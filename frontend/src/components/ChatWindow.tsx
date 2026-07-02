"use client";

import Image from "next/image";
import { Activity, ArrowDown, Bot, BrainCircuit, ChevronDown, Clock, Code2, CreditCard, FileCode2, FileText, FolderOpen, Gauge, Globe, Mic, Paperclip, Plus, Save, Search, Send, Terminal, UploadCloud, User, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AttachmentPayload, ModelOption, Project, ProjectDocument, WorkspaceState } from "@/app/page";

interface Message {
  role: string;
  content: string;
}

interface ChatWindowProps {
  sessionId: string | null;
  messages: Message[];
  onSendMessage: (message: string, attachments?: AttachmentPayload[]) => Promise<void>;
  isStreaming: boolean;
  selectedAgentId: string;
  models: ModelOption[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  activeWorkspace: WorkspaceState | null;
  onWorkspaceSelected: (workspace: WorkspaceState) => Promise<void>;
  projects: Project[];
  selectedProjectId: string;
  projectDocuments: ProjectDocument[];
  onSaveProjectDocument: (projectId: string, document: AttachmentPayload) => Promise<void>;
  searchMode: boolean;
  webSearch: boolean;
  orchestrate: boolean;
  onToggleSearchMode: () => void;
  onToggleWebSearch: () => void;
  onToggleOrchestrate: () => void;
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface FileSystemFileHandleLike {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<{
    write: (content: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

interface FileSystemDirectoryHandleLike {
  kind: "directory";
  name: string;
  entries: () => AsyncIterableIterator<[string, FileSystemFileHandleLike | FileSystemDirectoryHandleLike]>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
}

const AGENT_LABELS: Record<string, string> = {
  general: "General",
  research: "Research",
  code: "Code",
  web: "Web",
};

const MAX_FILE_CHARS = 6000;
const MAX_FILE_BYTES = 80_000;
const CONTEXT_LIMIT_TOKENS = 1_000_000;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "__pycache__", ".venv", "venv"]);
const READABLE_FILE_PATTERN = /\.(txt|md|json|csv|log|ts|tsx|js|jsx|py|css|html|yml|yaml|toml|env|sql|sh|ps1)$/i;

function estimateTokens(text: string) {
  return Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN);
}

function estimateTokensFromChars(chars: number) {
  return Math.ceil(chars / ESTIMATED_CHARS_PER_TOKEN);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
    notation: "compact",
  }).format(value);
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function reasoningText(content: string) {
  return content
    .split("\n")
    .filter((line) =>
      /^\s*(\[THOUGHT\]|\[PLANNER\]|\[RESEARCH\/RAG\]|\[CODER\]|\[REVIEWER\]|Reasoning:|Thought:|Plan:)/i.test(line)
    )
    .join("\n");
}

function renderAgenticContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let actionTitle: string | null = null;
  let actionBody: string[] = [];

  function flushAction(key: string) {
    if (!actionTitle) return;
    elements.push(
      <div key={key} className="my-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950">
          {actionTitle}
        </div>
        {actionBody.length > 0 && (
          <details open className="px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
              reasoning / output
            </summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-6 text-slate-500">
              {actionBody.join("\n")}
            </pre>
          </details>
        )}
      </div>
    );
    actionTitle = null;
    actionBody = [];
  }

  lines.forEach((line, index) => {
    const isActionLine = /^\s*(\[TOOL\]|\[ACTION\]|\[THOUGHT\]|\[ANSWER\]|\[PLANNER\]|\[RESEARCH\/RAG\]|\[CODER\]|\[REVIEWER\]|Tool:|Action:|edit_file|bash)\b/i.test(line);
    const isReasoningLine = /^\s*(Reasoning:|Thought:|Because:|Plan:|Output:|Evidence:)/i.test(line);

    if (isActionLine) {
      flushAction(`action-${index}`);
      actionTitle = line.trim();
      return;
    }

    if (actionTitle && (isReasoningLine || line.trim() || actionBody.length > 0)) {
      actionBody.push(line);
      return;
    }

    flushAction(`action-${index}`);
    elements.push(
      <p key={`text-${index}`} className="whitespace-pre-wrap leading-7 text-slate-800">
        {line || "\u00A0"}
      </p>
    );
  });

