import type { UserRole } from "@/hooks/usePermission";

export type AccessContext = {
  role: UserRole;
  canViewPayments: boolean;
};

// limited ロールが閲覧できるパス一覧（製造スタッフ向けの最小セット）
// ・ダッシュボード（/）
// ・日程表（/events）※一覧のみ。詳細ページ /events/[id] や /events/new は不可
// ・社員スケジュール（/schedule）
// ・モバイルメニュー（/menu）※ログアウト導線に必要
export function canAccessPath(ctx: AccessContext, pathname: string): boolean {
  // 入金管理・帳合先マスターは can_view_payments 権限が必要
  if (pathname === "/payments" || pathname.startsWith("/payments/")) {
    return ctx.canViewPayments;
  }
  if (pathname === "/payer-master" || pathname.startsWith("/payer-master/")) {
    return ctx.canViewPayments;
  }

  if (ctx.role === "admin" || ctx.role === "viewer") return true;

  // limited の許可ルート
  if (pathname === "/") return true;
  if (pathname === "/events") return true;
  if (pathname === "/schedule") return true;
  if (pathname === "/menu" || pathname.startsWith("/menu/")) return true;
  return false;
}
