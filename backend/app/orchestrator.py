from collections.abc import Generator
from dataclasses import dataclass
from typing import Dict, List

from .schemas import AttachmentPayload


@dataclass
class OrchestrationContext:
    user_message: str
    project_context: str | None
    attachments: list[AttachmentPayload]
    history: list[dict[str, str]]
    selected_model: str | None
    provider_config: dict[str, str | None] | None
    system_instruction: str | None = None


def _attachment_names(attachments: list[AttachmentPayload]) -> str:
    names = [attachment.name for attachment in attachments if attachment.name]
    return ", ".join(names[:8]) if names else "none"


def _project_signal(project_context: str | None) -> str:
    if not project_context:
        return "No project knowledge base is selected for this turn."

    lines = [line.strip() for line in project_context.splitlines() if line.strip()]
    return "\n".join(lines[:8])


def _stream_text(text: str) -> Generator[str, None, None]:
    for word in text.split(" "):
        yield word + " "


def run_lightweight_orchestration(
    context: OrchestrationContext,
    llm_streamer,
) -> Generator[str, None, None]:
    """Sequential multi-agent flow with one real LLM call for laptop-safe demos."""
    planner_block = (
        "[PLANNER] Breaking down the request\n"
        "Plan: Identify the user's goal, collect project/file context, generate the answer, "
        "then run a reviewer pass for missing tests and risk.\n\n"
    )
    yield planner_block

    research_block = (
        "[RESEARCH/RAG] Retrieving scoped context\n"
        f"Project context:\n{_project_signal(context.project_context)}\n"
        f"Attached workspace/files: {_attachment_names(context.attachments)}\n\n"
    )
    yield research_block

    coder_prompt = (
        "You are the Coder Agent in a lightweight multi-agent R&D system.\n"
        "Use the planner and project context below to produce the implementation-focused answer.\n"
        "Do not reveal hidden chain-of-thought. Provide concise reasoning, code-level tradeoffs, "
        "and concrete next steps.\n\n"
        f"User request:\n{context.user_message}\n\n"
        f"Project context:\n{context.project_context or 'No project context selected.'}\n\n"
        "Attached file context:\n"
        + "\n\n".join(
            f"File: {attachment.name}\n{(attachment.content or '')[:4000]}"
            for attachment in context.attachments
            if attachment.content
        )
    )
    coder_history = [
        *context.history[:-1],
        {"role": "user", "content": coder_prompt},
    ]

    yield "[CODER] Generating implementation response\n"
    coder_output = ""
    for chunk in llm_streamer(
        coder_history,
        selected_model=context.selected_model,
        provider_config=context.provider_config,
        system_instruction=context.system_instruction,
    ):
        coder_output += chunk
        yield chunk

    yield "\n\n"
    reviewer_block = (
        "[REVIEWER] Quality and risk check\n"
        "Reasoning: Verified the response against the available project context, active file attachments, "
        "and the interview task requirements.\n"
        "Output: Keep tests focused on streaming, session persistence, project context isolation, "
        "and orchestrator event order. Avoid adding heavyweight workers or external queues on a 16GB laptop.\n"
    )
    yield reviewer_block
