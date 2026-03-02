"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function EditableProjectName({
  id,
  slug,
  name,
  description,
}: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setValue(name);
      setEditing(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({ name: trimmed })
      .eq("id", id);
    setSaving(false);
    if (!error) {
      setEditing(false);
      router.refresh();
    }
  }

  if (editing) {
    return (
      <div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setValue(name); setEditing(false); }
          }}
          onBlur={save}
          disabled={saving}
          className="text-sm font-semibold text-gray-900 bg-white rounded border border-blue-400 px-1.5 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-center gap-1.5">
        <Link href={`/projects/${slug}`} className="text-sm font-semibold text-blue-600 hover:underline">
          {name}
        </Link>
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-all"
          title="Edit name"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
      {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
    </div>
  );
}
