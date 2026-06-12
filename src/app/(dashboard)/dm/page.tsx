"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { Upload } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { CustomerImportDialog } from "@/components/customers/CustomerImportDialog";
import { segKey, type SegmentMaster } from "@/components/customers/types";

type EventDM = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  dm_status: string | null;
  dm_count: number | null;
};

type SegmentRow = { kbn_no: number; code: number; segment_name: string; venue_id: string | null };
type VenueRow = { id: string; venue_name: string; store_name: string | null };

/** YYYY-MM-DD の今日の文字列 (タイムゾーンはローカル) */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DMListPage() {
  const { canEdit, role } = usePermission();
  // 名簿CSV取込は社員（viewer）も行う
  const canImport = role === "admin" || role === "viewer";
  const supabase = createClient();
  const [events, setEvents] = useState<EventDM[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "notDone">("all");
  const [includePast, setIncludePast] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [segmentsByVenueKey, setSegmentsByVenueKey] = useState<Map<string, SegmentRow[]>>(new Map());
  // 催事ID → 選択中のDM区分キー("kbn-code")の集合
  const [eventSegSel, setEventSegSel] = useState<Map<string, Set<string>>>(new Map());
  // 名簿CSV取込ダイアログ（対象の催事と、最初から選んでおく区分）
  const [importTarget, setImportTarget] = useState<{ id: string; label: string; segKey?: string } | null>(null);
  const [allSegments, setAllSegments] = useState<SegmentMaster[]>([]);

  const fetchData = useCallback(async () => {
    const [evRes, segRes, venRes, linkRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, name, venue, store_name, start_date, end_date, status, dm_status, dm_count")
        .order("start_date"),
      supabase.from("sanchoku_segments").select("kbn_no, code, segment_name, venue_id").order("kbn_no").order("code"),
      supabase.from("venue_master").select("id, venue_name, store_name"),
      supabase.from("event_dm_segments").select("event_id, kbn_no, code"),
    ]);
    setEvents(evRes.data || []);
    setAllSegments((segRes.data as SegmentMaster[]) || []);
    // 催事ごとの選択済みDM区分
    const selMap = new Map<string, Set<string>>();
    for (const l of (linkRes.data as { event_id: string; kbn_no: number; code: number }[]) || []) {
      if (!selMap.has(l.event_id)) selMap.set(l.event_id, new Set());
      selMap.get(l.event_id)!.add(`${l.kbn_no}-${l.code}`);
    }
    setEventSegSel(selMap);
    // 百貨店名+店舗名 → 区分リスト のマップを構築 (events.venue は文字列のため名前で結合)
    const venueById = new Map<string, VenueRow>((venRes.data || []).map((v: VenueRow) => [v.id, v]));
    const map = new Map<string, SegmentRow[]>();
    for (const s of (segRes.data || []) as SegmentRow[]) {
      const v = s.venue_id ? venueById.get(s.venue_id) : null;
      if (!v) continue;
      const key = `${v.venue_name}|${v.store_name || ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    setSegmentsByVenueKey(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleDmStatus = (evtId: string, current: string | null) => {
    const next = current === "印刷済み" ? "未着手" : "印刷済み";
    setEvents((prev) => prev.map((e) => e.id === evtId ? { ...e, dm_status: next } : e));
    supabase.from("events").update({ dm_status: next }).eq("id", evtId).then(() => {
      setSavedId(evtId);
      setTimeout(() => setSavedId((prev) => prev === evtId ? null : prev), 1500);
    });
  };

  /** この催事のDMをどの区分（名簿）に出したかをトグルで記録 */
  const toggleEventSegment = async (evtId: string, s: SegmentRow) => {
    const key = `${s.kbn_no}-${s.code}`;
    const wasSelected = eventSegSel.get(evtId)?.has(key) ?? false;
    // 楽観更新
    setEventSegSel((prev) => {
      const m = new Map(prev);
      const set = new Set(m.get(evtId) || []);
      if (wasSelected) set.delete(key); else set.add(key);
      m.set(evtId, set);
      return m;
    });
    if (wasSelected) {
      await supabase.from("event_dm_segments").delete().match({ event_id: evtId, kbn_no: s.kbn_no, code: s.code });
    } else {
      await supabase.from("event_dm_segments").insert({ event_id: evtId, kbn_no: s.kbn_no, code: s.code });
    }
    setSavedId(evtId);
    setTimeout(() => setSavedId((prev) => prev === evtId ? null : prev), 1500);
  };

  /** 名簿CSV取込ダイアログを開く（催事に紐付け済みの区分があれば最初から選んでおく） */
  const openRosterImport = (e: EventDM) => {
    const label = `${e.venue}${e.store_name ? ` ${e.store_name}` : ""}`;
    const selKeys = Array.from(eventSegSel.get(e.id) || []);
    let key: string | undefined;
    if (selKeys.length === 1) {
      key = selKeys[0];
    } else {
      const vsegs = segmentsByVenueKey.get(`${e.venue}|${e.store_name || ""}`) || [];
      if (vsegs.length === 1) key = segKey(vsegs[0].kbn_no, vsegs[0].code);
    }
    setImportTarget({ id: e.id, label, segKey: key });
  };

  const updateField = (evtId: string, field: string, value: string | number | null) => {
    setEvents((prev) => prev.map((e) => e.id === evtId ? { ...e, [field]: value } : e));
    supabase.from("events").update({ [field]: value }).eq("id", evtId).then(() => {
      setSavedId(evtId);
      setTimeout(() => setSavedId((prev) => prev === evtId ? null : prev), 1500);
    });
  };

  const today = todayStr();
  // 会期終了済 (end_date < today) はデフォルトで除外。includePast=true で含める。
  const isUpcoming = (e: EventDM) => e.end_date >= today;

  const filtered = filter === "notDone"
    ? events.filter(
        (e) =>
          e.dm_status !== "印刷済み" &&
          e.dm_status !== null &&
          e.status !== "終了" &&
          (includePast || isUpcoming(e))
      )
    : events.filter((e) => e.dm_status !== null && (includePast || isUpcoming(e)));

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const allDmEvents = events.filter(
    (e) => e.dm_status !== null && (includePast || isUpcoming(e))
  );
  const notDoneCount = events.filter(
    (e) =>
      e.dm_status !== "印刷済み" &&
      e.dm_status !== null &&
      e.status !== "終了" &&
      (includePast || isUpcoming(e))
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">DMハガキ一覧</h1>
        <Link href="/dm/segments" className={buttonVariants({ variant: "outline", size: "sm" })}>
          DM区分マスター
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        ※ 会期終了済の催事はデフォルトで非表示。確認したいときは「過去も見る」を ON にしてください。<br />
        ※ 「区分」列のバッジをクリックすると、この催事のDMをどの名簿（区分）に出したかを記録できます（緑＝選択中）。顧客・来場管理の抽出で使われます。
      </p>

      <div className="flex gap-2 flex-wrap items-center print:hidden">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>すべて ({allDmEvents.length})</Button>
        <Button variant={filter === "notDone" ? "default" : "outline"} size="sm" onClick={() => setFilter("notDone")}>未完了のみ ({notDoneCount})</Button>
        <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includePast}
            onChange={(e) => setIncludePast(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          過去も見る（会期終了済）
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>催事</TableHead>
                <TableHead className="hidden lg:table-cell">区分</TableHead>
                <TableHead>催事名</TableHead>
                <TableHead className="hidden md:table-cell">会期</TableHead>
                <TableHead>印刷済み</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>枚数</TableHead>
                <TableHead>名簿CSV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const isDone = e.dm_status === "印刷済み";
                const isPast = e.end_date < today;
                return (
                  <TableRow key={e.id} className={isPast ? "opacity-60" : ""}>
                    <TableCell>
                      <Link href={`/events/${e.id}`} className="text-primary hover:underline text-sm font-medium">
                        {e.venue}{e.store_name ? ` ${e.store_name}` : ""}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {(segmentsByVenueKey.get(`${e.venue}|${e.store_name || ""}`) || []).map((s) => {
                          const key = `${s.kbn_no}-${s.code}`;
                          const isSel = eventSegSel.get(e.id)?.has(key) ?? false;
                          const cls = isSel
                            ? "bg-green-700 border-green-700 text-white font-bold"
                            : "bg-amber-50 border-amber-200 text-amber-800";
                          return canEdit ? (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleEventSegment(e.id, s)}
                              title={`${s.segment_name}${isSel ? "（この催事のDM名簿として選択中）" : "（クリックでこの催事のDM名簿に設定）"}`}
                              className={`inline-block px-1.5 py-0.5 text-[10px] font-mono rounded border whitespace-nowrap transition-colors hover:opacity-80 ${cls}`}
                            >
                              区{s.kbn_no}-{s.code}
                            </button>
                          ) : (
                            <span key={key} title={s.segment_name} className={`inline-block px-1.5 py-0.5 text-[10px] font-mono rounded border whitespace-nowrap ${cls}`}>
                              区{s.kbn_no}-{s.code}
                            </span>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.name || "—"}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      {e.start_date} 〜 {e.end_date}
                      {isPast && (
                        <span className="ml-1 text-[10px] text-muted-foreground">（終了）</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <button
                          type="button"
                          className={`relative inline-flex h-6 w-24 items-center rounded-full transition-colors ${isDone ? "bg-green-700" : "bg-gray-300"}`}
                          onClick={() => toggleDmStatus(e.id, e.dm_status)}
                        >
                          <span className={`absolute text-[10px] font-medium ${isDone ? "left-2 text-white" : "right-2 text-gray-600"}`}>
                            {isDone ? "印刷済み" : "未完了"}
                          </span>
                          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${isDone ? "translate-x-[72px]" : "translate-x-0.5"}`} />
                        </button>
                      ) : (
                        <span className={`text-xs font-medium ${isDone ? "text-green-700" : "text-gray-500"}`}>
                          {isDone ? "印刷済み" : "未完了"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <div className="flex gap-1">
                          {["未着手", "校正中", "印刷済み"].map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`px-2 py-1 text-xs rounded border transition-colors ${e.dm_status === s ? "bg-green-700 text-white border-green-700 font-bold" : "bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700"}`}
                              onClick={() => updateField(e.id, "dm_status", e.dm_status === s ? null : s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm">{e.dm_status || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={e.dm_count ?? ""}
                            onChange={(ev) => updateField(e.id, "dm_count", ev.target.value ? parseInt(ev.target.value) : null)}
                            placeholder="枚数"
                            className="h-8 text-sm w-20 bg-white"
                            min="0"
                          />
                          {savedId === e.id && (
                            <span className="text-[10px] text-green-600 font-medium whitespace-nowrap animate-in fade-in">✓ 保存済み</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm">{e.dm_count ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canImport && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRosterImport(e)}
                          title="この催事のDM名簿CSVを取り込む"
                          className="whitespace-nowrap"
                        >
                          <Upload className="h-3.5 w-3.5 mr-1" />
                          名簿
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {filter === "all"
                    ? includePast
                      ? "DMハガキが登録された催事がありません"
                      : "今日以降に会期が残っている催事がありません。過去も含めて見たい場合は「過去も見る」を ON にしてください。"
                    : "該当する催事がありません"}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 催事ごとのDM名簿CSV取込 */}
      <CustomerImportDialog
        open={importTarget !== null}
        onOpenChange={(o) => { if (!o) setImportTarget(null); }}
        onImported={fetchData}
        segments={allSegments}
        event={importTarget ? { id: importTarget.id, label: importTarget.label } : null}
        defaultSegKey={importTarget?.segKey}
      />
    </div>
  );
}
