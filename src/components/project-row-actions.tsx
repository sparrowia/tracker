"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import { MoreHorizontal } from "lucide-react";

export default function ProjectRowActions({
  projectId,
  projectName,
  projectOwnerId,
}: {
  projectId: string;
  projectName: string;
  projectOwnerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { role, userPersonId } = useRole();
  const router = useRouter();
  const supabase = createClient();

  const canDelete =
    role === "super_admin" ||
    (userPersonId && projectOwnerId === userPersonId);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!canDelete) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-md border border-gray-200 shadow-lg py-1 z-10 min-w-[140px]">
          <button
            disabled={deleting}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!confirm(`Delete "${projectName}"? This will remove all action items, blockers, RAID entries, and other data associated with this project. This cannot be undone.`)) return;
              setDeleting(true);
              await supabase.from("projects").delete().eq("id", projectId);
              setOpen(false);
              router.refresh();
              window.dispatchEvent(new CustomEvent("sidebar:refresh"));
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Project"}
          </button>
        </div>
      )}
    </div>
  );
}
