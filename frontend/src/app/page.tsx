"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import SessionSidebar from "@/components/SessionSidebar";
import ChatWindow from "@/components/ChatWindow";
import ProjectWorkspace from "@/components/ProjectWorkspace";
import WorkspaceModals, { ModalMode } from "@/components/WorkspaceModals";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
    theme: "light",
    sidebar_collapsed: false,
    default_model: "models/gemini-3.1-pro-preview",
  });
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [orchestrate, setOrchestrate] = useState(false);

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
    setSelectedModel((current) =>
      models.some((model) => model.id === current) ? current : models[0].id
    );
  }, [models]);

  // Fetch messages whenever current session changes
  useEffect(() => {
    if (!currentSessionId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchSessionDetails(currentSessionId);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentSessionId, fetchSessionDetails]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchProjectDocuments(selectedProjectId);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchProjectDocuments, selectedProjectId]);

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

  const handleSendMessageWithSessionId = async (
    sessionId: string,
    messageText: string,
    attachments: AttachmentPayload[]
  ) => {
    if (isStreaming) return;

    // 1. Instantly append user message to local UI state
    const userMessage: Message = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMessage]);
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
                const meta: { session_title?: string } = JSON.parse(frame.data);
                const sessionTitle = meta.session_title;
                if (sessionTitle) {
                  setSessions((prev) =>
                    prev.map((s) =>
                      s.id === sessionId ? { ...s, title: sessionTitle } : s
                    )
                  );
                }
              } catch (e) {
                console.error("Failed to parse metadata", e);
              }
              continue;
          }

          if (frame.event === "end" || frame.data === "[DONE]") {
            continue;
          }

          if (frame.event === "error") {
            throw new Error(frame.data);
          }

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
    const res = await fetch(`${API_URL}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 text-slate-950 max-md:flex-col">
      {/* Sidebar - Sessions list & controls */}
      <SessionSidebar
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
        onToggleCollapsed={handleSidebarCollapse}
        onSelectProject={handleSelectProject}
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
  );
}
