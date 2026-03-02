"use client";

import { useState } from "react";
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
  BookType,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mainNav = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Initiatives", href: "/initiatives", icon: FolderKanban },
  { name: "Intake", href: "/intake", icon: Inbox },
];

const settingsItems = [
  { name: "People", href: "/settings/people", icon: Users },
  { name: "Vendors", href: "/settings/vendors", icon: Building2 },
  { name: "Term Corrections", href: "/settings", icon: BookType },
];

export function Sidebar() {
  const pathname = usePathname();
  const isOnSettings = pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = useState(isOnSettings);

  return (
    <div className="hidden md:flex md:w-56 md:flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center h-14 px-4 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-gray-900">Edcetera</span>
        </Link>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {mainNav.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}

        {/* Settings group */}
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
              {settingsItems.map((item) => {
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
      </nav>
    </div>
  );
}
