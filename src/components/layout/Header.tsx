"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
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
  UserCog,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { usePermission } from "@/hooks/usePermission";

const navItems = [
  { label: "ダッシュボード", href: "/", icon: LayoutDashboard },
  { label: "日程表", href: "/events", icon: CalendarDays },
  { label: "履歴（終了した催事）", href: "/archive", icon: Archive },
  { label: "社員スケジュール", href: "/schedule", icon: CalendarClock },
  { label: "ホテル手配", href: "/hotels", icon: Hotel },
  { label: "交通手配", href: "/transports", icon: Train },
  { label: "備品の流れ", href: "/shipments", icon: Package },
  { label: "出店申込書", href: "/applications", icon: FileText },
  { label: "DMハガキ", href: "/dm", icon: Mail },
  { label: "ホテルマスター", href: "/hotel-master", icon: Hotel },
  { label: "社員マスター", href: "/employees", icon: Users },
  { label: "マネキン", href: "/agencies", icon: Building2 },
  { label: "ユーザー管理", href: "/users", icon: UserCog },
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const { displayName } = usePermission();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b bg-background px-4 md:pl-64">
      {/* モバイル: ハンバーガーメニュー */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="md:hidden mr-2 inline-flex items-center justify-center rounded-md p-2 hover:bg-muted">
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0 bg-sidebar">
          <SheetTitle className="flex items-center gap-3 border-b border-sidebar-border px-4 py-3">
            <img src="/brand/logo-square.png" alt="安岡蒲鉾" className="h-10 w-10 shrink-0 object-contain" />
            <div className="flex flex-col leading-tight min-w-0 text-left">
              <span className="text-[11px] font-normal tracking-wider text-muted-foreground">安岡蒲鉾</span>
              <span className="font-bold text-base text-sidebar-foreground truncate">催事手配管理</span>
            </div>
          </SheetTitle>
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
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
        </SheetContent>
      </Sheet>

      {/* モバイル: タイトル */}
      <h1 className="text-base font-bold md:hidden">催事手配管理</h1>

      {/* 右端: ユーザー名 + ログアウト */}
      <div className="ml-auto flex items-center gap-2">
        {displayName && (
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {displayName}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </header>
  );
}
