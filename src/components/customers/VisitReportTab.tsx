"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Sparkles, X, Trash2, CalendarDays, Copy, Printer, Mail, Check } from "lucide-react";

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
type Denom = "dm" | "roster";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const fmtDate = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
};
const label = (e: EventRow) => `${e.venue}${e.store_name ? ` ${e.store_name}` : ""}`;
const rate = (visits: number, denom: number) => (denom > 0 ? (visits / denom) * 100 : null);
const fmtRate = (r: number | null) => (r === null ? "—" : `${r.toFixed(1)}%`);
const DENOM_LABEL: Record<Denom, string> = { dm: "DM枚数", roster: "名簿人数" };

export function VisitReportTab() {
  const supabase = createClient();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [visitCounts, setVisitCounts] = useState<Map<string, number>>(new Map());
  const [rosterCounts, setRosterCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [mode, setMode] = useState<"month" | "year">("month");
  // DM枚数は events.dm_count（＝カレンダー等と同じ「発送したハガキ枚数」）で固定。
  // 名簿の実人数（event_dm_recipients）は来場照合用の全リストで発送枚数とは別物のため分母には使わない。
  const denom: Denom = "dm";
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const [reports, setReports] = useState<AiReport[]>([]);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiTitle, setAiTitle] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const denomOf = useCallback((e: EventRow) =>
    denom === "dm" ? (e.dm_count ?? 0) : (rosterCounts.get(e.id) ?? 0),
  [denom, rosterCounts]);

  const years = useMemo(() => {
    const ys = new Set<number>([now.getFullYear()]);
    for (const e of events) {
      const y = parseInt(e.start_date.slice(0, 4), 10);
      if (!isNaN(y)) ys.add(y);
    }
    return Array.from(ys).sort((a, b) => b - a);
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1か月（開始日基準）を集計
  const summarizeMonth = useCallback((y: number, m: number) => {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const evs = events.filter((e) => e.start_date.slice(0, 7) === ym);
    let visits = 0, den = 0;
    const rows = evs.map((e) => {
      const v = visitCounts.get(e.id) ?? 0;
      const d = denomOf(e);
      visits += v; den += d;
      return { e, visits: v, den };
    }).sort((a, b) => b.visits - a.visits);
    return { evs, visits, den, rows };
  }, [events, visitCounts, denomOf]);

  // 1年（開始日基準）を集計（月別・百貨店別）
  const summarizeYear = useCallback((y: number) => {
    const evs = events.filter((e) => e.start_date.slice(0, 4) === String(y));
    let visits = 0, den = 0;
    const byMonth = Array.from({ length: 12 }, () => ({ visits: 0, den: 0, count: 0 }));
    const byVenue = new Map<string, { visits: number; den: number; count: number }>();
    for (const e of evs) {
      const v = visitCounts.get(e.id) ?? 0;
      const d = denomOf(e);
      visits += v; den += d;
      const m = parseInt(e.start_date.slice(5, 7), 10) - 1;
      byMonth[m].visits += v; byMonth[m].den += d; byMonth[m].count += 1;
      const lb = label(e);
      const rec = byVenue.get(lb) || { visits: 0, den: 0, count: 0 };
      rec.visits += v; rec.den += d; rec.count += 1;
      byVenue.set(lb, rec);
    }
    return { evs, visits, den, byMonth, byVenue };
  }, [events, visitCounts, denomOf]);

  const curM = useMemo(() => summarizeMonth(year, month), [summarizeMonth, year, month]);
  const prevM = useMemo(() => summarizeMonth(year - 1, month), [summarizeMonth, year, month]);
  const curY = useMemo(() => summarizeYear(year), [summarizeYear, year]);
  const prevY = useMemo(() => summarizeYear(year - 1), [summarizeYear, year]);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const isFutureMonth = `${year}-${String(month).padStart(2, "0")}` > todayStr.slice(0, 7);

  // 現在の対象（月 or 年）の主要数値
  const cur = mode === "month"
    ? { visits: curM.visits, den: curM.den, count: curM.evs.length }
    : { visits: curY.visits, den: curY.den, count: curY.evs.length };
  const prev = mode === "month"
    ? { visits: prevM.visits, den: prevM.den }
    : { visits: prevY.visits, den: prevY.den };
  const visitDiff = prev.visits > 0 ? ((cur.visits - prev.visits) / prev.visits) * 100 : null;

  // 百貨店別（今年 vs 前年）— 年間モード
  const venueRows = useMemo(() => {
    const labels = new Set<string>([...curY.byVenue.keys(), ...prevY.byVenue.keys()]);
    return Array.from(labels).map((lb) => {
      const c = curY.byVenue.get(lb) || { visits: 0, den: 0, count: 0 };
      const p = prevY.byVenue.get(lb) || { visits: 0, den: 0, count: 0 };
      return { label: lb, cur: c, prev: p };
    }).sort((a, b) => b.cur.visits - a.cur.visits);
  }, [curY, prevY]);

  const generateInsight = async () => {
    setAiLoading(true); setAiError(null); setAiInsight(null);
    try {
      const denomName = DENOM_LABEL[denom];
      let payload: Record<string, unknown>;
      let title: string;
      if (mode === "month") {
        title = `来場AI解説 ${year}年${month}月`;
        payload = {
          本日: todayStr,
          対象: `${year}年${month}月`,
          分母種別: denomName,
          対象月の状態: isFutureMonth ? "未来（未開催）" : isCurrentMonth ? "当月（進行中・途中経過）" : "確定",
          当月: {
            来場者数: curM.visits, 分母: curM.den, ヒット率: rate(curM.visits, curM.den), 催事数: curM.evs.length,
            催事一覧: curM.rows.map((r) => ({
              催事: label(r.e), 催事名: r.e.name || null, 会期: `${r.e.start_date}〜${r.e.end_date}`,
              来場者数: r.visits, 分母: r.den, ヒット率: rate(r.visits, r.den),
            })),
          },
          前年同月: { 来場者数: prevM.visits, 分母: prevM.den, ヒット率: rate(prevM.visits, prevM.den), 催事数: prevM.evs.length },
        };
      } else {
        title = `来場AI年間まとめ ${year}年`;
        payload = {
          本日: todayStr,
          対象: `${year}年（年間まとめ）`,
          分母種別: denomName,
          年計: { 来場者数: curY.visits, 分母: curY.den, ヒット率: rate(curY.visits, curY.den), 催事数: curY.evs.length },
          前年計: { 来場者数: prevY.visits, 分母: prevY.den, ヒット率: rate(prevY.visits, prevY.den), 催事数: prevY.evs.length },
          月別: curY.byMonth.map((mm, i) => ({ 月: i + 1, 来場者数: mm.visits, 分母: mm.den, ヒット率: rate(mm.visits, mm.den), 催事数: mm.count })),
          百貨店別: venueRows.slice(0, 30).map((v) => ({
            会場: v.label, 今年来場: v.cur.visits, 今年ヒット率: rate(v.cur.visits, v.cur.den),
            前年来場: v.prev.visits, 前年ヒット率: rate(v.prev.visits, v.prev.den), 今年催事数: v.cur.count,
          })),
        };
      }
      const res = await fetch("/api/visit-insights", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setAiError(data.error || "AI解説の生成に失敗しました"); return; }
      setAiInsight(data.insight);
      setAiTitle(title);
      const { data: inserted } = await supabase
        .from("ai_reports").insert({ kind: "visit", title, content: data.insight })
        .select("id, title, content, created_at").single();
      if (inserted) setReports((p) => [inserted as AiReport, ...p]);
    } catch {
      setAiError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setAiLoading(false);
    }
  };

  const deleteReport = async (id: string) => {
    if (!window.confirm("この月次レポートを削除しますか？")) return;
    await supabase.from("ai_reports").delete().eq("id", id);
    setReports((p) => p.filter((r) => r.id !== id));
  };

  // ===== 社長へ渡す: コピー / 印刷(PDF) / メール下書き =====
  const copyReport = async (title: string, content: string) => {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${content}`);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* 失敗時は無視（手動選択で対応） */ }
  };
  const printReport = (title: string, content: string) => {
    // アプリの印刷CSS（社外秘透かし等）の影響を受けないよう、別ウィンドウで印刷する
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>body{font-family:'Yu Gothic','游ゴシック','Hiragino Kaku Gothic ProN',sans-serif;line-height:1.9;margin:24mm 18mm;color:#1a1a1a;}
      h1{font-size:15pt;border-bottom:2px solid #333;padding-bottom:6px;margin:0 0 16px;}
      .meta{font-size:9pt;color:#666;margin-bottom:16px;}
      pre{font-family:inherit;white-space:pre-wrap;font-size:11pt;margin:0;}
      @page{size:A4 portrait;margin:0;}</style></head>
      <body><h1>${esc(title)}</h1><div class="meta">安岡蒲鉾　催事来場レポート</div><pre>${esc(content)}</pre></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };
  const mailReport = (title: string, content: string) => {
    const body = `${title}\n\n${content}\n\n------------------------------\n安岡蒲鉾　催事来場レポート`;
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  };

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const curRate = rate(cur.visits, cur.den);
  const prevRate = rate(prev.visits, prev.den);
  const periodLabel = mode === "month" ? `${year}年${month}月` : `${year}年（年間）`;

  return (
    <div className="space-y-4">
      {/* 設定: 月次/年間・分母・年(・月) */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-md border overflow-hidden">
              {(["month", "year"] as const).map((mo) => (
                <button key={mo} type="button" onClick={() => setMode(mo)}
                  className={`h-8 px-3 text-xs font-bold transition-colors ${mode === mo ? "bg-emerald-600 text-white" : "bg-white text-muted-foreground hover:bg-muted"}`}>
                  {mo === "month" ? "月次" : "年間まとめ"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />{mode === "month" ? "対象月:" : "対象年:"}
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
          {mode === "month" && (
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <button key={m} type="button" onClick={() => setMonth(m)}
                  className={`h-8 w-10 rounded border text-sm font-medium transition-colors ${m === month ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-muted-foreground border-input hover:bg-emerald-50"}`}>
                  {m}月
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            「DM枚数」＝その催事で<span className="font-medium">発送したハガキの枚数</span>（カレンダーや催事編集と同じ値）。
            来場者数（DM持参）÷ DM枚数 が「ヒット率」です。
            ※来場照合用に取り込んだ名簿の実人数（顧客リスト全体）とは別の数字です。
          </p>
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
            <div className="text-[10px] text-muted-foreground">前年同{mode === "month" ? "月" : "年"}: {prev.visits.toLocaleString()}人</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3 space-y-0.5">
            <span className="text-xs text-muted-foreground">{DENOM_LABEL[denom]}（合計）</span>
            <div className="text-2xl font-black tabular-nums">{cur.den.toLocaleString()}<span className="text-sm font-normal text-muted-foreground ml-1">{denom === "dm" ? "枚" : "人"}</span></div>
            <div className="text-[10px] text-muted-foreground">催事 {cur.count}件</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-3 space-y-0.5">
            <span className="text-xs text-muted-foreground">DMヒット率</span>
            <div className="text-2xl font-black tabular-nums">{fmtRate(curRate)}</div>
            <div className="text-[10px] text-muted-foreground">前年同{mode === "month" ? "月" : "年"}: {fmtRate(prevRate)}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI解説ボタン */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={generateInsight} disabled={aiLoading || cur.count === 0}
          className="bg-violet-600 hover:bg-violet-700 text-white">
          <Sparkles className="h-4 w-4 mr-1" />
          {aiLoading ? "分析中..." : `${periodLabel}のAI解説を作成`}
        </Button>
        {cur.count === 0 && <span className="text-xs text-muted-foreground">この期間の催事がありません</span>}
        {mode === "month" && isCurrentMonth && cur.count > 0 && <span className="text-xs text-amber-700">※当月は途中経過です</span>}
      </div>

      {/* AI解説パネル */}
      {(aiInsight || aiError || aiLoading) && (
        <Card className="border-violet-300">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-sm font-semibold text-violet-700 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />AI解説（{periodLabel}）
              </p>
              <div className="flex items-center gap-1">
                {aiInsight && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => copyReport(aiTitle, aiInsight)} title="本文をコピー">
                      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => printReport(aiTitle, aiInsight)} title="印刷 / PDF保存">
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => mailReport(aiTitle, aiInsight)} title="メール下書き">
                      <Mail className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {!aiLoading && (
                  <button type="button" onClick={() => { setAiInsight(null); setAiError(null); }} className="text-muted-foreground hover:text-foreground ml-1" aria-label="閉じる">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            {aiLoading && <p className="text-sm text-muted-foreground animate-pulse">来場データを分析しています…（10〜30秒ほどかかります）</p>}
            {aiError && <p className="text-sm text-destructive">{aiError}</p>}
            {aiInsight && <div className="text-sm leading-relaxed whitespace-pre-wrap">{aiInsight}</div>}
            {aiInsight && <p className="text-[10px] text-muted-foreground mt-3">※ AIによる自動分析です。重要な判断の前には元データをご確認ください。保存済みです（下の一覧）。</p>}
          </CardContent>
        </Card>
      )}

      {/* 月次モード: 催事別の内訳 */}
      {mode === "month" && curM.rows.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 py-2 border-b font-semibold text-sm">{year}年{month}月の催事別 来場（DM持参者）</div>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>催事</TableHead>
                  <TableHead className="hidden sm:table-cell">会期</TableHead>
                  <TableHead className="text-right">来場</TableHead>
                  <TableHead className="text-right">{DENOM_LABEL[denom]}</TableHead>
                  <TableHead className="text-right">ヒット率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {curM.rows.map((r) => (
                  <TableRow key={r.e.id}>
                    <TableCell className="text-sm font-medium">
                      {label(r.e)}
                      {r.e.name && <span className="block text-[11px] text-muted-foreground font-normal truncate max-w-[200px]">{r.e.name}</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.e.start_date)}〜{fmtDate(r.e.end_date)}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{r.visits.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.den ? r.den.toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(rate(r.visits, r.den))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 年間モード: 月別の推移 */}
      {mode === "year" && curY.evs.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 py-2 border-b font-semibold text-sm">{year}年 月別の来場推移</div>
            <Table className="min-w-[480px]">
              <TableHeader>
                <TableRow>
                  <TableHead>月</TableHead>
                  <TableHead className="text-right">来場</TableHead>
                  <TableHead className="text-right">{DENOM_LABEL[denom]}</TableHead>
                  <TableHead className="text-right">ヒット率</TableHead>
                  <TableHead className="text-right">催事</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {curY.byMonth.map((mm, i) => (
                  <TableRow key={i} className={mm.count === 0 ? "opacity-50" : ""}>
                    <TableCell className="text-sm font-medium">{i + 1}月</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{mm.visits.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{mm.den ? mm.den.toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtRate(rate(mm.visits, mm.den))}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{mm.count || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 年間モード: 百貨店別の来場推移（今年 vs 前年） */}
      {mode === "year" && venueRows.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="px-4 py-2 border-b font-semibold text-sm">{year}年 百貨店別の来場（前年比）</div>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>百貨店</TableHead>
                  <TableHead className="text-right">今年来場</TableHead>
                  <TableHead className="text-right">前年来場</TableHead>
                  <TableHead className="text-right">前年比</TableHead>
                  <TableHead className="text-right">今年ヒット率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venueRows.map((v) => {
                  const diff = v.prev.visits > 0 ? ((v.cur.visits - v.prev.visits) / v.prev.visits) * 100 : null;
                  return (
                    <TableRow key={v.label}>
                      <TableCell className="text-sm font-medium">{v.label}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold">{v.cur.visits.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{v.prev.visits.toLocaleString()}</TableCell>
                      <TableCell className={`text-right tabular-nums text-xs font-bold ${diff === null ? "text-muted-foreground" : diff >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {diff === null ? "—" : `${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtRate(rate(v.cur.visits, v.cur.den))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 保存済み 月次レポート */}
      {reports.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="font-semibold text-sm">保存済みのAI解説（社長報告用）</div>
            <div className="space-y-2">
              {reports.map((r) => (
                <details key={r.id} className="rounded-md border bg-muted/20">
                  <summary className="px-3 py-2 cursor-pointer text-sm font-medium flex items-center justify-between gap-2">
                    <span>{r.title}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{r.created_at.slice(0, 10)}</span>
                      <button type="button" onClick={(e) => { e.preventDefault(); copyReport(r.title, r.content); }} className="text-muted-foreground hover:text-foreground" aria-label="コピー"><Copy className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={(e) => { e.preventDefault(); printReport(r.title, r.content); }} className="text-muted-foreground hover:text-foreground" aria-label="印刷"><Printer className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={(e) => { e.preventDefault(); mailReport(r.title, r.content); }} className="text-muted-foreground hover:text-foreground" aria-label="メール"><Mail className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={(e) => { e.preventDefault(); deleteReport(r.id); }} className="text-muted-foreground hover:text-destructive" aria-label="削除"><Trash2 className="h-3.5 w-3.5" /></button>
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
