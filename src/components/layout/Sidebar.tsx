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
  FileText,
  Mail,
  Store,
  MapPin,
  UserCog,
  Archive,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermission, type UserRole } from "@/hooks/usePermission";
import { usePaymentAlerts } from "@/hooks/usePaymentAlerts";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  requiresPayments?: boolean; // can_view_payments フラグが必要な項目
};

const navItems: NavItem[] = [
  { label: "ダッシュボード", href: "/", icon: LayoutDashboard, roles: ["admin", "viewer", "limited"] },
  { label: "日程表", href: "/events", icon: CalendarDays, roles: ["admin", "viewer", "limited"] },
  { label: "履歴（終了した催事）", href: "/archive", icon: Archive, roles: ["admin", "viewer"] },
  { label: "社員スケジュール", href: "/schedule", icon: CalendarClock, roles: ["admin", "viewer", "limited"] },
  { label: "入金管理", href: "/payments", icon: Wallet, roles: ["admin", "viewer"], requiresPayments: true },
  { label: "ホテル・交通", href: "/hotels", icon: Hotel, roles: ["admin", "viewer"] },
  { label: "備品の流れ", href: "/shipments", icon: Package, roles: ["admin", "viewer"] },
  { label: "出店申込書", href: "/applications", icon: FileText, roles: ["admin", "viewer"] },
  { label: "DMハガキ", href: "/dm", icon: Mail, roles: ["admin", "viewer"] },
  { label: "百貨店マスター", href: "/venue-master", icon: Store, roles: ["admin", "viewer"] },
  { label: "エリアマスター", href: "/area-master", icon: MapPin, roles: ["admin", "viewer"] },
  { label: "ホテルマスター", href: "/hotel-master", icon: Hotel, roles: ["admin", "viewer"] },
  { label: "社員マスター", href: "/employees", icon: Users, roles: ["admin", "viewer"] },
  { label: "マネキン", href: "/agencies", icon: Building2, roles: ["admin", "viewer"] },
  { label: "帳合先マスター", href: "/payer-master", icon: Store, roles: ["admin", "viewer"], requiresPayments: true },
  { label: "ユーザー管理", href: "/users", icon: UserCog, roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { role, canViewPayments, loading } = usePermission();
  const alerts = usePaymentAlerts();

  const items = loading
    ? []
    : navItems.filter((item) => {
        if (!item.roles.includes(role)) return false;
        if (item.requiresPayments && !canViewPayments) return false;
        return true;
      });

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r bg-sidebar">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-3">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <img src="/brand/logo-square.png" alt="安岡蒲鉾" className="h-10 w-10 shrink-0 object-contain" />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[11px] tracking-wider text-muted-foreground">安岡蒲鉾</span>
            <span className="font-bold text-base text-sidebar-foreground truncate">催事手配管理</span>
          </div>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          // 入金管理のみ、alerts.total の件数バッジを右端に表示
          const badge = item.href === "/payments" && canViewPayments && alerts.total > 0 ? alerts.total : 0;
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
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="ml-auto rounded-full bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 min-w-[1.5rem] text-center">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
