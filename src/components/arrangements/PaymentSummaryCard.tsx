"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowUpRight } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

type PaymentRow = {
  id: string;
  planned_date: string | null;
  planned_amount: number | null;
  actual_date: string | null;
  actual_amount: number | null;
  status: "予定" | "入金済" | "保留" | "キャンセル";
};

const STATUS_COLOR: Record<string, string> = {
  予定: "bg-amber-100 text-amber-800 border-amber-300",
  入金済: "bg-green-100 text-green-800 border-green-300",
  保留: "bg-gray-100 text-gray-700 border-gray-300",
  キャンセル: "bg-rose-100 text-rose-800 border-rose-300",
};

export function PaymentSummaryCard({ eventId }: { eventId: string }) {
  const { canViewPayments, loading } = usePermission();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (loading || !canViewPayments) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("event_payments")
        .select("id, planned_date, planned_amount, actual_date, actual_amount, status")
        .eq("event_id", eventId)
        .order("planned_date", { ascending: true, nullsFirst: false });
      setRows((data || []) as PaymentRow[]);
      setFetched(true);
    })();
  }, [eventId, canViewPayments, loading]);

  if (loading || !canViewPayments || !fetched) return null;

  // サマリ計算
  const totalPlanned = rows.reduce((s, r) => s + (r.planned_amount ?? 0), 0);
  const totalActual = rows.reduce((s, r) => s + (r.actual_amount ?? 0), 0);
  const paidCount = rows.filter((r) => r.status === "入金済").length;

  return (
    <Card className="border-l-4 border-l-blue-500 bg-blue-50/30">
      <CardContent className="pt-3 pb-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-700" />
            <span className="text-sm font-bold text-blue-800">入金 {rows.length > 0 ? `${paidCount}/${rows.length}件 入金済` : "レコード無し"}</span>
            {rows.length > 0 && (
              <span className="text-xs text-muted-foreground">
                予定¥{totalPlanned.toLocaleString()} / 実績¥{totalActual.toLocaleString()}
              </span>
            )}
          </div>
          <Link
            href={`/payments?event=${eventId}`}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            入金管理ページで編集 <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rows.map((r) => (
              <Badge key={r.id} variant="outline" className={`text-xs ${STATUS_COLOR[r.status]}`}>
                {r.status}
                {r.planned_date && <span className="ml-1 opacity-70">{r.planned_date}</span>}
                {r.planned_amount != null && <span className="ml-1 opacity-70">¥{r.planned_amount.toLocaleString()}</span>}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
