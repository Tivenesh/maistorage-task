"use client";

import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import SessionSidebar from "@/components/SessionSidebar";
import ChatWindow from "@/components/ChatWindow";
import ProjectWorkspace from "@/components/ProjectWorkspace";
import WorkspaceModals, { ModalMode } from "@/components/WorkspaceModals";
import AppMotion from "@/components/AppMotion";
import SmoothScroll from "@/components/SmoothScroll";
import { spring } from "@/components/MotionControls";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const DARK_BG = [
  "radial-gradient(circle at 14% 22%, rgba(34,211,238,0.18), transparent 25rem)",
  "radial-gradient(circle at 86% 18%, rgba(255,152,26,0.17), transparent 28rem)",
  "radial-gradient(circle at 50% 115%, rgba(16,43,92,0.38), transparent 34rem)",
  "linear-gradient(135deg, #04070f 0%, #07101f 48%, #050912 100%)",
].join(",");

const LIGHT_BG = [
  "radial-gradient(circle at 15% 20%, rgba(255,152,26,0.17), transparent 25rem)",
  "radial-gradient(circle at 85% 20%, rgba(16,43,92,0.13), transparent 30rem)",
  "radial-gradient(circle at 50% 115%, rgba(34,211,238,0.12), transparent 34rem)",
  "linear-gradient(135deg, #fbfcff 0%, #f2f6fc 48%, #eaf1fb 100%)",
].join(",");

const MaistorageFieldScene = dynamic(
  () => import("@/components/MaistorageFieldScene"),
  { ssr: false }
);

interface Session {
  id: string;
  title: string;
  project_id?: string | null;
  created_at: string;
}

interface Message {
  role: string;
  content: string;
}

export interface AttachmentPayload {
  name: string;
  content?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  providerId?: string;
}

export interface ProviderConfig {
  id: string;
  provider: string;
  display_name: string;
  api_key_configured: boolean;
  api_key_preview: string;
  base_url?: string | null;
  default_model: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  name: string;
  content: string;
  created_at: string;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  provider_id?: string | null;
  model: string;
  project_id?: string | null;
}

export interface WorkspaceState {
  id?: string;
  name: string;
  file_tree: { path: string; type: "file" | "directory" }[];
  selected_files: AttachmentPayload[];
}

interface AppSettings {
  theme: string;
  sidebar_collapsed: boolean;
  default_model: string;
}

interface SseFrame {
  event: string;
  data: string;
}

interface StreamMetadata {
  run_id?: string;
  session_title?: string;
  model?: string;
  provider?: string;
  orchestrated?: boolean;
  prompt_chars?: number;
}

interface RunEventPayload {
  run_id?: string;
  status?: string;
  duration_ms?: number;
  prompt_chars?: number;
  response_chars?: number;
  model?: string;
  provider?: string;
  orchestrated?: boolean;
}

interface ChatRunSummary {
  id: string;
  session_id: string;
  model: string;
  provider: string;
  project_id?: string | null;
  orchestrated: boolean;
  status: string;
  prompt_chars: number;
  response_chars: number;
  duration_ms: number;
  error: string;
  created_at: string;
}

export interface SessionOverviewTelemetry {
  sessionId: string | null;
  completedRuntimeMs: number;
  activeRunStartedAt: number | null;
  requestCount: number;
  completedRequests: number;
  runErrors: number;
  completedPromptChars: number;
  activePromptChars: number;
  completedResponseChars: number;
  activeResponseChars: number;
  toolUseCount: number;
  lastRunId: string | null;
  lastRunStatus: string;
  lastRunModel: string;
  lastRunProvider: string;
  lastUpdatedAt: number | null;
}

function emptyOverviewTelemetry(sessionId: string | null = null): SessionOverviewTelemetry {
  return {
    sessionId,
    completedRuntimeMs: 0,
    activeRunStartedAt: null,
    requestCount: 0,
    completedRequests: 0,
    runErrors: 0,
    completedPromptChars: 0,
    activePromptChars: 0,
    completedResponseChars: 0,
    activeResponseChars: 0,
    toolUseCount: 0,
    lastRunId: null,
    lastRunStatus: "idle",
    lastRunModel: "",
    lastRunProvider: "",
    lastUpdatedAt: null,
  };
}

