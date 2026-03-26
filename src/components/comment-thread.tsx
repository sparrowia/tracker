"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Comment, CommentAttachment, Person } from "@/lib/types";
import { useRole } from "@/components/role-context";
import { canDelete } from "@/lib/permissions";

interface CommentThreadProps {
  raidEntryId?: string;
  actionItemId?: string;
  blockerId?: string;
  orgId: string;
  people: Person[];
  itemTitle?: string;
  itemType?: string;
  projectName?: string;
  ownerId?: string | null;
}

type CommentRow = Comment & { author: Person | null; attachments: CommentAttachment[] };

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

/** Render comment body with @mentions styled */
function renderBody(body: string, people: Person[]) {
  // Match @[Name](person_id) pattern
  const parts = body.split(/(@\[([^\]]+)\]\([^)]+\))/g);
  if (parts.length === 1) return <span>{body}</span>;

  const elements: React.ReactNode[] = [];
  let i = 0;
  const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      elements.push(<span key={i++}>{body.slice(lastIndex, match.index)}</span>);
    }
    elements.push(
      <span key={i++} className="text-blue-600 font-medium bg-blue-50 rounded px-0.5">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    elements.push(<span key={i++}>{body.slice(lastIndex)}</span>);
  }
  return <>{elements}</>;
}

