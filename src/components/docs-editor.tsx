"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { useCallback, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";

/* ── Markdown → HTML (load) ── */

function mdToHtml(md: string): string {
  let html = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^---$/gm, "<hr />");

  // Tables
  html = html.replace(
    /(\|.+\|[\r\n]+\|[-| :]+\|[\r\n]+((\|.+\|[\r\n]*)+))/g,
    (table) => {
      const lines = table.trim().split("\n").filter((l) => l.trim());
      if (lines.length < 2) return table;
      const headerCells = lines[0].split("|").filter((c) => c.trim());
      const bodyLines = lines.slice(2);
      let t = "<table><tr>";
      headerCells.forEach((c) => {
        t += `<th>${c.trim()}</th>`;
      });
      t += "</tr>";
      bodyLines.forEach((line) => {
        const cells = line.split("|").filter((c) => c.trim() !== undefined);
        // Keep empty cells
        const raw = line.split("|").slice(1, -1);
        t += "<tr>";
        raw.forEach((c) => {
          t += `<td>${c.trim()}</td>`;
        });
        t += "</tr>";
      });
      t += "</table>";
      return t;
    }
  );

  // Bullet lists
  html = html.replace(/(^[ \t]*[-*] .+$(\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => {
        const text = line.replace(/^[ \t]*[-*] /, "");
        return `<li>${text}</li>`;
      });
    return `<ul>${items.join("")}</ul>`;
  });

  // Numbered lists
  html = html.replace(/(^[ \t]*\d+\. .+$(\n|$))+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((line) => {
        const text = line.replace(/^[ \t]*\d+\. /, "");
        return `<li>${text}</li>`;
      });
    return `<ol>${items.join("")}</ol>`;
  });

  // Paragraphs
  html = html
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^<(h[1-3]|ul|ol|li|table|tr|th|td|hr|blockquote|p)[ />]/i.test(trimmed)) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join("\n");

  return html;
}

/* ── HTML → Markdown (save) ── */

function htmlToMd(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return nodeToMd(div).trim();
}

function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  const childMd = () =>
    Array.from(el.childNodes)
      .map((c) => nodeToMd(c))
      .join("");

  switch (tag) {
    case "h1":
      return `# ${childMd().trim()}\n\n`;
    case "h2":
      return `## ${childMd().trim()}\n\n`;
    case "h3":
      return `### ${childMd().trim()}\n\n`;
    case "p":
      return `${childMd().trim()}\n\n`;
    case "br":
      return "\n";
    case "hr":
      return "---\n\n";
    case "strong":
    case "b":
      return `**${childMd()}**`;
    case "em":
    case "i":
      return `*${childMd()}*`;
    case "code":
      return `\`${childMd()}\``;
    case "a": {
      const href = el.getAttribute("href") || "";
      return `[${childMd()}](${href})`;
    }
    case "ul": {
      const items = Array.from(el.children)
        .map((li) => `- ${nodeToMd(li).trim()}`)
        .join("\n");
      return `${items}\n\n`;
    }
    case "ol": {
      const items = Array.from(el.children)
        .map((li, i) => `${i + 1}. ${nodeToMd(li).trim()}`)
        .join("\n");
      return `${items}\n\n`;
    }
    case "li":
      return childMd();
    case "blockquote":
      return (
        childMd()
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") + "\n\n"
      );
    case "table": {
      const rows = Array.from(el.querySelectorAll("tr"));
      if (rows.length === 0) return "";
      const headerCells = Array.from(rows[0].querySelectorAll("th, td")).map(
        (c) => nodeToMd(c).trim()
      );
      const sep = headerCells.map(() => "---");
      const bodyRows = rows.slice(1).map((row) =>
        Array.from(row.querySelectorAll("td, th"))
          .map((c) => nodeToMd(c).trim())
      );
      let md = `| ${headerCells.join(" | ")} |\n`;
      md += `| ${sep.join(" | ")} |\n`;
      bodyRows.forEach((cells) => {
        md += `| ${cells.join(" | ")} |\n`;
      });
      return md + "\n";
    }
    case "thead":
    case "tbody":
    case "tfoot":
    case "tr":
    case "td":
    case "th":
      return childMd();
    default:
      return childMd();
  }
}

/* ── Toolbar Button ── */

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded text-sm transition-colors",
        active ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      )}
    >
      {children}
    </button>
  );
}

/* ── Editor Component ── */

export interface DocsEditorHandle {
  getMarkdown: () => string;
}

interface DocsEditorProps {
  markdown: string;
}

export const DocsEditor = forwardRef<DocsEditorHandle, DocsEditorProps>(
  function DocsEditor({ markdown }, ref) {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { class: "text-blue-600 underline" },
        }),
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
      ],
      content: mdToHtml(markdown),
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none focus:outline-none min-h-[350px] prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-table:text-sm prose-th:bg-gray-50 prose-th:border prose-th:border-gray-200 prose-th:px-2 prose-th:py-1 prose-th:text-left prose-th:text-xs prose-th:font-medium prose-th:text-gray-500 prose-td:border prose-td:border-gray-200 prose-td:px-2 prose-td:py-1",
        },
      },
    });

    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        if (!editor) return markdown;
        return htmlToMd(editor.getHTML());
      },
    }));

    const setLink = useCallback(() => {
      if (!editor) return;
      const previousUrl = editor.getAttributes("link").href;
      const url = window.prompt("URL", previousUrl);
      if (url === null) return;
      if (url === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }, [editor]);

    if (!editor) return null;

    return (
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <span className="font-bold text-xs">B</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <span className="italic text-xs">I</span>
          </ToolbarButton>

          <div className="w-px h-4 bg-gray-300 mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <span className="font-bold text-xs">H2</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive("heading", { level: 3 })}
            title="Heading 3"
          >
            <span className="font-bold text-xs">H3</span>
          </ToolbarButton>

          <div className="w-px h-4 bg-gray-300 mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet List"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Numbered List"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
              <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
            </svg>
          </ToolbarButton>

          <div className="w-px h-4 bg-gray-300 mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={setLink}
            active={editor.isActive("link")}
            title="Link"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </ToolbarButton>

          <div className="w-px h-4 bg-gray-300 mx-1" />

          <ToolbarButton
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
            title="Insert Table"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </ToolbarButton>
          {editor.isActive("table") && (
            <>
              <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="Add Column">
                <span className="text-[10px] font-medium">+Col</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="Add Row">
                <span className="text-[10px] font-medium">+Row</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete Column">
                <span className="text-[10px] font-medium text-red-500">-Col</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="Delete Row">
                <span className="text-[10px] font-medium text-red-500">-Row</span>
              </ToolbarButton>
              <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="Delete Table">
                <span className="text-[10px] font-medium text-red-500">Del Table</span>
              </ToolbarButton>
            </>
          )}
        </div>
        {/* Editor */}
        <div className="p-4">
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);
