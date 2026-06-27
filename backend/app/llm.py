import os
import time
import logging
import json
from typing import List, Dict, Generator
import httpx
import google.genai as genai
from google.genai import types

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Retrieve API key
api_key = os.getenv("GOOGLE_AI_API_KEY") or os.getenv("GEMINI_API_KEY")
model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-pro-preview-03-25")
FALLBACK_MODELS = [
    {"id": model_name, "label": f"{model_name} (default)"},
    {"id": "gemini-2.5-pro-preview-03-25", "label": "Gemini 2.5 Pro"},
    {"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash"},
    {"id": "gemini-1.5-flash", "label": "Gemini 1.5 Flash"},
    {"id": "gemini-1.5-pro", "label": "Gemini 1.5 Pro"},
]
if api_key:
    logger.info("Gemini API key found, configuring google-genai SDK.")
else:
    logger.warning("No Gemini API key found. System will fall back to mock stream model.")

def _get_client(api_key_value: str | None = None) -> genai.Client:
    key = api_key_value or api_key
    return genai.Client(api_key=key) if key else genai.Client()

def list_available_models() -> List[Dict[str, str]]:
    if not api_key:
        return FALLBACK_MODELS

    try:
        client = _get_client()
        discovered_models = []
        for model in client.models.list():
            actions = getattr(model, "supported_actions", [])
            if "generateContent" not in actions:
                continue

            model_id = getattr(model, "name", "")
            if not model_id:
                continue

            display_name = getattr(model, "display_name", None) or model_id
            discovered_models.append({"id": model_id, "label": display_name})

        if not any(model["id"] == model_name for model in discovered_models):
            discovered_models.insert(0, {"id": model_name, "label": f"{model_name} (default)"})

        return discovered_models or FALLBACK_MODELS
    except Exception as exc:
        logger.warning("Failed to list Gemini models: %s", exc)
        return FALLBACK_MODELS

def stream_chat_response(
    history: List[Dict[str, str]],
    selected_model: str | None = None,
    provider_config: Dict[str, str | None] | None = None,
) -> Generator[str, None, None]:
    """
    Streams the LLM response token-by-token.
    If Gemini API key is available and works, it calls Gemini.
    Otherwise, it falls back to a realistic mock streaming response.
    """
    provider_name = (provider_config or {}).get("provider")
    if provider_name and provider_name != "gemini":
        yield from _stream_non_gemini_provider(history, selected_model, provider_config or {})
        return

    if not api_key and not (provider_config or {}).get("api_key"):
        yield from _mock_stream_response(history)
        return

    try:
        gemini_key = (provider_config or {}).get("api_key")
        client = _get_client(gemini_key)

        # Build history as list of Content objects
        gemini_history: list[types.Content] = []
        for msg in history[:-1]:
            role = "model" if msg["role"] == "assistant" else "user"
            gemini_history.append(types.Content(
                role=role,
                parts=[types.Part(text=msg["content"])]
            ))

        latest_message = history[-1]["content"]
        model = selected_model or model_name

        chat = client.chats.create(model=model, history=gemini_history)

        for chunk in chat.send_message_stream(latest_message):
            if chunk.text:
                yield chunk.text

    except Exception as e:
        logger.error(f"Error calling Gemini API: {str(e)}. Falling back to mock stream.")
        yield "\n*[System: Live Gemini is unavailable, using the local demo model.]*\n\n"
        yield from _mock_stream_response(history)

def _stream_non_gemini_provider(
    history: List[Dict[str, str]],
    selected_model: str | None,
    provider_config: Dict[str, str | None],
) -> Generator[str, None, None]:
    provider = provider_config.get("provider")
    api_key_value = provider_config.get("api_key")
    model = selected_model or provider_config.get("default_model") or "gpt-4o-mini"

    if not api_key_value:
        yield "\n*[System: This provider has no saved API key, using the local demo model.]*\n\n"
        yield from _mock_stream_response(history)
        return

    if provider in {"openai", "deepseek", "openrouter", "openai-compatible"}:
        base_url = provider_config.get("base_url")
        if provider == "deepseek":
            base_url = base_url or "https://api.deepseek.com"
        elif provider == "openrouter":
            base_url = base_url or "https://openrouter.ai/api"
        else:
            base_url = base_url or "https://api.openai.com"

        try:
            with httpx.stream(
                "POST",
                f"{base_url.rstrip('/')}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key_value}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": history,
                    "stream": True,
                },
                timeout=30,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line.removeprefix("data: ").strip()
                    if payload == "[DONE]":
                        break
                    data = json.loads(payload)
                    content = data.get("choices", [{}])[0].get("delta", {}).get("content")
                    if content:
                        yield content
                return
        except Exception as exc:
            logger.error("OpenAI-compatible provider failed: %s", exc)

    if provider == "anthropic":
        try:
            user_messages = [
                {
                    "role": "assistant" if msg["role"] == "assistant" else "user",
                    "content": msg["content"],
                }
                for msg in history
            ]
            with httpx.stream(
                "POST",
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key_value,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": user_messages,
                    "max_tokens": 2048,
                    "stream": True,
                },
                timeout=30,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line.removeprefix("data: ").strip()
                    if payload == "[DONE]":
                        break
                    data = json.loads(payload)
                    if data.get("type") == "content_block_delta":
                        text = data.get("delta", {}).get("text")
                        if text:
                            yield text
                return
        except Exception as exc:
            logger.error("Anthropic provider failed: %s", exc)

    yield "\n*[System: Live provider call failed, using the local demo model.]*\n\n"
    yield from _mock_stream_response(history)

