"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";

export function Header() {
  const router = useRouter();
  const supabase = createClient();
  const { displayName } = usePermission();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background px-4 md:pl-60">
      {/* モバイル: ロゴ + タイトル（ナビはBottomNavに集約） */}
      <Link href="/" className="flex items-center gap-2 md:hidden min-w-0">
        <img src="/brand/logo-square.png" alt="安岡蒲鉾" className="h-8 w-8 shrink-0 object-contain" />
        <span className="font-bold text-base truncate">催事手配管理</span>
      </Link>

      {/* 右端: ユーザー名 + ログアウト（PC） */}
      <div className="ml-auto flex items-center gap-2">
        {displayName && (
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {displayName}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden md:inline-flex">
          <LogOut className="h-4 w-4 mr-2" />
          ログアウト
        </Button>
      </div>
    </header>
  );
}
