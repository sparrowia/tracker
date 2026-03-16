"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import { canCreate, canDelete, canEditWikiPage } from "@/lib/permissions";
import dynamic from "next/dynamic";
import type { WikiPage } from "@/lib/types";

const WikiEditor = dynamic(() => import("@/components/wiki-editor").then(m => m.WikiEditor), { ssr: false });
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Plus,
  Trash2,
  FileText,
} from "lucide-react";

interface TreeNode extends WikiPage {
  children: TreeNode[];
}

function buildTree(pages: WikiPage[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const page of pages) {
    map.set(page.id, { ...page, children: [] });
  }

  for (const page of pages) {
    const node = map.get(page.id)!;
    if (page.parent_id && map.has(page.parent_id)) {
      map.get(page.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by sort_order
  function sortChildren(nodes: TreeNode[]) {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    for (const n of nodes) sortChildren(n.children);
  }
  sortChildren(roots);

  return roots;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}

export default function DocsPage() {
  const { role, profileId, orgId } = useRole();
  const supabase = createClient();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<Record<string, unknown> | null>(null);

  const selectedPage = pages.find((p) => p.id === selectedId) || null;
  const tree = buildTree(pages);
  const canEdit = selectedPage
    ? canEditWikiPage(role, profileId || "", selectedPage)
    : false;

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("wiki_pages")
        .select("*")
        .order("sort_order");
      const loaded = (data || []) as WikiPage[];
      setPages(loaded);
      // Auto-select first page if none selected
      if (loaded.length > 0 && !selectedId) {
        const roots = loaded.filter((p) => !p.parent_id);
        if (roots.length > 0) setSelectedId(roots[0].id);
      }
      setLoading(false);
    }
    load();
  }, []);

  // When selecting a page, reset editing state
  useEffect(() => {
    setEditing(false);
    setEditingTitle(false);
    contentRef.current = null;
  }, [selectedId]);

  const debouncedSave = useCallback(
    (pageId: string, content: Record<string, unknown>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        supabase
          .from("wiki_pages")
          .update({ content, updated_by: profileId })
          .eq("id", pageId)
          .then(() => {});
        // Update local state
        setPages((prev) =>
          prev.map((p) => (p.id === pageId ? { ...p, content } : p))
        );
      }, 1500);
    },
    [profileId]
  );

  function handleContentChange(content: Record<string, unknown>) {
    contentRef.current = content;
    if (selectedId) {
      debouncedSave(selectedId, content);
    }
  }

  async function handleCreatePage() {
    if (!newTitle.trim() || !orgId) return;
    setCreating(true);

    // Generate unique slug
    let slug = generateSlug(newTitle);
    const existingSlugs = new Set(pages.map((p) => p.slug));
    if (existingSlugs.has(slug)) {
      let suffix = 2;
      while (existingSlugs.has(`${slug}-${suffix}`)) suffix++;
      slug = `${slug}-${suffix}`;
    }

    const maxSort = pages
      .filter((p) => p.parent_id === creatingParentId)
      .reduce((max, p) => Math.max(max, p.sort_order), 0);

    const { data, error } = await supabase
      .from("wiki_pages")
      .insert({
        org_id: orgId,
        title: newTitle.trim(),
        slug,
        parent_id: creatingParentId,
        sort_order: maxSort + 1000,
        created_by: profileId,
      })
      .select()
      .single();

    if (data && !error) {
      const newPage = data as WikiPage;
      setPages((prev) => [...prev, newPage]);
      setSelectedId(newPage.id);
      setEditing(true);
      // Auto-expand parent
      if (creatingParentId) {
        setExpandedIds((prev) => new Set([...prev, creatingParentId]));
      }
    }

    setNewTitle("");
    setCreatingParentId(null);
    setCreating(false);
  }

  async function handleDeletePage(pageId: string) {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    const childCount = pages.filter((p) => p.parent_id === pageId).length;
    const msg = childCount > 0
      ? `Delete "${page.title}" and its ${childCount} subpage${childCount > 1 ? "s" : ""}?`
      : `Delete "${page.title}"?`;
    if (!confirm(msg)) return;

    const { error } = await supabase.from("wiki_pages").delete().eq("id", pageId);
    if (!error) {
      // Remove page and children from local state (CASCADE handles DB)
      const idsToRemove = new Set<string>();
      function collect(id: string) {
        idsToRemove.add(id);
        pages.filter((p) => p.parent_id === id).forEach((p) => collect(p.id));
      }
      collect(pageId);
      setPages((prev) => prev.filter((p) => !idsToRemove.has(p.id)));
      if (selectedId && idsToRemove.has(selectedId)) {
        setSelectedId(null);
      }
    }
  }

  async function handleTitleSave() {
    if (!selectedPage || !titleDraft.trim()) {
      setEditingTitle(false);
      return;
    }
    const newTitle = titleDraft.trim();
    if (newTitle === selectedPage.title) {
      setEditingTitle(false);
      return;
    }

    // Update slug too
    let slug = generateSlug(newTitle);
    const existingSlugs = new Set(pages.filter((p) => p.id !== selectedPage.id).map((p) => p.slug));
    if (existingSlugs.has(slug)) {
      let suffix = 2;
      while (existingSlugs.has(`${slug}-${suffix}`)) suffix++;
      slug = `${slug}-${suffix}`;
    }

    supabase
      .from("wiki_pages")
      .update({ title: newTitle, slug, updated_by: profileId })
      .eq("id", selectedPage.id)
      .then(() => {});

    setPages((prev) =>
      prev.map((p) =>
        p.id === selectedPage.id ? { ...p, title: newTitle, slug } : p
      )
    );
    setEditingTitle(false);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderTreeNode(node: TreeNode, depth: number = 0) {
    const isSelected = node.id === selectedId;
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer transition-colors group",
            isSelected ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
          )}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
              className="p-0.5 flex-shrink-0 text-gray-400 hover:text-gray-600"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <button
            onClick={() => setSelectedId(node.id)}
            className="flex-1 text-left text-sm truncate"
          >
            {node.title}
          </button>
          {canCreate(role) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCreatingParentId(node.id);
                setNewTitle("");
                setShowCreateForm(true);
                setExpandedIds((prev) => new Set([...prev, node.id]));
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-blue-600 transition-all flex-shrink-0"
              title="Add subpage"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
        {isExpanded && node.children.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-gray-500">Loading documentation...</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left panel — page tree */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800">
          <span className="text-xs font-semibold text-white uppercase tracking-wide">Pages</span>
          {canCreate(role) && (
            <button
              onClick={() => { setCreatingParentId(null); setNewTitle(""); setShowCreateForm(true); }}
              className="text-gray-300 hover:text-white transition-colors"
              title="New page"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Create form placeholder - rendered at bottom of panel */}

        <div className="flex-1 overflow-y-auto py-2 px-1">
          {tree.length === 0 && !showCreateForm && (
            <div className="px-3 py-8 text-center">
              <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No pages yet</p>
              {canCreate(role) && (
                <button
                  onClick={() => { setCreatingParentId(null); setNewTitle(""); setShowCreateForm(true); }}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Create your first page
                </button>
              )}
            </div>
          )}
          {tree.map((node) => renderTreeNode(node))}
        </div>

        {/* Create form at bottom of tree panel */}
        {showCreateForm && (
          <div className="border-t border-gray-200 p-2">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 px-1">
              {creatingParentId ? `Subpage of ${pages.find((p) => p.id === creatingParentId)?.title || "..."}` : "New page"}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreatePage().then(() => setShowCreateForm(false));
              }}
              className="flex gap-1"
            >
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Page title"
                autoFocus
                className="flex-1 text-sm rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowCreateForm(false);
                    setNewTitle("");
                  }
                }}
              />
              <button
                type="submit"
                disabled={!newTitle.trim() || creating}
                className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Right panel — page content */}
      <div className="flex-1 overflow-y-auto">
        {selectedPage ? (
          <div className="max-w-3xl mx-auto px-6 py-6">
            {/* Title */}
            <div className="mb-1">
              {editingTitle ? (
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTitleSave();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  autoFocus
                  className="text-2xl font-bold text-gray-900 w-full border-b border-blue-400 focus:outline-none pb-1"
                />
              ) : (
                <h1
                  className={cn(
                    "text-2xl font-bold text-gray-900",
                    canEdit && "cursor-pointer hover:text-blue-700 transition-colors"
                  )}
                  onClick={() => {
                    if (!canEdit) return;
                    setTitleDraft(selectedPage.title);
                    setEditingTitle(true);
                  }}
                >
                  {selectedPage.title}
                </h1>
              )}
            </div>

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-gray-400 mb-6">
              <span>
                Updated {new Date(selectedPage.updated_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {canEdit && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Edit
                </button>
              )}
              {canEdit && editing && (
                <button
                  onClick={() => {
                    // Force save any pending content
                    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                    if (contentRef.current && selectedId) {
                      supabase
                        .from("wiki_pages")
                        .update({ content: contentRef.current, updated_by: profileId })
                        .eq("id", selectedId)
                        .then(() => {});
                      setPages((prev) =>
                        prev.map((p) =>
                          p.id === selectedId ? { ...p, content: contentRef.current! } : p
                        )
                      );
                    }
                    setEditing(false);
                  }}
                  className="text-green-600 hover:text-green-700 font-medium"
                >
                  Done
                </button>
              )}
              {canDelete(role) && (
                <button
                  onClick={() => handleDeletePage(selectedPage.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Delete page"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Editor */}
            <WikiEditor
              content={selectedPage.content}
              onChange={handleContentChange}
              editable={editing && canEdit}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                {pages.length === 0
                  ? "Create your first page to get started"
                  : "Select a page from the sidebar"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
