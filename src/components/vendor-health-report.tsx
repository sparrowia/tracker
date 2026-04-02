"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";

interface HealthMetric {
  label: string;
  value: string;
  grade: string;
  gradeColor: string;
}

function letterGrade(score: number): { grade: string; color: string } {
  if (score >= 90) return { grade: "A", color: "text-green-700 bg-green-100 border-green-300" };
  if (score >= 80) return { grade: "B", color: "text-blue-700 bg-blue-100 border-blue-300" };
  if (score >= 70) return { grade: "C", color: "text-yellow-700 bg-yellow-100 border-yellow-300" };
  if (score >= 60) return { grade: "D", color: "text-orange-700 bg-orange-100 border-orange-300" };
  return { grade: "F", color: "text-red-700 bg-red-100 border-red-300" };
}

function overallGrade(metrics: HealthMetric[]): { grade: string; color: string } {
  if (metrics.length === 0) return { grade: "—", color: "text-gray-400 bg-gray-100 border-gray-300" };
  const gradeToScore: Record<string, number> = { A: 95, B: 85, C: 75, D: 65, F: 40 };
  const avg = metrics.reduce((sum, m) => sum + (gradeToScore[m.grade] || 50), 0) / metrics.length;
  return letterGrade(avg);
}

// Score a metric on 0-100 scale based on thresholds (lower value = better)
function scoreMetric(value: number, thresholds: [number, number, number, number]): number {
  const [a, b, c, d] = thresholds;
  if (value <= a) return 95;
  if (value <= b) return 85;
  if (value <= c) return 75;
  if (value <= d) return 65;
  return 40;
}

// Score percentage metric (lower = better)
function scorePct(pct: number): number {
  if (pct <= 0) return 95;
  if (pct <= 10) return 85;
  if (pct <= 20) return 75;
  if (pct <= 30) return 65;
  return 40;
}

