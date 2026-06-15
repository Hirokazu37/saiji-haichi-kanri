"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { X, Plus, Search } from "lucide-react";

export type KarteVenue = { id: string; venue_name: string; store_name: string | null; notes: string | null };
export type KarteSeg = { kbn_no: number; code: number; segment_name: string };

type EventRow = { id: string; name: string | null; start_date: string; end_date: string; revenue: number | null; dm_count: number | null; venue: string; store_name: string | null };
type DailyRow = { event_id: string; amount: number; tax_type: "excluded" | "included"; tax_rate: number | null };
type AliasRow = { id: string; alias_venue: string; alias_store: string | null };

const toIncluded = (amount: number, taxType: "excluded" | "included", rate: number | null) =>
  taxType === "included" ? amount : Math.round(amount * (1 + (rate ?? 0.08)));

const evKey = (venue: string, store: string | null) => `${venue}|${store || ""}`;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  venue: KarteVenue | null;
  segments: KarteSeg[];
  canEdit: boolean;
  /** 全百貨店マスターの会場キー（名寄せ候補から、既に他店に登録済みの会場を除くため） */
  allMasterKeys: Set<string>;
  onNotesSaved: (notes: string | null) => void;
};

export function VenueKarteDialog({ open, onOpenChange, venue, segments, canEdit, allMasterKeys, onNotesSaved }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<{ ev: EventRow; sales: number; visits: number }[]>([]);
  const [custTotal, setCustTotal] = useState(0);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // 名寄せ候補ピッカー
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<{ venue: string; store: string | null }[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");

  // 開いたら notes を初期化（レンダー中の prop 追従パターン）
  const [prevId, setPrevId] = useState<string | null>(null);
  if (venue && venue.id !== prevId) {
    setPrevId(venue.id);
    setNotes(venue.notes || "");
    setNotesSaved(false);
    setPickerOpen(false);
  }

  useEffect(() => {
    if (!open || !venue) return;
    (async () => {
      setLoading(true);
      // 別表記（名寄せ）を取得
      const { data: aliasData } = await supabase
        .from("venue_aliases")
        .select("id, alias_venue, alias_store")
        .eq("venue_id", venue.id);
      const aliasList = (aliasData as AliasRow[]) || [];
      setAliases(aliasList);

      // この店として集計する会場キーの集合（本来の名称＋別表記）
      const matchKeys = new Set<string>([
        evKey(venue.venue_name, venue.store_name),
        ...aliasList.map((a) => evKey(a.alias_venue, a.alias_store)),
      ]);
      const venueNames = Array.from(new Set([venue.venue_name, ...aliasList.map((a) => a.alias_venue)]));

      const { data: evData } = await supabase
        .from("events")
        .select("id, name, start_date, end_date, revenue, dm_count, venue, store_name")
        .in("venue", venueNames)
        .order("start_date", { ascending: false });
      const events = ((evData as EventRow[]) || []).filter((e) => matchKeys.has(evKey(e.venue, e.store_name)));
      const ids = events.map((e) => e.id);

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
      setRows(events.map((ev) => ({ ev, sales: dailyByEvent.get(ev.id) ?? (ev.revenue || 0), visits: visitByEvent.get(ev.id) ?? 0 })));

      if (segments.length > 0) {
        const { data: sum } = await supabase.from("segment_customer_summary").select("kbn_no, code, customer_count");
        const set = new Set(segments.map((s) => `${s.kbn_no}-${s.code}`));
        setCustTotal(
          ((sum as { kbn_no: number; code: number; customer_count: number }[]) || [])
            .filter((r) => set.has(`${r.kbn_no}-${r.code}`))
            .reduce((a, r) => a + r.customer_count, 0)
        );
      } else {
        setCustTotal(0);
      }
      setLoading(false);
    })();
  }, [open, venue, segments, supabase, refreshKey]);

  // 名寄せ候補（どの店にも紐づいていない会場名）を読み込む
  const loadCandidates = async () => {
    const [evRes, alRes] = await Promise.all([
      supabase.from("events").select("venue, store_name"),
      supabase.from("venue_aliases").select("alias_venue, alias_store"),
    ]);
    // どこかのマスター名 or どこかの店の別表記に既に一致するものは候補から除外
    const taken = new Set<string>(allMasterKeys);
    for (const a of (alRes.data as { alias_venue: string; alias_store: string | null }[]) || []) {
      taken.add(evKey(a.alias_venue, a.alias_store));
    }
    const seen = new Set<string>();
    const list: { venue: string; store: string | null }[] = [];
    for (const e of (evRes.data as { venue: string; store_name: string | null }[]) || []) {
      const k = evKey(e.venue, e.store_name);
      if (seen.has(k)) continue;
      seen.add(k);
      if (taken.has(k)) continue;
      list.push({ venue: e.venue, store: e.store_name });
    }
    list.sort((a, b) => `${a.venue}${a.store || ""}`.localeCompare(`${b.venue}${b.store || ""}`, "ja"));
    setCandidates(list);
  };

  const openPicker = async () => { setPickerQuery(""); await loadCandidates(); setPickerOpen(true); };

  const addAlias = async (v: string, s: string | null) => {
    if (!venue) return;
    await supabase.from("venue_aliases").insert({ venue_id: venue.id, alias_venue: v, alias_store: s });
    setPickerOpen(false);
    setRefreshKey((k) => k + 1);
  };

  const removeAlias = async (id: string) => {
    await supabase.from("venue_aliases").delete().eq("id", id);
    setRefreshKey((k) => k + 1);
  };

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
  const filteredCandidates = candidates.filter(
    (c) => pickerQuery.trim() === "" || `${c.venue}${c.store || ""}`.includes(pickerQuery.trim())
  );

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
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">この店の催事記録がありません。会場名の表記ゆれがある場合は下の「別表記の名寄せ」で追加してください。</TableCell></TableRow>
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

              {/* 別表記の名寄せ */}
              {canEdit && (
                <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                  <div className="text-sm font-medium">別表記の名寄せ（過去の会場名の表記ゆれをこの店にまとめる）</div>
                  <div className="flex flex-wrap gap-1 items-center">
                    {aliases.length === 0 && <span className="text-xs text-muted-foreground">別表記なし</span>}
                    {aliases.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded bg-white border">
                        {a.alias_venue}{a.alias_store ? ` ${a.alias_store}` : ""}
                        <button type="button" onClick={() => removeAlias(a.id)} className="text-muted-foreground hover:text-destructive" aria-label="削除">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" onClick={openPicker}>
                    <Plus className="h-3.5 w-3.5 mr-1" />別表記を追加
                  </Button>
                  {pickerOpen && (
                    <div className="rounded-md border bg-white p-2 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="会場名で検索" className="pl-7 h-8" />
                      </div>
                      <div className="text-[11px] text-muted-foreground">どの店にも紐づいていない過去の会場名から、この店のものを選んでください</div>
                      <div className="max-h-52 overflow-y-auto divide-y">
                        {filteredCandidates.length === 0 && <div className="text-xs text-muted-foreground py-3 text-center">候補がありません</div>}
                        {filteredCandidates.slice(0, 100).map((c, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => addAlias(c.venue, c.store)}
                            className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{c.venue}{c.store ? ` ${c.store}` : ""}</span>
                            <span className="text-[10px] text-primary shrink-0">この店に追加</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