def _mock_stream_response(history: List[Dict[str, str]]) -> Generator[str, None, None]:
    """
    High-fidelity mock streaming response that mimics an LLM thinking and typing.
    It reads the user's latest query and replies contextually (e.g. remembering their name).
    """
    raw_latest_query = history[-1]["content"] if history else ""
    visible_latest_query = raw_latest_query.split("User message:\n")[-1]
    latest_query = raw_latest_query.lower()
    
    # Simple rule-based intelligence for demo context retention
    name = "Tiven"
    for msg in history:
        content = msg["content"].lower()
        if "my name is " in content:
            name = content.split("my name is ")[-1].strip(" .?!")
        elif "call me " in content:
            name = content.split("call me ")[-1].strip(" .?!")

    if "web lookup snippets:" in latest_query:
        response_text = (
            "Web mode is active. I used the injected web lookup snippets as lightweight external context, "
            "then combined them with the current chat history. For an interview demo, this shows the same "
            "frontend-to-backend pattern you would use for a stronger search provider."
        )
    elif "attached file context:" in latest_query:
        response_text = (
            "I can see the attached file context in this turn. I will use the uploaded text as grounding material "
            "while keeping the visible chat history clean. Ask me to summarize, compare, or extract details from it."
        )
    elif "research agent:" in latest_query:
        response_text = (
            "Research agent is active. I would answer with structured findings, explicit assumptions, and any "
            "available source snippets so the response is easier to audit."
        )
    elif "code agent:" in latest_query:
        response_text = (
            "Code agent is active. I would focus on concrete implementation steps, failure modes, tests, and "
            "production tradeoffs instead of giving a generic explanation."
        )
    elif "name" in latest_query:
        response_text = f"Your name is {name}! I remember that from our conversation history. Is there anything else you would like to discuss?"
    elif "who are you" in latest_query or "what is your role" in latest_query:
        response_text = "I am a high-performance R&D assistant running locally on Tesseracq Labs' server stack. I am configured with multi-turn memory."
    elif "hello" in latest_query or "hi" in latest_query:
        response_text = f"Hello {name}! How can I help you today? I'm ready to stream responses and discuss R&D optimization."
    elif "optimize" in latest_query or "performance" in latest_query or "gpu" in latest_query:
        response_text = ("When optimizing LLM serving for constrained environments (like client iGPUs), "
                         "we focus on several key pillars:\n\n"
                         "1. **KV Cache Compression**: Reducing cache size via quantization (e.g., 4-bit KV cache) and PageAttention.\n"
                         "2. **Quantization**: Moving from FP16 to INT4/INT8 (GGUF, GPTQ, AWQ) to fit parameters into VRAM.\n"
                         "3. **Memory Interplay**: Optimizing SSD-to-CPU-to-GPU data transfers (unified memory techniques).\n"
                         "4. **Kernel Tuning**: Writing custom Triton/CUDA kernels for faster fused attention operations.")
    else:
        response_text = (f"This is a streamed response from the server. I have successfully processed your query: "
                         f"\"{visible_latest_query}\". Thanks for testing the FastAPI SSE streaming and SQLite memory!")

    # Yield word-by-word with small delay to mimic streaming
    words = response_text.split(" ")
    for i, word in enumerate(words):
        # yield word and a space, except for the last word
        yield word + (" " if i < len(words) - 1 else "")
        time.sleep(0.04)  # 40ms delay per word (approx 15-20 tokens/sec)
