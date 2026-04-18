"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Printer, ImageDown, AlertTriangle, Warehouse, GripHorizontal, X } from "lucide-react";
import { getHolidaysForRange } from "@/lib/holidays";
import { usePermission } from "@/hooks/usePermission";

type EventRecord = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  equipment_from: string | null;
  equipment_to: string | null;
};

const HONSHA = "本社（安岡蒲鉾）";

const barColors = [
  { bar: "bg-sky-100 border-sky-400", badge: "bg-white border-sky-300 text-sky-400", badgeFill: "bg-sky-500 border-sky-500 text-white", badgeHover: "hover:bg-sky-50 hover:text-sky-700 hover:border-sky-500", arrow: "#0ea5e9" },
  { bar: "bg-cyan-100 border-cyan-400", badge: "bg-white border-cyan-300 text-cyan-500", badgeFill: "bg-cyan-500 border-cyan-500 text-white", badgeHover: "hover:bg-cyan-50 hover:text-cyan-700 hover:border-cyan-500", arrow: "#06b6d4" },
  { bar: "bg-emerald-100 border-emerald-400", badge: "bg-white border-emerald-300 text-emerald-400", badgeFill: "bg-emerald-500 border-emerald-500 text-white", badgeHover: "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-500", arrow: "#10b981" },
  { bar: "bg-rose-100 border-rose-400", badge: "bg-white border-rose-300 text-rose-400", badgeFill: "bg-rose-500 border-rose-500 text-white", badgeHover: "hover:bg-rose-50 hover:text-rose-700 hover:border-rose-500", arrow: "#f43f5e" },
  { bar: "bg-violet-100 border-violet-400", badge: "bg-white border-violet-300 text-violet-400", badgeFill: "bg-violet-500 border-violet-500 text-white", badgeHover: "hover:bg-violet-50 hover:text-violet-700 hover:border-violet-500", arrow: "#8b5cf6" },
  { bar: "bg-teal-100 border-teal-400", badge: "bg-white border-teal-300 text-teal-400", badgeFill: "bg-teal-500 border-teal-500 text-white", badgeHover: "hover:bg-teal-50 hover:text-teal-700 hover:border-teal-500", arrow: "#14b8a6" },
  { bar: "bg-pink-100 border-pink-400", badge: "bg-white border-pink-300 text-pink-400", badgeFill: "bg-pink-500 border-pink-500 text-white", badgeHover: "hover:bg-pink-50 hover:text-pink-700 hover:border-pink-500", arrow: "#ec4899" },
  { bar: "bg-indigo-100 border-indigo-400", badge: "bg-white border-indigo-300 text-indigo-400", badgeFill: "bg-indigo-500 border-indigo-500 text-white", badgeHover: "hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-500", arrow: "#6366f1" },
];

