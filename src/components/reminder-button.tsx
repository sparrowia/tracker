"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";

interface ReminderButtonProps {
  entityType: "action_item" | "blocker" | "raid_entry";
  entityId: string;
  entityTitle: string;
  orgId: string;
}

interface Reminder {
  id: string;
  remind_at: string;
  dismissed: boolean;
}

export default function ReminderButton({ entityType, entityId, entityTitle, orgId }: ReminderButtonProps) {
  const { profileId } = useRole();
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<Reminder | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Load existing active reminder for this entity
  useEffect(() => {
    supabase
      .from("reminders")
      .select("id, remind_at, dismissed")
      .eq("entity_id", entityId)
      .eq("profile_id", profileId)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setExisting(data[0]);
      });
  }, [entityId, profileId]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function computeTime(option: string): Date {
    const now = new Date();
    switch (option) {
      case "1h":
        return new Date(now.getTime() + 60 * 60 * 1000);
      case "4h":
        return new Date(now.getTime() + 4 * 60 * 60 * 1000);
      case "tomorrow": {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      }
      case "3d":
        return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      case "1w":
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      default:
        return now;
    }
  }

  async function setReminder(remindAt: Date) {
    const { data } = await supabase
      .from("reminders")
      .insert({
        org_id: orgId,
        profile_id: profileId,
        entity_type: entityType,
        entity_id: entityId,
        remind_at: remindAt.toISOString(),
        title: entityTitle,
      })
      .select("id, remind_at, dismissed")
      .single();
    if (data) setExisting(data);
    setOpen(false);
    setShowCustom(false);
    showFlash("Reminder set");
  }

  async function cancelReminder() {
    if (!existing) return;
    await supabase.from("reminders").update({ dismissed: true }).eq("id", existing.id).then(() => {});
    setExisting(null);
    setOpen(false);
    showFlash("Reminder cancelled");
  }

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2000);
  }

  function handleOptionClick(option: string) {
    const t = computeTime(option);
    setReminder(t);
  }

  function handleCustomSubmit() {
    if (!customValue) return;
    const d = new Date(customValue);
    if (isNaN(d.getTime())) return;
    setReminder(d);
  }

  const hasReminder = !!existing;

  function formatReminderDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
          setShowCustom(false);
        }}
        className={`transition-colors ${hasReminder ? "text-blue-500 hover:text-blue-700" : "text-gray-400 hover:text-blue-600"}`}
        title={hasReminder ? `Reminder set for ${formatReminderDate(existing!.remind_at)}` : "Set reminder"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="8"/>
          <path d="M12 9v4l2 2"/>
          <path d="M5 3 2 6"/>
          <path d="m22 6-3-3"/>
          <path d="M6.38 18.7 4 21"/>
          <path d="M17.64 18.67 20 21"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-full mb-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-56"
          onClick={(e) => e.stopPropagation()}
        >
          {hasReminder ? (
            <div className="px-3 py-2">
              <p className="text-xs text-gray-600 mb-2">
                Reminder set for <span className="font-medium">{formatReminderDate(existing!.remind_at)}</span>
              </p>
              <button
                onClick={cancelReminder}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Cancel reminder
              </button>
            </div>
          ) : showCustom ? (
            <div className="px-3 py-2">
              <label className="text-xs text-gray-500 block mb-1">Pick date & time</label>
              <input
                type="datetime-local"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCustomSubmit}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  Set
                </button>
                <button
                  onClick={() => setShowCustom(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => handleOptionClick("1h")} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">In 1 hour</button>
              <button onClick={() => handleOptionClick("4h")} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">In 4 hours</button>
              <button onClick={() => handleOptionClick("tomorrow")} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">Tomorrow morning</button>
              <button onClick={() => handleOptionClick("3d")} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">In 3 days</button>
              <button onClick={() => handleOptionClick("1w")} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">In 1 week</button>
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button onClick={() => setShowCustom(true)} className="w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">Custom...</button>
              </div>
            </>
          )}
        </div>
      )}

      {flash && (
        <div className="absolute right-0 bottom-full mb-8 z-50 bg-green-600 text-white text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap animate-pulse">
          {flash}
        </div>
      )}
    </div>
  );
}
