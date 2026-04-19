import type { UserRole } from "@/hooks/usePermission";

// limited ロールが閲覧できるパス一覧（製造スタッフ向けの最小セット）
// ・ダッシュボード（/）
// ・日程表（/events）※一覧のみ。詳細ページ /events/[id] や /events/new は不可
// ・社員スケジュール（/schedule）
// ・モバイルメニュー（/menu）※ログアウト導線に必要
export function canAccessPath(role: UserRole, pathname: string): boolean {
  if (role === "admin" || role === "viewer") return true;

  // limited の許可ルート
  if (pathname === "/") return true;
  if (pathname === "/events") return true;
  if (pathname === "/schedule") return true;
  if (pathname === "/menu" || pathname.startsWith("/menu/")) return true;
  return false;
}
