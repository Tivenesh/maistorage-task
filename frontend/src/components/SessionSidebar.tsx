"use client";

import Image from "next/image";
import { BookOpen, Bot, Code2, FolderPlus, Globe, MessageSquare, PanelLeftClose, PanelLeftOpen, Search, Settings, SquarePen, Trash2 } from "lucide-react";
import type { AgentConfig, Project } from "@/app/page";

interface Session {
  id: string;
  title: string;
  project_id?: string | null;
  created_at: string;
}

interface SessionSidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  agents: AgentConfig[];
  projects: Project[];
  selectedProjectId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectProject: (projectId: string) => void;
  onOpenAgents: () => void;
  onOpenProject: () => void;
  onOpenSettings: () => void;
}

const AGENTS = [
  { id: "general", label: "General", icon: <Bot className="h-4 w-4" /> },
  { id: "research", label: "Research", icon: <Search className="h-4 w-4" /> },
  { id: "code", label: "Code", icon: <Code2 className="h-4 w-4" /> },
  { id: "web", label: "Web", icon: <Globe className="h-4 w-4" /> },
];

export default function SessionSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  selectedAgentId,
  onSelectAgent,
  agents,
  projects,
  selectedProjectId,
  collapsed,
  onToggleCollapsed,
  onSelectProject,
  onOpenAgents,
  onOpenProject,
  onOpenSettings,
}: SessionSidebarProps) {
  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-slate-200 bg-[#f8fafc] transition-[width] duration-200 max-md:h-auto max-md:w-full max-md:border-b max-md:border-r-0 ${
        collapsed ? "w-[72px]" : "w-[264px]"
      }`}
    >
      <div className={`flex h-[68px] items-center ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative h-7 w-7 overflow-hidden rounded-sm bg-lime-300">
            <Image
              src="/logo.png"
              alt=""
              fill
              priority
              sizes="28px"
              className="object-cover"
            />
          </div>
          {!collapsed && <div className="leading-none">
            <div className="text-sm font-semibold tracking-tight text-slate-950">
              Tesseracq Labs
            </div>
          </div>}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-1 px-2 pb-3">
        <button
          type="button"
          onClick={onCreateSession}
          className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-800 transition hover:bg-slate-200/70 ${collapsed ? "justify-center" : ""}`}
        >
          <SquarePen className="h-4 w-4" />
          {!collapsed && "New Session"}
        </button>
        <button
          type="button"
          className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-slate-700 transition hover:bg-slate-200/70 ${collapsed ? "justify-center" : ""}`}
        >
          <Search className="h-4 w-4" />
          {!collapsed && "Search Chats"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 max-md:max-h-44">
        <SidebarSection title="Agents" collapsed={collapsed}>
          <SidebarItem
            icon={<Bot className="h-4 w-4" />}
            label="Explore Agents"
            muted
            collapsed={collapsed}
            onClick={onOpenAgents}
          />
          {AGENTS.map((agent) => (
            <SidebarItem
              key={agent.id}
              icon={agent.icon}
              label={agent.label}
              selected={agent.id === selectedAgentId}
              collapsed={collapsed}
              onClick={() => onSelectAgent(agent.id)}
            />
          ))}
          {agents.map((agent) => (
            <SidebarItem
              key={agent.id}
              icon={<Bot className="h-4 w-4" />}
              label={agent.name}
              selected={agent.id === selectedAgentId}
              collapsed={collapsed}
              onClick={() => onSelectAgent(agent.id)}
            />
          ))}
        </SidebarSection>

        <SidebarSection title="Projects" collapsed={collapsed}>
          <SidebarItem
            icon={<FolderPlus className="h-4 w-4" />}
            label="New Project"
            muted
            collapsed={collapsed}
            onClick={onOpenProject}
          />
          {projects.map((project) => (
            <SidebarItem
              key={project.id}
              icon={<BookOpen className="h-4 w-4" />}
              label={project.name}
              selected={project.id === selectedProjectId && !currentSessionId}
              collapsed={collapsed}
              onClick={() => onSelectProject(project.id)}
            />
          ))}
        </SidebarSection>

        <SidebarSection title="Recents" collapsed={collapsed}>
          {sessions.length === 0 ? (
            !collapsed && <p className="px-3 py-2 text-sm leading-5 text-slate-500">
              Try sending a message! Your chat history will appear here.
            </p>
          ) : (
            <div className="space-y-1">
            {sessions.map((session) => {
              const isActive = session.id === currentSessionId;

              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                    isActive
                      ? "bg-slate-100 text-slate-950"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(session.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2 text-left ${collapsed ? "justify-center" : ""}`}
                  >
                    {session.project_id ? (
                      <BookOpen className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    {!collapsed && <span className="truncate">{session.title}</span>}
                  </button>

                  {!collapsed && <button
                    type="button"
                    onClick={() => onDeleteSession(session.id)}
                    className="rounded p-1 text-slate-400 opacity-0 transition hover:bg-white hover:text-red-500 group-hover:opacity-100 max-md:opacity-100"
                    aria-label={`Delete ${session.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>}
                </div>
              );
            })}
            </div>
          )}
        </SidebarSection>
      </div>

      <div className="border-t border-slate-200 p-2 max-md:hidden">
        <button
          type="button"
          onClick={onOpenSettings}
          className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-slate-700 transition hover:bg-slate-200/70 ${collapsed ? "justify-center" : ""}`}
        >
          <Settings className="h-4 w-4" />
          {!collapsed && "Settings"}
        </button>
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  children,
  collapsed,
}: {
  title: string;
  children: React.ReactNode;
  collapsed: boolean;
}) {
  return (
    <section className="mb-4">
      {!collapsed && <h2 className="px-3 pb-1 text-xs font-medium text-slate-500">{title}</h2>}
      {children}
    </section>
  );
}

function SidebarItem({
  icon,
  label,
  muted = false,
  selected = false,
  collapsed = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  muted?: boolean;
  selected?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm transition hover:bg-slate-200/70 ${
        collapsed ? "justify-center" : ""
      } ${
        selected
          ? "bg-slate-200/80 font-medium text-slate-950"
          : muted
            ? "text-slate-600"
            : "text-slate-800"
      }`}
    >
      <span className={selected ? "text-slate-900" : "text-slate-500"}>{icon}</span>
      {!collapsed && label}
    </button>
  );
}
