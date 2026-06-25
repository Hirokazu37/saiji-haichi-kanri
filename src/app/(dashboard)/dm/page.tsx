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
import { Upload, Search, CheckCircle2, AlertTriangle } from "lucide-react";
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
  // ステータス絞り込み: すべて / 未完了 / ステータス単体
  const [filter, setFilter] = useState<"all" | "notDone" | "未着手" | "校正中" | "印刷済み">("all");
  const [includePast, setIncludePast] = useState(false);
  const [query, setQuery] = useState("");
  // 並び順: 会期が近い順（昇順）/ 新しい順（降順）
  const [sortDesc, setSortDesc] = useState(false);
  // 催事ID → 取り込んだ名簿の人数（取込状況の可視化）
  const [rosterCounts, setRosterCounts] = useState<Map<string, number>>(new Map());
  const [savedId, setSavedId] = useState<string | null>(null);
  const [segmentsByVenueKey, setSegmentsByVenueKey] = useState<Map<string, SegmentRow[]>>(new Map());
  // 催事ID → 選択中のDM区分キー("kbn-code")の集合
  const [eventSegSel, setEventSegSel] = useState<Map<string, Set<string>>>(new Map());
  // 名簿CSV取込ダイアログ（対象の催事と、最初から選んでおく区分）
  const [importTarget, setImportTarget] = useState<{ id: string; label: string; segKey?: string } | null>(null);
  const [allSegments, setAllSegments] = useState<SegmentMaster[]>([]);

  const fetchData = useCallback(async () => {
    const [evRes, segRes, venRes, linkRes, rosterRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, name, venue, store_name, start_date, end_date, status, dm_status, dm_count")
        .order("start_date"),
      supabase.from("sanchoku_segments").select("kbn_no, code, segment_name, venue_id").order("kbn_no").order("code"),
      supabase.from("venue_master").select("id, venue_name, store_name"),
      supabase.from("event_dm_segments").select("event_id, kbn_no, code"),
      supabase.from("event_roster_counts").select("event_id, roster_count"),
    ]);
    setEvents(evRes.data || []);
    setAllSegments((segRes.data as SegmentMaster[]) || []);
    // 催事ごとの名簿人数（取込状況の表示用）
    const rc = new Map<string, number>();
    for (const r of (rosterRes.data as { event_id: string; roster_count: number }[]) || []) {
      rc.set(r.event_id, r.roster_count);
    }
    setRosterCounts(rc);
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

  /** DM投函期限（会期開始の7日前）まであと何日か */
  const MAIL_LEAD_DAYS = 7;
  const daysToDeadline = (e: EventDM): number => {
    const deadline = new Date(e.start_date + "T00:00:00");
    deadline.setDate(deadline.getDate() - MAIL_LEAD_DAYS);
    const now = new Date(today + "T00:00:00");
    return Math.round((deadline.getTime() - now.getTime()) / 86400000);
  };

  /** 開始日まであと何日か（開催中判定用） */
  const daysToStart = (e: EventDM): number => {
    const start = new Date(e.start_date + "T00:00:00");
    const now = new Date(today + "T00:00:00");
    return Math.round((start.getTime() - now.getTime()) / 86400000);
  };

  // DM対象（dm_status が設定されている）かつ過去フィルタを満たす催事が母集団
  const baseEvents = events.filter((e) => e.dm_status !== null && (includePast || isUpcoming(e)));

  const q = query.trim().toLowerCase();
  const matchesQuery = (e: EventDM) =>
    q === "" ||
    `${e.venue} ${e.store_name || ""} ${e.name || ""}`.toLowerCase().includes(q);

  const matchesStatus = (e: EventDM) => {
    if (filter === "all") return true;
    if (filter === "notDone") return e.dm_status !== "印刷済み" && e.status !== "終了";
    return e.dm_status === filter;
  };

  const filtered = baseEvents
    .filter((e) => matchesStatus(e) && matchesQuery(e))
    .sort((a, b) =>
      sortDesc ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)
    );

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  // 各チップの件数
  const countOf = (f: typeof filter) =>
    baseEvents.filter((e) => {
      if (f === "all") return true;
      if (f === "notDone") return e.dm_status !== "印刷済み" && e.status !== "終了";
      return e.dm_status === f;
    }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">DMハガキ一覧</h1>
        <div className="flex items-center gap-2">
          <Link href="/dm/message" className={buttonVariants({ variant: "outline", size: "sm" })}>
            文面の作成・印刷
          </Link>
          <Link href="/dm/postcards" className={buttonVariants({ variant: "outline", size: "sm" })}>
            QR付きはがき印刷（宛名）
          </Link>
          <Link href="/dm/segments" className={buttonVariants({ variant: "outline", size: "sm" })}>
            DM区分マスター
          </Link>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        ※ 会期終了済の催事はデフォルトで非表示。確認したいときは「過去も見る」を ON にしてください。<br />
        ※ 「区分」列のバッジをクリックすると、この催事のDMをどの名簿（区分）に出したかを記録できます（緑＝選択中）。顧客・来場管理の抽出で使われます。
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
        {/* 検索窓 */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="百貨店名・催事名で検索（例: 阪急 / 横浜）"
            className="pl-8 h-9"
          />
        </div>
        {/* ステータス絞り込みチップ */}
        <div className="flex gap-1.5 flex-wrap items-center">
          {([
            ["all", "すべて"],
            ["notDone", "未完了のみ"],
            ["未着手", "未着手"],
            ["校正中", "校正中"],
            ["印刷済み", "印刷済み"],
          ] as const).map(([key, label]) => (
            <Button
              key={key}
              variant={filter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(key)}
            >
              {label} ({countOf(key)})
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setSortDesc((v) => !v)} title="会期の並び順を切り替え">
            会期: {sortDesc ? "新しい順" : "近い順"}
          </Button>
          <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includePast}
              onChange={(e) => setIncludePast(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            過去も見る（会期終了済）
          </label>
        </div>
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
                <TableHead>ステータス</TableHead>
                <TableHead>枚数</TableHead>
                <TableHead>名簿CSV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const isDone = e.dm_status === "印刷済み";
                const isPast = e.end_date < today;
                // 投函期限が迫っている（未完了・未開催）行を強調
                const dd = daysToDeadline(e);
                const urgent = !isPast && !isDone && daysToStart(e) >= 0 && dd <= 7;
                const rowCls = isPast
                  ? "opacity-60"
                  : urgent
                  ? (dd <= 3 ? "bg-red-50 hover:bg-red-100" : "bg-amber-50 hover:bg-amber-100")
                  : "";
                return (
                  <TableRow key={e.id} className={rowCls}>
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
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="max-w-[140px] truncate" title={e.name || undefined}>{e.name || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      {e.start_date} 〜 {e.end_date}
                      {isPast ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">（終了）</span>
                      ) : daysToStart(e) < 0 ? (
                        <span className="ml-1 text-[10px] font-medium text-green-700">開催中</span>
                      ) : isDone ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">投函済み</span>
                      ) : (() => {
                        // DM投函期限（会期7日前）までの残り日数で警告
                        const d = daysToDeadline(e);
                        const cls = d < 0
                          ? "bg-red-200 text-red-800 font-bold"      // 期限超過
                          : d <= 3
                          ? "bg-red-100 text-red-700 font-bold"      // 直前
                          : d <= 7
                          ? "bg-amber-100 text-amber-700 font-medium" // 間近
                          : "text-muted-foreground";
                        const text = d < 0
                          ? `投函期限 ${-d}日超過 ⚠`
                          : d === 0
                          ? "投函期限 今日 ⚠"
                          : `投函期限まで${d}日`;
                        return (
                          <span className={`ml-1 inline-block text-[10px] rounded px-1 ${cls}`}>
                            {text}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {canEdit ? (
                          <div className="flex gap-1">
                            {["未着手", "校正中", "印刷済み"].map((s) => (
                              <button
                                key={s}
                                type="button"
                                className={`px-1.5 py-1 text-xs rounded border transition-colors ${e.dm_status === s ? "bg-green-700 text-white border-green-700 font-bold" : "bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700"}`}
                                onClick={() => updateField(e.id, "dm_status", e.dm_status === s ? null : s)}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm">{e.dm_status || "—"}</span>
                        )}
                        {urgent && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full border bg-red-600 text-white border-red-600 whitespace-nowrap">
                            <AlertTriangle className="h-3 w-3" />要対応
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={e.dm_count ?? ""}
                            onChange={(ev) => updateField(e.id, "dm_count", ev.target.value ? parseInt(ev.target.value) : null)}
                            placeholder="未入力"
                            className={`h-8 text-sm w-20 ${
                              e.dm_count == null && !isPast
                                ? "bg-amber-50 border-amber-300 placeholder:text-amber-500"
                                : "bg-white"
                            }`}
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
                      {canImport ? (
                        <div className="flex items-center gap-1.5">
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
                          {rosterCounts.has(e.id) ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-green-700 font-medium whitespace-nowrap" title="名簿CSV取込済み">
                              <CheckCircle2 className="h-3 w-3" />
                              {rosterCounts.get(e.id)!.toLocaleString()}人
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openRosterImport(e)}
                              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 whitespace-nowrap hover:bg-amber-100"
                              title="クリックで名簿CSVを取り込む"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              未取込（取り込む）
                            </button>
                          )}
                        </div>
                      ) : (
                        rosterCounts.has(e.id) && (
                          <span className="text-[10px] text-green-700">{rosterCounts.get(e.id)!.toLocaleString()}人</span>
                        )
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