export function VendorHealthReport({ vendorId }: { vendorId: string }) {
  const { role } = useRole();
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== "super_admin") { setLoading(false); return; }

    const supabase = createClient();

    async function compute() {
      // Fetch all items for this vendor
      const [{ data: raids }, { data: actions }, { data: blockers }] = await Promise.all([
        supabase.from("raid_entries").select("id, status, priority, due_date, first_flagged_at, resolved_at, raid_type").eq("vendor_id", vendorId),
        supabase.from("action_items").select("id, status, priority, due_date, first_flagged_at, resolved_at").eq("vendor_id", vendorId),
        supabase.from("blockers").select("id, status, priority, due_date, first_flagged_at, resolved_at").eq("vendor_id", vendorId),
      ]);

      const allItems = [
        ...(raids || []).filter(r => r.raid_type === "issue").map(r => ({ ...r, entityType: "raid_entry" })),
        ...(actions || []).map(a => ({ ...a, entityType: "action_item" })),
        ...(blockers || []).map(b => ({ ...b, entityType: "blocker" })),
      ];

      const active = allItems.filter(i => !i.resolved_at && !["complete", "closed", "mitigated"].includes(i.status));
      const resolved = allItems.filter(i => i.resolved_at);
      const now = Date.now();

      // Fetch activity log for status transitions
      const entityIds = allItems.map(i => i.id);
      let statusLogs: { entity_id: string; field_name: string; old_value: string | null; new_value: string | null; created_at: string }[] = [];
      let dueDateLogs: { entity_id: string; old_value: string | null; new_value: string | null; created_at: string }[] = [];

      if (entityIds.length > 0) {
        // Batch in chunks to avoid URL length limits
        for (let i = 0; i < entityIds.length; i += 50) {
          const chunk = entityIds.slice(i, i + 50);
          const [{ data: sLogs }, { data: dLogs }] = await Promise.all([
            supabase.from("activity_log").select("entity_id, field_name, old_value, new_value, created_at").in("entity_id", chunk).eq("field_name", "status"),
            supabase.from("activity_log").select("entity_id, old_value, new_value, created_at").in("entity_id", chunk).eq("field_name", "due_date"),
          ]);
          statusLogs = statusLogs.concat(sLogs || []);
          dueDateLogs = dueDateLogs.concat(dLogs || []);
        }
      }

      const results: HealthMetric[] = [];

      // 1. Average Ticket Age (active items)
      if (active.length > 0) {
        const avgAge = active.reduce((sum, i) => sum + (now - new Date(i.first_flagged_at).getTime()) / 86400000, 0) / active.length;
        const score = scoreMetric(avgAge, [7, 14, 21, 30]);
        const g = letterGrade(score);
        results.push({ label: "Avg Ticket Age", value: `${Math.round(avgAge)}d`, grade: g.grade, gradeColor: g.color });
      }

      // 2. Time to First Action — avg days from creation to first status change away from "pending"
      const firstActionTimes: number[] = [];
      for (const item of allItems) {
        const itemLogs = statusLogs.filter(l => l.entity_id === item.id && l.old_value === "pending").sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (itemLogs.length > 0) {
          const days = (new Date(itemLogs[0].created_at).getTime() - new Date(item.first_flagged_at).getTime()) / 86400000;
          if (days >= 0) firstActionTimes.push(days);
        }
      }
      if (firstActionTimes.length > 0) {
        const avg = firstActionTimes.reduce((s, d) => s + d, 0) / firstActionTimes.length;
        const score = scoreMetric(avg, [2, 5, 7, 14]);
        const g = letterGrade(score);
        results.push({ label: "Time to First Action", value: `${Math.round(avg)}d`, grade: g.grade, gradeColor: g.color });
      }

      // 3. Resolution Time — avg days from creation to resolution
      if (resolved.length > 0) {
        const avgRes = resolved.reduce((sum, i) => sum + (new Date(i.resolved_at!).getTime() - new Date(i.first_flagged_at).getTime()) / 86400000, 0) / resolved.length;
        const score = scoreMetric(avgRes, [7, 14, 21, 30]);
        const g = letterGrade(score);
        results.push({ label: "Avg Resolution Time", value: `${Math.round(avgRes)}d`, grade: g.grade, gradeColor: g.color });
      }

      // 4. QA Bounce Rate — items that went from needs_verification back to in_progress/pending
      const totalVerified = new Set(statusLogs.filter(l => l.new_value === "needs_verification").map(l => l.entity_id)).size;
      const bounced = new Set(statusLogs.filter(l => l.old_value === "needs_verification" && l.new_value !== "complete" && l.new_value !== "closed").map(l => l.entity_id)).size;
      if (totalVerified > 0) {
        const pct = Math.round((bounced / totalVerified) * 100);
        const score = scorePct(pct);
        const g = letterGrade(score);
        results.push({ label: "QA Bounce Rate", value: `${pct}%`, grade: g.grade, gradeColor: g.color });
      }

      // 5. Missing ETAs — % of active items without due_date
      if (active.length > 0) {
        const missing = active.filter(i => !i.due_date).length;
        const pct = Math.round((missing / active.length) * 100);
        const score = scorePct(pct);
        const g = letterGrade(score);
        results.push({ label: "Missing ETAs", value: `${pct}% (${missing}/${active.length})`, grade: g.grade, gradeColor: g.color });
      }

      // 6. ETA Response Time — avg days from creation to due_date being set
      const etaTimes: number[] = [];
      for (const item of allItems) {
        const itemLogs = dueDateLogs.filter(l => l.entity_id === item.id && !l.old_value && l.new_value).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (itemLogs.length > 0) {
          const days = (new Date(itemLogs[0].created_at).getTime() - new Date(item.first_flagged_at).getTime()) / 86400000;
          if (days >= 0) etaTimes.push(days);
        }
      }
      if (etaTimes.length > 0) {
        const avg = etaTimes.reduce((s, d) => s + d, 0) / etaTimes.length;
        const score = scoreMetric(avg, [2, 5, 7, 14]);
        const g = letterGrade(score);
        results.push({ label: "Time to Set ETA", value: `${Math.round(avg)}d`, grade: g.grade, gradeColor: g.color });
      }

      // 7. Overdue Rate — % of items past due_date that aren't resolved
      const withDueDate = active.filter(i => i.due_date);
      if (withDueDate.length > 0) {
        const overdue = withDueDate.filter(i => new Date(i.due_date!) < new Date()).length;
        const pct = Math.round((overdue / withDueDate.length) * 100);
        const score = scorePct(pct);
        const g = letterGrade(score);
        results.push({ label: "Overdue Rate", value: `${pct}% (${overdue}/${withDueDate.length})`, grade: g.grade, gradeColor: g.color });
      }

      // 8. Critical/High Open
      const critHigh = active.filter(i => i.priority === "critical" || i.priority === "high").length;
      const score8 = scoreMetric(critHigh, [0, 2, 5, 10]);
      const g8 = letterGrade(score8);
      results.push({ label: "Critical/High Open", value: `${critHigh}`, grade: g8.grade, gradeColor: g8.color });

      setMetrics(results);
      setLoading(false);
    }

    compute();
  }, [vendorId, role]); // eslint-disable-line react-hooks/exhaustive-deps

  if (role !== "super_admin") return null;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
        <div className="bg-gray-800 px-4 py-2.5">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Vendor Health</h2>
        </div>
        <div className="px-4 py-6 text-center text-sm text-gray-400">Loading health metrics...</div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
        <div className="bg-gray-800 px-4 py-2.5">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Vendor Health</h2>
        </div>
        <div className="px-4 py-6 text-center text-sm text-gray-400">No data available for health metrics.</div>
      </div>
    );
  }

  const overall = overallGrade(metrics);

  return (
    <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
      <div className="bg-gray-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Vendor Health</h2>
      </div>
      <div className="flex items-start gap-6 px-6 py-5">
        {/* Overall grade */}
        <div className="flex flex-col items-center flex-shrink-0">
          <span className={`text-5xl font-bold w-20 h-20 rounded-xl border-2 flex items-center justify-center ${overall.color}`}>
            {overall.grade}
          </span>
          <span className="text-[10px] text-gray-400 uppercase mt-1.5 tracking-wide">Overall</span>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-3 flex-1">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-gray-200 px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{m.label}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.gradeColor}`}>{m.grade}</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
