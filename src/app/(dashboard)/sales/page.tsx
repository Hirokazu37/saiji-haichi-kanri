"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendingUp, Calendar as CalendarIcon, BarChart3, Store, LineChart, Download, Upload, FileText, Copy, Check, Wallet, Hash, Coins, CalendarDays } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

type EventLite = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  revenue: number | null;
};

type DailyRow = {
  event_id: string;
  date: string;
  amount: number;
  tax_type: "excluded" | "included";
  tax_rate: number | null;
};

// 1税抜換算ヘルパー
const toExcluded = (amount: number, taxType: "excluded" | "included", rate: number | null) => {
  if (taxType === "excluded") return amount;
  return Math.round(amount / (1 + (rate ?? 0.08)));
};
const toIncluded = (amount: number, taxType: "excluded" | "included", rate: number | null) => {
  if (taxType === "included") return amount;
  return Math.round(amount * (1 + (rate ?? 0.08)));
};

const TRACK_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export default function SalesPage() {
  const { canViewPayments, loading: permLoading } = usePermission();
  const supabase = createClient();
  const [events, setEvents] = useState<EventLite[]>([]);
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [evtRes, dailyRes] = await Promise.all([
      supabase.from("events").select("id, name, venue, store_name, start_date, end_date, revenue").order("start_date", { ascending: true }),
      supabase.from("event_daily_revenue").select("event_id, date, amount, tax_type, tax_rate"),
    ]);
    setEvents((evtRes.data || []) as EventLite[]);
    setDailyRows((dailyRes.data || []) as DailyRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 催事ID → 売上(税込・税抜) の Map
  // 1. event_daily_revenue があればそれを優先
  // 2. 無ければ events.revenue (税込合計) をフォールバック (税抜は 8% 概算で割戻し)
  const salesByEvent = useMemo(() => {
    const map = new Map<string, { excluded: number; included: number; hasData: boolean; source: "daily" | "revenue" }>();
    // STEP 1: 日別売上から集計
    for (const d of dailyRows) {
      const cur = map.get(d.event_id) ?? { excluded: 0, included: 0, hasData: false, source: "daily" as const };
      cur.excluded += toExcluded(d.amount, d.tax_type, d.tax_rate);
      cur.included += toIncluded(d.amount, d.tax_type, d.tax_rate);
      cur.hasData = true;
      cur.source = "daily";
      map.set(d.event_id, cur);
    }
    // STEP 2: events.revenue のみある催事 (日別なし) をフォールバックで取り込む
    for (const e of events) {
      if (map.has(e.id)) continue; // 日別あり→そっち優先
      if (e.revenue == null || e.revenue === 0) continue;
      // events.revenue は税込合計 (events/[id]/page.tsx で 税込で保存)
      const included = e.revenue;
      const excluded = Math.round(included / 1.08); // 軽減税率 8% で概算
      map.set(e.id, { excluded, included, hasData: true, source: "revenue" });
    }
    return map;
  }, [dailyRows, events]);

  // 検索フィルタ
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      const hay = [e.name, e.venue, e.store_name].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [events, search]);

  // ===== カレンダー: 選択した年の1月〜12月を表示 =====
  // ユーザーが年を切り替えて過去の実績(2024,2025,2026,...)を見られる
  const dataYears = useMemo(() => {
    const ys = new Set<number>();
    for (const e of events) {
      const y = parseInt(e.start_date.slice(0, 4), 10);
      if (!isNaN(y)) ys.add(y);
    }
    const today = new Date();
    ys.add(today.getFullYear()); // 今年は必ず含める
    return Array.from(ys).sort();
  }, [events]);
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  type CalEntry = { event: EventLite; sales: { excluded: number; included: number; hasData: boolean; source?: "daily" | "revenue" } };
  const calendarMonths = useMemo(() => {
    type MonthData = {
      ym: string;
      year: number;
      month: number;
      label: string;
      isCurrent: boolean;
      daysInMonth: number;
      trackMap: Map<string, number>;
      trackCount: number;
      entries: CalEntry[];
    };
    const today = new Date();
    const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const months: MonthData[] = [];
    // 選択された年の1月〜12月
    for (let m = 1; m <= 12; m++) {
      const d = new Date(calendarYear, m - 1, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const ym = `${year}-${String(month).padStart(2, "0")}`;
      const label = `${year}年${month}月`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthStartStr = `${ym}-01`;
      const monthEndStr = `${ym}-${String(daysInMonth).padStart(2, "0")}`;
      const entries: CalEntry[] = events
        .filter((e) => e.start_date <= monthEndStr && e.end_date >= monthStartStr)
        .map((e) => ({ event: e, sales: salesByEvent.get(e.id) ?? { excluded: 0, included: 0, hasData: false } }))
        .sort((a, b) => a.event.start_date.localeCompare(b.event.start_date));
      // トラック割当
      const trackMap = new Map<string, number>();
      const trackEnds: string[] = [];
      for (const en of entries) {
        let placed = false;
        for (let t = 0; t < trackEnds.length; t++) {
          if (en.event.start_date > trackEnds[t]) {
            trackEnds[t] = en.event.end_date;
            trackMap.set(en.event.id, t);
            placed = true;
            break;
          }
        }
        if (!placed) {
          trackMap.set(en.event.id, trackEnds.length);
          trackEnds.push(en.event.end_date);
        }
      }
      months.push({ ym, year, month, label, isCurrent: ym === currentYm, daysInMonth, trackMap, trackCount: Math.max(trackEnds.length, 1), entries });
    }
    return months;
  }, [events, salesByEvent, calendarYear]);

  // ===== 月次サマリ (選択年 vs 前年) =====
  // calendarYear と calendarYear - 1 の月別合計 (税込) を計算
  const monthlySummary = useMemo(() => {
    const thisYear = calendarYear;
    const lastYear = thisYear - 1;
    // 各年の月別売上 (税込)
    const yearMonthTotals: Record<number, number[]> = { [thisYear]: Array(12).fill(0), [lastYear]: Array(12).fill(0) };
    for (const e of events) {
      const sales = salesByEvent.get(e.id);
      if (!sales || !sales.hasData) continue;
      const [y, m] = e.start_date.split("-").map(Number);
      if (yearMonthTotals[y] !== undefined) {
        yearMonthTotals[y][m - 1] += sales.included;
      }
    }
    return { thisYear, lastYear, totals: yearMonthTotals };
  }, [events, salesByEvent, calendarYear]);

  // ===== 会場別 (選択年 vs 前年) =====
  const venueSummary = useMemo(() => {
    type VenueRow = {
      label: string;
      thisYearTotal: number;
      lastYearTotal: number;
      thisYearEvents: number;
      lastYearEvents: number;
    };
    const thisYear = calendarYear;
    const lastYear = thisYear - 1;
    const byVenue = new Map<string, VenueRow>();
    for (const e of events) {
      const sales = salesByEvent.get(e.id);
      if (!sales || !sales.hasData) continue;
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      const [year] = e.start_date.split("-").map(Number);
      const row = byVenue.get(label) ?? { label, thisYearTotal: 0, lastYearTotal: 0, thisYearEvents: 0, lastYearEvents: 0 };
      if (year === thisYear) {
        row.thisYearTotal += sales.included;
        row.thisYearEvents += 1;
      } else if (year === lastYear) {
        row.lastYearTotal += sales.included;
        row.lastYearEvents += 1;
      }
      byVenue.set(label, row);
    }
    return Array.from(byVenue.values())
      .filter((r) => r.thisYearTotal > 0 || r.lastYearTotal > 0)
      .sort((a, b) => b.thisYearTotal - a.thisYearTotal);
  }, [events, salesByEvent, calendarYear]);

  // ===== KPI サマリ (選択年 vs 前年 / 今月 vs 前年同月) =====
  const kpi = useMemo(() => {
    const thisYear = calendarYear;
    const lastYear = thisYear - 1;
    const today = new Date();
    const todayMonth = today.getMonth() + 1; // 1-12
    let thisSales = 0, lastSales = 0;
    let thisCount = 0, lastCount = 0;
    let thisMonthSales = 0, lastMonthSales = 0;
    let thisMonthCount = 0, lastMonthCount = 0;
    for (const e of events) {
      const sales = salesByEvent.get(e.id);
      const [y, m] = e.start_date.split("-").map(Number);
      if (y === thisYear) {
        thisCount += 1;
        if (sales?.hasData) thisSales += sales.included;
        if (m === todayMonth) {
          thisMonthCount += 1;
          if (sales?.hasData) thisMonthSales += sales.included;
        }
      } else if (y === lastYear) {
        lastCount += 1;
        if (sales?.hasData) lastSales += sales.included;
        if (m === todayMonth) {
          lastMonthCount += 1;
          if (sales?.hasData) lastMonthSales += sales.included;
        }
      }
    }
    const salesRatio = lastSales > 0 ? ((thisSales - lastSales) / lastSales) * 100 : null;
    const countRatio = lastCount > 0 ? ((thisCount - lastCount) / lastCount) * 100 : null;
    const thisAvg = thisCount > 0 ? Math.round(thisSales / thisCount) : 0;
    const lastAvg = lastCount > 0 ? Math.round(lastSales / lastCount) : 0;
    const avgRatio = lastAvg > 0 ? ((thisAvg - lastAvg) / lastAvg) * 100 : null;

    // 前年同月比
    const monthSalesRatio = lastMonthSales > 0 ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100 : null;
    const monthCountRatio = lastMonthCount > 0 ? ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100 : null;
    const thisMonthAvg = thisMonthCount > 0 ? Math.round(thisMonthSales / thisMonthCount) : 0;
    const lastMonthAvg = lastMonthCount > 0 ? Math.round(lastMonthSales / lastMonthCount) : 0;
    const monthAvgRatio = lastMonthAvg > 0 ? ((thisMonthAvg - lastMonthAvg) / lastMonthAvg) * 100 : null;

    return {
      thisYear, lastYear, todayMonth,
      thisSales, lastSales, salesRatio,
      thisCount, lastCount, countRatio,
      thisAvg, lastAvg, avgRatio,
      thisMonthSales, lastMonthSales, monthSalesRatio,
      thisMonthCount, lastMonthCount, monthCountRatio,
      thisMonthAvg, lastMonthAvg, monthAvgRatio,
    };
  }, [events, salesByEvent, calendarYear]);
  // 表コピー フィードバック
  const [copied, setCopied] = useState(false);
  const copyTable = async () => {
    const rows: string[] = [];
    rows.push(["催事", "会場", "開始日", "終了日", "売上(税込)", "売上(税抜)"].join("\t"));
    for (const e of filteredEvents) {
      const sales = salesByEvent.get(e.id);
      rows.push([
        e.name || "",
        e.store_name ? `${e.venue} ${e.store_name}` : e.venue,
        e.start_date,
        e.end_date,
        sales?.included ? String(sales.included) : "",
        sales?.excluded ? String(sales.excluded) : "",
      ].join("\t"));
    }
    try {
      await navigator.clipboard.writeText(rows.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("クリップボードへのコピーに失敗しました");
    }
  };

  // ===== CSV インポート =====
  // ヘッダ: 会場名, 店舗名, 開始日(YYYY-MM-DD), 売上(税込)
  // events を venue+store_name+start_date でマッチして events.revenue を更新
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matched: number; updated: number; skipped: string[] } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const downloadCsvTemplate = () => {
    const headers = ["会場名", "店舗名", "開始日", "売上(税込)"];
    const samples = [
      ["京王", "新宿店", "2025-01-06", "6437882"],
      ["近鉄", "阿倍野店", "2025-01-14", "3923009"],
    ];
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [headers, ...samples].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `売上インポート_テンプレート.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      // BOM 除去
      const clean = text.replace(/^﻿/, "");
      const lines = clean.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        alert("CSV にデータがありません (ヘッダ行 + 1行以上必要)");
        return;
      }
      // 簡易CSVパース (ダブルクォート対応)
      const parseLine = (line: string): string[] => {
        const cells: string[] = [];
        let cur = "";
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (inQ) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') { inQ = false; }
            else cur += c;
          } else {
            if (c === ",") { cells.push(cur); cur = ""; }
            else if (c === '"') { inQ = true; }
            else cur += c;
          }
        }
        cells.push(cur);
        return cells.map((s) => s.trim());
      };
      const header = parseLine(lines[0]);
      const idxVenue = header.findIndex((h) => h.includes("会場"));
      const idxStore = header.findIndex((h) => h.includes("店舗"));
      const idxStart = header.findIndex((h) => h.includes("開始") || h.includes("日付"));
      const idxRev = header.findIndex((h) => h.includes("売上"));
      if (idxVenue < 0 || idxStart < 0 || idxRev < 0) {
        alert("CSVヘッダに「会場名」「開始日」「売上」が必要です");
        return;
      }

      let matched = 0;
      let updated = 0;
      const skipped: string[] = [];
      for (let li = 1; li < lines.length; li++) {
        const cells = parseLine(lines[li]);
        const venueName = (cells[idxVenue] || "").trim();
        const storeName = idxStore >= 0 ? (cells[idxStore] || "").trim() : "";
        const startDate = (cells[idxStart] || "").trim();
        const revStr = (cells[idxRev] || "").replace(/[,¥]/g, "").trim();
        if (!venueName || !startDate || !revStr) {
          skipped.push(`行${li + 1}: 必須項目が空 (${venueName}/${startDate}/${revStr})`);
          continue;
        }
        const revenue = parseInt(revStr, 10);
        if (isNaN(revenue) || revenue <= 0) {
          skipped.push(`行${li + 1}: 売上が数値でない (${revStr})`);
          continue;
        }
        // マッチング: venue + store_name + start_date
        const target = events.find((e) =>
          e.venue === venueName &&
          (e.store_name ?? "") === storeName &&
          e.start_date === startDate
        );
        if (!target) {
          skipped.push(`行${li + 1}: ${venueName} ${storeName} ${startDate} に一致する催事なし`);
          continue;
        }
        matched++;
        const { error } = await supabase.from("events").update({ revenue }).eq("id", target.id);
        if (error) {
          skipped.push(`行${li + 1}: 更新失敗 (${error.message})`);
        } else {
          updated++;
        }
      }
      setImportResult({ matched, updated, skipped });
      await fetchData();
    } catch (e) {
      alert(`インポート中にエラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  // ===== CSV エクスポート =====
  const exportCsv = () => {
    const headers = ["催事名", "会場", "開始日", "終了日", "売上(税込)", "売上(税抜)"];
    const rows = filteredEvents.map((e) => {
      const sales = salesByEvent.get(e.id);
      return [
        e.name || "",
        e.store_name ? `${e.venue} ${e.store_name}` : e.venue,
        e.start_date,
        e.end_date,
        sales?.included ? String(sales.included) : "",
        sales?.excluded ? String(sales.excluded) : "",
      ];
    });
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `売上分析_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const todayYear = new Date().getFullYear();

  const fmtRatio = (r: number | null) => {
    if (r === null) return "—";
    const sign = r >= 0 ? "+" : "";
    return `${sign}${r.toFixed(1)}%`;
  };
  const ratioColor = (r: number | null) => {
    if (r === null) return "text-muted-foreground";
    if (r >= 0) return "text-emerald-700";
    return "text-rose-700";
  };

  if (permLoading) return <p className="text-muted-foreground">読み込み中...</p>;
  if (!canViewPayments) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6" />売上分析
        </h1>
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            このページの閲覧には経理閲覧権限が必要です。管理者に問い合わせてください。
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />売上分析
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            催事ごとの売上を可視化し、前年同期との比較ができます。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="outline" size="sm" onClick={downloadCsvTemplate} title="売上一括取込用のテンプレートCSVを取得">
            <FileText className="h-4 w-4 mr-1" />テンプレ
          </Button>
          <Button variant="outline" size="sm" onClick={() => importFileRef.current?.click()} disabled={importing} title="CSVから売上を一括取込 (events.revenue を更新)">
            <Upload className="h-4 w-4 mr-1" />{importing ? "取込中..." : "CSV取込"}
          </Button>
          <input
            ref={importFileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
            }}
          />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" />CSV出力
          </Button>
        </div>
      </div>

      {/* 年セレクタ (横並びチップ) */}
      {!loading && dataYears.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <span className="text-xs font-bold text-muted-foreground inline-flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />対象年:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {dataYears.map((y) => {
              const isSel = y === calendarYear;
              const isCurrent = y === todayYear;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => setCalendarYear(y)}
                  className={`inline-flex items-center gap-1 h-8 px-3 rounded-full border text-xs font-bold transition-all ${
                    isSel
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                      : "bg-white text-foreground border-input hover:bg-emerald-50 hover:border-emerald-300"
                  }`}
                  aria-pressed={isSel}
                >
                  {y}年
                  {isCurrent && (
                    <span className={`text-[10px] font-semibold px-1 rounded ${isSel ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"}`}>今年</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI カード (2行構成: 年合計 + 今月) */}
      {!loading && (
        <div className="space-y-3 print:hidden">
          {/* 1行目: 選択年 vs 前年 (年合計) */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-emerald-700">
              <CalendarIcon className="h-3.5 w-3.5" />
              {kpi.thisYear}年 vs {kpi.lastYear}年（年合計）
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 売上合計 */}
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-emerald-600" />売上合計（税込）
                    </span>
                    <span className={`text-xs font-bold ${ratioColor(kpi.salesRatio)}`}>{fmtRatio(kpi.salesRatio)}</span>
                  </div>
                  <div className="text-xl font-black tabular-nums">¥{kpi.thisSales.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    前年: ¥{kpi.lastSales.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              {/* 催事件数 */}
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Hash className="h-3.5 w-3.5 text-blue-600" />催事件数
                    </span>
                    <span className={`text-xs font-bold ${ratioColor(kpi.countRatio)}`}>{fmtRatio(kpi.countRatio)}</span>
                  </div>
                  <div className="text-xl font-black tabular-nums">{kpi.thisCount}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    前年: {kpi.lastCount}件
                  </div>
                </CardContent>
              </Card>
              {/* 平均売上/催事 */}
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5 text-purple-600" />平均売上/催事
                    </span>
                    <span className={`text-xs font-bold ${ratioColor(kpi.avgRatio)}`}>{fmtRatio(kpi.avgRatio)}</span>
                  </div>
                  <div className="text-xl font-black tabular-nums">¥{kpi.thisAvg.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    前年: ¥{kpi.lastAvg.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 2行目: 今月 vs 前年同月 */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-amber-700">
              <CalendarDays className="h-3.5 w-3.5" />
              {kpi.thisYear}年{kpi.todayMonth}月 vs {kpi.lastYear}年{kpi.todayMonth}月（前年同月比）
              {kpi.thisYear === todayYear && <span className="text-[10px] font-semibold px-1 rounded bg-amber-100 text-amber-700">今月</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 月売上 */}
              <Card className="border-l-4 border-l-amber-500 bg-amber-50/20">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Wallet className="h-3.5 w-3.5 text-amber-600" />{kpi.todayMonth}月 売上（税込）
                    </span>
                    <span className={`text-xs font-bold ${ratioColor(kpi.monthSalesRatio)}`}>{fmtRatio(kpi.monthSalesRatio)}</span>
                  </div>
                  <div className="text-xl font-black tabular-nums">¥{kpi.thisMonthSales.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    前年同月: ¥{kpi.lastMonthSales.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              {/* 月催事件数 */}
              <Card className="border-l-4 border-l-amber-500 bg-amber-50/20">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Hash className="h-3.5 w-3.5 text-amber-600" />{kpi.todayMonth}月 催事件数
                    </span>
                    <span className={`text-xs font-bold ${ratioColor(kpi.monthCountRatio)}`}>{fmtRatio(kpi.monthCountRatio)}</span>
                  </div>
                  <div className="text-xl font-black tabular-nums">{kpi.thisMonthCount}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    前年同月: {kpi.lastMonthCount}件
                  </div>
                </CardContent>
              </Card>
              {/* 月平均売上 */}
              <Card className="border-l-4 border-l-amber-500 bg-amber-50/20">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Coins className="h-3.5 w-3.5 text-amber-600" />{kpi.todayMonth}月 平均/催事
                    </span>
                    <span className={`text-xs font-bold ${ratioColor(kpi.monthAvgRatio)}`}>{fmtRatio(kpi.monthAvgRatio)}</span>
                  </div>
                  <div className="text-xl font-black tabular-nums">¥{kpi.thisMonthAvg.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    前年同月: ¥{kpi.lastMonthAvg.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
      {/* CSV インポート結果 */}
      {importResult && (
        <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
          <CardContent className="p-3 space-y-1 text-xs">
            <div className="font-bold">CSV取込結果</div>
            <div>催事マッチ: {importResult.matched}件 / 更新成功: {importResult.updated}件 / スキップ: {importResult.skipped.length}件</div>
            {importResult.skipped.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">スキップ詳細 ({importResult.skipped.length}件)</summary>
                <ul className="mt-1 pl-4 list-disc text-muted-foreground space-y-0.5">
                  {importResult.skipped.slice(0, 30).map((s, i) => (<li key={i}>{s}</li>))}
                  {importResult.skipped.length > 30 && <li>...他 {importResult.skipped.length - 30}件</li>}
                </ul>
              </details>
            )}
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setImportResult(null)}>閉じる</Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-muted-foreground">読み込み中...</p>
      ) : (
        <Tabs defaultValue="calendar" className="w-full">
          <TabsList className="w-full justify-start print:hidden">
            <TabsTrigger value="calendar"><CalendarIcon className="h-3.5 w-3.5" />カレンダー</TabsTrigger>
            <TabsTrigger value="monthly"><BarChart3 className="h-3.5 w-3.5" />月次サマリ</TabsTrigger>
            <TabsTrigger value="venue"><Store className="h-3.5 w-3.5" />会場別</TabsTrigger>
            <TabsTrigger value="chart"><LineChart className="h-3.5 w-3.5" />推移グラフ</TabsTrigger>
          </TabsList>

          {/* タブ: カレンダー */}
          <TabsContent value="calendar" keepMounted className="space-y-4 print:!block print:!opacity-100">
            <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-emerald-700" />
                <h2 className="text-sm font-bold">{calendarYear}年 催事カレンダー（売上付き）</h2>
              </div>
              <span className="inline-flex items-center gap-2 text-[10px] flex-wrap">
                <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-emerald-100 border-2 border-emerald-500 rounded-sm"></span>売上入力済</span>
                <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-yellow-100 border-2 border-yellow-500 rounded-sm"></span>売上未入力(終了済)</span>
                <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-gray-100 border-2 border-gray-400 rounded-sm"></span>未開催</span>
              </span>
            </div>
            {calendarMonths.map((m) => {
              const todayStr = new Date().toISOString().slice(0, 10);
              return (
                <Card key={m.ym} className="overflow-hidden print:break-inside-avoid">
                  <CardContent className="p-0 overflow-x-auto print:overflow-visible">
                    <div className="min-w-[600px]">
                      {/* 月タイトル + 日付ヘッダ */}
                      <div className="flex border-b bg-white">
                        <div className="w-14 shrink-0 border-r flex flex-col items-center justify-center py-1.5 bg-emerald-50">
                          <span className="text-emerald-700 text-base font-black leading-none">
                            {m.month}<span className="text-xs">月</span>
                          </span>
                          {m.isCurrent && <span className="text-[10px] text-amber-700 font-semibold mt-0.5">今月</span>}
                        </div>
                        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${m.daysInMonth}, minmax(0, 1fr))` }}>
                          {Array.from({ length: m.daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const date = new Date(m.year, m.month - 1, day);
                            const dateStr = `${m.ym}-${String(day).padStart(2, "0")}`;
                            const isSun = date.getDay() === 0;
                            const isSat = date.getDay() === 6;
                            const isToday = dateStr === todayStr;
                            const wday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
                            return (
                              <div key={day} className={`text-center border-r ${isToday ? "bg-primary/10" : isSun ? "bg-red-50/50" : isSat ? "bg-blue-50/50" : ""}`}>
                                <div className="text-[14px] font-bold leading-tight pt-1">{day}</div>
                                <div className={`text-[11px] leading-tight pb-1 ${isSun ? "text-red-500 font-bold" : isSat ? "text-blue-500" : "text-muted-foreground"}`}>{wday}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* トラック行 */}
                      {m.entries.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-muted-foreground italic">この月に催事はありません</div>
                      ) : (
                        Array.from({ length: m.trackCount }, (_, trackIdx) => {
                          const trackEntries = m.entries.filter((en) => m.trackMap.get(en.event.id) === trackIdx);
                          return (
                            <div key={trackIdx} className={`flex border-b last:border-b-0 ${trackIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`} style={{ minHeight: 64 }}>
                              <div className="w-14 shrink-0 border-r flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                {TRACK_LABELS[trackIdx] || String(trackIdx + 1)}
                              </div>
                              <div className="flex-1 relative">
                                {/* 背景グリッド */}
                                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${m.daysInMonth}, minmax(0, 1fr))` }}>
                                  {Array.from({ length: m.daysInMonth }, (_, i) => {
                                    const day = i + 1;
                                    const date = new Date(m.year, m.month - 1, day);
                                    const dateStr = `${m.ym}-${String(day).padStart(2, "0")}`;
                                    const isSun = date.getDay() === 0;
                                    const isSat = date.getDay() === 6;
                                    const isToday = dateStr === todayStr;
                                    return <div key={i} className={`border-r ${isToday ? "bg-primary/5" : isSun ? "bg-red-50/30" : isSat ? "bg-blue-50/30" : ""}`} />;
                                  })}
                                </div>
                                {trackEntries.map((en) => {
                                  const [esy, esm, esd] = en.event.start_date.split("-").map(Number);
                                  const [eey, eem, eed] = en.event.end_date.split("-").map(Number);
                                  const startDay = esy === m.year && esm === m.month ? esd : 1;
                                  const endDay = eey === m.year && eem === m.month ? eed : m.daysInMonth;
                                  const left = ((startDay - 1) / m.daysInMonth) * 100;
                                  const width = ((endDay - startDay + 1) / m.daysInMonth) * 100;
                                  const isPast = en.event.end_date < todayStr;
                                  const hasSales = en.sales.hasData;
                                  const barColor = hasSales
                                    ? "bg-emerald-100 border-emerald-500 text-emerald-900"
                                    : isPast
                                      ? "bg-yellow-100 border-yellow-500 text-yellow-900"
                                      : "bg-gray-100 border-gray-400 text-gray-700";
                                  const venueLabel = en.event.store_name ? `${en.event.venue} ${en.event.store_name}` : en.event.venue;
                                  const salesLabel = hasSales ? `¥${en.sales.included.toLocaleString()}` : "売上未入力";
                                  return (
                                    <Link
                                      key={en.event.id}
                                      href={`/events/${en.event.id}`}
                                      className={`absolute top-0.5 rounded border-2 text-[11px] leading-snug px-1 py-0.5 overflow-hidden hover:opacity-80 transition-opacity z-[1] cursor-pointer print:no-underline ${barColor}`}
                                      style={{ left: `${left}%`, width: `${width}%`, height: 60 }}
                                      title={`${venueLabel} (${en.event.start_date}〜${en.event.end_date}) ${salesLabel}`}
                                    >
                                      <div className="truncate font-semibold leading-tight text-[11px]">{venueLabel}</div>
                                      <div className="truncate text-[10px] leading-tight">
                                        期間: {en.event.start_date.slice(5)}〜{en.event.end_date.slice(5)}
                                      </div>
                                      <div className="truncate text-[10px] leading-tight font-semibold">
                                        売上(税込): {salesLabel}
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* タブ: 月次サマリ (前年比較) */}
          <TabsContent value="monthly" keepMounted className="space-y-4 print:!block">
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-700" />
                  <h2 className="text-sm font-bold">月次売上サマリ（前年比較・税込）</h2>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>月</TableHead>
                      <TableHead className="text-right">{monthlySummary.thisYear}年</TableHead>
                      <TableHead className="text-right">{monthlySummary.lastYear}年</TableHead>
                      <TableHead className="text-right">前年差</TableHead>
                      <TableHead className="text-right">前年比</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = i + 1;
                      const thisVal = monthlySummary.totals[monthlySummary.thisYear][i];
                      const lastVal = monthlySummary.totals[monthlySummary.lastYear][i];
                      const diff = thisVal - lastVal;
                      const ratio = lastVal > 0 ? ((diff / lastVal) * 100) : null;
                      const isCurrent = m === new Date().getMonth() + 1;
                      return (
                        <TableRow key={m} className={isCurrent ? "bg-amber-50" : ""}>
                          <TableCell className="font-medium">{m}月{isCurrent && <span className="ml-1 text-[10px] text-amber-700">(今月)</span>}</TableCell>
                          <TableCell className="text-right tabular-nums">{thisVal > 0 ? `¥${thisVal.toLocaleString()}` : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{lastVal > 0 ? `¥${lastVal.toLocaleString()}` : "—"}</TableCell>
                          <TableCell className={`text-right tabular-nums ${diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-muted-foreground"}`}>
                            {thisVal > 0 || lastVal > 0 ? `${diff >= 0 ? "+" : ""}¥${Math.abs(diff).toLocaleString().replace(/^/, diff < 0 ? "-" : "")}` : "—"}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${ratio !== null && ratio > 0 ? "text-emerald-700" : ratio !== null && ratio < 0 ? "text-rose-700" : ""}`}>
                            {ratio !== null ? `${ratio >= 0 ? "+" : ""}${ratio.toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* 合計行 */}
                    <TableRow className="border-t-2 font-bold bg-muted/30">
                      <TableCell>合計</TableCell>
                      <TableCell className="text-right tabular-nums">¥{monthlySummary.totals[monthlySummary.thisYear].reduce((a, b) => a + b, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">¥{monthlySummary.totals[monthlySummary.lastYear].reduce((a, b) => a + b, 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right" colSpan={2}>—</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* タブ: 会場別 (前年比較) */}
          <TabsContent value="venue" keepMounted className="space-y-4 print:!block">
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-blue-700" />
                  <h2 className="text-sm font-bold">会場別 売上実績（前年比較・税込）</h2>
                  <span className="text-[11px] text-muted-foreground ml-auto">今年の売上額が大きい順</span>
                </div>
                {venueSummary.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4">データがありません</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>会場</TableHead>
                        <TableHead className="text-right">{monthlySummary.thisYear}年実績</TableHead>
                        <TableHead className="text-right">{monthlySummary.lastYear}年実績</TableHead>
                        <TableHead className="text-right">前年差</TableHead>
                        <TableHead className="text-right">前年比</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {venueSummary.map((v) => {
                        const diff = v.thisYearTotal - v.lastYearTotal;
                        const ratio = v.lastYearTotal > 0 ? ((diff / v.lastYearTotal) * 100) : null;
                        return (
                          <TableRow key={v.label}>
                            <TableCell className="font-medium">{v.label}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {v.thisYearTotal > 0 ? `¥${v.thisYearTotal.toLocaleString()}` : "—"}
                              {v.thisYearEvents > 0 && <span className="text-[10px] text-muted-foreground ml-1">({v.thisYearEvents}件)</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {v.lastYearTotal > 0 ? `¥${v.lastYearTotal.toLocaleString()}` : "—"}
                              {v.lastYearEvents > 0 && <span className="text-[10px] ml-1">({v.lastYearEvents}件)</span>}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums ${diff > 0 ? "text-emerald-700" : diff < 0 ? "text-rose-700" : "text-muted-foreground"}`}>
                              {v.thisYearTotal > 0 && v.lastYearTotal > 0 ? `${diff >= 0 ? "+" : ""}¥${diff.toLocaleString()}` : "—"}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums ${ratio !== null && ratio > 0 ? "text-emerald-700" : ratio !== null && ratio < 0 ? "text-rose-700" : ""}`}>
                              {ratio !== null ? `${ratio >= 0 ? "+" : ""}${ratio.toFixed(1)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* タブ: 推移グラフ (棒グラフ + 前年比折れ線 のコンボ) */}
          <TabsContent value="chart" keepMounted className="space-y-4 print:!block">
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-purple-700" />
                  <h2 className="text-sm font-bold">月次売上 推移グラフ（{monthlySummary.thisYear}年実績 + 前年比）</h2>
                </div>
                <div className="flex items-center gap-4 text-xs flex-wrap">
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 bg-emerald-500 rounded-sm"></span>{monthlySummary.thisYear}年 売上（税込）</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 bg-gray-300 rounded-sm"></span>{monthlySummary.lastYear}年 売上（税込）</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-orange-500"></span>前年比 (%)</span>
                </div>
                {(() => {
                  const thisData = monthlySummary.totals[monthlySummary.thisYear];
                  const lastData = monthlySummary.totals[monthlySummary.lastYear];
                  const allValues = [...thisData, ...lastData].filter((v) => v > 0);
                  const maxSales = allValues.length > 0 ? Math.max(...allValues) : 1;
                  // 前年比 (%) — 前年実績がない月は null
                  const ratios: (number | null)[] = thisData.map((v, i) => {
                    const l = lastData[i];
                    if (l <= 0) return null;
                    return ((v - l) / l) * 100;
                  });
                  const ratioValues = ratios.filter((r): r is number => r !== null);
                  // 前年比の上限: ±200% に丸める (見やすさ優先)
                  const rawMaxRatio = ratioValues.length > 0 ? Math.max(...ratioValues.map(Math.abs)) : 100;
                  const maxRatio = Math.min(Math.max(Math.ceil(rawMaxRatio / 50) * 50, 50), 300);

                  // SVG dims
                  const W = 760, H = 320;
                  const padL = 64, padR = 64, padT = 24, padB = 44;
                  const innerW = W - padL - padR;
                  const innerH = H - padT - padB;
                  // 棒は2本/月 (今年, 前年) → 12月 × 2本
                  const bandW = innerW / 12;
                  const barGap = 2;
                  const barW = (bandW - barGap * 3) / 2;

                  const xBandCenter = (i: number) => padL + bandW * i + bandW / 2;
                  const yAtSales = (v: number) => padT + innerH - (v / maxSales) * innerH;
                  const yAtRatio = (r: number) => padT + innerH / 2 - (r / maxRatio) * (innerH / 2);

                  // Y軸ラベル (5本) — 左側=売上
                  const yTicks: number[] = [];
                  for (let i = 0; i <= 4; i++) yTicks.push((maxSales / 4) * i);
                  // 右側=前年比 (5本)
                  const rTicks: number[] = [-maxRatio, -maxRatio / 2, 0, maxRatio / 2, maxRatio];

                  const formatY = (v: number) => {
                    if (v >= 100000000) return `${(v / 100000000).toFixed(1)}億`;
                    if (v >= 10000) return `${(v / 10000).toFixed(0)}万`;
                    return v.toFixed(0);
                  };

                  // 折れ線パス — 前年実績が存在する月のみ
                  const linePoints: { x: number; y: number; idx: number; r: number }[] = [];
                  ratios.forEach((r, i) => {
                    if (r !== null) linePoints.push({ x: xBandCenter(i), y: yAtRatio(r), idx: i, r });
                  });
                  const linePath = linePoints.length > 0
                    ? "M " + linePoints.map((p) => `${p.x},${p.y}`).join(" L ")
                    : "";

                  return (
                    <div className="overflow-x-auto">
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full" style={{ minWidth: 640 }}>
                        {/* 横グリッド (売上軸ベース) */}
                        {yTicks.map((v, idx) => (
                          <line key={idx} x1={padL} y1={yAtSales(v)} x2={W - padR} y2={yAtSales(v)} stroke="#e5e7eb" strokeWidth={1} strokeDasharray={idx === 0 ? "0" : "2,2"} />
                        ))}
                        {/* 0%ライン (折れ線軸) */}
                        <line x1={padL} y1={yAtRatio(0)} x2={W - padR} y2={yAtRatio(0)} stroke="#fdba74" strokeWidth={1} strokeDasharray="4,3" opacity={0.6} />

                        {/* Y軸ラベル: 左=売上 */}
                        {yTicks.map((v, idx) => (
                          <text key={idx} x={padL - 6} y={yAtSales(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#059669">{formatY(v)}</text>
                        ))}
                        {/* Y軸ラベル: 右=前年比% */}
                        {rTicks.map((r, idx) => (
                          <text key={idx} x={W - padR + 6} y={yAtRatio(r)} textAnchor="start" dominantBaseline="middle" fontSize={10} fill="#ea580c">{r > 0 ? "+" : ""}{r}%</text>
                        ))}

                        {/* X軸ラベル */}
                        {Array.from({ length: 12 }, (_, i) => (
                          <text key={i} x={xBandCenter(i)} y={H - padB + 16} textAnchor="middle" fontSize={11} fill="#374151" fontWeight={600}>{i + 1}月</text>
                        ))}

                        {/* 棒グラフ */}
                        {Array.from({ length: 12 }, (_, i) => {
                          const tv = thisData[i];
                          const lv = lastData[i];
                          const bx = padL + bandW * i + barGap;
                          return (
                            <g key={i}>
                              {/* 前年 (グレー) */}
                              {lv > 0 && (
                                <rect
                                  x={bx}
                                  y={yAtSales(lv)}
                                  width={barW}
                                  height={padT + innerH - yAtSales(lv)}
                                  fill="#d1d5db"
                                  rx={2}
                                />
                              )}
                              {/* 今年 (緑) */}
                              {tv > 0 && (
                                <rect
                                  x={bx + barW + barGap}
                                  y={yAtSales(tv)}
                                  width={barW}
                                  height={padT + innerH - yAtSales(tv)}
                                  fill="#10b981"
                                  rx={2}
                                />
                              )}
                            </g>
                          );
                        })}

                        {/* 前年比 折れ線 */}
                        {linePath && (
                          <path d={linePath} fill="none" stroke="#f97316" strokeWidth={2.5} />
                        )}
                        {linePoints.map((p) => (
                          <g key={`pt-${p.idx}`}>
                            <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#f97316" strokeWidth={2} />
                            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} fill="#ea580c" fontWeight={700}>
                              {p.r >= 0 ? "+" : ""}{p.r.toFixed(0)}%
                            </text>
                          </g>
                        ))}

                        {/* 軸タイトル */}
                        <text x={padL - 50} y={padT + innerH / 2} textAnchor="middle" fontSize={10} fill="#059669" transform={`rotate(-90 ${padL - 50} ${padT + innerH / 2})`}>売上 (¥)</text>
                        <text x={W - padR + 50} y={padT + innerH / 2} textAnchor="middle" fontSize={10} fill="#ea580c" transform={`rotate(90 ${W - padR + 50} ${padT + innerH / 2})`}>前年比 (%)</text>
                      </svg>
                    </div>
                  );
                })()}
                <p className="text-[10px] text-muted-foreground">
                  ※ 棒グラフ=月別売上(税込) 緑:{monthlySummary.thisYear}年 / グレー:{monthlySummary.lastYear}年 ／ オレンジ折れ線=前年比 (前年実績がある月のみ)
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* 一覧（タブ外に独立して配置）*/}
      <Card className="print:hidden">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-bold">催事一覧（売上付き・絞り込み可）</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={copyTable}
                title="表のデータをタブ区切り (TSV) でクリップボードへコピー。Excel/スプレッドシートにそのまま貼り付け可"
                className={copied ? "border-emerald-500 text-emerald-700" : ""}
              >
                {copied ? <Check className="h-4 w-4 mr-1 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "コピー済" : "表をコピー"}
              </Button>
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="催事名・会場で検索"
                className="w-60 h-8 text-xs"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>催事</TableHead>
                  <TableHead>期間</TableHead>
                  <TableHead className="text-right">売上(税込)</TableHead>
                  <TableHead className="text-right">売上(税抜)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.slice(0, 100).map((e) => {
                  const sales = salesByEvent.get(e.id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                          {e.store_name ? `${e.venue} ${e.store_name}` : e.venue}
                        </Link>
                        {e.name && <span className="block text-[10px] text-muted-foreground">{e.name}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.start_date} 〜 {e.end_date}</TableCell>
                      <TableCell className="text-right tabular-nums">{sales?.included ? `¥${sales.included.toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{sales?.excluded ? `¥${sales.excluded.toLocaleString()}` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredEvents.length > 100 && (
              <p className="text-[10px] text-muted-foreground py-2 text-center">最大100件まで表示。絞り込み検索を使ってください。</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