export default function ShipmentsPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [pastVenues, setPastVenues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);

  // 編集パネル
  const [editEvent, setEditEvent] = useState<EventRecord | null>(null);
  const [draftFrom, setDraftFrom] = useState<string | null>(null);
  const [draftTo, setDraftTo] = useState<string | null>(null);
  const [panelDirty, setPanelDirty] = useState(false);
  const [panelPos, setPanelPos] = useState({ x: 100, y: 100 });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: panelPos.x, origY: panelPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPanelPos({
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !panelDirty) {
      setEditEvent(null);
    }
  };

  const openEditPanel = (evt: EventRecord) => {
    setEditEvent(evt);
    setDraftFrom(evt.equipment_from);
    setDraftTo(evt.equipment_to);
    setPanelDirty(false);
    setPanelPos({ x: Math.max(window.innerWidth / 2 - 200, 20), y: 120 });
    setTimeout(() => panelRef.current?.focus(), 50);
  };

  const savePanel = () => {
    if (!editEvent) return;
    // 自分を更新
    updateEquipment(editEvent.id, "equipment_from", draftFrom);
    updateEquipment(editEvent.id, "equipment_to", draftTo);
    // editEventのローカル値も更新
    setEditEvent({ ...editEvent, equipment_from: draftFrom, equipment_to: draftTo });
    setPanelDirty(false);
  };

  const cancelPanel = () => {
    if (!editEvent) return;
    // ドラフトを元に戻す
    setDraftFrom(editEvent.equipment_from);
    setDraftTo(editEvent.equipment_to);
    setPanelDirty(false);
    setEditEvent(null);
  };

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthSpan, setMonthSpan] = useState(3);

  const getMonthRange = () => {
    const months: { year: number; month: number; days: number }[] = [];
    for (let i = 0; i < monthSpan; i++) {
      let m = month + i;
      let y = year;
      while (m > 12) { m -= 12; y++; }
      months.push({ year: y, month: m, days: new Date(y, m, 0).getDate() });
    }
    return months;
  };

  const monthRange = getMonthRange();
  const totalDays = monthRange.reduce((sum, m) => sum + m.days, 0);

  const holidays = useMemo(() => {
    const years = monthRange.map((m) => m.year);
    return getHolidaysForRange(years);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, monthSpan]);

  const fetchData = useCallback(async () => {
    const firstMonth = monthRange[0];
    const lastMonth = monthRange[monthRange.length - 1];
    const startOfRange = `${firstMonth.year}-${String(firstMonth.month).padStart(2, "0")}-01`;
    const endOfRange = `${lastMonth.year}-${String(lastMonth.month).padStart(2, "0")}-${lastMonth.days}`;

    const [evtRes, venueRes] = await Promise.all([
      supabase.from("events")
        .select("id, name, venue, store_name, start_date, end_date, status, equipment_from, equipment_to")
        .gte("end_date", startOfRange)
        .lte("start_date", endOfRange)
        .order("start_date"),
      supabase.from("events").select("venue, store_name").order("created_at", { ascending: false }).limit(100),
    ]);

    setEvents(evtRes.data || []);
    const seen = new Set<string>();
    const venues: string[] = [];
    (venueRes.data || []).forEach((e: { venue: string; store_name: string | null }) => {
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (!seen.has(label)) { seen.add(label); venues.push(label); }
    });
    setPastVenues(venues);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, year, month, monthSpan]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevMonth = () => { if (month === 1) { setYear(year - 1); setMonth(12); } else { setMonth(month - 1); } };
  const nextMonth = () => { if (month === 12) { setYear(year + 1); setMonth(1); } else { setMonth(month + 1); } };

  const allDays: { year: number; month: number; day: number; date: Date; dateStr: string }[] = [];
  monthRange.forEach((m) => {
    for (let d = 1; d <= m.days; d++) {
      const date = new Date(m.year, m.month - 1, d);
      const dateStr = `${m.year}-${String(m.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      allDays.push({ year: m.year, month: m.month, day: d, date, dateStr });
    }
  });

  const getDayOfWeek = (date: Date) => ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  const isSunday = (date: Date) => date.getDay() === 0;
  const isSaturday = (date: Date) => date.getDay() === 6;
  const isRedDay = (date: Date, dateStr: string) => isSunday(date) || holidays.has(dateStr);
  const isToday = (date: Date) => { const t = new Date(); return t.getFullYear() === date.getFullYear() && t.getMonth() === date.getMonth() && t.getDate() === date.getDate(); };
  const todayIndex = allDays.findIndex((d) => isToday(d.date));

  const getBarPosition = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const rangeStart = allDays[0]?.date;
    const rangeEnd = allDays[allDays.length - 1]?.date;
    if (!rangeStart || !rangeEnd) return null;
    const effectiveStart = start < rangeStart ? rangeStart : start;
    const effectiveEnd = end > rangeEnd ? rangeEnd : end;
    const startIdx = allDays.findIndex((d) => d.date.getFullYear() === effectiveStart.getFullYear() && d.date.getMonth() === effectiveStart.getMonth() && d.date.getDate() === effectiveStart.getDate());
    const endIdx = allDays.findIndex((d) => d.date.getFullYear() === effectiveEnd.getFullYear() && d.date.getMonth() === effectiveEnd.getMonth() && d.date.getDate() === effectiveEnd.getDate());
    if (startIdx === -1 || endIdx === -1) return null;
    return {
      left: `${(startIdx / totalDays) * 100}%`,
      width: `${(Math.max(endIdx - startIdx + 1, 1) / totalDays) * 100}%`,
      startPct: (startIdx / totalDays) * 100,
      endPct: ((endIdx + 1) / totalDays) * 100,
    };
  };

  const getVenueLabel = (evt: EventRecord) => evt.store_name ? `${evt.venue} ${evt.store_name}` : evt.venue;

  const updateEquipment = (evtId: string, field: "equipment_from" | "equipment_to", value: string | null) => {
    // オプティミスティック更新: 先にUIを即座に反映
    setEvents((prev) => prev.map((e) => e.id === evtId ? { ...e, [field]: value } : e));
    if (editEvent?.id === evtId) setEditEvent((prev) => prev ? { ...prev, [field]: value } : prev);

    // 連動: 搬出先/搬入元を相手催事にも反映
    const sourceEvt = events.find((e) => e.id === evtId);
    if (sourceEvt) {
      const sourceLabel = getVenueLabel(sourceEvt);

      if (field === "equipment_to" && value && value !== HONSHA) {
        const targetEvt = events.find((e) => getVenueLabel(e) === value && e.id !== evtId);
        if (targetEvt) {
          setEvents((prev) => prev.map((e) => e.id === targetEvt.id ? { ...e, equipment_from: sourceLabel } : e));
          if (editEvent?.id === targetEvt.id) setEditEvent((prev) => prev ? { ...prev, equipment_from: sourceLabel } : prev);
          supabase.from("events").update({ equipment_from: sourceLabel }).eq("id", targetEvt.id).then();
        }
      } else if (field === "equipment_to" && !value) {
        const targetEvt = events.find((e) => e.equipment_from === sourceLabel && e.id !== evtId);
        if (targetEvt) {
          setEvents((prev) => prev.map((e) => e.id === targetEvt.id ? { ...e, equipment_from: null } : e));
          if (editEvent?.id === targetEvt.id) setEditEvent((prev) => prev ? { ...prev, equipment_from: null } : prev);
          supabase.from("events").update({ equipment_from: null }).eq("id", targetEvt.id).then();
        }
      } else if (field === "equipment_from" && value && value !== HONSHA) {
        const targetEvt = events.find((e) => getVenueLabel(e) === value && e.id !== evtId);
        if (targetEvt) {
          setEvents((prev) => prev.map((e) => e.id === targetEvt.id ? { ...e, equipment_to: sourceLabel } : e));
          if (editEvent?.id === targetEvt.id) setEditEvent((prev) => prev ? { ...prev, equipment_to: sourceLabel } : prev);
          supabase.from("events").update({ equipment_to: sourceLabel }).eq("id", targetEvt.id).then();
        }
      } else if (field === "equipment_from" && !value) {
        const targetEvt = events.find((e) => e.equipment_to === sourceLabel && e.id !== evtId);
        if (targetEvt) {
          setEvents((prev) => prev.map((e) => e.id === targetEvt.id ? { ...e, equipment_to: null } : e));
          if (editEvent?.id === targetEvt.id) setEditEvent((prev) => prev ? { ...prev, equipment_to: null } : prev);
          supabase.from("events").update({ equipment_to: null }).eq("id", targetEvt.id).then();
        }
      }
    }

    // DB保存（バックグラウンド）
    supabase.from("events").update({ [field]: value }).eq("id", evtId).then();
  };

  const handlePrint = () => { window.print(); };
  const handleSaveJpg = async () => {
    if (!tableRef.current) return;
    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(tableRef.current, {
        quality: 0.92,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `備品の流れ_${year}年${month}月.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("JPG保存エラー:", err);
      alert("JPG保存に失敗しました。");
    }
  };

  const monthLabel = monthSpan === 1 ? `${year}年 ${month}月` : `${year}年 ${month}月 〜 ${monthRange[monthRange.length - 1].year}年 ${monthRange[monthRange.length - 1].month}月`;

  // 備品の流れ: 催事を時系列で並べてチェーンを構築
  const sortedEvents = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date));

  // 催事ごとの色インデックスマップ
  const eventColorMap = new Map<string, number>();
  sortedEvents.forEach((evt, idx) => { eventColorMap.set(evt.id, idx % barColors.length); });

  // 会場名→催事IDマップ（搬出先からバーへの矢印用）
  const venueToEventMap = new Map<string, EventRecord>();
  sortedEvents.forEach((evt) => { venueToEventMap.set(getVenueLabel(evt), evt); });

  // 接続情報を構築: equipment_to が他催事の会場名と一致すれば矢印
  const connections: { fromEvt: EventRecord; toEvt: EventRecord }[] = [];
  for (const from of sortedEvents) {
    if (!from.equipment_to || from.equipment_to === HONSHA) continue;
    const toEvt = venueToEventMap.get(from.equipment_to);
    if (toEvt && toEvt.id !== from.id && new Date(toEvt.start_date) >= new Date(from.start_date)) {
      connections.push({ fromEvt: from, toEvt });
    }
  }

  // 整合性チェック
  type Warning = { evtId: string; venue: string; message: string };
  const warnings: Warning[] = [];
  for (const evt of sortedEvents) {
    const label = getVenueLabel(evt);

    // 搬出先の催事が存在しない（百貨店名が見つからない）
    if (evt.equipment_to && evt.equipment_to !== HONSHA) {
      const target = venueToEventMap.get(evt.equipment_to);
      if (!target) {
        warnings.push({ evtId: evt.id, venue: label, message: `${label}の搬出先「${evt.equipment_to}」はこの期間の催事に存在しません` });
      }
      // 時系列チェック: 搬出先が自分より前に始まる
      if (target && new Date(target.start_date) < new Date(evt.start_date)) {
        warnings.push({ evtId: evt.id, venue: label, message: `${label}の搬出先「${evt.equipment_to}」は会期が先に始まります（時系列が逆）` });
      }
    }

    // 搬入元の催事が存在しない
    if (evt.equipment_from && evt.equipment_from !== HONSHA) {
      const source = venueToEventMap.get(evt.equipment_from);
      if (!source) {
        warnings.push({ evtId: evt.id, venue: label, message: `${label}の搬入元「${evt.equipment_from}」はこの期間の催事に存在しません` });
      }
    }

    // 搬入元も搬出先も未設定
    if (!evt.equipment_from && !evt.equipment_to) {
      warnings.push({ evtId: evt.id, venue: label, message: `${label}の搬入元・搬出先が未設定です` });
    }
  }
  const uniqueWarnings = warnings.filter((w, i, arr) => arr.findIndex((x) => x.message === w.message) === i);
  const evtHasWarning = new Set(warnings.map((w) => w.evtId));

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const ROW_HEIGHT = 95;

  // イベント行のみ（矢印はSVGオーバーレイで描画）
  const eventRows = sortedEvents.map((evt, idx) => ({ evt, idx }));

  // 各催事の行インデックスマップ（SVG矢印の座標計算用）
  const eventRowIndexMap = new Map<string, number>();
  eventRows.forEach((r, i) => { eventRowIndexMap.set(r.evt.id, i); });

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* サイドバー非表示 */
          nav, aside, header { display: none !important; }
          /* メインコンテンツを全幅に */
          main, [data-slot="main"] { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
          /* テーブルの横スクロールを解除して全体表示 */
          .print\\:overflow-visible { overflow: visible !important; }
          /* 左パネルの幅を縮小 */
          .print\\:w-32 { width: 8rem !important; min-width: 8rem !important; max-width: 8rem !important; }
          /* フォントサイズを縮小 */
          .print\\:text-\\[8px\\] { font-size: 8px !important; }
          /* 行の高さを縮小 */
          .print\\:h-auto { height: auto !important; min-height: 60px !important; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">備品の流れ</h1>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />印刷</Button>
          <Button variant="outline" size="sm" onClick={handleSaveJpg}><ImageDown className="h-4 w-4 mr-1" />JPG保存</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-lg font-semibold min-w-[140px] text-center">{monthLabel}</span>
        <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }}>今月</Button>
        <Select value={String(monthSpan)} onValueChange={(v) => v && setMonthSpan(parseInt(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1ヶ月</SelectItem>
            <SelectItem value="2">2ヶ月</SelectItem>
            <SelectItem value="3">3ヶ月</SelectItem>
            <SelectItem value="6">6ヶ月</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground print:hidden">
        <div className="flex items-center gap-1"><Warehouse className="h-3 w-3" /> 本社（安岡蒲鉾）</div>
        <div className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-amber-500" /> 本社から/本社へ</div>
        <div className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-blue-500" /> 催事間の直送</div>
        <div className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-orange-400" /> 未設定</div>
      </div>

      {/* 整合性警告 */}
      {uniqueWarnings.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 space-y-1 print:hidden">
          <div className="flex items-center gap-2 text-sm font-bold text-red-700">
            <AlertTriangle className="h-4 w-4" />
            備品の流れに不整合があります（{uniqueWarnings.length}件）
          </div>
          {uniqueWarnings.map((w, i) => (
            <div key={i} className="text-xs text-red-600 pl-6">• {w.message}</div>
          ))}
        </div>
      )}

      <div ref={tableRef}>
        <div className="hidden print:block text-center mb-2">
          <h2 className="text-base font-bold">備品の流れ — {monthLabel}</h2>
        </div>

        <TooltipProvider>
          <Card>
            <CardContent className="p-0 overflow-x-auto print:overflow-visible print:text-[8px] [touch-action:pan-x_pan-y_pinch-zoom]">
              <div>
                {/* 月ヘッダー */}
                {monthSpan > 1 && (
                  <div className="flex border-b">
                    <div className="w-48 print:w-32 shrink-0 border-r" />
                    <div className="flex-1 flex">
                      {monthRange.map((m) => (
                        <div key={`${m.year}-${m.month}`} className="text-center text-xs font-bold py-1 border-r last:border-r-0 bg-muted/50" style={{ width: `${(m.days / totalDays) * 100}%` }}>
                          {m.year}年{m.month}月
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 日付ヘッダー */}
                <div className="flex border-b sticky top-0 bg-background z-10">
                  <div className="w-48 print:w-32 shrink-0 p-2 border-r font-medium text-sm">催事 / 備品の流れ</div>
                  <div className="flex-1 flex">
                    {allDays.map((d, i) => {
                      const holiday = holidays.get(d.dateStr);
                      const red = isRedDay(d.date, d.dateStr);
                      const sat = isSaturday(d.date);
                      return (
                        <div key={i} className={`flex-1 text-center text-xs py-1 border-r last:border-r-0 ${isToday(d.date) ? "bg-primary/10 font-bold" : ""} ${red ? "bg-red-50/60" : sat ? "bg-blue-50/60" : ""}`} title={holiday || undefined}>
                          <div>{d.day}</div>
                          <div className={red ? "text-red-500" : sat ? "text-blue-500" : "text-muted-foreground"}>{getDayOfWeek(d.date)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* イベント行 + SVGオーバーレイ */}
                <div className="relative">
                  {eventRows.map(({ evt, idx }) => {
                    const barPos = getBarPosition(evt.start_date, evt.end_date);
                    const venueLabel = getVenueLabel(evt);
                    const colorIdx = eventColorMap.get(evt.id) ?? (idx % barColors.length);
                    const color = barColors[colorIdx];
                    const hasFrom = !!evt.equipment_from;
                    const hasTo = !!evt.equipment_to;
                    const fromIsHonsha = evt.equipment_from === HONSHA;
                    const toIsHonsha = evt.equipment_to === HONSHA;

                    const fromEvtMatch = !fromIsHonsha && evt.equipment_from ? sortedEvents.find((e) => getVenueLabel(e) === evt.equipment_from) : null;
                    const toEvtMatch = !toIsHonsha && evt.equipment_to ? sortedEvents.find((e) => getVenueLabel(e) === evt.equipment_to) : null;
                    const fromBadgeColor = fromIsHonsha ? "border-amber-400 text-amber-700 bg-amber-50" : fromEvtMatch ? barColors[eventColorMap.get(fromEvtMatch.id) ?? 0].badge : "border-gray-400 text-gray-700 bg-gray-50";
                    const toBadgeColor = toIsHonsha ? "border-amber-400 text-amber-700 bg-amber-50" : toEvtMatch ? barColors[eventColorMap.get(toEvtMatch.id) ?? 0].badge : "border-gray-400 text-gray-700 bg-gray-50";

                    return (
                      <div key={evt.id} className={`flex border-b last:border-b-0 ${idx % 2 === 1 ? "bg-muted/20" : ""}`} style={{ height: ROW_HEIGHT }}>
                        {/* 左パネル */}
                        <div
                          className={`w-48 print:w-32 shrink-0 p-1.5 border-r text-xs overflow-hidden ${canEdit ? "hover:bg-muted/50 transition-colors cursor-pointer" : ""}`}
                          onClick={canEdit ? () => openEditPanel(evt) : undefined}
                        >
                          <div className="font-bold text-sm truncate text-black flex items-center gap-1">
                            {venueLabel}
                            {evtHasWarning.has(evt.id) && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                          </div>
                          {evt.name && <div className="text-[10px] text-muted-foreground truncate">{evt.name}</div>}
                          <div className="flex items-center gap-1 mt-1">
                            {hasFrom ? (
                              <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${fromBadgeColor}`}>
                                ← {evt.equipment_from}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px] px-1.5 py-0 border-orange-300 text-orange-500 bg-orange-50">
                                <AlertTriangle className="h-3 w-3 mr-0.5" />搬入未設定
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {hasTo ? (
                              <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${toBadgeColor}`}>
                                → {evt.equipment_to}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px] px-1.5 py-0 border-orange-300 text-orange-500 bg-orange-50">
                                <AlertTriangle className="h-3 w-3 mr-0.5" />搬出未設定
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* ガントエリア */}
                        <div className="flex-1 relative">
                          <div className="absolute inset-0 flex">
                            {allDays.map((d, i) => {
                              const red = isRedDay(d.date, d.dateStr);
                              const sat = isSaturday(d.date);
                              return (<div key={i} className={`flex-1 border-r last:border-r-0 ${isToday(d.date) ? "bg-primary/5" : ""} ${red ? "bg-red-50/30" : sat ? "bg-blue-50/30" : ""}`} />);
                            })}
                          </div>
                          {todayIndex >= 0 && (<div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-[5] pointer-events-none" style={{ left: `${((todayIndex + 0.5) / totalDays) * 100}%` }} />)}

                          {/* 本社から搬入の矢印 */}
                          {barPos && fromIsHonsha && (
                            <>
                              <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1]">
                                <defs>
                                  <marker id={`honsha-from-${evt.id}`} markerWidth="12" markerHeight="8" refX="12" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                                    <polygon points="0 0, 12 4, 0 8" fill="#d97706" />
                                  </marker>
                                </defs>
                                <line x1={`${Math.max(barPos.startPct - 6, 0)}%`} y1="48" x2={`${barPos.startPct}%`} y2="48" stroke="#d97706" strokeWidth="3" markerEnd={`url(#honsha-from-${evt.id})`} />
                              </svg>
                              <div className="absolute pointer-events-none z-[3]" style={{ left: `${Math.max(barPos.startPct - 6.5, 0)}%`, top: 38, transform: "translateX(-100%)" }}>
                                <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded border-2 border-amber-400 bg-white text-amber-700 whitespace-nowrap">
                                  本社
                                </span>
                              </div>
                            </>
                          )}

                          {/* 本社へ搬出の矢印 */}
                          {barPos && toIsHonsha && (
                            <>
                              <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1]">
                                <defs>
                                  <marker id={`honsha-to-${evt.id}`} markerWidth="12" markerHeight="8" refX="12" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                                    <polygon points="0 0, 12 4, 0 8" fill="#d97706" />
                                  </marker>
                                </defs>
                                <line x1={`${barPos.endPct}%`} y1="48" x2={`${Math.min(barPos.endPct + 6, 100)}%`} y2="48" stroke="#d97706" strokeWidth="3" markerEnd={`url(#honsha-to-${evt.id})`} />
                              </svg>
                              <div className="absolute pointer-events-none z-[3]" style={{ left: `${Math.min(barPos.endPct + 6.5, 100)}%`, top: 38 }}>
                                <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded border-2 border-amber-400 bg-white text-amber-700 whitespace-nowrap">
                                  本社
                                </span>
                              </div>
                            </>
                          )}

                          {/* 催事バー */}
                          {barPos && (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <div
                                    className={`absolute rounded border-2 text-xs leading-snug px-1.5 flex items-center overflow-hidden whitespace-nowrap z-[2] hover:opacity-80 transition-opacity ${canEdit ? "cursor-pointer" : ""} ${color.bar}`}
                                    style={{ left: barPos.left, width: barPos.width, top: 28, height: 40 }}
                                    onClick={canEdit ? () => openEditPanel(evt) : undefined}
                                  >
                                    <div className="truncate">
                                      <div className="font-bold flex items-center gap-1">
                                        {venueLabel}
                                        {evtHasWarning.has(evt.id) && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                                      </div>
                                      <div className="text-[10px] opacity-70">{evt.start_date} 〜 {evt.end_date}</div>
                                    </div>
                                  </div>
                                }
                              />
                              <TooltipContent side="bottom" className="max-w-xs">
                                <div className="space-y-1">
                                  <div className="font-bold">{venueLabel}</div>
                                  {evt.name && <div className="text-muted-foreground">{evt.name}</div>}
                                  <div>{evt.start_date} 〜 {evt.end_date}</div>
                                  <div className="border-t pt-1 mt-1">
                                    <div>搬入元: {evt.equipment_from || "未設定"}</div>
                                    <div>搬出先: {evt.equipment_to || "未設定"}</div>
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    );
                  })}


                  {/* 接続矢印オーバーレイ: 各接続ごとに個別SVG */}
                  {connections.map((conn, ci) => {
                    const fromPos = getBarPosition(conn.fromEvt.start_date, conn.fromEvt.end_date);
                    const toPos = getBarPosition(conn.toEvt.start_date, conn.toEvt.end_date);
                    const fromRow = eventRowIndexMap.get(conn.fromEvt.id);
                    const toRow = eventRowIndexMap.get(conn.toEvt.id);
                    if (!fromPos || !toPos || fromRow === undefined || toRow === undefined) return null;

                    const cIdx = eventColorMap.get(conn.toEvt.id) ?? 0;
                    const arrowColor = barColors[cIdx].arrow;
                    const toLabel = getVenueLabel(conn.toEvt);

                    // 位置計算（px）
                    const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                    const x2Pct = toPos.startPct;
                    const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

                    // ラベル位置: 搬出元バーの終了日あたり
                    const oneDayPct = (1 / totalDays) * 100;
                    const labelXPct = fromPos.endPct + oneDayPct;
                    const labelY = y1;

                    return (
                      <React.Fragment key={`conn-${ci}`}>
                        {/* 矢印線のSVG */}
                        <svg
                          className="absolute pointer-events-none"
                          style={{ top: 0, left: 192, width: "calc(100% - 192px)", height: eventRows.length * ROW_HEIGHT, zIndex: 0, overflow: "visible" }}
                        >
                          <defs>
                            <marker id={`conn-arr-${ci}`} markerWidth="16" markerHeight="12" refX="16" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                              <polygon points="0 0, 16 6, 0 12" fill={arrowColor} />
                            </marker>
                          </defs>
                          <line
                            x1={`${fromPos.endPct}%`} y1={y1}
                            x2={`${x2Pct}%`} y2={y2}
                            stroke={arrowColor} strokeWidth="4" opacity="0.85"
                            markerEnd={`url(#conn-arr-${ci})`}
                          />
                        </svg>
                        {/* ラベル（HTML） */}
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            left: `calc(192px + (100% - 192px) * ${labelXPct / 100})`,
                            top: labelY - 12,
                            transform: "translateX(-50%)",
                            zIndex: 10,
                          }}
                        >
                          <span className="inline-block px-2 py-0.5 text-[11px] font-bold rounded border bg-white/95 whitespace-nowrap"
                            style={{ color: arrowColor, borderColor: arrowColor }}
                          >
                            →{toLabel}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  })}

                  {events.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">この期間に催事がありません。</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TooltipProvider>
      </div>

      {/* 備品の流れ編集パネル（ドラッグ移動可能・背景ぼかしなし） */}
      {canEdit && editEvent && (() => {
        const venueLabel = getVenueLabel(editEvent);
        return (
          <div
            ref={panelRef}
            tabIndex={0}
            onKeyDown={handlePanelKeyDown}
            className="fixed z-50 w-[400px] max-h-[80vh] overflow-y-auto rounded-xl bg-popover ring-1 ring-foreground/10 shadow-xl print:hidden outline-none"
            style={{ left: panelPos.x, top: panelPos.y }}
          >
            {/* ドラッグハンドル */}
            <div
              className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 rounded-t-xl cursor-grab active:cursor-grabbing select-none"
              onMouseDown={onDragStart}
            >
              <div className="flex items-center gap-2">
                <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">備品の流れ</span>
              </div>
              <button onClick={cancelPanel} className="p-1 rounded hover:bg-red-100 hover:text-red-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const editColorIdx = eventColorMap.get(editEvent.id) ?? 0;
              const editColor = barColors[editColorIdx];
              // ガントチャートの時系列順で候補を生成（自分を除く）
              const venueOptions = sortedEvents
                .filter((e) => e.id !== editEvent.id)
                .map((e) => getVenueLabel(e))
                .filter((v, i, arr) => arr.indexOf(v) === i); // 重複排除
              // 各催事会場のバッジ色を取得するヘルパー
              const getBadgeColorForVenue = (v: string, selected: boolean) => {
                if (v === HONSHA) return selected ? "bg-black border-black text-white" : "border-gray-300 text-gray-500 bg-white hover:bg-gray-100 hover:text-black hover:border-gray-500";
                const matchEvt = sortedEvents.find((e) => getVenueLabel(e) === v);
                if (!matchEvt) return "bg-white";
                const c = barColors[eventColorMap.get(matchEvt.id) ?? 0];
                return selected ? c.badgeFill : `${c.badge} ${c.badgeHover}`;
              };
              return (
                <div className="p-4 space-y-4">
                  <div className="text-sm">
                    <span className={`inline-block font-bold text-base px-2 py-0.5 rounded border ${editColor.badge}`}>{venueLabel}</span>
                    <span className="text-muted-foreground ml-2">{editEvent.name}</span>
                    <div className="text-xs text-muted-foreground mt-0.5">{editEvent.start_date} 〜 {editEvent.end_date}</div>
                  </div>

                  {/* 搬入元 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-amber-700 font-medium">搬入元</span>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="outline" className={`text-xs ${editColor.badge}`}>{venueLabel}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className={`cursor-pointer text-xs transition-colors ${getBadgeColorForVenue(HONSHA, draftFrom === HONSHA)} ${draftFrom === HONSHA ? "font-bold" : ""}`}
                        onClick={() => { setDraftFrom(draftFrom === HONSHA ? null : HONSHA); setPanelDirty(true); }}
                      >
                        本社（安岡蒲鉾）
                      </Badge>
                      {venueOptions.map((v) => {
                        const selected = draftFrom === v;
                        const vColor = getBadgeColorForVenue(v, selected);
                        return (
                          <Badge
                            key={v}
                            variant="outline"
                            className={`cursor-pointer text-xs transition-colors ${vColor} ${selected ? "font-bold" : ""}`}
                            onClick={() => { setDraftFrom(selected ? null : v); setPanelDirty(true); }}
                          >
                            {v}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* 搬出先 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className={`text-xs ${editColor.badge}`}>{venueLabel}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-amber-700 font-medium">搬出先</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant="outline"
                        className={`cursor-pointer text-xs transition-colors ${getBadgeColorForVenue(HONSHA, draftTo === HONSHA)} ${draftTo === HONSHA ? "font-bold" : ""}`}
                        onClick={() => { setDraftTo(draftTo === HONSHA ? null : HONSHA); setPanelDirty(true); }}
                      >
                        本社（安岡蒲鉾）
                      </Badge>
                      {venueOptions.map((v) => {
                        const selected = draftTo === v;
                        const vColor = getBadgeColorForVenue(v, selected);
                        return (
                          <Badge
                            key={v}
                            variant="outline"
                            className={`cursor-pointer text-xs transition-colors ${vColor} ${selected ? "font-bold" : ""}`}
                            onClick={() => { setDraftTo(selected ? null : v); setPanelDirty(true); }}
                          >
                            {v}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* 保存・キャンセル */}
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={cancelPanel}>キャンセル</Button>
                    <Button size="sm" onClick={savePanel} disabled={!panelDirty}>保存する</Button>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  );
}