export default function CommentThread({ raidEntryId, actionItemId, blockerId, orgId, people, itemTitle, itemType, projectName, ownerId }: CommentThreadProps) {
  const { role } = useRole();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [currentUser, setCurrentUser] = useState<Person | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const supabase = createClient();

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(0);
  const mentionRef = useRef<HTMLDivElement>(null);
  const mentionsRef = useRef<Map<string, string>>(new Map()); // name -> person_id

  // Filter people for mention dropdown — only those with profiles (active users)
  const mentionCandidates = mentionQuery !== null
    ? people
        .filter((p) => p.profile_id || p.email) // has account or is contactable
        .filter((p) => p.full_name.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 8)
    : [];

  useEffect(() => {
    resolveCurrentUser();
  }, []);

  useEffect(() => {
    fetchComments();
  }, [raidEntryId, actionItemId, blockerId]);

  async function resolveCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const person = people.find((p) => p.profile_id === user.id);
    if (person) setCurrentUser(person);
  }

  async function fetchComments() {
    setLoading(true);
    const parentFilter = raidEntryId
      ? { column: "raid_entry_id" as const, value: raidEntryId }
      : blockerId
      ? { column: "blocker_id" as const, value: blockerId }
      : { column: "action_item_id" as const, value: actionItemId! };

    const { data } = await supabase
      .from("comments")
      .select("*, author:people(id, full_name), attachments:comment_attachments(*)")
      .eq(parentFilter.column, parentFilter.value)
      .order("created_at", { ascending: false });

    setComments((data as CommentRow[]) || []);
    setLoading(false);
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setBody(val);

    // Check if we're in an @mention context — run synchronously before React re-render
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(cursorPos - atMatch[0].length);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(person: Person) {
    const before = body.slice(0, mentionStart);
    const after = body.slice(textareaRef.current?.selectionStart || mentionStart + (mentionQuery?.length || 0) + 1);
    const displayText = `@${person.full_name} `;
    const newBody = before + displayText + after;
    setBody(newBody);
    setMentionQuery(null);
    mentionsRef.current.set(person.full_name, person.id);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length + displayText.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  }

  /** Convert display text (@Name) to storage format (@[Name](id)) for saving */
  function buildMentionMarkup(text: string): string {
    let result = text;
    for (const [name, id] of mentionsRef.current) {
      result = result.replace(new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), `@[${name}](${id})`);
    }
    return result;
  }

  function handleMentionKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, mentionCandidates.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // Cmd+Enter to post
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePost();
    }
  }

  async function handlePost() {
    if (!body.trim() || posting) return;
    setPosting(true);
    setMentionQuery(null);

    const storedBody = buildMentionMarkup(body.trim());

    const insert: Record<string, unknown> = {
      org_id: orgId,
      body: storedBody,
      author_id: currentUser?.id || null,
    };
    if (raidEntryId) insert.raid_entry_id = raidEntryId;
    if (actionItemId) insert.action_item_id = actionItemId;
    if (blockerId) insert.blocker_id = blockerId;

    const { data: comment, error } = await supabase
      .from("comments")
      .insert(insert)
      .select("*, author:people(*)")
      .single();

    if (error || !comment) {
      console.error("Failed to post comment:", error);
      setPosting(false);
      return;
    }

    let attachments: CommentAttachment[] = [];
    if (files.length > 0) {
      attachments = await uploadAttachments(comment.id);
    }

    const newComment: CommentRow = {
      ...(comment as Comment & { author: Person | null }),
      attachments,
    };

    setComments((prev) => [newComment, ...prev]);

    // Queue notifications for @mentioned people and item owner
    queueNotifications(comment.id, storedBody);

    setBody("");
    setFiles([]);
    setPosting(false);
    mentionsRef.current.clear();
  }

  async function queueNotifications(commentId: string, commentBody: string) {
    // Extract mentioned person IDs from @[Name](id) pattern
    const mentionRegex = /@\[[^\]]+\]\(([^)]+)\)/g;
    const mentionedIds = new Set<string>();
    let m;
    while ((m = mentionRegex.exec(commentBody)) !== null) {
      mentionedIds.add(m[1]);
    }

    // Also notify the item owner if they have an email
    const recipientIds = new Set(mentionedIds);
    if (ownerId) recipientIds.add(ownerId);

    // Don't notify the commenter
    if (currentUser) recipientIds.delete(currentUser.id);

    if (recipientIds.size === 0) return;

    // Build notification rows
    const notifications: Record<string, unknown>[] = [];
    for (const personId of recipientIds) {
      const person = people.find((p) => p.id === personId);
      if (!person?.email) continue;

      // Strip mention markup for email display
      const cleanBody = commentBody.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");

      notifications.push({
        org_id: orgId,
        recipient_person_id: personId,
        recipient_email: person.email,
        comment_id: commentId,
        commenter_name: currentUser?.full_name || "Someone",
        comment_body: cleanBody,
        item_title: itemTitle || "Untitled",
        item_type: itemType || "item",
        project_name: projectName || null,
        mention_type: mentionedIds.has(personId) ? "mention" : "owner",
      });
    }

    if (notifications.length > 0) {
      supabase.from("comment_notifications").insert(notifications).then(() => {});
    }
  }

  async function uploadAttachments(commentId: string): Promise<CommentAttachment[]> {
    const uploaded: CommentAttachment[] = [];
    for (const file of files) {
      const path = `${orgId}/${commentId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("comment-attachments")
        .upload(path, file);
      if (uploadError) { console.error("Upload failed:", uploadError); continue; }
      const { data: urlData } = supabase.storage.from("comment-attachments").getPublicUrl(path);
      const { data: attachment } = await supabase
        .from("comment_attachments")
        .insert({
          org_id: orgId,
          comment_id: commentId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_size: file.size,
          mime_type: file.type || null,
        })
        .select("*")
        .single();
      if (attachment) uploaded.push(attachment as CommentAttachment);
    }
    return uploaded;
  }

  async function handleDelete(commentId: string) {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;
    if (comment.attachments.length > 0) {
      const paths = comment.attachments.map((a) => `${orgId}/${commentId}/${a.file_name}`);
      await supabase.storage.from("comment-attachments").remove(paths);
    }
    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (!error) setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="px-5 py-3 border-t border-gray-100 bg-yellow-50/25">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
        Comments ({comments.length})
      </span>

      {/* Compose */}
      <div className="mt-2 mb-3">
        <div className="flex gap-2 mb-2 items-start">
          {currentUser ? (
            <span className="w-7 h-7 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              {initials(currentUser.full_name)}
            </span>
          ) : (
            <span className="w-7 h-7 rounded-full bg-gray-200 text-[10px] font-medium text-gray-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              ?
            </span>
          )}
          <div className="flex-1 relative">
            {/* Highlight overlay — renders colored @mentions behind transparent textarea */}
            <div
              aria-hidden
              className="absolute inset-0 px-2 py-1.5 text-sm whitespace-pre-wrap break-words pointer-events-none overflow-hidden rounded border border-transparent"
            >
              {body.split(/(@\S+)/g).map((part, i) =>
                part.startsWith("@") && mentionsRef.current.has(part.slice(1).trimEnd())
                  ? <span key={i} className="text-blue-600 font-medium">{part}</span>
                  : <span key={i} className="text-gray-900">{part}</span>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={handleBodyChange}
              onKeyDown={handleMentionKeyDown}
              onBlur={() => { setTimeout(() => setMentionQuery(null), 200); }}
              placeholder="Add a comment... (@ to mention)"
              rows={2}
              className="w-full rounded border border-gray-300 bg-transparent px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none relative z-10"
              style={{ caretColor: "#111827", color: "transparent" }}
            />
            {/* @mention dropdown */}
            {mentionQuery !== null && mentionCandidates.length > 0 && (
              <div
                ref={mentionRef}
                className="absolute left-0 top-full mt-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[100] max-h-48 overflow-y-auto"
              >
                {mentionCandidates.map((p, idx) => (
                  <button
                    key={p.id}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(p); }}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                      idx === mentionIndex ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                      {initials(p.full_name)}
                    </span>
                    <span className="truncate">{p.full_name}</span>
                    {p.title && <span className="text-xs text-gray-400 truncate">{p.title}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending files */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 ml-9">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 rounded px-2 py-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                {f.name} ({formatFileSize(f.size)})
                <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 ml-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 ml-9">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 bg-white rounded px-2 py-1 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            Attach
          </button>
          <div className="flex-1" />
          <span className="text-[10px] text-gray-400">{"\u2318"}+Enter to post</span>
          <button
            onClick={handlePost}
            disabled={!body.trim() || posting}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {posting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>

      {/* Comments list */}
      {loading ? (
        <p className="text-xs text-gray-400 py-2">Loading...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No comments yet.</p>
      ) : (
        <div className="space-y-0 divide-y divide-gray-100">
          {comments.map((c) => (
            <div key={c.id} className="py-2.5 group/comment">
              <div className="flex items-start gap-2">
                {c.author ? (
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {initials(c.author.full_name)}
                  </span>
                ) : (
                  <span className="w-6 h-6 rounded-full bg-gray-200 text-[10px] font-medium text-gray-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    ?
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-800">
                      {c.author?.full_name || "Unknown"}
                    </span>
                    <span className="text-[10px] text-gray-400">{timeAgo(c.created_at)}</span>
                    {canDelete(role) && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/comment:opacity-100 ml-auto"
                        title="Delete comment"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{renderBody(c.body, people)}</p>

                  {c.attachments && c.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {c.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={a.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 rounded px-2 py-1 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                          {a.file_name}
                          {a.file_size ? ` (${formatFileSize(a.file_size)})` : ""}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
