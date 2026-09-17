"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Three columns reference people(id) with no ON DELETE rule, so Postgres refuses
// the delete outright rather than clearing them. Before this existed the refusal
// was swallowed and the row simply stayed on screen with no explanation.
//
// All three are live duties someone has to inherit, so each REQUIRES a named
// replacement. Reporter used to be a fourth; it records who raised an item
// rather than who owns it, so it now clears itself on delete
// (20260917000001_reporter_clears_on_person_delete.sql) and never reaches here.
export interface BlockingRef {
  table: "projects" | "initiatives" | "project_department_statuses";
  column: string;
  label: string;
  rows: Array<{ id: string; name: string }>;
}

const GROUPS: Array<{
  table: BlockingRef["table"];
  column: string;
  label: string;
  nameColumn: string;
}> = [
  { table: "projects", column: "executive_sponsor_id", label: "Executive sponsor on these projects", nameColumn: "name" },
  { table: "initiatives", column: "executive_sponsor_id", label: "Executive sponsor on these initiatives", nameColumn: "name" },
  { table: "project_department_statuses", column: "rep_person_id", label: "Department representative on these projects", nameColumn: "id" },
];

/** What is holding this person, or an empty array when the delete will succeed. */
export async function findBlockers(personId: string): Promise<BlockingRef[]> {
  const supabase = createClient();
  const out: BlockingRef[] = [];
  for (const g of GROUPS) {
    // Column names are interpolated, so the generated types cannot narrow the
    // row shape here; the cast is confined to this one read.
    const { data, error } = await (supabase
      .from(g.table)
      .select(`id, ${g.nameColumn}`)
      .eq(g.column, personId) as unknown as Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>);
    // A table that is absent or unreadable must not silently look like "clear".
    if (error) continue;
    if (!data?.length) continue;
    out.push({
      table: g.table,
      column: g.column,
      label: g.label,
      rows: data.map((row) => ({
        id: String(row.id),
        name: String(row[g.nameColumn] ?? row.id),
      })),
    });
  }
  return out;
}

interface Props {
  person: { id: string; full_name: string };
  blockers: BlockingRef[];
  people: Array<{ id: string; full_name: string }>;
  onCancel: () => void;
  onDeleted: () => void;
}

export default function PersonDeleteModal({ person, blockers, people, onCancel, onDeleted }: Props) {
  const supabase = createClient();
  // One choice per blocking group: a person id, or "" meaning clear.
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = (b: BlockingRef) => `${b.table}.${b.column}`;
  const candidates = people.filter((p) => p.id !== person.id);
  // Every remaining blocker is a duty, so all of them need a named replacement.
  const unresolved = blockers.filter((b) => !choice[key(b)]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !busy) onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  async function confirm() {
    if (unresolved.length) return;
    setBusy(true);
    setError(null);
    // Reassign first. If any of these fails the delete must not run, or the
    // person disappears while a project still points at them.
    for (const b of blockers) {
      const next = choice[key(b)];
      const { error: e } = await supabase
        .from(b.table)
        .update({ [b.column]: next })
        .eq(b.column, person.id);
      if (e) {
        setError(`Could not update ${b.label.toLowerCase()}: ${e.message}`);
        setBusy(false);
        return;
      }
    }
    const { error: delErr } = await supabase.from("people").delete().eq("id", person.id);
    if (delErr) {
      setError(`Reassignments saved, but the delete still failed: ${delErr.message}`);
      setBusy(false);
      return;
    }
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">Can&rsquo;t delete {person.full_name} yet</h2>
          <p className="mt-1 text-xs text-gray-600">
            {person.full_name} still holds the responsibilities below. Choose who takes each one over, then the delete can go through.
          </p>
        </div>

        <div className="max-h-96 space-y-5 overflow-y-auto px-5 py-4">
          {blockers.map((b) => (
            <div key={key(b)}>
              <div className="text-xs font-semibold text-gray-800">
                {b.label}
                <span className="ml-1 font-normal text-red-600">(required)</span>
              </div>
              <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
                {b.rows.map((r) => <li key={r.id}>{r.name}</li>)}
              </ul>
              <select
                value={choice[key(b)] ?? ""}
                onChange={(e) => setChoice((c) => ({ ...c, [key(b)]: e.target.value }))}
                disabled={busy}
                className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">Select a replacement…</option>
                {candidates.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          ))}
        </div>

        {error && <p className="px-5 pb-2 text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onCancel} disabled={busy} className="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={busy || unresolved.length > 0}
            title={unresolved.length ? "Choose a replacement for each item first" : undefined}
            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
          >
            {busy ? "Working…" : `Reassign and delete`}
          </button>
        </div>
      </div>
    </div>
  );
}