function summarizeRunsForOverview(
  sessionId: string,
  runs: ChatRunSummary[]
): SessionOverviewTelemetry {
  const latestRun = runs[0];
  return {
    sessionId,
    completedRuntimeMs: runs
      .filter((run) => run.status !== "running")
      .reduce((total, run) => total + Math.max(0, run.duration_ms || 0), 0),
    activeRunStartedAt: null,
    requestCount: runs.length,
    completedRequests: runs.filter((run) => run.status === "completed").length,
    runErrors: runs.filter((run) => run.status === "error").length,
    completedPromptChars: runs.reduce((total, run) => total + Math.max(0, run.prompt_chars || 0), 0),
    activePromptChars: 0,
    completedResponseChars: runs.reduce((total, run) => total + Math.max(0, run.response_chars || 0), 0),
    activeResponseChars: 0,
    toolUseCount: runs.filter((run) => run.orchestrated).length,
    lastRunId: latestRun?.id ?? null,
    lastRunStatus: latestRun?.status ?? "idle",
    lastRunModel: latestRun?.model ?? "",
    lastRunProvider: latestRun?.provider ?? "",
    lastUpdatedAt: latestRun ? Date.parse(latestRun.created_at) : null,
  };
}

function parseSseFrame(rawFrame: string): SseFrame | null {
  const lines = rawFrame.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

// Displayed model list = discovered base models plus one entry per saved
// provider (tagged with providerId so the chat can route to that saved key).
// Derived fresh from providers, so removing a provider drops its model too.
function mergeProviderModels(
  baseModels: ModelOption[],
  providerConfigs: ProviderConfig[]
): ModelOption[] {
  const modelsById = new Map(baseModels.map((model) => [model.id, model]));

  for (const provider of providerConfigs) {
    if (!provider.default_model) continue;
    modelsById.set(provider.default_model, {
      id: provider.default_model,
      label: `${provider.default_model} (${provider.display_name})`,
      providerId: provider.id,
    });
  }

  return Array.from(modelsById.values());
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("general");
  const [baseModels, setBaseModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("models/gemini-3.1-pro-preview");
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceState | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    theme: "dark",
    sidebar_collapsed: false,
    default_model: "models/gemini-3.1-pro-preview",
  });
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [orchestrate, setOrchestrate] = useState(false);
  const themeAnimatingRef = useRef(false);
  const [overviewTelemetry, setOverviewTelemetry] = useState<SessionOverviewTelemetry>(() =>
    emptyOverviewTelemetry()
  );
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Model list is derived, not stored, so provider add/remove stays consistent.
  const models = useMemo(
    () => mergeProviderModels(baseModels, providers),
    [baseModels, providers]
  );

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`);
      if (res.ok) {
        const data: Session[] = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/models`);
      if (!res.ok) {
        return;
      }

      const data: ModelOption[] = await res.json();
      setBaseModels(data);
    } catch (err) {
      console.error("Failed to fetch models:", err);
    }
  }, []);

  const fetchWorkspaceState = useCallback(async () => {
    try {
      const [providersRes, agentsRes, projectsRes, settingsRes, workspacesRes] =
        await Promise.all([
          fetch(`${API_URL}/providers`),
          fetch(`${API_URL}/agents`),
          fetch(`${API_URL}/projects`),
          fetch(`${API_URL}/settings`),
          fetch(`${API_URL}/workspaces`),
        ]);

      if (providersRes.ok) {
        setProviders(await providersRes.json());
      }
      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (projectsRes.ok) setProjects(await projectsRes.json());
      if (settingsRes.ok) {
        const nextSettings: AppSettings = await settingsRes.json();
        setSettings(nextSettings);
        setSelectedModel((current) => current || nextSettings.default_model);
      }
      if (workspacesRes.ok) {
        const data: WorkspaceState[] = await workspacesRes.json();
        setWorkspaces(data);
        setActiveWorkspace((current) => current ?? data[0] ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch workspace state:", err);
    }
  }, []);

  const fetchSessionDetails = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${id}`);
      if (res.ok) {
        const data: { messages?: Message[] } = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to fetch session details:", err);
    }
  }, []);

  const fetchSessionRuns = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${id}/runs`);
      if (!res.ok) {
        setOverviewTelemetry((current) =>
          current.sessionId === id ? current : emptyOverviewTelemetry(id)
        );
        return;
      }

      const runs: ChatRunSummary[] = await res.json();
      setOverviewTelemetry((current) => {
        const summarized = summarizeRunsForOverview(id, runs);
        if (current.sessionId === id && current.activeRunStartedAt) {
          return {
            ...summarized,
            activeRunStartedAt: current.activeRunStartedAt,
            requestCount: Math.max(summarized.requestCount, current.requestCount),
            activePromptChars: current.activePromptChars,
            activeResponseChars: current.activeResponseChars,
            toolUseCount: Math.max(summarized.toolUseCount, current.toolUseCount),
            lastRunId: current.lastRunId ?? summarized.lastRunId,
            lastRunStatus: current.lastRunStatus,
            lastRunModel: current.lastRunModel || summarized.lastRunModel,
            lastRunProvider: current.lastRunProvider || summarized.lastRunProvider,
          };
        }
        return summarized;
      });
    } catch (err) {
      console.error("Failed to fetch session runs:", err);
      setOverviewTelemetry((current) =>
        current.sessionId === id ? current : emptyOverviewTelemetry(id)
      );
    }
  }, []);

  const fetchProjectDocuments = useCallback(async (projectId: string) => {
    if (!projectId) {
      setProjectDocuments([]);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/projects/${projectId}/documents`);
      if (!res.ok) {
        setProjectDocuments([]);
        return;
      }
      setProjectDocuments(await res.json());
    } catch (err) {
      console.error("Failed to fetch project documents:", err);
      setProjectDocuments([]);
    }
  }, []);

  // Sync <html> element's data-theme for body-level CSS vars
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // Fetch all sessions on mount
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchSessions();
      void fetchModels();
      void fetchWorkspaceState();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchModels, fetchSessions, fetchWorkspaceState]);

  // Keep the selected model valid as the available list changes (e.g. after a
  // provider is added or removed). Preserves the choice when still available.
  useEffect(() => {
    if (models.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      setSelectedModel((current) =>
        models.some((model) => model.id === current) ? current : models[0].id
      );
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [models]);

  // Fetch messages whenever current session changes
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!currentSessionId) {
        setOverviewTelemetry(emptyOverviewTelemetry());
        return;
      }

      void fetchSessionDetails(currentSessionId);
      void fetchSessionRuns(currentSessionId);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentSessionId, fetchSessionDetails, fetchSessionRuns]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchProjectDocuments(selectedProjectId);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchProjectDocuments, selectedProjectId]);

  // Persist and apply the theme to React state (drives data-theme on the app).
  const applyThemeState = useCallback((theme: string) => {
    setSettings((current) => ({ ...current, theme }));
    void fetch(`${API_URL}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    }).catch(() => {});
  }, []);

  // Smooth colour crossfade theme transition: a full-screen wash of the target
  // theme's palette fades in over the current one (so the colours blend), the
  // theme is swapped at peak opacity (hidden), then the wash fades back out to
  // settle into the new theme. No moving panels — just colour integrating.
  // Uses the Web Animations API (not CSS transitions) so it cannot be zeroed out
  // by the global reduced-motion transition override in globals.css; this is a
  // deliberate, user-initiated brand transition.
  const runThemeCrossfade = useCallback((newTheme: string) => {
    const canAnimate =
      typeof document !== "undefined" &&
      typeof Element !== "undefined" &&
      "animate" in Element.prototype;

    if (!canAnimate || themeAnimatingRef.current) {
      applyThemeState(newTheme);
      return;
    }
    themeAnimatingRef.current = true;

    const FADE_IN_MS = 460;
    const HOLD_MS = 90;
    const FADE_OUT_MS = 520;
    const easing = "cubic-bezier(0.4, 0, 0.2, 1)";

    const wash = document.createElement("div");
    wash.setAttribute("aria-hidden", "true");
    Object.assign(wash.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483000",
      pointerEvents: "none",
      background: newTheme === "dark" ? DARK_BG : LIGHT_BG,
      opacity: "0",
      willChange: "opacity",
    });
    document.body.appendChild(wash);

    // The sequence (swap + cleanup) is driven by timers so it always completes
    // correctly, even if the animation's callbacks are starved. The Web
    // Animations API supplies the smooth opacity crossfade itself.
    wash.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_IN_MS,
      easing,
      fill: "forwards",
    });

    window.setTimeout(() => {
      applyThemeState(newTheme); // swap theme at peak opacity (new palette covers)
      wash.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: FADE_OUT_MS,
        easing,
        fill: "forwards",
      });
      window.setTimeout(() => {
        wash.remove();
        themeAnimatingRef.current = false;
      }, FADE_OUT_MS + HOLD_MS);
    }, FADE_IN_MS + HOLD_MS);
  }, [applyThemeState]);

  const createSession = async (projectId?: string | null): Promise<Session | null> => {
    try {
      const res = await fetch(`${API_URL}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation", project_id: projectId || null }),
      });
      if (res.ok) {
        const newSession: Session = await res.json();
        setSessions((prev) => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        setSelectedProjectId(newSession.project_id || "");
        setMessages([]);
        return newSession;
      }
    } catch (err) {
      console.error("Failed to create session:", err);
    }

    return null;
  };

  const handleCreateSession = async () => {
    await createSession(null);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (currentSessionId === id) {
          setCurrentSessionId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const res = await fetch(`${API_URL}/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        if (selectedProjectId === projectId) {
          setSelectedProjectId("");
          setProjectDocuments([]);
        }
        // Sessions that belonged to this project are now unlinked server-side.
        void fetchSessions();
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  const handleSelectSession = (id: string) => {
    if (isStreaming) return; // Prevent switching sessions while streaming
    const session = sessions.find((item) => item.id === id);
    setSelectedProjectId(session?.project_id || "");
    setCurrentSessionId(id);
  };

  const handleSelectProject = (projectId: string) => {
    if (isStreaming) return;
    setSelectedProjectId(projectId);
    setCurrentSessionId(null);
    setMessages([]);
    void fetchProjectDocuments(projectId);
  };

  const beginOverviewRun = (
    sessionId: string,
    messageText: string,
    attachments: AttachmentPayload[]
  ) => {
    const attachmentChars = attachments.reduce(
      (total, attachment) => total + (attachment.content?.length ?? 0),
      0
    );
    const enabledToolCount =
      Number(searchMode) + Number(webSearch) + Number(orchestrate);

    setOverviewTelemetry((current) => {
      const base =
        current.sessionId === sessionId ? current : emptyOverviewTelemetry(sessionId);
      return {
        ...base,
        sessionId,
        activeRunStartedAt: Date.now(),
        requestCount: base.requestCount + 1,
        activePromptChars: messageText.length + attachmentChars,
        activeResponseChars: 0,
        toolUseCount: base.toolUseCount + enabledToolCount,
        lastRunId: null,
        lastRunStatus: "running",
        lastRunModel: selectedModel,
        lastRunProvider:
          providers.find((provider) => provider.default_model === selectedModel)?.provider ||
          "gemini",
        lastUpdatedAt: Date.now(),
      };
    });
  };

  const applyStreamMetadataToOverview = (sessionId: string, meta: StreamMetadata) => {
    setOverviewTelemetry((current) => {
      const base =
        current.sessionId === sessionId ? current : emptyOverviewTelemetry(sessionId);
      return {
        ...base,
        sessionId,
        activePromptChars:
          typeof meta.prompt_chars === "number"
            ? Math.max(0, meta.prompt_chars)
            : base.activePromptChars,
        lastRunId: meta.run_id ?? base.lastRunId,
        lastRunStatus: "running",
        lastRunModel: meta.model ?? base.lastRunModel,
        lastRunProvider: meta.provider ?? base.lastRunProvider,
        lastUpdatedAt: Date.now(),
      };
    });
  };

  const addStreamTokenToOverview = (sessionId: string, chunk: string) => {
    setOverviewTelemetry((current) => {
      if (current.sessionId !== sessionId) return current;
      return {
        ...current,
        activeResponseChars: current.activeResponseChars + chunk.length,
        lastUpdatedAt: Date.now(),
      };
    });
  };

  const completeOverviewRun = (sessionId: string, payload?: RunEventPayload) => {
    setOverviewTelemetry((current) => {
      if (current.sessionId !== sessionId) return current;
      const activeDuration =
        current.activeRunStartedAt === null
          ? 0
          : Math.max(0, Date.now() - current.activeRunStartedAt);
      const durationMs =
        typeof payload?.duration_ms === "number"
          ? Math.max(0, payload.duration_ms)
          : activeDuration;
      const status = payload?.status ?? "completed";
      return {
        ...current,
        completedRuntimeMs: current.completedRuntimeMs + durationMs,
        activeRunStartedAt: null,
        completedRequests:
          status === "completed"
            ? current.completedRequests + 1
            : current.completedRequests,
        runErrors:
          status === "error" ? current.runErrors + 1 : current.runErrors,
        completedPromptChars:
          current.completedPromptChars +
          (typeof payload?.prompt_chars === "number"
            ? Math.max(0, payload.prompt_chars)
            : current.activePromptChars),
        activePromptChars: 0,
        completedResponseChars:
          current.completedResponseChars +
          (typeof payload?.response_chars === "number"
            ? Math.max(0, payload.response_chars)
            : current.activeResponseChars),
        activeResponseChars: 0,
        lastRunId: payload?.run_id ?? current.lastRunId,
        lastRunStatus: status,
        lastRunModel: payload?.model ?? current.lastRunModel,
        lastRunProvider: payload?.provider ?? current.lastRunProvider,
        lastUpdatedAt: Date.now(),
      };
    });
  };

  const failOverviewRun = (sessionId: string) => {
    setOverviewTelemetry((current) => {
      if (current.sessionId !== sessionId || current.activeRunStartedAt === null) {
        return current;
      }
      return {
        ...current,
        completedRuntimeMs:
          current.completedRuntimeMs + Math.max(0, Date.now() - current.activeRunStartedAt),
        activeRunStartedAt: null,
        completedPromptChars: current.completedPromptChars + current.activePromptChars,
        activePromptChars: 0,
        completedResponseChars: current.completedResponseChars + current.activeResponseChars,
        activeResponseChars: 0,
        runErrors: current.runErrors + 1,
        lastRunStatus: "error",
        lastUpdatedAt: Date.now(),
      };
    });
  };

  const handleSendMessageWithSessionId = async (
    sessionId: string,
    messageText: string,
    attachments: AttachmentPayload[]
  ) => {
    if (isStreaming) return;

    // 1. Instantly append user message to local UI state
    const userMessage: Message = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMessage]);
    beginOverviewRun(sessionId, messageText, attachments);
    setIsStreaming(true);

    try {
      // 2. Fetch stream from backend
      const response = await fetch(`${API_URL}/sessions/${sessionId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          agent_id: selectedAgentId,
          model: selectedModel,
          provider_id:
            models.find((model) => model.id === selectedModel)?.providerId ??
            providers.find((provider) => provider.default_model === selectedModel)?.id,
          project_id: selectedProjectId || null,
          search_mode: searchMode,
          web_search: webSearch,
          orchestrate,
          attachments,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 3. Setup reader to parse SSE response body
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable.");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let hasInitializedAssistantBubble = false;
      let hasReceivedRunSummary = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        buffer += textChunk;

        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";

        for (const rawFrame of frames) {
          const frame = parseSseFrame(rawFrame);
          if (!frame) continue;

          if (frame.event === "metadata") {
              try {
                const meta: StreamMetadata = JSON.parse(frame.data);
                const sessionTitle = meta.session_title;
                if (sessionTitle) {
                  setSessions((prev) =>
                    prev.map((s) =>
                      s.id === sessionId ? { ...s, title: sessionTitle } : s
                    )
                  );
                }
                applyStreamMetadataToOverview(sessionId, meta);
              } catch (e) {
                console.error("Failed to parse metadata", e);
              }
              continue;
          }

          if (frame.event === "run") {
            try {
              completeOverviewRun(sessionId, JSON.parse(frame.data));
              hasReceivedRunSummary = true;
            } catch (e) {
              console.error("Failed to parse run summary", e);
              completeOverviewRun(sessionId);
              hasReceivedRunSummary = true;
            }
            continue;
          }

          if (frame.event === "end" || frame.data === "[DONE]") {
            if (!hasReceivedRunSummary) {
              completeOverviewRun(sessionId);
              hasReceivedRunSummary = true;
            }
            continue;
          }

          if (frame.event === "error") {
            throw new Error(frame.data);
          }

          addStreamTokenToOverview(sessionId, frame.data);
          if (!hasInitializedAssistantBubble) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: frame.data },
            ]);
            hasInitializedAssistantBubble = true;
          } else {
            setMessages((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx]?.role === "assistant") {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: updated[lastIdx].content + frame.data,
                };
              }
              return updated;
            });
          }
        }
      }
    } catch (err) {
      console.error("Streaming error:", err);
      failOverviewRun(sessionId);
      // Append error message
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `\n\n**[Connection Error: Failed to stream response from backend. Ensure the FastAPI server is running on ${API_URL}]**`,
        },
      ]);
    } finally {
      setIsStreaming(false);
      // Re-fetch sessions to make sure session titles are fully synced
      await fetchSessions();
      await fetchSessionRuns(sessionId);
    }
  };

  const handleSendMessage = async (
    messageText: string,
    attachments: AttachmentPayload[] = []
  ) => {
    let targetSessionId = currentSessionId;

    if (!targetSessionId) {
      const newSession = await createSession(selectedProjectId || null);
      if (!newSession) {
        return;
      }
      targetSessionId = newSession.id;
    }

    await handleSendMessageWithSessionId(targetSessionId, messageText, attachments);
  };

  const handleStartProjectChat = async (message?: string) => {
    if (!selectedProjectId || isStreaming) return;
    const newSession = await createSession(selectedProjectId);
    if (!newSession || !message) return;
    await handleSendMessageWithSessionId(newSession.id, message, []);
  };

  const saveProvider = async (payload: Record<string, string>) => {
    const res = await fetch(`${API_URL}/providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save provider");
    await fetchWorkspaceState();
  };

  const deleteProvider = async (providerId: string) => {
    const res = await fetch(`${API_URL}/providers/${providerId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete provider");
    await fetchWorkspaceState();
  };

  const saveAgent = async (payload: Record<string, string | null>) => {
    const res = await fetch(`${API_URL}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save agent");
    await fetchWorkspaceState();
  };

  const saveProject = async (payload: { name: string; description: string }) => {
    const res = await fetch(`${API_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save project");
    await fetchWorkspaceState();
  };

  const saveProjectDocument = async (projectId: string, payload: AttachmentPayload) => {
    const res = await fetch(`${API_URL}/projects/${projectId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        content: payload.content ?? "",
      }),
    });
    if (!res.ok) throw new Error("Failed to save project document");
    await fetchProjectDocuments(projectId);
  };

  const saveSettings = async (payload: Partial<AppSettings>) => {
    const { theme, ...rest } = payload;

    // Theme changes run the colour crossfade, which applies + persists the theme
    // itself at peak opacity (see runThemeCrossfade).
    if (theme && theme !== settings.theme) {
      runThemeCrossfade(theme);
    }

    // Persist any non-theme settings immediately.
    if (Object.keys(rest).length === 0) return;
    setSettings((current) => ({ ...current, ...rest }));
    const res = await fetch(`${API_URL}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
    });
    if (!res.ok) throw new Error("Failed to save settings");
    await fetchWorkspaceState();
  };

  const saveWorkspace = async (workspace: WorkspaceState) => {
    const res = await fetch(`${API_URL}/workspaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workspace),
    });
    if (!res.ok) throw new Error("Failed to save workspace");
    const savedWorkspace: WorkspaceState = await res.json();
    setActiveWorkspace(savedWorkspace);
    await fetchWorkspaceState();
  };

  const handleSidebarCollapse = async () => {
    const nextValue = !settings.sidebar_collapsed;
    setSettings((current) => ({ ...current, sidebar_collapsed: nextValue }));
    try {
      await saveSettings({ sidebar_collapsed: nextValue });
    } catch (err) {
      console.error("Failed to persist sidebar state:", err);
    }
  };

  const activeProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId) ?? null
    : null;
  const activeProjectSessions = activeProject
    ? sessions.filter((session) => session.project_id === activeProject.id)
    : [];

  return (
    <MotionConfig transition={spring.soft}>
      <div
        data-theme={settings.theme === "dark" ? "dark" : "light"}
        className="maistorage-app relative flex h-[100dvh] w-full overflow-hidden text-[var(--app-text)] max-md:flex-col"
      >
        <MaistorageFieldScene />
        <SmoothScroll />
        <AppMotion />

        <SessionSidebar
          toggleRef={toggleRef}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={handleSelectSession}
          onCreateSession={handleCreateSession}
          onDeleteSession={handleDeleteSession}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          agents={agents}
          projects={projects}
          selectedProjectId={selectedProjectId}
          collapsed={settings.sidebar_collapsed}
          theme={settings.theme}
          onToggleCollapsed={handleSidebarCollapse}
          onToggleTheme={() =>
            void saveSettings({ theme: settings.theme === "dark" ? "light" : "dark" })
          }
          onSelectProject={handleSelectProject}
          onDeleteProject={handleDeleteProject}
          onOpenAgents={() => setModalMode("agent")}
          onOpenProject={() => setModalMode("project")}
          onOpenSettings={() => setModalMode("settings")}
        />

        {activeProject && !currentSessionId ? (
          <ProjectWorkspace
            project={activeProject}
            documents={projectDocuments}
            sessions={activeProjectSessions}
            onUploadDocument={saveProjectDocument}
            onStartChat={handleStartProjectChat}
            onOpenSession={handleSelectSession}
          />
        ) : (
          <ChatWindow
            sessionId={currentSessionId}
            messages={messages}
            onSendMessage={handleSendMessage}
            isStreaming={isStreaming}
            selectedAgentId={selectedAgentId}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            activeWorkspace={activeWorkspace}
            onWorkspaceSelected={saveWorkspace}
            projects={projects}
            selectedProjectId={selectedProjectId}
            projectDocuments={projectDocuments}
            onSaveProjectDocument={saveProjectDocument}
            overviewTelemetry={overviewTelemetry}
            searchMode={searchMode}
            webSearch={webSearch}
            orchestrate={orchestrate}
            onToggleSearchMode={() => setSearchMode((enabled) => !enabled)}
            onToggleWebSearch={() => setWebSearch((enabled) => !enabled)}
            onToggleOrchestrate={() => setOrchestrate((enabled) => !enabled)}
          />
        )}

        <WorkspaceModals
          mode={modalMode}
          onClose={() => setModalMode(null)}
          providers={providers}
          agents={agents}
          projects={projects}
          models={models}
          settings={settings}
          workspaces={workspaces}
          onSaveProvider={saveProvider}
          onDeleteProvider={deleteProvider}
          onSaveAgent={saveAgent}
          onSaveProject={saveProject}
          onSaveSettings={saveSettings}
        />
      </div>
    </MotionConfig>
  );
}
