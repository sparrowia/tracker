"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { Comment, CommentAttachment, Person } from "@/lib/types";
import { useRole } from "@/components/role-context";
import { canDelete } from "@/lib/permissions";
import type { CommentEditorRef } from "@/components/comment-editor";

const CommentEditor = dynamic(() => import("@/components/comment-editor"), { ssr: false });

interface CommentThreadProps {
  raidEntryId?: string;
  actionItemId?: string;
  blockerId?: string;
  orgId: string;
  people: Person[];
  itemTitle?: string;
  itemType?: string;
  projectName?: string;
  projectSlug?: string;
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
function renderBody(body: string) {
  const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      elements.push(<span key={i++}>{body.slice(lastIndex, match.index)}</span>);
    }
    elements.push(
      <span key={i++} className="text-blue-600 font-semibold">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    elements.push(<span key={i++}>{body.slice(lastIndex)}</span>);
  }
  return elements.length > 0 ? <>{elements}</> : <span>{body}</span>;
}

export default function CommentThread({ raidEntryId, actionItemId, blockerId, orgId, people, itemTitle, itemType, projectName, projectSlug, ownerId }: CommentThreadProps) {
  const { role, profileId } = useRole();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Person | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<CommentEditorRef>(null);
  const supabase = createClient();

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

  async function handlePost() {
    if (!editorRef.current || editorRef.current.isEmpty() || posting) return;
    setPosting(true);
    setUploadError(null);

    const storedBody = editorRef.current.getContent();
    const mentionIds = editorRef.current.getMentionIds();
    const pendingFiles = [...files]; // Capture before any async/state changes

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

    // Upload attachments if any
    const errors: string[] = [];
    if (pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${orgId}/${comment.id}/${safeName}`;
        const { error: uploadErr } = await supabase.storage
          .from("comment-attachments")
          .upload(path, file);
        if (uploadErr) {
          errors.push(`Upload "${file.name}": ${uploadErr.message}`);
          continue;
        }
        const { data: urlData } = supabase.storage.from("comment-attachments").getPublicUrl(path);
        const { error: insertErr } = await supabase
          .from("comment_attachments")
          .insert({
            org_id: orgId,
            comment_id: comment.id,
            file_name: file.name,
            file_url: urlData.publicUrl,
            file_size: file.size,
            mime_type: file.type || null,
          });
        if (insertErr) {
          errors.push(`Save "${file.name}": ${insertErr.message}`);
        }
      }
    }

    if (errors.length > 0) {
      setUploadError(errors.join("; "));
    }

    // Queue notifications
    queueNotifications(comment.id, storedBody, mentionIds);

    // Bump parent item's updated_at so the ❗ indicator shows for other users
    const now = new Date().toISOString();
    if (raidEntryId) {
      supabase.from("raid_entries").update({ updated_at: now }).eq("id", raidEntryId).then(() => {});
      supabase.from("activity_log").insert({ org_id: orgId, entity_type: "raid_entry", entity_id: raidEntryId, action: "comment", field_name: "comment", old_value: null, new_value: null, performed_by: profileId }).then(() => {});
    }
    if (actionItemId) {
      supabase.from("action_items").update({ updated_at: now }).eq("id", actionItemId).then(() => {});
      supabase.from("activity_log").insert({ org_id: orgId, entity_type: "action_item", entity_id: actionItemId, action: "comment", field_name: "comment", old_value: null, new_value: null, performed_by: profileId }).then(() => {});
    }
    if (blockerId) {
      supabase.from("blockers").update({ updated_at: now }).eq("id", blockerId).then(() => {});
      supabase.from("activity_log").insert({ org_id: orgId, entity_type: "blocker", entity_id: blockerId, action: "comment", field_name: "comment", old_value: null, new_value: null, performed_by: profileId }).then(() => {});
    }

    editorRef.current.clear();
    setFiles([]);
    setPosting(false);

    // Refetch comments from DB to ensure attachments show correctly
    fetchComments();
  }

  async function queueNotifications(commentId: string, commentBody: string, mentionIds: string[]) {
    const mentionedIds = new Set(mentionIds);
    const recipientIds = new Set(mentionedIds);
    if (ownerId) recipientIds.add(ownerId);
    if (currentUser) recipientIds.delete(currentUser.id);

    if (recipientIds.size === 0) return;

    const cleanBody = commentBody.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");

    const notifications: Record<string, unknown>[] = [];
    for (const personId of recipientIds) {
      const person = people.find((p) => p.id === personId);
      if (!person?.email) continue;

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
        entity_id: raidEntryId || actionItemId || blockerId || null,
        project_slug: projectSlug || null,
      });
    }

    if (notifications.length > 0) {
      supabase.from("comment_notifications").insert(notifications).then(() => {});
    }
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
          <div className="flex-1">
            <CommentEditor
              ref={editorRef}
              people={people}
              onSubmit={handlePost}
            />
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

        {uploadError && (
          <div className="ml-9 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            Attachment failed: {uploadError}
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
            disabled={posting}
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

                  <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{renderBody(c.body)}</p>

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
