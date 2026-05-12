"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, AlertTriangle, ChevronRight, Flame } from "lucide-react";
import { usePaymentAlerts, type PaymentAlertEvent } from "@/hooks/usePaymentAlerts";

const venueLabel = (e: PaymentAlertEvent) => (e.store_name ? `${e.venue} ${e.store_name}` : e.venue);
const daysSinceEndLabel = (e: PaymentAlertEvent) =>
  e.daysSinceEnd === undefined ? "" : e.daysSinceEnd === 0 ? "本日終了" : `${e.daysSinceEnd}日前終了`;

type Section = {
  key: string;
  label: string;
  description: string;
  events: PaymentAlertEvent[];
  color: string;
  urgent?: boolean;
  // 催事クリック時のリンク先（デフォルトは催事詳細）
  href?: (e: PaymentAlertEvent) => string;
};

export function PaymentAlertsCard() {
  const alerts = usePaymentAlerts();
  if (alerts.loading) return null;
  if (alerts.total === 0) return null;

  const sections: Section[] = [
    {
      key: "recentlySalesPending",
      label: "🔥 直近終了 — 売上を入力してください",
      description: "催事終了から14日以内で日別売上がまだ未入力。終わったら売上を入力してください",
      events: alerts.recentlySalesPending,
      color: "bg-rose-100 text-rose-900 border-rose-400",
      urgent: true,
    },
    {
      key: "recentlyAmountPending",
      label: "🔥 直近終了 — 入金予定額を確定してください",
      description: "売上は入力済みですが入金予定額が未確定。/payments で「売上から税抜をコピー」してください",
      events: alerts.recentlyAmountPending,
      color: "bg-rose-100 text-rose-900 border-rose-400",
      urgent: true,
      href: (e: PaymentAlertEvent) => `/payments?event=${e.id}`,
    },
    {
      key: "missingRecord",
      label: "入金レコード無し",
      description: "自動生成が失敗した催事。手動で追加してください",
      events: alerts.missingRecord,
      color: "bg-rose-50 text-rose-800 border-rose-300",
    },
    {
      key: "missingSetup",
      label: "入金設定が不足",
      description: "開催前なのに予定日・予定額・入金率のいずれかが空",
      events: alerts.missingSetup,
      color: "bg-amber-100 text-amber-800 border-amber-300",
    },
    {
      key: "noSales",
      label: "売上未入力（15日以上前）",
      description: "終了から15日以上経過しても日別売上が未入力（古い催事）",
      events: alerts.noSales,
      color: "bg-orange-100 text-orange-800 border-orange-300",
    },
    {
      key: "overdue",
      label: "予定日超過で未入金",
      description: "入金予定日を過ぎても「入金済」になっていない（未回収）",
      events: alerts.overdue,
      color: "bg-purple-100 text-purple-800 border-purple-300",
    },
  ].filter((s) => s.events.length > 0);

  const urgentCount = sections.filter((s) => s.urgent).reduce((sum, s) => sum + s.events.length, 0);

  const urgentSections = sections.filter((s) => s.urgent);
  const normalSections = sections.filter((s) => !s.urgent);

  return (
    <Card className="border-l-4 border-l-rose-500 bg-rose-50/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          <h2 className="text-sm font-bold text-rose-800">入金管理アラート（{alerts.total}件）</h2>
          {urgentCount > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold inline-flex items-center gap-0.5">
              <Flame className="h-3 w-3" />要対応 {urgentCount}件
            </span>
          )}
          <Link href="/payments" className="ml-auto text-xs text-primary hover:underline inline-flex items-center gap-1">
            <Wallet className="h-3 w-3" />入金管理ページへ
          </Link>
        </div>
        {/* 🔥 直近終了アラート（最上部・1列で目立たせる） */}
        {urgentSections.length > 0 && (
          <div className="space-y-2">
            {urgentSections.map((s) => (
              <div key={s.key} className={`rounded-md border-2 p-2.5 ${s.color}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold">{s.label}</span>
                  <span className="text-xs font-bold">{s.events.length}件</span>
                </div>
                <p className="text-[11px] opacity-75 mb-1.5">{s.description}</p>
                <div className="space-y-0.5">
                  {s.events.slice(0, 5).map((e) => (
                    <Link
                      key={e.id}
                      href={s.href ? s.href(e) : `/events/${e.id}`}
                      className="flex items-center justify-between text-xs hover:underline py-0.5"
                    >
                      <span className="truncate">
                        {venueLabel(e)}
                        <span className="ml-1 text-[10px] opacity-60">({daysSinceEndLabel(e)})</span>
                      </span>
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    </Link>
                  ))}
                  {s.events.length > 5 && (
                    <div className="text-[10px] opacity-70">+{s.events.length - 5}件</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* 通常アラート（2列グリッド） */}
        {normalSections.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {normalSections.map((s) => (
              <div key={s.key} className={`rounded-md border p-2 ${s.color}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{s.label}</span>
                  <span className="text-xs font-bold">{s.events.length}件</span>
                </div>
                <p className="text-[10px] opacity-75 mb-1">{s.description}</p>
                <div className="space-y-0.5">
                  {s.events.slice(0, 3).map((e) => (
                    <Link
                      key={e.id}
                      href={s.href ? s.href(e) : `/events/${e.id}`}
                      className="flex items-center justify-between text-[11px] hover:underline"
                    >
                      <span className="truncate">{venueLabel(e)}</span>
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    </Link>
                  ))}
                  {s.events.length > 3 && (
                    <div className="text-[10px] opacity-70">+{s.events.length - 3}件</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
