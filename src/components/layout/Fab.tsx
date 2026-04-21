"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

// FAB は "+" 新規作成を片手で届く位置に固定表示する（モバイル専用）
// 表示するのは新規作成の意味が通る画面のみ
const visibleOn = (pathname: string) =>
  pathname === "/" ||
  pathname.startsWith("/events") ||
  pathname.startsWith("/schedule") ||
  pathname.startsWith("/hotels") ||
  pathname.startsWith("/shipments") ||
  pathname.startsWith("/applications") ||
  pathname.startsWith("/dm") ||
  pathname.startsWith("/archive");

export function Fab() {
  const pathname = usePathname();
  const { canEdit } = usePermission();

  if (!canEdit) return null;
  if (!visibleOn(pathname)) return null;
  // /events/new 等の詳細画面では不要
  if (pathname === "/events/new") return null;

  return (
    <Link
      href="/events/new"
      aria-label="新規催事を追加"
      className="md:hidden fixed right-4 z-30 bg-primary text-primary-foreground shadow-lg rounded-full h-14 w-14 flex items-center justify-center active:scale-95 transition-transform print:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
    >
      <Plus className="h-7 w-7" strokeWidth={2.5} aria-hidden />
    </Link>
  );
}
