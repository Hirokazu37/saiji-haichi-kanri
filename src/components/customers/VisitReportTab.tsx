"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sparkles, X, Trash2, CalendarDays } from "lucide-react";

type EventRow = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  dm_count: number | null;
};

type AiReport = { id: string; title: string; content: string; created_at: string };

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const fmtDate = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
};
const label = (e: EventRow) => `${e.venue}${e.store_name ? ` ${e.store_name}` : ""}`;
const rate = (visits: number, dm: number) => (dm > 0 ? (visits / dm) * 100 : null);
const fmtRate = (r: number | null) => (r === null ? "—" : `${r.toFixed(1)}%`);

export function VisitReportTab() {
  const supabase = createClient();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [visitCounts, setVisitCounts] = useState<Map<string, number>>(new Map());
  const [rosterCounts, setRosterCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const [reports, setReports] = useState<AiReport[]>([]);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [evRes, vRes, rRes, repRes] = await Promise.all([
      supabase.from("events").select("id, name, venue, store_name, start_date, end_date, dm_count").order("start_date"),
      supabase.from("event_visit_counts").select("event_id, visit_count"),
      supabase.from("event_roster_counts").select("event_id, roster_count"),
      supabase.from("ai_reports").select("id, title, content, created_at").eq("kind", "visit").order("created_at", { ascending: false }),
    ]);
    setEvents((evRes.data as EventRow[]) || []);
    setVisitCounts(new Map(((vRes.data as { event_id: string; visit_count: number }[]) || []).map((r) => [r.event_id, r.visit_count])));
    setRosterCounts(new Map(((rRes.data as { event_id: string; roster_count: number }[]) || []).map((r) => [r.event_id, r.roster_count])));
    setReports((repRes.data as AiReport[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // データのある年（来場登録のある催事の年＋今年）
  const years = useMemo(() => {
    const ys = new Set<number>([now.getFullYear()]);
    for (const e of events) {
      const y = parseInt(e.start_date.slice(0, 4), 10);
      if (!isNaN(y)) ys.add(y);
    }
    return Array.from(ys).sort((a, b) => b - a);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // 指定年月（開始日基準）の催事
  const eventsOfMonth = useCallback((y: number, m: number) => {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    return events.filter((e) => e.start_date.slice(0, 7) === ym);
  }, [events]);

  const summarize = useCallback((y: number, m: number) => {
    const evs = eventsOfMonth(y, m);
    let visits = 0, dm = 0;
    const rows = evs.map((e) => {
      const v = visitCounts.get(e.id) ?? 0;
      const dmc = e.dm_count ?? 0;
      visits += v;
      dm += dmc;
      return { e, visits: v, dm: dmc, roster: rosterCounts.get(e.id) ?? 0 };
    }).sort((a, b) => b.visits - a.visits);
    return { evs, visits, dm, rows };
  }, [eventsOfMonth, visitCounts, rosterCounts]);

  const cur = useMemo(() => summarize(year, month), [summarize, year, month]);
  const prev = useMemo(() => summarize(year - 1, month), [summarize, year, month]);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const isFutureMonth = `${year}-${String(month).padStart(2, "0")}` > todayStr.slice(0, 7);

  const generateInsight = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiInsight(null);
    try {
      const payload = {
        本日: todayStr,
        対象年月: `${year}年${month}月`,
        対象月の状態: isFutureMonth ? "未来（未開催）" : isCurrentMonth ? "当月（進行中・途中経過）" : "確定",
        当月: {
          来場者数: cur.visits,
          DM枚数: cur.dm,
          ヒット率: rate(cur.visits, cur.dm),
          催事数: cur.evs.length,
          催事一覧: cur.rows.map((r) => ({
            催事: label(r.e),
            催事名: r.e.name || null,
            会期: `${r.e.start_date}〜${r.e.end_date}`,
            来場者数: r.visits,
            DM枚数: r.dm,
            ヒット率: rate(r.visits, r.dm),
          })),
        },
        前年同月: {
          来場者数: prev.visits,
          DM枚数: prev.dm,
          ヒット率: rate(prev.visits, prev.dm),
          催事数: prev.evs.length,
        },
        補足: "来場者数はDMハガキを持参・提示したお客様の数（総来場者数ではない）。月集計は催事の開始日の月に計上。",
      };
      const res = await fetch("/api/visit-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setAiError(data.error || "AI解説の生成に失敗しました"); return; }
      setAiInsight(data.insight);
      // 月次報告として保存（社長報告の蓄積用）
      const title = `来場AI解説 ${year}年${month}月`;
      const { data: inserted } = await supabase
        .from("ai_reports")
        .insert({ kind: "visit", title, content: data.insight })
        .select("id, title, content, created_at")
        .single();
      if (inserted) setReports((prev) => [inserted as AiReport, ...prev]);
    } catch {
      setAiError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setAiLoading(false);
    }
  };

  const deleteReport = async (id: string) => {
    if (!window.confirm("この月次レポートを削除しますか？")) return;
    await supabase.from("ai_reports").delete().eq("id", id);
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const curRate = rate(cur.visits, cur.dm);
  const prevRate = rate(prev.visits, prev.dm);
  const visitDiff = prev.visits > 0 ? ((cur.visits - prev.visits) / prev.visits) * 100 : null;

  return (
    <div className="space-y-4">
      {/* 年・月セレクタ */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />対象月:
            </span>
            <div className="flex gap-1 flex-wrap">
              {years.map((y) => (
                <button key={y} type="button" onClick={() => setYear(y)}
                  className={`h-8 px-3 rounded-full border text-xs font-bold transition-colors ${y === year ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-foreground border-input hover:bg-emerald-50"}`}>
                  {y}年
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button key={m} type="button" onClick={() => setMonth(m)}
                className={`h-8 w-10 rounded border text-sm font-medium transition-colors ${m === month ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-muted-foreground border-input hover:bg-emerald-50"}`}>
                {m}月
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* サマリ KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-3 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">来場者数（DM持参）</span>
              {visitDiff !== null && (
                <span className={`text-xs font-bold ${visitDiff >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {visitDiff >= 0 ? "+" : ""}{visitDiff.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="text-2xl font-black tabular-nums">{cur.visits.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">人</span></div>
            <div className="text-[10px] text-muted-foreground">前年同月: {prev.visits.toLocaleString()}人</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3 space-y-0.5">
            <span className="text-xs text-muted-foreground">DM枚数</span>
            <div className="text-2xl font-black tabular-nums">{cur.dm.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">枚</span></div>
            <div className="text-[10px] text-muted-foreground">催事 {cur.evs.length}件</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3 space-y-0.5">
            <span className="text-xs text-muted-foreground">DMヒット率</span>
            <div className="text-2xl font-black tabular-nums">{fmtRate(curRate)}</div>
            <div className="text-[10px] text-muted-foreground">前年同月: {fmtRate(prevRate)}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI解説ボタン */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={generateInsight} disabled={aiLoading || cur.evs.length === 0}
          className="bg-violet-600 hover:bg-violet-700 text-white">
          <Sparkles className="h-4 w-4 mr-1" />
          {aiLoading ? "分析中..." : `${year}年${month}月のAI解説を作成`}
        </Button>
        {cur.evs.length === 0 && <span className="text-xs text-muted-foreground">この月の催事がありません</span>}
        {isCurrentMonth && cur.evs.length > 0 && <span className="text-xs text-amber-700">※当月は途中経過です</span>}
      </div>

      {/* AI解説パネル */}
      {(aiInsight || aiError || aiLoading) && (
        <Card className="border-violet-300">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-violet-700 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />AI解説（{year}年{month}月）
              </p>
              {!aiLoading && (
                <button type="button" onClick={() => { setAiInsight(null); setAiError(null); }} className="text-muted-foreground hover:text-foreground" aria-label="閉じる">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {aiLoading && <p className="text-sm text-muted-foreground animate-pulse">来場データを分析しています…（10〜30秒ほどかかります）</p>}
            {aiError && <p className="text-sm text-destructive">{aiError}</p>}
            {aiInsight && <div className="text-sm leading-relaxed whitespace-pre-wrap">{aiInsight}</div>}
            {aiInsight && <p className="text-[10px] text-muted-foreground mt-3">※ AIによる自動分析です。重要な判断の前には元データをご確認ください。保存済みです（下の一覧）。</p>}
          </CardContent>
        </Card>
      )}

      {/* 催事別 内訳 */}
      {cur.rows.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 py-2 border-b font-semibold text-sm">{year}年{month}月の催事別 来場（DM持参者）</div>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>催事</TableHead>
                  <TableHead className="hidden sm:table-cell">会期</TableHead>
                  <TableHead className="text-right">来場</TableHead>
                  <TableHead className="text-right">DM枚数</TableHead>
                  <TableHead className="text-right">ヒット率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cur.rows.map((r) => (
                  <TableRow key={r.e.id}>
                    <TableCell className="text-sm font-medium">
                      {label(r.e)}
                      {r.e.name && <span className="block text-[11px] text-muted-foreground font-normal truncate max-w-[200px]">{r.e.name}</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.e.start_date)}〜{fmtDate(r.e.end_date)}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{r.visits.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.dm ? r.dm.toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(rate(r.visits, r.dm))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 保存済み 月次レポート */}
      {reports.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="font-semibold text-sm">保存済みの月次AI解説（社長報告用）</div>
            <div className="space-y-2">
              {reports.map((r) => (
                <details key={r.id} className="rounded-md border bg-muted/20">
                  <summary className="px-3 py-2 cursor-pointer text-sm font-medium flex items-center justify-between gap-2">
                    <span>{r.title}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{r.created_at.slice(0, 10)}</span>
                      <button type="button" onClick={(e) => { e.preventDefault(); deleteReport(r.id); }} className="text-muted-foreground hover:text-destructive" aria-label="削除">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </summary>
                  <div className="px-3 pb-3 text-sm leading-relaxed whitespace-pre-wrap">{r.content}</div>
                </details>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
