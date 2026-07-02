export type BlockKind = "action" | "thought" | "text";

export interface ContentBlock {
  kind: BlockKind;
  title: string | null;
  lines: string[];
}

const ACTION_PATTERN = /^\s*(\[TOOL\]|\[ACTION\]|\[TOOLCALL\]|Tool:|Action:|edit_file|bash|read_file|write_file|list_files)\b/i;
const THOUGHT_PATTERN = /^\s*(\[THOUGHT\]|\[REASONING\]|Thinking:|Thought:|Reasoning:|Because:|Plan:|evidence:)/i;

export function parseStreamBlocks(raw: string): ContentBlock[] {
  const lines = raw.split("\n");
  const blocks: ContentBlock[] = [];
  let current: ContentBlock | null = null;

  function flush() {
    if (current && current.lines.length > 0) {
      blocks.push(current);
    }
    current = null;
  }

  for (const line of lines) {
    if (ACTION_PATTERN.test(line)) {
      flush();
      current = { kind: "action", title: line.trim(), lines: [] };
      continue;
    }

    if (THOUGHT_PATTERN.test(line)) {
      flush();
      current = { kind: "thought", title: line.trim(), lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else {
      blocks.push({ kind: "text", title: null, lines: [line] });
    }
  }

  flush();
  return blocks;
}

export function renderBlockMarkdown(content: string): string {
  return content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, "<br>");
}
