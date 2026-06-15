"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export type KarteVenue = { id: string; venue_name: string; store_name: string | null; notes: string | null };
export type KarteSeg = { kbn_no: number; code: number; segment_name: string };

type EventRow = { id: string; name: string | null; start_date: string; end_date: string; revenue: number | null; dm_count: number | null };
type DailyRow = { event_id: string; amount: number; tax_type: "excluded" | "included"; tax_rate: number | null };

const toIncluded = (amount: number, taxType: "excluded" | "included", rate: number | null) =>
  taxType === "included" ? amount : Math.round(amount * (1 + (rate ?? 0.08)));

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  venue: KarteVenue | null;
  segments: KarteSeg[];
  canEdit: boolean;
  onNotesSaved: (notes: string | null) => void;
};

export function VenueKarteDialog({ open, onOpenChange, venue, segments, canEdit, onNotesSaved }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<{ ev: EventRow; sales: number; visits: number }[]>([]);
  const [custTotal, setCustTotal] = useState(0);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);

  // 開いたら notes を初期化（レンダー中の prop 追従パターン）
  const [prevId, setPrevId] = useState<string | null>(null);
  if (venue && venue.id !== prevId) {
    setPrevId(venue.id);
    setNotes(venue.notes || "");
    setNotesSaved(false);
  }

  useEffect(() => {
    if (!open || !venue) return;
    (async () => {
      setLoading(true);
      // 1. この店の催事（会場名＋店舗名で一致）
      const { data: evData } = await supabase
        .from("events")
        .select("id, name, start_date, end_date, revenue, dm_count")
        .eq("venue", venue.venue_name)
        .order("start_date", { ascending: false });
      // store_name でさらに絞る（events 側に store_name がある前提）
      const events = ((evData as (EventRow & { store_name?: string | null })[]) || []).filter(
        (e) => (e.store_name || "") === (venue.store_name || "")
      ) as EventRow[];
      const ids = events.map((e) => e.id);

      // 2. 日別売上
      const dailyByEvent = new Map<string, number>();
      const visitByEvent = new Map<string, number>();
      if (ids.length > 0) {
        const [dailyRes, visRes] = await Promise.all([
          supabase.from("event_daily_revenue").select("event_id, amount, tax_type, tax_rate").in("event_id", ids),
          supabase.from("event_visit_counts").select("event_id, visit_count").in("event_id", ids),
        ]);
        for (const d of (dailyRes.data as DailyRow[]) || []) {
          dailyByEvent.set(d.event_id, (dailyByEvent.get(d.event_id) || 0) + toIncluded(d.amount, d.tax_type, d.tax_rate));
        }
        for (const v of (visRes.data as { event_id: string; visit_count: number }[]) || []) {
          visitByEvent.set(v.event_id, v.visit_count);
        }
      }

      setRows(
        events.map((ev) => ({
          ev,
          sales: dailyByEvent.get(ev.id) ?? (ev.revenue || 0),
          visits: visitByEvent.get(ev.id) ?? 0,
        }))
      );

      // 3. この店の区分に属する顧客数（合計）
      if (segments.length > 0) {
        const { data: sum } = await supabase
          .from("segment_customer_summary")
          .select("kbn_no, code, customer_count");
        const set = new Set(segments.map((s) => `${s.kbn_no}-${s.code}`));
        const total = ((sum as { kbn_no: number; code: number; customer_count: number }[]) || [])
          .filter((r) => set.has(`${r.kbn_no}-${r.code}`))
          .reduce((a, r) => a + r.customer_count, 0);
        setCustTotal(total);
      } else {
        setCustTotal(0);
      }
      setLoading(false);
    })();
  }, [open, venue, segments, supabase]);

  const saveNotes = async () => {
    if (!venue) return;
    const v = notes.trim() || null;
    const { error } = await supabase.from("venue_master").update({ notes: v }).eq("id", venue.id);
    if (!error) {
      onNotesSaved(v);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    }
  };

  const totalSales = rows.reduce((a, r) => a + r.sales, 0);
  const salesEvents = rows.filter((r) => r.sales > 0);
  const avgSales = salesEvents.length > 0 ? Math.round(totalSales / salesEvents.length) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        {venue && (
          <>
            <DialogHeader>
              <DialogTitle>
                {venue.venue_name}
                {venue.store_name && <span className="ml-1 text-muted-foreground font-normal">{venue.store_name}</span>}
                <span className="ml-2 text-sm font-normal text-muted-foreground">店舗カルテ</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 min-w-0">
              {/* サマリ */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">催事回数</div>
                  <div className="text-lg font-bold">{rows.length}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">累計売上(税込)</div>
                  <div className="text-lg font-bold">¥{totalSales.toLocaleString()}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">平均売上/回</div>
                  <div className="text-lg font-bold">¥{avgSales.toLocaleString()}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">顧客数(区分)</div>
                  <div className="text-lg font-bold">{custTotal.toLocaleString()}</div>
                </div>
              </div>

              {/* DM区分 */}
              {segments.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-xs text-muted-foreground mr-1">DM区分:</span>
                  {segments.map((s) => (
                    <span key={`${s.kbn_no}-${s.code}`} className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-amber-50 border border-amber-200 text-amber-800">
                      {s.segment_name}（{s.kbn_no}-{s.code}）
                    </span>
                  ))}
                </div>
              )}

              {/* 過去の催事 */}
              <div>
                <div className="text-sm font-medium mb-1">過去の催事（新しい順）</div>
                <div className="overflow-x-auto border rounded-md max-w-full">
                  <Table className="min-w-[560px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>会期</TableHead>
                        <TableHead className="text-right">売上(税込)</TableHead>
                        <TableHead className="text-right">DM</TableHead>
                        <TableHead className="text-right">来場</TableHead>
                        <TableHead className="text-right">反応率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">読み込み中…</TableCell></TableRow>
                      )}
                      {!loading && rows.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">この店の催事記録がありません（会場名の表記ゆれの可能性もあります）</TableCell></TableRow>
                      )}
                      {!loading && rows.map(({ ev, sales, visits }) => {
                        const rate = ev.dm_count && visits > 0 ? ((visits / ev.dm_count) * 100).toFixed(1) : null;
                        return (
                          <TableRow key={ev.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {ev.start_date}〜{ev.end_date.slice(5)}
                              {ev.name && <span className="block text-[10px] text-muted-foreground">{ev.name}</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{sales > 0 ? `¥${sales.toLocaleString()}` : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{ev.dm_count != null ? ev.dm_count.toLocaleString() : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{visits > 0 ? visits.toLocaleString() : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs font-semibold">{rate ? `${rate}%` : "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* メモ・振り返り */}
              <div>
                <div className="text-sm font-medium mb-1">メモ・振り返り（交渉条件・担当・課題など）</div>
                {canEdit ? (
                  <div className="space-y-1.5">
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="例: 歩率◯%／担当◯◯さん／地下催事は反応薄め" />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={saveNotes}>メモを保存</Button>
                      {notesSaved && <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap">{venue.notes || "—"}</div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
