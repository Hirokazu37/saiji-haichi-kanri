"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wallet } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { resolvePaymentSource, formatPaymentCycle } from "@/lib/payment-cycle";

type VenueMasterLite = {
  id: string;
  venue_name: string;
  store_name: string | null;
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
  default_payer_id: string | null;
  direct_receive_rate: number | null;
  chouai_receive_rate: number | null;
};

type PayerLite = {
  id: string;
  name: string;
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
  is_active: boolean;
};

export function PayerSourceSection({
  venueName,
  storeName,
  payerSource,
  onChange,
}: {
  venueName: string;
  storeName: string;
  payerSource: string; // "venue" | "direct" | `payer:<uuid>`
  onChange: (v: string) => void;
}) {
  const { canViewPayments, loading } = usePermission();
  const [venues, setVenues] = useState<VenueMasterLite[]>([]);
  const [payers, setPayers] = useState<PayerLite[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (loading || !canViewPayments) return;
    const supabase = createClient();
    (async () => {
      const [vmRes, pyRes] = await Promise.all([
        supabase.from("venue_master").select("id, venue_name, store_name, closing_day, pay_month_offset, pay_day, default_payer_id, direct_receive_rate, chouai_receive_rate"),
        supabase.from("payer_master").select("id, name, closing_day, pay_month_offset, pay_day, is_active").order("name"),
      ]);
      setVenues((vmRes.data || []) as VenueMasterLite[]);
      setPayers((pyRes.data || []) as PayerLite[]);
      setFetched(true);
    })();
  }, [canViewPayments, loading]);

  if (loading || !canViewPayments || !fetched) return null;

  // この催事の会場マスターを解決
  const venue = venues.find(
    (v) => v.venue_name === venueName.trim() && (v.store_name ?? "") === storeName.trim(),
  ) || null;

  // 現在選択中のソースを event-like オブジェクトに変換
  const eventLike = {
    payer_master_id: payerSource.startsWith("payer:") ? payerSource.slice(6) : null,
    force_direct: payerSource === "direct",
  };
  const resolved = resolvePaymentSource(eventLike, venue, payers);

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center gap-2 mb-2">
        <Wallet className="h-4 w-4 text-blue-700" />
        <Label className="text-sm font-semibold text-blue-800">入金設定</Label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
        <Select value={payerSource} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue>
              {payerSource === "venue" && "百貨店の設定に従う"}
              {payerSource === "direct" && "直取引に上書き"}
              {payerSource.startsWith("payer:") && `帳合経由: ${payers.find((p) => p.id === payerSource.slice(6))?.name ?? "（不明）"}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="venue">百貨店の設定に従う</SelectItem>
            <SelectItem value="direct">直取引に上書き</SelectItem>
            {payers.filter((p) => p.is_active).map((p) => (
              <SelectItem key={p.id} value={`payer:${p.id}`}>
                帳合経由: {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* 現在適用される実際の設定 */}
      <div className="mt-2 text-xs text-muted-foreground">
        現在適用: <span className="font-medium text-foreground">{resolved.displayLabel}</span>
        {resolved.cycle.closing_day != null && (
          <> ・ {formatPaymentCycle(resolved.cycle)}</>
        )}
        {resolved.appliedRate != null && (
          <> ・ 入金率 <span className="font-medium text-foreground">{resolved.appliedRate}%</span></>
        )}
        {!venue && (
          <span className="ml-2 text-amber-700">※この会場が百貨店マスターに未登録です</span>
        )}
      </div>
    </div>
  );
}
