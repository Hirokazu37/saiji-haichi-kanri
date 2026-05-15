"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendingUp, Calendar as CalendarIcon, BarChart3, Store, LineChart, Download } from "lucide-react";
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
  const salesByEvent = useMemo(() => {
    const map = new Map<string, { excluded: number; included: number; hasData: boolean }>();
    for (const d of dailyRows) {
      const cur = map.get(d.event_id) ?? { excluded: 0, included: 0, hasData: false };
      cur.excluded += toExcluded(d.amount, d.tax_type, d.tax_rate);
      cur.included += toIncluded(d.amount, d.tax_type, d.tax_rate);
      cur.hasData = true;
      map.set(d.event_id, cur);
    }
    return map;
  }, [dailyRows]);

  // 検索フィルタ
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      const hay = [e.name, e.venue, e.store_name].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [events, search]);

  // ===== カレンダー: 今年1月～未来6ヶ月 =====
  type CalEntry = { event: EventLite; sales: { excluded: number; included: number; hasData: boolean } };
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
    const startOffset = -today.getMonth();
    const endOffset = 6;
    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
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
  }, [events, salesByEvent]);

  // ===== 月次サマリ (前年比較) =====
  // 今年と昨年の月別合計 (税込) を計算
  const monthlySummary = useMemo(() => {
    const today = new Date();
    const thisYear = today.getFullYear();
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
  }, [events, salesByEvent]);

  // ===== 会場別 前年比較 =====
  const venueSummary = useMemo(() => {
    type VenueRow = {
      label: string;
      thisYearTotal: number;
      lastYearTotal: number;
      thisYearEvents: number;
      lastYearEvents: number;
    };
    const today = new Date();
    const thisYear = today.getFullYear();
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
  }, [events, salesByEvent]);

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
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" />CSV出力
          </Button>
        </div>
      </div>

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
                <h2 className="text-sm font-bold">催事カレンダー（売上付き）</h2>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] text-muted-foreground">今年1月 〜 未来6ヶ月</span>
                <span className="inline-flex items-center gap-2 text-[10px] flex-wrap">
                  <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-emerald-100 border-2 border-emerald-500 rounded-sm"></span>売上入力済</span>
                  <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-yellow-100 border-2 border-yellow-500 rounded-sm"></span>売上未入力(終了済)</span>
                  <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-gray-100 border-2 border-gray-400 rounded-sm"></span>未開催</span>
                </span>
              </div>
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

          {/* タブ: 推移グラフ */}
          <TabsContent value="chart" keepMounted className="space-y-4 print:!block">
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-purple-700" />
                  <h2 className="text-sm font-bold">月次売上 推移グラフ（前年比較・税込）</h2>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-emerald-600"></span>{monthlySummary.thisYear}年</span>
                  <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-gray-400"></span>{monthlySummary.lastYear}年</span>
                </div>
                {(() => {
                  const thisData = monthlySummary.totals[monthlySummary.thisYear];
                  const lastData = monthlySummary.totals[monthlySummary.lastYear];
                  const allValues = [...thisData, ...lastData].filter((v) => v > 0);
                  const max = allValues.length > 0 ? Math.max(...allValues) : 1;
                  // SVG dims
                  const W = 720, H = 280;
                  const padL = 60, padR = 20, padT = 20, padB = 40;
                  const innerW = W - padL - padR;
                  const innerH = H - padT - padB;
                  const xAt = (m: number) => padL + (m / 11) * innerW; // m = 0-11
                  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
                  const buildPath = (data: number[]) => {
                    const points: string[] = [];
                    for (let i = 0; i < 12; i++) {
                      if (data[i] > 0) points.push(`${xAt(i)},${yAt(data[i])}`);
                    }
                    if (points.length === 0) return "";
                    return "M " + points.join(" L ");
                  };
                  // Y軸ラベル (5本)
                  const yTicks: number[] = [];
                  for (let i = 0; i <= 4; i++) yTicks.push((max / 4) * i);
                  const formatY = (v: number) => {
                    if (v >= 10000000) return `${(v / 10000000).toFixed(1)}千万`;
                    if (v >= 10000) return `${(v / 10000).toFixed(0)}万`;
                    return v.toFixed(0);
                  };
                  return (
                    <div className="overflow-x-auto">
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full" style={{ minWidth: 600 }}>
                        {/* グリッド */}
                        {yTicks.map((v, idx) => (
                          <g key={idx}>
                            <line x1={padL} y1={yAt(v)} x2={W - padR} y2={yAt(v)} stroke="#e5e7eb" strokeWidth={1} strokeDasharray={idx === 0 ? "0" : "2,2"} />
                            <text x={padL - 6} y={yAt(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#6b7280">{formatY(v)}</text>
                          </g>
                        ))}
                        {/* X軸ラベル */}
                        {Array.from({ length: 12 }, (_, i) => (
                          <text key={i} x={xAt(i)} y={H - padB + 15} textAnchor="middle" fontSize={10} fill="#374151">{i + 1}月</text>
                        ))}
                        {/* 去年の線 */}
                        <path d={buildPath(lastData)} fill="none" stroke="#9ca3af" strokeWidth={2} strokeDasharray="4,2" />
                        {lastData.map((v, i) => v > 0 && (
                          <circle key={`l-${i}`} cx={xAt(i)} cy={yAt(v)} r={3} fill="#9ca3af" />
                        ))}
                        {/* 今年の線 */}
                        <path d={buildPath(thisData)} fill="none" stroke="#059669" strokeWidth={2.5} />
                        {thisData.map((v, i) => v > 0 && (
                          <circle key={`t-${i}`} cx={xAt(i)} cy={yAt(v)} r={4} fill="#059669" />
                        ))}
                      </svg>
                    </div>
                  );
                })()}
                <p className="text-[10px] text-muted-foreground">※ 日別売上(税込)の月別合計。売上未入力の月はプロット無し。</p>
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
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="催事名・会場で検索"
              className="w-60 h-8 text-xs"
            />
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
