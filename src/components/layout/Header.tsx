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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { label: "ダッシュボード", href: "/", icon: LayoutDashboard },
  { label: "日程表", href: "/events", icon: CalendarDays },
  { label: "社員スケジュール", href: "/schedule", icon: CalendarClock },
  { label: "ホテル手配", href: "/hotels", icon: Hotel },
  { label: "交通手配", href: "/transports", icon: Train },
  { label: "備品の流れ", href: "/shipments", icon: Package },
  { label: "出店申込書", href: "/applications", icon: FileText },
  { label: "DMハガキ", href: "/dm", icon: Mail },
  { label: "ホテルマスター", href: "/hotel-master", icon: Hotel },
  { label: "社員マスター", href: "/employees", icon: Users },
  { label: "マネキン", href: "/agencies", icon: Building2 },
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

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
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="flex h-14 items-center border-b px-4 font-bold text-lg">
            催事手配管理
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

      {/* PC: ページタイトル */}
      <h1 className="text-lg font-semibold md:hidden">催事手配管理</h1>

      {/* 右端: ログアウト */}
      <div className="ml-auto">
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </header>
  );
}
