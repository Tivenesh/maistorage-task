"use client";

import { FormEvent, useRef, useState } from "react";
import { FileImage, FileText, MessageSquare, Plus, Send, UploadCloud } from "lucide-react";
import type { AttachmentPayload, Project, ProjectDocument } from "@/app/page";

interface Session {
  id: string;
  title: string;
  project_id?: string | null;
  created_at: string;
}

interface ProjectWorkspaceProps {
  project: Project;
  documents: ProjectDocument[];
  sessions: Session[];
  onUploadDocument: (projectId: string, document: AttachmentPayload) => Promise<void>;
  onStartChat: (message?: string) => Promise<void>;
  onOpenSession: (sessionId: string) => void;
}

const READABLE_SOURCE_PATTERN = /\.(txt|md|json|csv|log|ts|tsx|js|jsx|py|css|html|yml|yaml|toml|sql|sh|ps1)$/i;
const IMAGE_SOURCE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;

async function sourcePayload(file: File): Promise<AttachmentPayload> {
  if (READABLE_SOURCE_PATTERN.test(file.name) || file.type.startsWith("text/")) {
    return {
      name: file.name,
      content: (await file.text()).slice(0, 120_000),
    };
  }

  if (IMAGE_SOURCE_PATTERN.test(file.name) || file.type.startsWith("image/")) {
    return {
      name: file.name,
      content: `[Image source uploaded: ${file.name}. Type: ${file.type || "unknown"}. Size: ${file.size} bytes. This lightweight demo stores image metadata as a shared project source; text documents are embedded for semantic RAG.]`,
    };
  }

  return {
    name: file.name,
    content: `[Source uploaded: ${file.name}. Type: ${file.type || "unknown"}. Size: ${file.size} bytes. This file type is tracked as a project source, but only text-like files are embedded as readable RAG content.]`,
  };
}

export default function ProjectWorkspace({
  project,
  documents,
  sessions,
  onUploadDocument,
  onStartChat,
  onOpenSession,
}: ProjectWorkspaceProps) {
  const [prompt, setPrompt] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        await onUploadDocument(project.id, await sourcePayload(file));
      }
    } finally {
      setIsUploading(false);
      if (sourceInputRef.current) {
        sourceInputRef.current.value = "";
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsStarting(true);
    try {
      await onStartChat(prompt.trim() || undefined);
      setPrompt("");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-10 max-md:px-4">
        <div className="mb-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => sourceInputRef.current?.click()}
            className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <UploadCloud className="h-4 w-4" />
            {isUploading ? "Uploading..." : "Add sources"}
          </button>
          <div className="flex h-9 items-center gap-2 rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700">
            <FileText className="h-4 w-4 text-red-500" />
            {documents.length} Source{documents.length === 1 ? "" : "s"}
          </div>
        </div>

        <input
          ref={sourceInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".txt,.md,.json,.csv,.log,.ts,.tsx,.js,.jsx,.py,.css,.html,.yml,.yaml,.toml,.sql,.sh,.ps1,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,text/*,application/json,image/*"
          onChange={(event) => void handleUpload(event.target.files)}
        />

        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-12">
          <div className="mb-7">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <FileText className="h-6 w-6" />
            </div>
            <h1 className="text-4xl font-semibold tracking-normal text-slate-950 max-md:text-3xl">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-2 max-w-2xl text-base leading-7 text-slate-500">
                {project.description}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="shadow-box flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <button
              type="button"
              onClick={() => sourceInputRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              title="Add project sources"
            >
              <Plus className="h-5 w-5" />
            </button>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask about this project"
              className="min-w-0 flex-1 bg-transparent text-lg text-slate-950 outline-none placeholder:text-slate-400"
              disabled={isStarting}
            />
            <button
              type="submit"
              disabled={isStarting}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              title="Start project chat"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1fr]">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-500">Sources</h2>
              <div className="space-y-2">
                {documents.length === 0 ? (
                  <p className="text-sm leading-6 text-slate-500">
                    Upload documents here once. Every chat started from this project will use the same shared source set.
                  </p>
                ) : (
                  documents.slice(0, 6).map((document) => {
                    const isImage = IMAGE_SOURCE_PATTERN.test(document.name);
                    return (
                      <div key={document.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                        {isImage ? <FileImage className="h-4 w-4 text-sky-600" /> : <FileText className="h-4 w-4 text-red-500" />}
                        <span className="truncate">{document.name}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-500">Past chats</h2>
              <div className="space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-sm leading-6 text-slate-500">
                    Start multiple chats from this page. They stay separate, but share this project knowledge base.
                  </p>
                ) : (
                  sessions.slice(0, 6).map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onOpenSession(session.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate">{session.title}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {new Date(session.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
