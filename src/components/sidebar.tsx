"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Inbox,
  Users,
  Building2,
  Settings,
  ChevronDown,
  ChevronRight,
  BookType,
  BookOpen,
  MessageSquare,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types";
import { useRole } from "@/components/role-context";

interface SidebarProject {
  id: string;
  name: string;
  slug: string;
  hasBlockers: boolean;
}

interface SidebarInitiative {
  id: string;
  name: string;
  slug: string;
  projects: SidebarProject[];
}

function getSettingsItems(role: UserRole) {
  const items: { name: string; href: string; icon: typeof Users }[] = [
    { name: "People", href: "/settings/people", icon: Users },
    { name: "Vendors", href: "/settings/vendors", icon: Building2 },
  ];
  if (role === "super_admin" || role === "admin") {
    items.push({ name: "Term Corrections", href: "/settings", icon: BookType });
  }
  return items;
}

export function Sidebar({ role: propRole = "user" as UserRole, profileId, userPersonId }: { role?: UserRole; profileId?: string; userPersonId?: string | null }) {
  const { role: contextRole, userPersonId: contextPersonId, impersonation } = useRole();
  // Use context role (which reflects impersonation) over the server-passed prop
  const role = contextRole || propRole;
  const effectivePersonId = contextPersonId || userPersonId;
  // When impersonating a non-admin, don't use real user's profileId for project visibility
  const effectiveProfileId = impersonation && role === "user" ? null : profileId;
  const pathname = usePathname();
  const isOnSettings = pathname.startsWith("/settings");
  const isOnInitiatives = pathname.startsWith("/initiatives") || pathname.startsWith("/projects");
  const [settingsOpen, setSettingsOpen] = useState(isOnSettings);
  const [initiativesOpen, setInitiativesOpen] = useState(isOnInitiatives);
  const [expandedInitiatives, setExpandedInitiatives] = useState<Set<string>>(new Set());
  const [initiatives, setInitiatives] = useState<SidebarInitiative[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);

  // Load collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      if (next) setHovering(false);
      return next;
    });
  }

  // Fetch on mount + re-fetch on sidebar:refresh events
  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [{ data: initData }, { data: projData }, { data: blockerData }] = await Promise.all([
        supabase.from("initiatives").select("id, name, slug").order("name"),
        supabase.from("projects").select("id, name, slug, initiative_id").order("name"),
        supabase.from("blockers").select("project_id").eq("status", "pending"),
      ]);

      const inits = (initData || []) as { id: string; name: string; slug: string }[];
      let projs = (projData || []) as { id: string; name: string; slug: string; initiative_id: string | null }[];
      const blockedProjectIds = new Set((blockerData || []).map((b: { project_id: string }) => b.project_id));

      // For regular users, only show projects they are part of
      if (role === "user" && effectivePersonId) {
        const rpcProfileId = effectiveProfileId || "00000000-0000-0000-0000-000000000000";
        const { data: visibleIds } = await supabase.rpc("user_visible_project_ids", { p_person_id: effectivePersonId, p_profile_id: rpcProfileId });
        const idSet = new Set((visibleIds || []).map(String));
        projs = projs.filter((p) => idSet.has(p.id));
      }

      const result: SidebarInitiative[] = inits
        .map((init) => ({
          ...init,
          projects: projs
            .filter((p) => p.initiative_id === init.id)
            .map((p) => ({ ...p, hasBlockers: blockedProjectIds.has(p.id) })),
        }))
        // For regular users, only show initiatives that have visible projects
        .filter((init) => role !== "user" || init.projects.length > 0);

      setInitiatives(result);
      setLoaded(true);
    }
    load();
    window.addEventListener("sidebar:refresh", load);
    return () => window.removeEventListener("sidebar:refresh", load);
  }, [role, effectiveProfileId, effectivePersonId]);

  // Auto-expand based on current path (no re-fetch)
  useEffect(() => {
    if (!loaded || initiatives.length === 0) return;

    if (pathname.startsWith("/projects/")) {
      const currentSlug = pathname.split("/projects/")[1]?.split("/")[0];
      for (const init of initiatives) {
        if (init.projects.some((p) => p.slug === currentSlug)) {
          setExpandedInitiatives((prev) => {
            if (prev.has(init.id)) return prev;
            return new Set([...prev, init.id]);
          });
          break;
        }
      }
    }
    if (pathname.startsWith("/initiatives/")) {
      const currentSlug = pathname.split("/initiatives/")[1]?.split("/")[0];
      const init = initiatives.find((i) => i.slug === currentSlug);
      if (init) {
        setExpandedInitiatives((prev) => {
          if (prev.has(init.id)) return prev;
          return new Set([...prev, init.id]);
        });
      }
    }
  }, [pathname, loaded, initiatives]);

  function toggleInitiative(id: string) {
    setExpandedInitiatives((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isExpanded = !collapsed || hovering;

  // Icon-only collapsed strip
  if (collapsed && !hovering) {
    return (
      <div
        className="hidden md:flex md:flex-col w-14 border-r border-gray-200 bg-white flex-shrink-0"
        onMouseEnter={() => setHovering(true)}
      >
        <div className="flex items-center justify-center h-14 border-b border-gray-200">
          <button onClick={toggleCollapsed} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md">
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 py-4 flex flex-col items-center gap-1">
          <Link href="/dashboard" className={cn("p-2 rounded-md", pathname === "/dashboard" || pathname.startsWith("/dashboard/") ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")} title="Dashboard">
            <LayoutDashboard className="h-4 w-4" />
          </Link>
          {role !== "vendor" && (
            <Link href="/ask" className={cn("p-2 rounded-md", pathname === "/ask" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")} title="Ask">
              <MessageSquare className="h-4 w-4" />
            </Link>
          )}
          {(role === "super_admin" || role === "admin") && (
            <Link href="/timeline" className={cn("p-2 rounded-md", pathname === "/timeline" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")} title="Timeline">
              <CalendarDays className="h-4 w-4" />
            </Link>
          )}
          {role !== "vendor" && (
            <Link href="/docs" prefetch={false} className={cn("p-2 rounded-md", pathname === "/docs" || pathname.startsWith("/docs/") ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")} title="Docs">
              <BookOpen className="h-4 w-4" />
            </Link>
          )}
          <Link href="/initiatives" className={cn("p-2 rounded-md", isOnInitiatives ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")} title="Initiatives">
            <FolderKanban className="h-4 w-4" />
          </Link>
          {role !== "vendor" && (
            <Link href="/intake" className={cn("p-2 rounded-md", pathname === "/intake" || pathname.startsWith("/intake/") ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")} title="Intake">
              <Inbox className="h-4 w-4" />
            </Link>
          )}
          {role !== "vendor" && (
            <Link href="/settings" className={cn("p-2 rounded-md", isOnSettings ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")} title="Settings">
              <Settings className="h-4 w-4" />
            </Link>
          )}
        </nav>
      </div>
    );
  }

  // Full sidebar content (used for both expanded and hover-overlay modes)
  const sidebarContent = (
    <>
      <div className="flex items-center h-14 px-4 border-b border-gray-200 justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-gray-900">Edcetera</span>
        </Link>
        <button onClick={toggleCollapsed} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
            pathname === "/dashboard" || pathname.startsWith("/dashboard/")
              ? "bg-blue-50 text-blue-700"
              : "text-gray-700 hover:bg-gray-100"
          )}
        >
          <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
          Dashboard
        </Link>

        {/* Ask — hidden from vendors */}
        {role !== "vendor" && (
          <Link
            href="/ask"
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
              pathname === "/ask"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            Ask
          </Link>
        )}

        {/* Timeline — admin+ only */}
        {(role === "super_admin" || role === "admin") && (
          <Link
            href="/timeline"
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
              pathname === "/timeline"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <CalendarDays className="h-4 w-4 flex-shrink-0" />
            Timeline
          </Link>
        )}

        {/* Docs — hidden from vendors */}
        {role !== "vendor" && (
          <Link
            href="/docs"
            prefetch={false}
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
              pathname === "/docs" || pathname.startsWith("/docs/")
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <BookOpen className="h-4 w-4 flex-shrink-0" />
            Docs
          </Link>
        )}

        {/* Initiatives group */}
        <div>
          <button
            onClick={() => setInitiativesOpen((prev) => !prev)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
              isOnInitiatives
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <FolderKanban className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">Initiatives</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", initiativesOpen ? "rotate-180" : "")} />
          </button>

          {initiativesOpen && (
            <div className="mt-1 ml-4 space-y-0.5">
              {initiatives.map((init) => {
                const isExpanded = expandedInitiatives.has(init.id);
                const isInitActive = pathname === `/initiatives/${init.slug}`;
                return (
                  <div key={init.id}>
                    <div className="flex items-center">
                      <button
                        onClick={() => toggleInitiative(init.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                      >
                        <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded ? "rotate-90" : "")} />
                      </button>
                      <Link
                        href={`/initiatives/${init.slug}`}
                        className={cn(
                          "flex-1 px-2 py-1.5 text-sm rounded-md transition-colors truncate",
                          isInitActive
                            ? "text-blue-700 font-medium"
                            : "text-gray-600 hover:bg-gray-100"
                        )}
                      >
                        {init.name}
                      </Link>
                    </div>
                    {isExpanded && init.projects.length > 0 && (
                      <div className="ml-5 space-y-0.5">
                        {init.projects.map((proj) => {
                          const isProjActive = pathname === `/projects/${proj.slug}`;
                          return (
                            <Link
                              key={proj.id}
                              href={`/projects/${proj.slug}`}
                              className={cn(
                                "block px-2 py-1 text-xs rounded-md transition-colors truncate",
                                isProjActive
                                  ? "text-blue-700 font-medium bg-blue-50"
                                  : proj.hasBlockers
                                    ? "text-red-600 font-semibold hover:bg-red-50"
                                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              )}
                            >
                              {proj.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Intake — hidden from vendors */}
        {role !== "vendor" && (
          <Link
            href="/intake"
            className={cn(
              "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
              pathname === "/intake" || pathname.startsWith("/intake/")
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <Inbox className="h-4 w-4 flex-shrink-0" />
            Intake
          </Link>
        )}

        {/* Settings group — hidden from vendors */}
        {role !== "vendor" && (
          <div className="pt-2">
            <button
              onClick={() => setSettingsOpen((prev) => !prev)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                isOnSettings
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">Settings</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", settingsOpen ? "rotate-180" : "")} />
            </button>

            {settingsOpen && (
              <div className="mt-1 ml-4 space-y-0.5">
                {getSettingsItems(role).map((item) => {
                  const isActive =
                    item.href === "/settings"
                      ? pathname === "/settings"
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors",
                        isActive
                          ? "text-blue-700 font-medium"
                          : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </>
  );

  // Hovering over collapsed sidebar — show full sidebar as overlay
  if (collapsed && hovering) {
    return (
      <>
        {/* Collapsed strip stays in place */}
        <div className="hidden md:flex md:flex-col w-14 border-r border-gray-200 bg-white flex-shrink-0" />
        {/* Full sidebar overlaid */}
        <div
          className="hidden md:flex md:flex-col w-56 bg-white border-r border-gray-200 shadow-xl fixed top-0 left-0 h-full z-40"
          onMouseLeave={() => setHovering(false)}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  // Normal expanded sidebar
  return (
    <div className="hidden md:flex md:w-56 md:flex-col border-r border-gray-200 bg-white">
      {sidebarContent}
    </div>
  );
}
