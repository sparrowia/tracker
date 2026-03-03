"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Person } from "@/lib/types";

const ADD_SENTINEL = "__add_new__";

interface OwnerPickerProps {
  value: string;
  onChange: (id: string) => void;
  people: Person[];
  onPersonAdded: (person: Person) => void;
}

export default function OwnerPicker({ value, onChange, people, onPersonAdded }: OwnerPickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  function handleSelectChange(val: string) {
    if (val === ADD_SENTINEL) {
      setAdding(true);
    } else {
      onChange(val);
    }
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);

    const supabase = createClient();
    const { data: profile } = await supabase.from("profiles").select("org_id").single();
    const orgId = profile?.org_id;
    if (!orgId) { setSaving(false); return; }

    const { data: newPerson } = await supabase
      .from("people")
      .insert({ full_name: trimmed, org_id: orgId, is_internal: false })
      .select("*")
      .single();

    if (newPerson) {
      onPersonAdded(newPerson as Person);
      onChange(newPerson.id);
    }

    setName("");
    setAdding(false);
    setSaving(false);
  }

  function handleCancel() {
    setName("");
    setAdding(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
    if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
  }

  if (adding) {
    return (
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Full name"
          disabled={saving}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !name.trim()}
          className="p-1.5 text-green-600 hover:text-green-700 disabled:opacity-50 flex-shrink-0"
          title="Add"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="p-1.5 text-gray-400 hover:text-red-500 flex-shrink-0"
          title="Cancel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => handleSelectChange(e.target.value)}
      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">Unassigned</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.full_name}</option>
      ))}
      <option value={ADD_SENTINEL}>+ Add Person</option>
    </select>
  );
}
