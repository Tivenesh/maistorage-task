"use client";

import { FormEvent, useState } from "react";
import { Bot, FolderPlus, KeyRound, Settings, Trash2, X } from "lucide-react";
import type { AgentConfig, ModelOption, Project, ProviderConfig, WorkspaceState } from "@/app/page";

export type ModalMode = "settings" | "agent" | "project";

interface AppSettings {
  theme: string;
  sidebar_collapsed: boolean;
  default_model: string;
}

interface WorkspaceModalsProps {
  mode: ModalMode | null;
  onClose: () => void;
  providers: ProviderConfig[];
  agents: AgentConfig[];
  projects: Project[];
  models: ModelOption[];
  settings: AppSettings;
  workspaces: WorkspaceState[];
  onSaveProvider: (payload: Record<string, string>) => Promise<void>;
  onDeleteProvider: (providerId: string) => Promise<void>;
  onSaveAgent: (payload: Record<string, string | null>) => Promise<void>;
  onSaveProject: (payload: { name: string; description: string }) => Promise<void>;
  onSaveSettings: (payload: Partial<AppSettings>) => Promise<void>;
}

const PROVIDERS = [
  { id: "gemini", label: "Gemini", defaultModel: "gemini-2.5-pro-preview-03-25" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini" },
  { id: "anthropic", label: "Claude / Anthropic", defaultModel: "claude-3-5-sonnet-latest" },
  { id: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "openai/gpt-4o-mini" },
  { id: "openai-compatible", label: "OpenAI Compatible", defaultModel: "local-model" },
];

export default function WorkspaceModals({
  mode,
  onClose,
  providers,
  agents,
  projects,
  models,
  settings,
  workspaces,
  onSaveProvider,
  onDeleteProvider,
  onSaveAgent,
  onSaveProject,
  onSaveSettings,
}: WorkspaceModalsProps) {
  const [activePanel, setActivePanel] = useState<ModalMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!mode) return null;
  const currentPanel = activePanel ?? mode;

  function handleClose() {
    setActivePanel(null);
    setError(null);
    onClose();
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <aside className="w-56 shrink-0 border-r border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-950">Workspace</p>
            <button type="button" onClick={handleClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-200">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ModalTab icon={<Settings className="h-4 w-4" />} label="Settings" active={currentPanel === "settings"} onClick={() => setActivePanel("settings")} />
          <ModalTab icon={<Bot className="h-4 w-4" />} label="Agents" active={currentPanel === "agent"} onClick={() => setActivePanel("agent")} />
          <ModalTab icon={<FolderPlus className="h-4 w-4" />} label="Projects" active={currentPanel === "project"} onClick={() => setActivePanel("project")} />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {currentPanel === "settings" && (
            <SettingsPanel
              settings={settings}
              providers={providers}
              models={models}
              workspaces={workspaces}
              onSaveSettings={(payload) => run(() => onSaveSettings(payload))}
              onSaveProvider={(payload) => run(() => onSaveProvider(payload))}
              onDeleteProvider={(providerId) => run(() => onDeleteProvider(providerId))}
            />
          )}

          {currentPanel === "agent" && (
            <AgentPanel
              providers={providers}
              agents={agents}
              projects={projects}
              models={models}
              onSaveAgent={(payload) => run(() => onSaveAgent(payload))}
            />
          )}

          {currentPanel === "project" && (
            <ProjectPanel
              projects={projects}
              onSaveProject={(payload) => run(() => onSaveProject(payload))}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function ModalTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm transition ${
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SettingsPanel({
  settings,
  providers,
  models,
  workspaces,
  onSaveSettings,
  onSaveProvider,
  onDeleteProvider,
}: {
  settings: AppSettings;
  providers: ProviderConfig[];
  models: ModelOption[];
  workspaces: WorkspaceState[];
  onSaveSettings: (payload: Partial<AppSettings>) => Promise<void>;
  onSaveProvider: (payload: Record<string, string>) => Promise<void>;
  onDeleteProvider: (providerId: string) => Promise<void>;
}) {
  const [provider, setProvider] = useState(PROVIDERS[0].id);
  const providerMeta = PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0];

  async function submitProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await onSaveProvider({
      provider,
      display_name: String(form.get("display_name") || providerMeta.label),
      api_key: String(form.get("api_key") || ""),
      base_url: String(form.get("base_url") || ""),
      default_model: String(form.get("default_model") || providerMeta.defaultModel),
    });
    formElement.reset();
  }

  return (
    <div className="space-y-6">
      <Header icon={<Settings className="h-5 w-5" />} title="Settings" description="Configure local model providers, app defaults, and workspace state." />

      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-950">Bring your own API key</h3>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              Keys entered here are saved only in this local SQLite database and are never sent back to the browser after saving. The UI shows only a preview, and a fresh clone starts with no real key.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Account Config</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">
            Theme
            <select
              value={settings.theme}
              onChange={(event) => void onSaveSettings({ theme: event.target.value })}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-slate-900"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Default model
            <select
              value={settings.default_model}
              onChange={(event) => void onSaveSettings({ default_model: event.target.value })}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-slate-900"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
          <KeyRound className="h-4 w-4" />
          Connect LLM Provider
        </h3>
        <form onSubmit={submitProvider} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-600">
            Brand
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-slate-900">
              {PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <Field name="display_name" label="Display name" placeholder={providerMeta.label} />
          <Field name="api_key" label="Their API key" placeholder="Paste your provider key" type="password" />
          <Field name="default_model" label="Model to show in chat" placeholder={providerMeta.defaultModel} />
          <Field name="base_url" label="Base URL" placeholder="Optional for OpenAI-compatible providers" />
          <div className="flex items-end">
            <button type="submit" className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">Save provider</button>
          </div>
        </form>

        <div className="mt-4 grid gap-2">
          {providers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500">
              No local provider key saved. The app will use environment variables if configured, otherwise it falls back to the offline demo model.
            </p>
          ) : (
            providers.map((item) => (
              <div key={item.id} className="grid gap-1 rounded-lg bg-slate-50 px-3 py-2 text-sm md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="font-medium text-slate-800">{item.display_name}</div>
                  <div className="text-xs text-slate-500">{item.provider} / {item.default_model}</div>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
                    {item.api_key_preview}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteProvider(item.id)}
                    aria-label={`Delete ${item.display_name} key`}
                    title="Delete saved key"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Saved Workspaces</h3>
        <div className="grid gap-2">
          {workspaces.length === 0 ? (
            <p className="text-sm text-slate-500">Use the Code button in chat to choose a local folder.</p>
          ) : (
            workspaces.map((workspace) => (
              <div key={workspace.id ?? workspace.name} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {workspace.name} - {workspace.file_tree.length} files indexed for context
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function AgentPanel({
  providers,
  agents,
  projects,
  models,
  onSaveAgent,
}: {
  providers: ProviderConfig[];
  agents: AgentConfig[];
  projects: Project[];
  models: ModelOption[];
  onSaveAgent: (payload: Record<string, string | null>) => Promise<void>;
}) {
  async function submitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await onSaveAgent({
      name: String(form.get("name") || "New Agent"),
      description: String(form.get("description") || ""),
      system_prompt: String(form.get("system_prompt") || ""),
      provider_id: String(form.get("provider_id") || "") || null,
      model: String(form.get("model") || "gemini-2.5-pro-preview-03-25"),
      project_id: String(form.get("project_id") || "") || null,
    });
    formElement.reset();
  }

  return (
    <div className="space-y-6">
      <Header icon={<Bot className="h-5 w-5" />} title="Agent Wizard" description="Create or update assistants with a prompt, model, provider, and optional project scope." />
      <form onSubmit={submitAgent} className="grid gap-3 rounded-lg border border-slate-200 p-4">
        <Field name="name" label="Agent name" placeholder="R&D Systems Agent" />
        <Field name="description" label="Description" placeholder="Optimizes LLM deployment and backend systems" />
        <label className="text-sm text-slate-600">
          System prompt
          <textarea name="system_prompt" rows={5} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900" placeholder="Define the agent behavior..." />
        </label>
        <div className="grid gap-3 md:grid-cols-3">
          <Select name="provider_id" label="Provider" options={[{ value: "", label: "Use default" }, ...providers.map((provider) => ({ value: provider.id, label: provider.display_name }))]} />
          <Select name="model" label="Model" options={models.map((model) => ({ value: model.id, label: model.label }))} />
          <Select name="project_id" label="Project" options={[{ value: "", label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]} />
        </div>
        <button type="submit" className="h-9 w-fit rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">Create agent</button>
      </form>

      <div className="grid gap-2">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-lg border border-slate-200 p-3">
            <div className="font-medium text-slate-900">{agent.name}</div>
            <div className="text-sm text-slate-500">{agent.description || "No description"} - {agent.model}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectPanel({ projects, onSaveProject }: { projects: Project[]; onSaveProject: (payload: { name: string; description: string }) => Promise<void> }) {
  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await onSaveProject({
      name: String(form.get("name") || "New Project"),
      description: String(form.get("description") || ""),
    });
    formElement.reset();
  }

  return (
    <div className="space-y-6">
      <Header icon={<FolderPlus className="h-5 w-5" />} title="Projects" description="Create workspace containers that can scope agents and code context." />
      <form onSubmit={submitProject} className="grid gap-3 rounded-lg border border-slate-200 p-4">
        <Field name="name" label="Project name" placeholder="MaiStorage Interview Demo" />
        <Field name="description" label="Description" placeholder="Scope for agents and local code workspace" />
        <button type="submit" className="h-9 w-fit rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">Create project</button>
      </form>
      <div className="grid gap-2">
        {projects.map((project) => (
          <div key={project.id} className="rounded-lg border border-slate-200 p-3">
            <div className="font-medium text-slate-900">{project.name}</div>
            <div className="text-sm text-slate-500">{project.description || "No description"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <header>
      <div className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-950">
        {icon}
        {title}
      </div>
      <p className="text-sm text-slate-500">{description}</p>
    </header>
  );
}

function Field({ name, label, placeholder, type = "text" }: { name: string; label: string; placeholder?: string; type?: string }) {
  return (
    <label className="text-sm text-slate-600">
      {label}
      <input name={name} type={type} placeholder={placeholder} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-slate-900 outline-none focus:border-slate-400" />
    </label>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: { value: string; label: string }[] }) {
  return (
    <label className="text-sm text-slate-600">
      {label}
      <select name={name} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-slate-900 outline-none focus:border-slate-400">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
