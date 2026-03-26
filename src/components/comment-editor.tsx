"use client";

import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import tippy, { Instance as TippyInstance } from "tippy.js";
import type { Person } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Suggestion dropdown component
interface MentionListProps {
  items: Person[];
  command: (attrs: { id: string; label: string }) => void;
}

interface MentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command({ id: item.id, label: item.full_name });
      },
      [items, command]
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          selectItem(selectedIndex);
          return true;
        }
        if (event.key === "Escape") return true;
        return false;
      },
    }));

    if (items.length === 0)
      return (
        <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-2 px-3 text-xs text-gray-400">
          No results
        </div>
      );

    return (
      <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-64 max-h-48 overflow-y-auto">
        {items.map((person, index) => (
          <button
            key={person.id}
            onClick={() => selectItem(index)}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
              index === selectedIndex
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
              {initials(person.full_name)}
            </span>
            <span className="truncate">{person.full_name}</span>
            {person.title && (
              <span className="text-xs text-gray-400 truncate">
                {person.title}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";

export interface CommentEditorRef {
  /** Get the comment body with mention markup: @[Name](id) */
  getContent: () => string;
  /** Get list of mentioned person IDs */
  getMentionIds: () => string[];
  /** Clear the editor */
  clear: () => void;
  /** Check if editor has content */
  isEmpty: () => boolean;
}

interface CommentEditorProps {
  people: Person[];
  placeholder?: string;
  onSubmit?: () => void;
}

const CommentEditor = forwardRef<CommentEditorRef, CommentEditorProps>(
  ({ people, placeholder = "Add a comment... (@ to mention)", onSubmit }, ref) => {
    const peopleRef = useRef(people);
    peopleRef.current = people;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          // Disable block-level features — comments are plain text + mentions
          heading: false,
          blockquote: false,
          codeBlock: false,
          bulletList: false,
          orderedList: false,
          horizontalRule: false,
        }),
        Placeholder.configure({ placeholder }),
        Mention.configure({
          HTMLAttributes: {
            class: "text-blue-600 font-semibold",
          },
          suggestion: {
            items: ({ query }: { query: string }) => {
              return peopleRef.current
                .filter(
                  (p) => p.profile_id || p.email
                )
                .filter((p) =>
                  p.full_name.toLowerCase().includes(query.toLowerCase())
                )
                .slice(0, 8);
            },
            render: () => {
              let component: ReactRenderer<MentionListRef> | null = null;
              let popup: TippyInstance[] | null = null;

              return {
                onStart: (props: SuggestionProps) => {
                  component = new ReactRenderer(MentionList, {
                    props,
                    editor: props.editor,
                  });

                  if (!props.clientRect) return;

                  popup = tippy("body", {
                    getReferenceClientRect: props.clientRect as () => DOMRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: "manual",
                    placement: "bottom-start",
                  });
                },

                onUpdate(props: SuggestionProps) {
                  component?.updateProps(props);
                  if (popup && props.clientRect) {
                    popup[0]?.setProps({
                      getReferenceClientRect:
                        props.clientRect as () => DOMRect,
                    });
                  }
                },

                onKeyDown(props: SuggestionKeyDownProps) {
                  if (props.event.key === "Escape") {
                    popup?.[0]?.hide();
                    return true;
                  }
                  return component?.ref?.onKeyDown(props) ?? false;
                },

                onExit() {
                  popup?.[0]?.destroy();
                  component?.destroy();
                },
              };
            },
          },
        }),
      ],
      editorProps: {
        attributes: {
          class:
            "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[52px] max-h-[200px] overflow-y-auto prose prose-sm prose-gray max-w-none",
        },
        handleKeyDown: (_view, event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit?.();
            return true;
          }
          return false;
        },
      },
    });

    useImperativeHandle(ref, () => ({
      getContent: () => {
        if (!editor) return "";
        // Walk the doc and serialize text + mention nodes
        let result = "";
        editor.state.doc.descendants((node) => {
          if (node.type.name === "mention") {
            result += `@[${node.attrs.label}](${node.attrs.id})`;
            return false;
          }
          if (node.isText) {
            result += node.text;
          }
          if (node.type.name === "paragraph" && result.length > 0) {
            result += "\n";
          }
          return true;
        });
        // Clean up trailing newlines
        return result.replace(/\n+$/, "").trim();
      },
      getMentionIds: () => {
        if (!editor) return [];
        const ids: string[] = [];
        editor.state.doc.descendants((node) => {
          if (node.type.name === "mention" && node.attrs.id) {
            ids.push(node.attrs.id);
          }
        });
        return ids;
      },
      clear: () => {
        editor?.commands.clearContent();
      },
      isEmpty: () => {
        return editor?.isEmpty ?? true;
      },
    }));

    return <EditorContent editor={editor} />;
  }
);

CommentEditor.displayName = "CommentEditor";

export default CommentEditor;
