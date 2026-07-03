"use client";

import Image from "next/image";
import { useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { BookOpen, Bot, Code2, FolderPlus, Globe, KeyRound, MessageSquare, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, SquarePen, Sun, Trash2, X } from "lucide-react";
import { listItemVariants, MotionButton, spring } from "@/components/MotionControls";
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
  theme: string;
  onToggleCollapsed: () => void;
  onToggleTheme: () => void;
  onSelectProject: (projectId: string) => void;
  onOpenAgents: () => void;
  onOpenProject: () => void;
  onOpenSettings: () => void;
  toggleRef?: RefObject<HTMLButtonElement | null>;
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
  theme,
  onToggleCollapsed,
  onToggleTheme,
  onSelectProject,
  onOpenAgents,
  onOpenProject,
  onOpenSettings,
  toggleRef,
}: SessionSidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSessions = useMemo(() => {
    if (!normalizedQuery) return sessions;

    return sessions.filter((session) =>
      session.title.toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery, sessions]);

  function openSearch() {
    if (collapsed) {
      onToggleCollapsed();
    }
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchQuery("");
    setSearchOpen(false);
  }

  return (
    <motion.aside
      data-reveal
      layout
      transition={spring.panel}
      className={`glass-rail relative z-10 m-3.5 flex h-[calc(100%-28px)] shrink-0 flex-col rounded-[22px] max-md:m-2 max-md:max-h-[248px] max-md:w-[calc(100%-16px)] max-md:overflow-y-auto ${
        collapsed ? "w-[76px]" : "w-[256px]"
      }`}
    >
      <LayoutGroup id="sidebar">
      <motion.div
        layout
        transition={spring.panel}
        className={`flex h-[72px] items-center ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <motion.div
            layout
            transition={spring.panel}
            className={`brand-logo-surface relative h-[34px] overflow-hidden ${
              collapsed ? "w-[34px]" : "w-[176px]"
            }`}
          >
            <Image
              src="/logo.png"
              alt="MaiStorage"
              fill
              priority
              sizes={collapsed ? "34px" : "176px"}
              className={collapsed ? "object-contain object-left" : "object-contain"}
            />
          </motion.div>
        </div>
        {!collapsed && (
          <MotionButton
            type="button"
            interaction="icon"
            onClick={onToggleCollapsed}
            className="rail-button rounded-lg p-1.5 transition"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </MotionButton>
        )}
        {collapsed && (
          <MotionButton
            type="button"
            interaction="icon"
            onClick={onToggleCollapsed}
            className="rail-button rounded-lg p-1.5 transition"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </MotionButton>
        )}
      </motion.div>

      <motion.div layout transition={spring.panel} className="space-y-1 px-2 pb-3">
        <MotionButton
          type="button"
          onClick={onCreateSession}
          className={`primary-command flex h-[42px] w-full items-center gap-2 rounded-[13px] px-3 text-sm font-semibold transition ${collapsed ? "justify-center" : ""}`}
        >
          <SquarePen className="h-4 w-4" />
          <CollapsibleLabel collapsed={collapsed}>New Chat</CollapsibleLabel>
        </MotionButton>
        <MotionButton
          type="button"
          onClick={openSearch}
          className={`rail-button flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-sm transition ${collapsed ? "justify-center" : ""}`}
          aria-expanded={searchOpen}
          aria-controls="chat-search"
        >
          <Search className="h-4 w-4" />
          <CollapsibleLabel collapsed={collapsed}>Search Chats</CollapsibleLabel>
        </MotionButton>
        <AnimatePresence initial={false} mode="popLayout">
          {searchOpen && !collapsed && (
          <motion.div
            key="sidebar-search"
            layout
            initial={{ opacity: 0, scale: 0.98, y: -6, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, y: -4, filter: "blur(6px)" }}
            transition={spring.panel}
            onAnimationComplete={() => searchInputRef.current?.focus()}
            className="field-surface flex h-10 items-center gap-2 rounded-[12px] px-3"
          >
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              ref={searchInputRef}
              id="chat-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeSearch();
                }
              }}
              placeholder="Search recent chats"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              type="search"
            />
            {(searchQuery || searchOpen) && (
              <MotionButton
                type="button"
                interaction="icon"
                onClick={closeSearch}
                className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-900"
                aria-label="Clear chat search"
              >
                <X className="h-3.5 w-3.5" />
              </MotionButton>
            )}
          </motion.div>
          )}
        </AnimatePresence>
        <MotionButton
          type="button"
          onClick={onOpenSettings}
          className={`rail-button flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-sm transition ${collapsed ? "justify-center" : ""}`}
        >
          <KeyRound className="h-4 w-4" />
          <CollapsibleLabel collapsed={collapsed}>API Keys</CollapsibleLabel>
        </MotionButton>
      </motion.div>

      <motion.div layout transition={spring.panel} className="flex-1 overflow-y-auto px-2 pb-3 max-md:max-h-44">
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
          ) : filteredSessions.length === 0 ? (
            !collapsed && (
              <p className="px-3 py-2 text-sm leading-5 text-slate-500">
                No chats match &quot;{searchQuery.trim()}&quot;.
              </p>
            )
          ) : (
            <motion.div layout className="space-y-1">
            <AnimatePresence initial={false} mode="popLayout">
            {filteredSessions.map((session) => {
              const isActive = session.id === currentSessionId;

              return (
                <motion.div
                  key={session.id}
                  layout
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={spring.soft}
                  className={`group flex items-center gap-2 rounded-[11px] px-2 py-2 text-sm transition ${
                    isActive
                      ? "sidebar-selected text-slate-950"
                      : "rail-button"
                  }`}
                >
                  <MotionButton
                    type="button"
                    onClick={() => onSelectSession(session.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2 text-left ${collapsed ? "justify-center" : ""}`}
                  >
                    {session.project_id ? (
                      <BookOpen className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <CollapsibleLabel collapsed={collapsed}>{session.title}</CollapsibleLabel>
                  </MotionButton>

                  {!collapsed && <MotionButton
                    type="button"
                    interaction="icon"
                    onClick={() => onDeleteSession(session.id)}
                    className="rounded p-1 text-slate-400 opacity-0 transition hover:bg-white/20 hover:text-red-500 group-hover:opacity-100 max-md:opacity-100"
                    aria-label={`Delete ${session.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </MotionButton>}
                </motion.div>
              );
            })}
            </AnimatePresence>
            </motion.div>
          )}
        </SidebarSection>
      </motion.div>

      <div className="border-t border-slate-200 p-2 max-md:hidden">
        <MotionButton
          type="button"
          ref={toggleRef}
          onClick={onToggleTheme}
          className={`rail-button mb-1 flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-sm transition ${
            collapsed ? "justify-center" : ""
          }`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={theme}
              initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.6, opacity: 0 }}
              transition={spring.icon}
              className="flex"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
          {!collapsed && (
            <>
              <CollapsibleLabel collapsed={collapsed}>{theme === "dark" ? "Light mode" : "Dark mode"}</CollapsibleLabel>
              <span
                className={`theme-toggle-knob ml-auto h-4 w-8 rounded-full border border-[var(--glass-brd)] bg-[var(--field-bg)] p-0.5 ${
                  theme === "dark" ? "" : "shadow-[0_0_18px_var(--orange-glow)]"
                }`}
                aria-hidden="true"
              >
                <span
                  className={`block h-3 w-3 rounded-full bg-[var(--orange)] transition-transform duration-300 ${
                    theme === "dark" ? "translate-x-0" : "translate-x-4"
                  }`}
                />
              </span>
            </>
          )}
        </MotionButton>
        <MotionButton
          type="button"
          onClick={onOpenSettings}
          className={`rail-button flex h-10 w-full items-center gap-2 rounded-[12px] px-3 text-sm transition ${collapsed ? "justify-center" : ""}`}
          >
          <Settings className="h-4 w-4" />
          <CollapsibleLabel collapsed={collapsed}>Settings</CollapsibleLabel>
        </MotionButton>
      </div>
      </LayoutGroup>
    </motion.aside>
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
      {!collapsed && <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h2>}
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
    <MotionButton
      type="button"
      onClick={onClick}
      title={label}
      className={`flex h-[38px] w-full items-center gap-2 rounded-[11px] px-3 text-[13.5px] transition ${
        collapsed ? "justify-center" : ""
      } ${
        selected
          ? "sidebar-selected font-medium text-slate-950"
          : muted
            ? "rail-button"
            : "rail-button"
      }`}
    >
      <span className={selected ? "text-[var(--orange)]" : "text-slate-500"}>{icon}</span>
      <CollapsibleLabel collapsed={collapsed}>{label}</CollapsibleLabel>
    </MotionButton>
  );
}

function CollapsibleLabel({
  children,
  collapsed,
}: {
  children: React.ReactNode;
  collapsed: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.span
          key="label"
          layout
          initial={{ opacity: 0, x: -6, filter: "blur(4px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -6, filter: "blur(4px)" }}
          transition={spring.soft}
          className="min-w-0 truncate"
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
