"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, AlertTriangle, ChevronRight } from "lucide-react";
import { usePaymentAlerts, type PaymentAlertEvent } from "@/hooks/usePaymentAlerts";

const venueLabel = (e: PaymentAlertEvent) => (e.store_name ? `${e.venue} ${e.store_name}` : e.venue);

type Section = {
  key: string;
  label: string;
  description: string;
  events: PaymentAlertEvent[];
  color: string;
};

export function PaymentAlertsCard() {
  const alerts = usePaymentAlerts();
  if (alerts.loading) return null;
  if (alerts.total === 0) return null;

  const sections: Section[] = [
    {
      key: "missingRecord",
      label: "入金レコード無し",
      description: "自動生成が失敗した催事。手動で追加してください",
      events: alerts.missingRecord,
      color: "bg-rose-100 text-rose-800 border-rose-300",
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
      label: "売上未入力で終了",
      description: "催事が終わったのに日別売上が未入力",
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

  return (
    <Card className="border-l-4 border-l-rose-500 bg-rose-50/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          <h2 className="text-sm font-bold text-rose-800">入金管理アラート（{alerts.total}件）</h2>
          <Link href="/payments" className="ml-auto text-xs text-primary hover:underline inline-flex items-center gap-1">
            <Wallet className="h-3 w-3" />入金管理ページへ
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sections.map((s) => (
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
                    href={`/events/${e.id}`}
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
      </CardContent>
    </Card>
  );
}
