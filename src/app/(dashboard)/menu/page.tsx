"use client";

import Link from "next/link";
import {
  Hotel,
  FileText,
  Mail,
  Store,
  MapPin,
  Users,
  Building2,
  UserCog,
  Archive,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { usePermission, type UserRole } from "@/hooks/usePermission";

type Item = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  desc?: string;
  roles: UserRole[];
};

type Section = { title: string; items: Item[] };

const sections: Section[] = [
  {
    title: "日々の手配",
    items: [
      { label: "ホテル・交通", href: "/hotels", icon: Hotel, desc: "社員ごとの宿泊と行き帰り", roles: ["admin", "viewer"] },
      { label: "出店申込書", href: "/applications", icon: FileText, desc: "提出状況の一覧管理", roles: ["admin", "viewer"] },
      { label: "DMハガキ", href: "/dm", icon: Mail, desc: "制作ステータスと枚数", roles: ["admin", "viewer"] },
    ],
  },
  {
    title: "履歴・振り返り",
    items: [
      { label: "履歴（終了した催事）", href: "/archive", icon: Archive, desc: "売上・振り返りメモ", roles: ["admin", "viewer"] },
    ],
  },
  {
    title: "マスター管理",
    items: [
      { label: "百貨店マスター", href: "/venue-master", icon: Store, roles: ["admin", "viewer"] },
      { label: "エリアマスター", href: "/area-master", icon: MapPin, roles: ["admin", "viewer"] },
      { label: "ホテルマスター", href: "/hotel-master", icon: Hotel, roles: ["admin", "viewer"] },
      { label: "社員マスター", href: "/employees", icon: Users, roles: ["admin", "viewer"] },
      { label: "マネキン（派遣会社）", href: "/agencies", icon: Building2, roles: ["admin", "viewer"] },
      { label: "ユーザー管理", href: "/users", icon: UserCog, roles: ["admin"] },
    ],
  },
];

export default function MenuPage() {
  const router = useRouter();
  const supabase = createClient();
  const { displayName, role, loading } = usePermission();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const visibleSections = loading
    ? []
    : sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) }))
        .filter((s) => s.items.length > 0);

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">メニュー</h1>
        {displayName && (
          <p className="text-sm text-muted-foreground mt-1">{displayName} としてログイン中</p>
        )}
      </div>

      {visibleSections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            {section.title}
          </h2>
          <div className="bg-card rounded-xl border divide-y">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-4 px-4 py-4 min-h-[64px] active:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-base">{item.label}</div>
                    {item.desc && (
                      <div className="text-xs text-muted-foreground truncate">{item.desc}</div>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          アカウント
        </h2>
        <div className="bg-card rounded-xl border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-4 min-h-[64px] active:bg-muted transition-colors rounded-xl text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
              <LogOut className="h-5 w-5" />
            </div>
            <div className="flex-1 font-medium text-base text-destructive">ログアウト</div>
          </button>
        </div>
      </section>
    </div>
  );
}
