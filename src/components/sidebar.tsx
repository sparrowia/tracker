"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  FileText,
  Inbox,
  AlertTriangle,
  Users,
  Calendar,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Vendors", href: "/vendors", icon: Building2 },
  { name: "Blockers", href: "/blockers", icon: AlertTriangle },
  { name: "Agendas", href: "/agendas", icon: Calendar },
  { name: "Intake", href: "/intake", icon: Inbox },
  { name: "People", href: "/people", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex md:w-56 md:flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center h-14 px-4 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-gray-900">Edcetera</span>
        </Link>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navigation.map((item) => {
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
      </nav>
    </div>
  );
}