  flushAction("action-final");
  return elements;
}

export default function ChatWindow({
  sessionId,
  messages,
  onSendMessage,
  isStreaming,
  selectedAgentId,
  models,
  selectedModel,
  onSelectModel,
  activeWorkspace,
  onWorkspaceSelected,
  projects,
  selectedProjectId,
  projectDocuments,
  onSaveProjectDocument,
  searchMode,
  webSearch,
  orchestrate,
  onToggleSearchMode,
  onToggleWebSearch,
  onToggleOrchestrate,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const projectDocInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeFilePath, setActiveFilePath] = useState<string>("");
  const [editorContent, setEditorContent] = useState("");
  const [fileHandles, setFileHandles] = useState<Record<string, FileSystemFileHandleLike>>({});
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "[workspace] No folder selected yet.",
  ]);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const activeFileContent =
    activeWorkspace?.selected_files.find((file) => file.name === activeFilePath)?.content ?? "";

  useEffect(() => {
    setSessionStartedAt(Date.now());
  }, [sessionId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const overviewStats = useMemo(() => {
    const promptChars =
      messages
        .filter((message) => message.role === "user")
        .reduce((total, message) => total + message.content.length, 0) + input.length;
    const fileContextChars = [
      ...attachments,
      ...(activeWorkspace?.selected_files ?? []),
      ...(selectedProjectId ? projectDocuments : []),
    ].reduce((total, item) => total + (item.content?.length ?? 0), 0);
    const assistantContent = messages
      .filter((message) => message.role === "assistant")
      .map((message) => message.content)
      .join("\n");
    const assistantTokens = estimateTokens(assistantContent);
    const reasoningTokens = estimateTokens(reasoningText(assistantContent));
    const promptTokens = estimateTokensFromChars(promptChars);
    const otherTokens =
      estimateTokensFromChars(fileContextChars) +
      (searchMode ? 64 : 0) +
      (webSearch ? 64 : 0) +
      (orchestrate ? 128 : 0);
    const completionTokens = Math.max(0, assistantTokens - reasoningTokens);
    const totalTokens = promptTokens + completionTokens + reasoningTokens + otherTokens;
    const contextPercent = Math.min(
      100,
      Math.round((totalTokens / CONTEXT_LIMIT_TOKENS) * 100)
    );
    const requestCount = messages.filter((message) => message.role === "user").length;
    const activeFlags = [searchMode, webSearch, orchestrate].filter(Boolean).length;

    return {
      activeFlags,
      completionTokens,
      contextPercent,
      fileContextTokens: otherTokens,
      promptTokens,
      reasoningTokens,
      requestCount,
      totalTokens,
    };
  }, [
    activeWorkspace?.selected_files,
    attachments,
    input,
    messages,
    orchestrate,
    projectDocuments,
    searchMode,
    selectedProjectId,
    webSearch,
  ]);

  useEffect(() => {
    if (!activeWorkspace) {
      setActiveFilePath("");
      setEditorContent("");
      return;
    }

    const nextPath = activeWorkspace.selected_files[0]?.name || activeWorkspace.file_tree[0]?.path || "";
    setActiveFilePath((current) =>
      current && activeWorkspace.file_tree.some((file) => file.path === current) ? current : nextPath
    );
  }, [activeWorkspace]);

  useEffect(() => {
    setEditorContent(activeFileContent);
  }, [activeFileContent, activeFilePath]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollButton(distanceFromBottom > 240);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();
    if ((!message && attachments.length === 0) || isStreaming) return;

    setInput("");
    const filesForTurn = [...attachments, ...(activeWorkspace?.selected_files ?? [])];
    setAttachments([]);
    await onSendMessage(message || "Please review the attached file context.", filesForTurn);
    inputRef.current?.focus();
  }

  async function handleFileSelection(files: FileList | null) {
    if (!files?.length) return;

    const nextAttachments = await Promise.all(
      Array.from(files).map(async (file) => {
        if (file.size > MAX_FILE_BYTES) {
          return {
            name: file.name,
            content: `[Skipped: file is larger than ${Math.round(MAX_FILE_BYTES / 1000)} KB. Attach a smaller text excerpt for this demo.]`,
          };
        }

        const content = await file.text();
        return {
          name: file.name,
          content: content.slice(0, MAX_FILE_CHARS),
        };
      })
    );

    setAttachments((current) => [...current, ...nextAttachments]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleFolderSelection(files: FileList | null) {
    if (!files?.length) return;

    const allFiles = Array.from(files);
    const fileTree = allFiles.map((file) => ({
      path: file.webkitRelativePath || file.name,
      type: "file" as const,
    }));
    const readableFiles = allFiles
      .filter((file) => file.size <= MAX_FILE_BYTES)
      .filter((file) =>
        /\.(txt|md|json|csv|log|ts|tsx|js|jsx|py|css|html|yml|yaml)$/i.test(file.name)
      )
      .slice(0, 8);

    const selectedFiles = await Promise.all(
      readableFiles.map(async (file) => ({
        name: file.webkitRelativePath || file.name,
        content: (await file.text()).slice(0, MAX_FILE_CHARS),
      }))
    );

    setFileHandles({});
    setTerminalLines([
      `[workspace] Opened ${allFiles[0]?.webkitRelativePath?.split("/")[0] || "Selected Workspace"} using upload fallback.`,
      `[index] ${fileTree.length} files scanned; ${selectedFiles.length} text/source files loaded into context.`,
      "[mode] Folder upload fallback is read-only. Use Chrome/Edge directory picker for save support.",
    ]);
    await onWorkspaceSelected({
      name: allFiles[0]?.webkitRelativePath?.split("/")[0] || "Selected Workspace",
      file_tree: fileTree,
      selected_files: selectedFiles,
    });

    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  }

  async function traverseDirectory(
    directoryHandle: FileSystemDirectoryHandleLike,
    rootName: string,
    currentPath = "",
    fileTree: WorkspaceState["file_tree"] = [],
    selectedFiles: AttachmentPayload[] = [],
    nextFileHandles: Record<string, FileSystemFileHandleLike> = {}
  ) {
    for await (const [name, handle] of directoryHandle.entries()) {
      const relativePath = currentPath ? `${currentPath}/${name}` : `${rootName}/${name}`;

      if (handle.kind === "directory") {
        if (IGNORED_DIRS.has(name)) continue;
        fileTree.push({ path: relativePath, type: "directory" });
        await traverseDirectory(handle, rootName, relativePath, fileTree, selectedFiles, nextFileHandles);
        continue;
      }

      fileTree.push({ path: relativePath, type: "file" });
      nextFileHandles[relativePath] = handle;

      if (selectedFiles.length >= 20 || !READABLE_FILE_PATTERN.test(name)) {
        continue;
      }

      const file = await handle.getFile();
      if (file.size > MAX_FILE_BYTES) {
        continue;
      }

      selectedFiles.push({
        name: relativePath,
        content: (await file.text()).slice(0, MAX_FILE_CHARS),
      });
    }

    return { fileTree, selectedFiles, nextFileHandles };
  }

  async function openCodeWorkspace() {
    const pickerWindow = window as DirectoryPickerWindow;
    if (!pickerWindow.showDirectoryPicker) {
      folderInputRef.current?.click();
      return;
    }

    try {
      const directoryHandle = await pickerWindow.showDirectoryPicker();
      const { fileTree, selectedFiles, nextFileHandles } = await traverseDirectory(
        directoryHandle,
        directoryHandle.name
      );
      setFileHandles(nextFileHandles);
      setTerminalLines([
        `[workspace] Opened ${directoryHandle.name}`,
        `[index] ${fileTree.length} entries scanned; ${selectedFiles.length} text/source files loaded into context.`,
        "[mode] Browser File System Access save is enabled for readable files.",
      ]);
      await onWorkspaceSelected({
        name: directoryHandle.name,
        file_tree: fileTree,
        selected_files: selectedFiles,
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setTerminalLines((current) => [...current, `[error] ${(error as Error).message}`]);
      }
    }
  }

  async function saveActiveFile() {
    if (!activeFilePath) return;
    const handle = fileHandles[activeFilePath];
    if (!handle?.createWritable) {
      setTerminalLines((current) => [
        ...current,
        `[save] ${activeFilePath} is read-only in this browser fallback mode.`,
      ]);
      return;
    }

    const writable = await handle.createWritable();
    await writable.write(editorContent);
    await writable.close();
    setTerminalLines((current) => [...current, `[save] Wrote ${activeFilePath}`]);
  }

  async function handleProjectDocumentSelection(files: FileList | null) {
    if (!files?.length || !selectedProjectId) return;

    for (const file of Array.from(files)) {
      const content = await file.text();
      await onSaveProjectDocument(selectedProjectId, {
        name: file.name,
        content: content.slice(0, 120_000),
      });
    }

    if (projectDocInputRef.current) {
      projectDocInputRef.current.value = "";
    }
  }

  function startVoiceInput() {
    if (typeof window === "undefined" || isStreaming) return;

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setInput((current) =>
        current
          ? current
          : "Voice input is not supported in this browser. Please type your message."
      );
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        setInput((current) => (current ? `${current} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  }

  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-white">

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto ${activeWorkspace ? "mr-[44%] border-r border-slate-200" : "xl:mr-80"}`}
      >
        {!sessionId ? (
          <section className="mx-auto flex min-h-full w-full max-w-[760px] flex-col items-center justify-center px-6 pb-40 pt-12">
            <div className="relative mb-3 h-9 w-9 self-start">
              <Image
                src="/logo.png"
                alt="Tesseracq Labs"
                fill
                priority
                sizes="36px"
                className="object-contain"
              />
            </div>
            <h1 className="w-full text-left text-3xl font-semibold tracking-tight text-slate-950 max-md:text-2xl">
              How can I help you today?
            </h1>
          </section>
        ) : messages.length === 0 ? (
          <section className="mx-auto flex min-h-full w-full max-w-[760px] flex-col items-center justify-center px-6 pb-40 pt-12">
            <div className="relative mb-3 h-9 w-9 self-start">
              <Image
                src="/logo.png"
                alt="Tesseracq Labs"
                fill
                priority
                sizes="36px"
                className="object-contain"
              />
            </div>
            <h1 className="w-full text-left text-3xl font-semibold tracking-tight text-slate-950 max-md:text-2xl">
              How can I help you today?
            </h1>
          </section>
        ) : (
          <div className="mx-auto w-full max-w-[760px] px-6 py-8 pb-36 max-md:px-4">
            {messages.map((message, index) => {
              const isUser = message.role === "user";

              return (
                <article
                  key={`${message.role}-${index}`}
                  className="grid grid-cols-[32px_1fr] gap-4 py-6"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      isUser
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {isUser ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {isUser ? "You" : "Tesseracq Labs"}
                    </p>
                    <div className="text-[15px] text-slate-800">
                      {isUser ? renderAgenticContent(message.content) : renderAgenticContent(message.content)}
                    </div>
                  </div>
                </article>
              );
            })}

            {isStreaming && messages[messages.length - 1]?.role === "user" && (
              <article className="grid grid-cols-[32px_1fr] gap-4 py-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                  Streaming response...
                </div>
              </article>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {showScrollButton && (
        <button
          type="button"
          onClick={() =>
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
          }
          className="absolute bottom-28 right-8 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
          aria-label="Scroll to latest message"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

      {activeWorkspace && (
        <aside className="absolute bottom-0 right-0 top-0 flex w-[44%] flex-col bg-slate-50">
          <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4">
            <div className="flex min-w-0 items-center gap-2">
              <FolderOpen className="h-4 w-4 shrink-0 text-slate-600" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{activeWorkspace.name}</p>
                <p className="text-xs text-slate-500">{activeWorkspace.file_tree.length} indexed entries</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void saveActiveFile()}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              title="Save active file"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
            <div className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Files</p>
              <div className="space-y-1">
                {activeWorkspace.file_tree.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => item.type === "file" && setActiveFilePath(item.path)}
                    className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                      activeFilePath === item.path
                        ? "bg-slate-900 text-white"
                        : item.type === "directory"
                          ? "text-slate-500"
                          : "text-slate-700 hover:bg-slate-100"
                    }`}
                    title={item.path}
                  >
                    {item.type === "directory" ? (
                      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{item.path.replace(`${activeWorkspace.name}/`, "")}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex h-10 items-center justify-between border-b border-slate-200 bg-white px-3">
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {activeFilePath || "No file selected"}
                  </p>
                  <span className="text-xs text-slate-400">
                    {fileHandles[activeFilePath]?.createWritable ? "writable" : "context view"}
                  </span>
                </div>
                <textarea
                  value={editorContent}
                  onChange={(event) => setEditorContent(event.target.value)}
                  spellCheck={false}
                  className="min-h-0 flex-1 resize-none bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none"
                  placeholder="Select a readable file from the tree."
                />
              </div>

              <div className="h-44 border-t border-slate-200 bg-white">
                <div className="flex h-9 items-center gap-2 border-b border-slate-200 px-3">
                  <Terminal className="h-4 w-4 text-slate-600" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terminal / Index Log</p>
                </div>
                <pre className="h-[calc(100%-36px)] overflow-auto bg-slate-950 p-3 font-mono text-xs leading-6 text-slate-100">
                  {terminalLines.join("\n")}
                </pre>
              </div>

              <div className="border-t border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project Knowledge</p>
                    <p className="text-xs text-slate-500">
                      {projectDocuments.length} scoped document{projectDocuments.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!selectedProjectId}
                    onClick={() => projectDocInputRef.current?.click()}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                    title="Upload project document"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Upload
                  </button>
                </div>
                <div className="max-h-20 space-y-1 overflow-auto">
                  {projectDocuments.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Select a project, then upload docs to include them in that project only.
                    </p>
                  ) : (
                    projectDocuments.map((document) => (
                      <div key={document.id} className="truncate rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">
                        {document.name}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {!activeWorkspace && (
        <UsageOverviewPanel
          stats={overviewStats}
          selectedModel={selectedModel}
          sessionDuration={formatDuration(now - sessionStartedAt)}
          streamingDuration={isStreaming ? formatDuration(now - sessionStartedAt) : "-"}
          isStreaming={isStreaming}
        />
      )}

      <footer className={`absolute bottom-0 left-0 ${activeWorkspace ? "right-[44%]" : "right-0 xl:right-80"} bg-gradient-to-t from-white via-white to-white/0 px-6 pb-5 pt-10 max-md:px-4`}>
        <form
          onSubmit={handleSubmit}
          className={`shadow-box mx-auto rounded-2xl border border-slate-200 bg-white p-2 ${activeWorkspace ? "max-w-[calc(100%-48px)]" : "max-w-[760px]"}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".txt,.md,.json,.csv,.log,text/*,application/json"
            onChange={(event) => void handleFileSelection(event.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void handleFolderSelection(event.target.files)}
            {...{ webkitdirectory: "", directory: "" }}
          />
          <input
            ref={projectDocInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".txt,.md,.json,.csv,.log,text/*,application/json"
            onChange={(event) => void handleProjectDocumentSelection(event.target.files)}
          />
          {(attachments.length > 0 || activeWorkspace || searchMode || webSearch || orchestrate || selectedModel) && (
            <div className="mb-1 flex flex-wrap items-center gap-1.5 px-2 pt-1">
              <StatusChip label={`Agent: ${AGENT_LABELS[selectedAgentId] ?? "General"}`} />
              <StatusChip label={`Model: ${selectedModel}`} />
              {selectedProjectId && (
                <>
                  <StatusChip label={`Project: ${projects.find((project) => project.id === selectedProjectId)?.name ?? "Active"}`} />
                  <StatusChip label={`${projectDocuments.length} knowledge doc${projectDocuments.length === 1 ? "" : "s"}`} />
                </>
              )}
              {activeWorkspace && (
                <StatusChip
                  label={`Workspace: ${activeWorkspace.name} (${activeWorkspace.file_tree.length} files)`}
                />
              )}
              {searchMode && <StatusChip label="Search mode" />}
              {webSearch && <StatusChip label="Web lookup" />}
              {orchestrate && <StatusChip label="Multi-agent orchestration" />}
              {attachments.map((attachment, index) => (
                <button
                  key={`${attachment.name}-${index}`}
                  type="button"
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                  className="flex max-w-48 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                  title={`Remove ${attachment.name}`}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{attachment.name}</span>
                  <X className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
            </div>
          )}
          <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={isStreaming}
              rows={1}
              placeholder={
                isStreaming
                  ? "Waiting for response..."
                  : "How can I help you today?"
              }
              className="block max-h-32 min-h-11 w-full resize-none bg-transparent px-3 py-3 text-[15px] text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
            />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {selectedProjectId && (
                <>
                  <div
                    className="flex h-8 max-w-44 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700"
                    title="Active project"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {projects.find((project) => project.id === selectedProjectId)?.name ?? "Project"}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isStreaming}
                    onClick={() => projectDocInputRef.current?.click()}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    title="Upload project source"
                  >
                    <UploadCloud className="h-4 w-4" />
                    <span className="max-md:hidden">Sources</span>
                  </button>
                </>
              )}
              <ModelSelect
                models={models}
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
                disabled={isStreaming}
              />
              <IconButton
                icon={<Plus className="h-4 w-4" />}
                label="Add file"
                onClick={() => fileInputRef.current?.click()}
              />
              <IconButton
                icon={<Paperclip className="h-4 w-4" />}
                label="Attach file"
                onClick={() => fileInputRef.current?.click()}
              />
              <PillButton
                icon={<Code2 className="h-4 w-4" />}
                label="Code"
                active={Boolean(activeWorkspace)}
                onClick={() => void openCodeWorkspace()}
              />
              <PillButton
                icon={<Search className="h-4 w-4" />}
                label="Search"
                active={searchMode}
                onClick={onToggleSearchMode}
              />
              <PillButton
                icon={<Globe className="h-4 w-4" />}
                label="Web"
                active={webSearch}
                onClick={onToggleWebSearch}
              />
              <PillButton
                icon={<BrainCircuit className="h-4 w-4" />}
                label="Orchestrate"
                active={orchestrate}
                onClick={onToggleOrchestrate}
              />
            </div>
            <div className="flex items-center gap-1">
              <IconButton
                icon={<Mic className="h-4 w-4" />}
                label={isListening ? "Listening" : "Voice"}
                active={isListening}
                onClick={startVoiceInput}
              />
              <button
                type="submit"
                disabled={isStreaming || (!input.trim() && attachments.length === 0)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </form>
      </footer>
    </main>
  );
}

interface UsageOverviewStats {
  activeFlags: number;
  completionTokens: number;
  contextPercent: number;
  fileContextTokens: number;
  promptTokens: number;
  reasoningTokens: number;
  requestCount: number;
  totalTokens: number;
}

function UsageOverviewPanel({
  stats,
  selectedModel,
  sessionDuration,
  streamingDuration,
  isStreaming,
}: {
  stats: UsageOverviewStats;
  selectedModel: string;
  sessionDuration: string;
  streamingDuration: string;
  isStreaming: boolean;
}) {
  const contextHealth =
    stats.contextPercent >= 85
      ? "Tight"
      : stats.contextPercent >= 65
        ? "Many files"
        : "Healthy";
  const ringBackground = `conic-gradient(rgb(15 23 42) ${stats.contextPercent}%, rgb(226 232 240) 0)`;

  return (
    <aside className="absolute bottom-0 right-0 top-0 hidden w-80 flex-col border-l border-slate-200 bg-white xl:flex">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        <Activity className="h-4 w-4 text-slate-700" />
        <p className="text-sm font-semibold text-slate-950">Overview</p>
      </div>

      <div className="flex-1 space-y-3 overflow-auto bg-slate-50 p-3">
        <OverviewSection icon={<Gauge className="h-4 w-4" />} title="Context window">
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex h-36 w-36 items-center justify-center rounded-full p-4"
              style={{ background: ringBackground }}
            >
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
                <p className="text-3xl font-semibold text-slate-950">{stats.contextPercent}%</p>
                <p className="text-xs text-slate-500">context used</p>
              </div>
            </div>
            <p className="font-mono text-xs text-slate-700">
              {formatCompact(stats.totalTokens)} / {formatCompact(CONTEXT_LIMIT_TOKENS)} tokens
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <MeterRow label="Prompt" value={stats.promptTokens} colorClassName="bg-cyan-500" />
            <MeterRow label="Completion" value={stats.completionTokens} colorClassName="bg-blue-500" />
            <MeterRow label="Reasoning" value={stats.reasoningTokens} colorClassName="bg-orange-500" />
            <MeterRow label="Other" value={stats.fileContextTokens} colorClassName="bg-slate-300" />
          </div>
        </OverviewSection>

        <OverviewSection icon={<Clock className="h-4 w-4" />} title="Runtime">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Time" value={sessionDuration} />
            <StatTile label="Streaming" value={streamingDuration} detail={isStreaming ? "active" : "idle"} />
            <StatTile label="Requests" value={formatInteger(stats.requestCount)} />
            <StatTile label="Tools" value={formatInteger(stats.activeFlags)} detail="enabled" />
          </div>
        </OverviewSection>

        <OverviewSection icon={<CreditCard className="h-4 w-4" />} title="Cost">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Session cost" value="-" detail="usage API needed" />
            <StatTile label="Cache hit" value="-" detail="not exposed" />
          </div>
          <p className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-500">
            Token counts update live here. Exact billed cost needs backend usage metadata from the provider stream.
          </p>
        </OverviewSection>

        <OverviewSection icon={<Terminal className="h-4 w-4" />} title="Session status">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Context health" value={contextHealth} />
            <StatTile label="Compaction" value={`${Math.max(0, 100 - stats.contextPercent)}%`} />
          </div>
          <p className="mt-2 truncate rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">
            {selectedModel || "No model selected"}
          </p>
        </OverviewSection>
      </div>
    </aside>
  );
}

function OverviewSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-slate-700">
        {icon}
        <p className="text-sm font-semibold text-slate-950">{title}</p>
      </div>
      {children}
    </section>
  );
}

function MeterRow({
  label,
  value,
  colorClassName,
}: {
  label: string;
  value: number;
  colorClassName: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${colorClassName}`} />
        <span className="truncate text-slate-600">{label}</span>
      </div>
      <span className="font-mono text-xs text-slate-700">{formatInteger(value)}</span>
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <p className="truncate text-xs text-slate-500">{label}</p>
      <p className="truncate text-lg font-semibold text-slate-950">{value}</p>
      {detail && <p className="truncate text-xs text-slate-400">{detail}</p>}
    </div>
  );
}

function ModelSelect({
  models,
  selectedModel,
  onSelectModel,
  disabled,
}: {
  models: ModelOption[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
  disabled: boolean;
}) {
  const options =
    models.length > 0
      ? models
      : [{ id: selectedModel, label: selectedModel }];

  return (
    <label className="relative flex h-8 items-center">
      <span className="sr-only">Model</span>
      <select
        value={selectedModel}
        disabled={disabled}
        onChange={(event) => onSelectModel(event.target.value)}
        className="h-8 max-w-52 appearance-none rounded-lg border border-slate-200 bg-white py-0 pl-2.5 pr-7 text-sm text-slate-700 outline-none transition hover:bg-slate-50 focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 max-md:max-w-36"
        title="Select model"
      >
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-500" />
    </label>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
      {label}
    </span>
  );
}

function IconButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-slate-100 hover:text-slate-900 ${
        active ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white" : "text-slate-500"
      }`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function PillButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm transition hover:bg-slate-100 hover:text-slate-900 ${
        active ? "bg-slate-900 text-white hover:bg-slate-800 hover:text-white" : "text-slate-600"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
