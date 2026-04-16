"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  CalendarClock,
  Building2,
  Package,
  Hotel,
  Train,
  FileText,
  Mail,
  Store,
  MapPin,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "ダッシュボード", href: "/", icon: LayoutDashboard },
  { label: "日程表", href: "/events", icon: CalendarDays },
  { label: "社員スケジュール", href: "/schedule", icon: CalendarClock },
  { label: "ホテル・交通", href: "/hotels", icon: Hotel },
  { label: "備品の流れ", href: "/shipments", icon: Package },
  { label: "出店申込書", href: "/applications", icon: FileText },
  { label: "DMハガキ", href: "/dm", icon: Mail },
  { label: "百貨店マスター", href: "/venue-master", icon: Store },
  { label: "エリアマスター", href: "/area-master", icon: MapPin },
  { label: "ホテルマスター", href: "/hotel-master", icon: Hotel },
  { label: "社員マスター", href: "/employees", icon: Users },
  { label: "マネキン", href: "/agencies", icon: Building2 },
  { label: "ユーザー管理", href: "/users", icon: UserCog },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.jpg" alt="安岡蒲鉾" className="h-10 w-10 rounded object-contain" />
          <span className="font-bold text-lg">催事手配管理</span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
