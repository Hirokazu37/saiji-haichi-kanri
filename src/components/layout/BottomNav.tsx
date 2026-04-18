"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarClock,
  Package,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "ホーム", href: "/", icon: LayoutDashboard, match: (p: string) => p === "/" },
  { label: "日程表", href: "/events", icon: CalendarDays, match: (p: string) => p.startsWith("/events") || p.startsWith("/archive") },
  { label: "社員", href: "/schedule", icon: CalendarClock, match: (p: string) => p.startsWith("/schedule") },
  { label: "備品", href: "/shipments", icon: Package, match: (p: string) => p.startsWith("/shipments") },
  { label: "メニュー", href: "/menu", icon: MoreHorizontal, match: (p: string) => p.startsWith("/menu") || p.startsWith("/hotels") || p.startsWith("/applications") || p.startsWith("/dm") || p.startsWith("/venue-master") || p.startsWith("/area-master") || p.startsWith("/hotel-master") || p.startsWith("/employees") || p.startsWith("/agencies") || p.startsWith("/users") },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="主要ナビゲーション"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground active:bg-muted"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("h-6 w-6", active && "stroke-[2.5]")} aria-hidden />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
