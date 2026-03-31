"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import Link from "next/link";
import { formatAge, priorityColor, priorityLabel, healthColor, healthLabel, formatDateShort, statusBadge } from "@/lib/utils";
import type { ActionItem, Blocker, RaidEntry, Project, Initiative, Person, Vendor } from "@/lib/types";

type ActionRow = ActionItem & { owner: Pick<Person, "id" | "full_name" | "email" | "slack_member_id"> | null; project: Pick<Project, "id" | "name" | "slug"> | null };
type BlockerRow = Blocker & { owner: Pick<Person, "id" | "full_name" | "email"> | null; vendor: Pick<Vendor, "id" | "name"> | null; project: Pick<Project, "id" | "name" | "slug"> | null };
type RaidRow = RaidEntry & { owner: Pick<Person, "id" | "full_name" | "email"> | null; project: Pick<Project, "id" | "name" | "slug"> | null };
type ProjectRow = Project & { actionCount: number; blockerCount: number };
type InitiativeGroup = Initiative & { projects: ProjectRow[] };

export default function DashboardPage() {
  const { role, profileId, userPersonId, impersonation } = useRole();
  const [loading, setLoading] = useState(true);
  const [overdue, setOverdue] = useState<ActionRow[]>([]);
  const [dueThisWeek, setDueThisWeek] = useState<ActionRow[]>([]);
  const [myTasks, setMyTasks] = useState<ActionRow[]>([]);
  const [blockers, setBlockers] = useState<BlockerRow[]>([]);
  const [risksIssues, setRisksIssues] = useState<RaidRow[]>([]);
  const [decisions, setDecisions] = useState<RaidRow[]>([]);
  const [initiativeGroups, setInitiativeGroups] = useState<InitiativeGroup[]>([]);
  const [reminders, setReminders] = useState<{ id: string; entity_type: string; entity_id: string; remind_at: string; title: string }[]>([]);
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const isAdmin = role === "super_admin" || role === "admin";

      // Get visible project IDs for regular users
      let visibleProjectIds: Set<string> | null = null;
      const effectiveProfileId = impersonation && !isAdmin ? "00000000-0000-0000-0000-000000000000" : profileId;
      if (!isAdmin && userPersonId) {
        const { data: ids } = await supabase.rpc("user_visible_project_ids", { p_person_id: userPersonId, p_profile_id: effectiveProfileId });
        visibleProjectIds = new Set((ids || []).map(String));
      }

      const today = new Date().toISOString().split("T")[0];
      const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

      // All queries in parallel
      const [
        { data: overdueData },
        { data: dueWeekData },
        { data: myTasksData },
        { data: blockerData },
        { data: riskData },
        { data: decisionData },
        { data: initData },
        { data: projData },
        { data: actionCounts },
        { data: blockerCounts },
        { data: reminderData },
      ] = await Promise.all([
        // Overdue action items — only items owned by the current user
        supabase
          .from("action_item_ages")
          .select("*, owner:people(id, full_name, email, slack_member_id), project:projects(id, name, slug)")
          .lt("due_date", today)
          .in("status", ["pending", "in_progress", "at_risk", "blocked"])
          .eq("owner_id", userPersonId || "00000000-0000-0000-0000-000000000000")
          .order("due_date")
          .limit(20),
        // Due this week — only items owned by the current user
        supabase
          .from("action_item_ages")
          .select("*, owner:people(id, full_name, email, slack_member_id), project:projects(id, name, slug)")
          .gte("due_date", today)
          .lte("due_date", weekFromNow)
          .in("status", ["pending", "in_progress", "at_risk", "blocked"])
          .eq("owner_id", userPersonId || "00000000-0000-0000-0000-000000000000")
          .order("due_date")
          .limit(20),
        // My Tasks — all active tasks owned by the current user
        supabase
          .from("action_item_ages")
          .select("*, owner:people(id, full_name, email, slack_member_id), project:projects(id, name, slug)")
          .in("status", ["pending", "in_progress", "at_risk", "blocked", "needs_verification"])
          .eq("owner_id", userPersonId || "00000000-0000-0000-0000-000000000000")
          .order("priority")
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(50),
        // Active blockers
        supabase
          .from("blocker_ages")
          .select("*, owner:people(id, full_name, email), vendor:vendors(id, name), project:projects(id, name, slug)")
          .order("priority")
          .order("first_flagged_at")
          .limit(15),
        // High/critical risks and issues
        supabase
          .from("raid_entries")
          .select("*, owner:people(id, full_name, email, slack_member_id), project:projects(id, name, slug)")
          .in("raid_type", ["risk", "issue"])
          .in("priority", ["critical", "high"])
          .neq("status", "complete")
          .is("resolved_at", null)
          .order("priority")
          .order("first_flagged_at")
          .limit(15),
        // Pending decisions
        supabase
          .from("raid_entries")
          .select("*, owner:people(id, full_name, email, slack_member_id), project:projects(id, name, slug)")
          .eq("raid_type", "decision")
          .neq("status", "complete")
          .order("priority")
          .limit(10),
        // Initiatives
        supabase.from("initiatives").select("*").order("name"),
        // Projects
        supabase.from("projects").select("*").order("name"),
        // Action counts per project (open items)
        supabase.from("action_items").select("project_id").neq("status", "complete").not("project_id", "is", null),
        // Blocker counts per project (unresolved)
        supabase.from("blockers").select("project_id").is("resolved_at", null).not("project_id", "is", null),
        // Due reminders
        supabase
          .from("reminders")
          .select("id, entity_type, entity_id, remind_at, title")
          .eq("dismissed", false)
          .lte("remind_at", new Date().toISOString())
          .order("remind_at"),
      ]);

      // Scope to visible projects for regular users
      function scopeByProject<T extends { project_id?: string | null; project?: { id: string } | null }>(items: T[]): T[] {
        if (!visibleProjectIds) return items;
        return items.filter((i) => {
          const pid = i.project?.id || i.project_id;
          return pid && visibleProjectIds!.has(pid);
        });
      }

      setOverdue(scopeByProject((overdueData || []) as ActionRow[]));
      setDueThisWeek(scopeByProject((dueWeekData || []) as ActionRow[]));
      setMyTasks(scopeByProject((myTasksData || []) as ActionRow[]));
      setBlockers(scopeByProject((blockerData || []) as BlockerRow[]));
      setRisksIssues(scopeByProject((riskData || []) as RaidRow[]));
      setDecisions(scopeByProject((decisionData || []) as RaidRow[]));
      setReminders(reminderData || []);

      // Build initiative-grouped project view with counts
      const actionCountMap = new Map<string, number>();
      const blockerCountMap = new Map<string, number>();
      for (const a of actionCounts || []) actionCountMap.set(a.project_id, (actionCountMap.get(a.project_id) || 0) + 1);
      for (const b of blockerCounts || []) blockerCountMap.set(b.project_id, (blockerCountMap.get(b.project_id) || 0) + 1);

      let projects = ((projData || []) as Project[]).map((p) => ({
        ...p,
        actionCount: actionCountMap.get(p.id) || 0,
        blockerCount: blockerCountMap.get(p.id) || 0,
      }));

      if (visibleProjectIds) {
        projects = projects.filter((p) => visibleProjectIds!.has(p.id));
      }

      // Derive initiative health from worst child project health
      const healthRank: Record<string, number> = { at_risk: 3, off_track: 3, needs_attention: 2, in_progress: 1, on_track: 0 };
      function worstHealth(projs: ProjectRow[]): Initiative["health"] {
        let worst = 0;
        let worstVal: Initiative["health"] = "on_track";
        for (const p of projs) {
          const rank = healthRank[p.health] ?? 0;
          if (rank > worst) { worst = rank; worstVal = p.health as Initiative["health"]; }
        }
        return worstVal;
      }

      const inits = (initData || []) as Initiative[];
      const groups: InitiativeGroup[] = inits
        .map((init) => {
          const initProjects = projects.filter((p) => p.initiative_id === init.id);
          return { ...init, health: worstHealth(initProjects), projects: initProjects };
        })
        .filter((g) => g.projects.length > 0);

      // Add unassigned projects as a pseudo-initiative
      const unassigned = projects.filter((p) => !p.initiative_id);
      if (unassigned.length > 0) {
        groups.push({
          id: "__unassigned__",
          org_id: "",
          name: "Unassigned Projects",
          slug: "",
          description: null,
          health: "on_track" as Project["health"],
          owner_id: null,
          target_completion: null,
          notes: null,
          created_at: "",
          updated_at: "",
          projects: unassigned,
        });
      }

      setInitiativeGroups(groups);
      setLoading(false);
    }
    load();
  }, [role, profileId, userPersonId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
        <div>
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-200 rounded mt-2" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5"><div className="h-4 w-32 bg-gray-600 rounded" /></div>
            {[1, 2, 3].map((j) => (
              <div key={j} className="px-4 py-3 border-b border-gray-200 flex items-center gap-6">
                <div className="h-4 flex-1 bg-gray-200 rounded" />
                <div className="h-4 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{dateStr}</p>
      </div>

      {/* Overdue Items */}
      {overdue.length > 0 && (
        <section>
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-red-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Overdue ({overdue.length})</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Overdue</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((item) => (
                    <tr key={item.id} className="border-b border-gray-200 hover:bg-red-50/60 relative group">
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                        {item.project ? (
                          <Link href={`/projects/${item.project.slug}?tab=actions&item=${item.id}`} className="before:absolute before:inset-0">{item.title}</Link>
                        ) : item.title}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.owner ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                              {item.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                            </span>
                            <span className="text-gray-700">{item.owner.full_name}</span>
                          </div>
                        ) : <span className="text-gray-400 italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-600">{item.project?.name || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(item.due_date)}</td>
                      <td className="px-4 py-3 text-sm text-red-600 font-medium">
                        {item.days_overdue != null ? `${item.days_overdue}d` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {item.owner ? (
                          <div className="flex items-center gap-2.5 relative z-10">
                            {item.owner.email && (
                              <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(item.owner.email)}&su=${encodeURIComponent(`RE: ${item.title}`)}&body=${encodeURIComponent(`https://edcet-tracker.vercel.app/projects/${item.project?.slug || ""}?tab=actions\n\n`)}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors" title={`Email ${item.owner.full_name}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                              </a>
                            )}
                            {item.owner.slack_member_id && (
                              <a href={`https://edcetera.slack.com/team/${item.owner.slack_member_id}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-purple-600 transition-colors" title={`Slack DM ${item.owner.full_name}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              </a>
                            )}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Reminders */}
      {reminders.length > 0 && (
        <section>
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-indigo-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Reminders ({reminders.length})</h2>
            </div>
            <div>
              {reminders.map((r) => {
                const ago = Math.max(0, Math.floor((Date.now() - new Date(r.remind_at).getTime()) / 60000));
                const agoLabel = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.floor(ago / 60)}h ago` : `${Math.floor(ago / 1440)}d ago`;
                return (
                  <div key={r.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-semibold truncate">{r.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Set {agoLabel}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 relative">
                      <button
                        onClick={() => setSnoozeOpenId(snoozeOpenId === r.id ? null : r.id)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Snooze
                      </button>
                      {snoozeOpenId === r.id && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-48">
                          {[
                            { label: "In 1 hour", ms: 60 * 60 * 1000 },
                            { label: "In 4 hours", ms: 4 * 60 * 60 * 1000 },
                            { label: "Tomorrow morning", ms: 0 },
                            { label: "In 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
                            { label: "In 1 week", ms: 7 * 24 * 60 * 60 * 1000 },
                          ].map((opt) => (
                            <button
                              key={opt.label}
                              onClick={() => {
                                let newTime: Date;
                                if (opt.label === "Tomorrow morning") {
                                  newTime = new Date();
                                  newTime.setDate(newTime.getDate() + 1);
                                  newTime.setHours(9, 0, 0, 0);
                                } else {
                                  newTime = new Date(Date.now() + opt.ms);
                                }
                                supabase.from("reminders").update({ remind_at: newTime.toISOString(), dismissed: false }).eq("id", r.id).then(() => {});
                                setReminders((prev) => prev.filter((rem) => rem.id !== r.id));
                                setSnoozeOpenId(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          supabase.from("reminders").update({ dismissed: true }).eq("id", r.id).then(() => {});
                          setReminders((prev) => prev.filter((rem) => rem.id !== r.id));
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Due This Week */}
      {dueThisWeek.length > 0 && (
        <section>
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Due This Week ({dueThisWeek.length})</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                </tr>
              </thead>
              <tbody>
                {dueThisWeek.map((item) => (
                    <tr key={item.id} className="border-b border-gray-200 hover:bg-blue-50/60 relative group">
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                        {item.project ? (
                          <Link href={`/projects/${item.project.slug}?tab=actions&item=${item.id}`} className="before:absolute before:inset-0">{item.title}</Link>
                        ) : item.title}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.owner ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                              {item.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                            </span>
                            <span className="text-gray-700">{item.owner.full_name}</span>
                          </div>
                        ) : <span className="text-gray-400 italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-600">{item.project?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(item.priority)}`}>{priorityLabel(item.priority)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(item.due_date)}</td>
                      <td className="px-4 py-3">
                        {item.owner ? (
                          <div className="flex items-center gap-2.5 relative z-10">
                            {item.owner.email && (
                              <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(item.owner.email)}&su=${encodeURIComponent(`RE: ${item.title}`)}&body=${encodeURIComponent(`https://edcet-tracker.vercel.app/projects/${item.project?.slug || ""}?tab=actions\n\n`)}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors" title={`Email ${item.owner.full_name}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                              </a>
                            )}
                            {item.owner.slack_member_id && (
                              <a href={`https://edcetera.slack.com/team/${item.owner.slack_member_id}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-purple-600 transition-colors" title={`Slack DM ${item.owner.full_name}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              </a>
                            )}
                          </div>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* My Tasks */}
      {myTasks.length > 0 && (
        <section>
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">My Tasks ({myTasks.length})</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                </tr>
              </thead>
              <tbody>
                {myTasks.map((item) => {
                  const badge = statusBadge(item.status);
                  return (
                    <tr key={item.id} className="border-b border-gray-200 hover:bg-blue-50/60 relative group">
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                        {item.project ? (
                          <Link href={`/projects/${item.project.slug}?tab=actions&item=${item.id}`} className="before:absolute before:inset-0">{item.title}</Link>
                        ) : item.title}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-600">{item.project?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(item.priority)}`}>{priorityLabel(item.priority)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(item.due_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* No overdue or due items */}
      {overdue.length === 0 && dueThisWeek.length === 0 && myTasks.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-300 p-6 text-center">
          <p className="text-sm text-gray-500">No overdue or upcoming items.</p>
        </div>
      )}

      {/* Active Blockers */}
      {blockers.length > 0 && (
        <section>
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Active Blockers ({blockers.length})</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Blocker</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Impact</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b) => (
                  <tr key={b.id} className="border-b border-gray-200 hover:bg-red-50/60 relative group">
                    <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                      {b.project ? (
                        <Link href={`/projects/${b.project.slug}?tab=blockers`} className="before:absolute before:inset-0">{b.title}</Link>
                      ) : b.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-blue-600">{b.project?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-blue-600">{b.vendor?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={
                        b.age_severity === "critical" ? "text-red-600 font-medium" :
                        b.age_severity === "aging" ? "text-orange-600" : "text-gray-600"
                      }>
                        {b.age_days != null ? formatAge(b.age_days) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{b.impact_description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Two-column: Risks & Issues + Decisions */}
      {(risksIssues.length > 0 || decisions.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Risks & Issues */}
          <section>
            {risksIssues.length === 0 ? (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Risks & Issues</h2>
                <p className="text-sm text-gray-500">No high-priority risks or issues.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                <div className="bg-gray-800 px-4 py-2.5">
                  <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Risks & Issues ({risksIssues.length})</h2>
                </div>
                {risksIssues.map((r) => {
                  const href = r.project ? `/projects/${(r.project as Pick<Project, "id" | "name" | "slug">).slug}?tab=raid` : null;
                  const typeLabel = r.raid_type === "risk" ? "R" : "I";
                  const typeBg = r.raid_type === "risk" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
                  const inner = (
                    <>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex w-5 h-5 items-center justify-center text-[10px] font-bold rounded ${typeBg}`}>{typeLabel}</span>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(r.priority)}`}>{priorityLabel(r.priority)}</span>
                        {r.first_flagged_at && <span className="text-xs text-gray-400">{formatAge(Math.floor((Date.now() - new Date(r.first_flagged_at).getTime()) / 86400000))}</span>}
                      </div>
                      <p className="text-sm text-gray-900 font-semibold mt-1">{r.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {r.owner?.email ? (
                          <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(r.owner.email)}&su=${encodeURIComponent(`RE: ${r.title}`)}&body=${encodeURIComponent(`https://edcet-tracker.vercel.app/projects/${r.project?.slug || ""}?tab=raid\n\n`)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{r.owner.full_name}</a>
                        ) : (r.owner?.full_name || "Unassigned")} · {r.project?.name || "General"}
                      </p>
                    </>
                  );
                  return href ? (
                    <Link key={r.id} href={href} className="block px-4 py-3 border-b border-gray-200 last:border-b-0 hover:bg-blue-50/60">{inner}</Link>
                  ) : (
                    <div key={r.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0">{inner}</div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Decisions */}
          <section>
            {decisions.length === 0 ? (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Decisions Needed</h2>
                <p className="text-sm text-gray-500">No pending decisions.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                <div className="bg-gray-800 px-4 py-2.5">
                  <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Decisions Needed ({decisions.length})</h2>
                </div>
                {decisions.map((d) => {
                  const href = d.project ? `/projects/${(d.project as Pick<Project, "id" | "name" | "slug">).slug}?tab=raid` : null;
                  const inner = (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">{d.display_id}</span>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(d.priority)}`}>{priorityLabel(d.priority)}</span>
                      </div>
                      <p className="text-sm text-gray-900 font-semibold mt-1">{d.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {d.owner?.email ? (
                          <a href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(d.owner.email)}&su=${encodeURIComponent(`RE: ${d.title}`)}&body=${encodeURIComponent(`https://edcet-tracker.vercel.app/projects/${d.project?.slug || ""}?tab=raid\n\n`)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{d.owner.full_name}</a>
                        ) : (d.owner?.full_name || "Unassigned")} · {d.project?.name || "General"}
                      </p>
                    </>
                  );
                  return href ? (
                    <Link key={d.id} href={href} className="block px-4 py-3 border-b border-gray-200 last:border-b-0 hover:bg-blue-50/60">{inner}</Link>
                  ) : (
                    <div key={d.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0">{inner}</div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Initiatives divider */}
      {initiativeGroups.length > 0 && (
        <div className="flex items-center gap-4 pt-2">
          <hr className="flex-1 border-gray-300" />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-widest">Initiatives</span>
          <hr className="flex-1 border-gray-300" />
        </div>
      )}

      {/* Initiative tables — 2-up grid */}
      {initiativeGroups.length > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {initiativeGroups.map((init) => (
            <div key={init.id} className="bg-white rounded-lg border border-gray-300 overflow-hidden">
              <div className="bg-gray-800 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {init.id !== "__unassigned__" ? (
                    <Link href={`/initiatives/${init.slug}`} className="text-xs font-semibold text-white uppercase tracking-wide hover:text-blue-300">{init.name}</Link>
                  ) : (
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{init.name}</span>
                  )}
                  {init.id !== "__unassigned__" && (
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(init.health)}`}>{healthLabel(init.health)}</span>
                  )}
                </div>
                {init.target_completion && (
                  <span className="text-xs text-gray-400">Target: {formatDateShort(init.target_completion)}</span>
                )}
              </div>
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-300">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Health</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Blockers</th>
                  </tr>
                </thead>
                <tbody>
                  {init.projects.map((p) => (
                    <tr key={p.id} className="border-b border-gray-200 hover:bg-blue-50/60 relative group">
                      <td className="px-4 py-3 text-sm font-semibold">
                        <Link href={`/projects/${p.slug}`} className="text-blue-600 hover:underline before:absolute before:inset-0">{p.name}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>{healthLabel(p.health)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{p.actionCount}</td>
                      <td className="px-4 py-3 text-sm text-center">
                        {p.blockerCount > 0 ? (
                          <span className="text-red-600 font-medium">{p.blockerCount}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
