"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TermCorrection } from "@/lib/types";

export default function SettingsPage() {
  const [corrections, setCorrections] = useState<TermCorrection[]>([]);
  const [wrongTerm, setWrongTerm] = useState("");
  const [correctTerm, setCorrectTerm] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWrong, setEditWrong] = useState("");
  const [editCorrect, setEditCorrect] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadCorrections();
  }, []);

  async function loadCorrections() {
    const { data } = await supabase
      .from("term_corrections")
      .select("*")
      .order("wrong_term");
    setCorrections((data || []) as TermCorrection[]);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!wrongTerm.trim() || !correctTerm.trim()) return;

    const { data: profile, error: profileErr } = await supabase.from("profiles").select("org_id").single();
    if (profileErr || !profile?.org_id) {
      setError(`Could not load profile: ${profileErr?.message || "no org_id"}`);
      return;
    }

    const { data, error: insertErr } = await supabase
      .from("term_corrections")
      .insert({
        org_id: profile.org_id,
        wrong_term: wrongTerm.trim(),
        correct_term: correctTerm.trim(),
        notes: notes.trim() || null,
      })
      .select()
      .single();

    if (insertErr) {
      setError(`Failed to add: ${insertErr.message}`);
      return;
    }

    if (data) {
      setCorrections((prev) =>
        [...prev, data as TermCorrection].sort((a, b) =>
          a.wrong_term.localeCompare(b.wrong_term)
        )
      );
      setWrongTerm("");
      setCorrectTerm("");
      setNotes("");
    }
  }

  async function handleDelete(id: string) {
    await supabase.from("term_corrections").delete().eq("id", id);
    setCorrections((prev) => prev.filter((c) => c.id !== id));
  }

  function startEditing(c: TermCorrection) {
    setEditingId(c.id);
    setEditWrong(c.wrong_term);
    setEditCorrect(c.correct_term);
    setEditNotes(c.notes || "");
  }

  async function handleSaveEdit(id: string) {
    if (!editWrong.trim() || !editCorrect.trim()) return;

    const { error } = await supabase
      .from("term_corrections")
      .update({
        wrong_term: editWrong.trim(),
        correct_term: editCorrect.trim(),
        notes: editNotes.trim() || null,
      })
      .eq("id", id);

    if (!error) {
      setCorrections((prev) =>
        prev
          .map((c) =>
            c.id === id
              ? { ...c, wrong_term: editWrong.trim(), correct_term: editCorrect.trim(), notes: editNotes.trim() || null }
              : c
          )
          .sort((a, b) => a.wrong_term.localeCompare(b.wrong_term))
      );
      setEditingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mt-4">
          {error}
        </div>
      )}

      <section className="mt-6">
        <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Term Corrections</h2>
        </div>
        <p className="text-sm text-gray-500 my-3">
          Common mistranslations the AI should fix during extraction. For example, names that are frequently misspelled or products with alternate names.
        </p>

        {/* Add form */}
        <form onSubmit={handleAdd} className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Wrong Term</label>
              <input
                type="text"
                value={wrongTerm}
                onChange={(e) => setWrongTerm(e.target.value)}
                placeholder="e.g. Accelerate"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Correct Term</label>
              <input
                type="text"
                value={correctTerm}
                onChange={(e) => setCorrectTerm(e.target.value)}
                placeholder="e.g. Edcelerate"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Product name"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={!wrongTerm.trim() || !correctTerm.trim()}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Correction
            </button>
          </div>
        </form>

        {/* List */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : corrections.length === 0 ? (
          <p className="text-sm text-gray-500">No term corrections yet. Add one above.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Wrong Term</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Correct Term</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24"></th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((c) => (
                  <tr key={c.id} className="border-b border-gray-200">
                    {editingId === c.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editWrong}
                            onChange={(e) => setEditWrong(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editCorrect}
                            onChange={(e) => setEditCorrect(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-500 hover:text-gray-700 mr-2"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(c.id)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Save
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-sm text-gray-900">{c.wrong_term}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{c.correct_term}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{c.notes || "—"}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => startEditing(c)}
                            className="text-xs text-gray-400 hover:text-blue-600 mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-xs text-gray-400 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
