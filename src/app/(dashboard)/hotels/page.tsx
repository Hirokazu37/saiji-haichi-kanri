"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from "@/components/ui/tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, ChevronDown, Hotel, Train, ExternalLink, Printer, ImageDown, CalendarDays, CalendarRange } from "lucide-react";
import Link from "next/link";
import { getHolidaysForRange } from "@/lib/holidays";
import { usePermission } from "@/hooks/usePermission";

type StaffRow = {
  id: string;
  event_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  role: string | null;
  hotel_name: string | null;
  hotel_status: string | null;
  transport_outbound_status: string | null;
  transport_return_status: string | null;
  employees: { name: string } | null;
};

type Event = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  prefecture: string;
  start_date: string;
  end_date: string;
  status: string;
};

const trackBarColors = [
  "bg-blue-100 border-blue-300 text-black",
  "bg-green-100 border-green-300 text-black",
  "bg-amber-100 border-amber-300 text-black",
  "bg-rose-100 border-rose-300 text-black",
  "bg-purple-100 border-purple-300 text-black",
  "bg-orange-100 border-orange-300 text-black",
  "bg-cyan-100 border-cyan-300 text-black",
  "bg-pink-100 border-pink-300 text-black",
];

const TRACK_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** 指定週内の催事をレーンに割り当てる（日曜始まり） */
function assignWeekLanes(
  evts: Event[],
  weekStart: Date,
  weekEnd: Date
): { event: Event; laneIdx: number; startDay: number; endDay: number }[] {
  const ws = weekStart.toISOString().slice(0, 10);
  const we = weekEnd.toISOString().slice(0, 10);
  const weekEvents = evts
    .filter((e) => e.start_date <= we && e.end_date >= ws)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const laneEnds: string[] = [];
  const result: { event: Event; laneIdx: number; startDay: number; endDay: number }[] = [];
  for (const evt of weekEvents) {
    let lane = -1;
    for (let t = 0; t < laneEnds.length; t++) {
      if (evt.start_date > laneEnds[t]) {
        lane = t;
        laneEnds[t] = evt.end_date;
        break;
      }
    }
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(evt.end_date);
    }
    const effStart = evt.start_date < ws ? weekStart : new Date(evt.start_date + "T00:00:00");
    const effEnd = evt.end_date > we ? weekEnd : new Date(evt.end_date + "T00:00:00");
    result.push({ event: evt, laneIdx: lane, startDay: effStart.getDay(), endDay: effEnd.getDay() });
  }
  return result;
}

/** 月のカレンダー週構造（日曜始まり） */
function getCalendarWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month - 1, 1);
  const dim = new Date(year, month, 0).getDate();
  const firstDow = firstDay.getDay();
  const weeks: Date[][] = [];
  const startDate = new Date(year, month - 1, 1 - firstDow);
  const totalCells = Math.ceil((firstDow + dim) / 7) * 7;
  for (let w = 0; w < totalCells / 7; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(startDate);
      cur.setDate(startDate.getDate() + w * 7 + d);
      row.push(cur);
    }
    weeks.push(row);
  }
  return weeks;
}

function assignTracks(evts: Event[], y: number, m: number): Map<string, number> {
  const dim = new Date(y, m, 0).getDate();
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;
  const inMonth = evts
    .filter((e) => e.start_date <= monthEnd && e.end_date >= monthStart)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const trackMap = new Map<string, number>();
  const trackEnds: string[] = [];
  for (const evt of inMonth) {
    let placed = false;
    for (let t = 0; t < trackEnds.length; t++) {
      if (evt.start_date > trackEnds[t]) {
        trackEnds[t] = evt.end_date;
        trackMap.set(evt.id, t);
        placed = true;
        break;
      }
    }
    if (!placed) {
      trackMap.set(evt.id, trackEnds.length);
      trackEnds.push(evt.end_date);
    }
  }
  return trackMap;
}

export default function HotelTransportPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [events, setEvents] = useState<Event[]>([]);
  const [allStaff, setAllStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "incomplete">("all");
  const [hotelMasters, setHotelMasters] = useState<{ id: string; name: string }[]>([]);
  const [hotelVenueLinks, setHotelVenueLinks] = useState<{ hotel_id: string; venue_name: string }[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);

  // ガントチャート
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [calSpan, setCalSpan] = useState(6);
  const [viewMode, setViewMode] = useState<"gantt" | "calendar">("gantt");
  // ガント期間: "half-3" | "1" | "3" | "6" | "12"
  const [ganttSpanSel, setGanttSpanSel] = useState<string>("6");

  // 下パネル
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [panelStaff, setPanelStaff] = useState<StaffRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null); // saving staff id
  const panelRef = useRef<HTMLDivElement>(null);

  const calMonths = useMemo(() => {
    const months: { year: number; month: number }[] = [];
    for (let i = 0; i < calSpan; i++) {
      let m = calMonth + i;
      let y = calYear;
      while (m > 12) { m -= 12; y++; }
      months.push({ year: y, month: m });
    }
    return months;
  }, [calYear, calMonth, calSpan]);

  // ガント用ブロック（各要素が1つのサブ表示範囲）
  const ganttBlocks = useMemo(() => {
    type Block = { year: number; month: number; dayStart: number; dayEnd: number; halfLabel?: "前半" | "後半" };
    const blocks: Block[] = [];
    const nextYM = (i: number) => {
      let m = calMonth + i, y = calYear;
      while (m > 12) { m -= 12; y++; }
      return { y, m };
    };
    const pushMonthFull = (y: number, m: number) => {
      const dim = new Date(y, m, 0).getDate();
      blocks.push({ year: y, month: m, dayStart: 1, dayEnd: dim });
    };
    const pushMonthHalves = (y: number, m: number) => {
      const dim = new Date(y, m, 0).getDate();
      blocks.push({ year: y, month: m, dayStart: 1, dayEnd: 15, halfLabel: "前半" });
      blocks.push({ year: y, month: m, dayStart: 16, dayEnd: dim, halfLabel: "後半" });
    };
    if (ganttSpanSel === "half-3") {
      for (let i = 0; i < 3; i++) { const { y, m } = nextYM(i); pushMonthHalves(y, m); }
    } else {
      const months = parseInt(ganttSpanSel) || 1;
      for (let i = 0; i < months; i++) { const { y, m } = nextYM(i); pushMonthFull(y, m); }
    }
    return blocks;
  }, [calYear, calMonth, ganttSpanSel]);

  // 同月の連続ブロックを1カードにまとめる
  const ganttCardGroups = useMemo(() => {
    type Block = typeof ganttBlocks[number];
    const groups: Block[][] = [];
    for (const b of ganttBlocks) {
      const last = groups[groups.length - 1];
      if (last && last[0].year === b.year && last[0].month === b.month) last.push(b);
      else groups.push([b]);
    }
    return groups;
  }, [ganttBlocks]);

  const holidays = useMemo(() => {
    const years = [...new Set(calMonths.map((m) => m.year))];
    return getHolidaysForRange(years);
  }, [calMonths]);

  const fetchData = useCallback(async () => {
    const [evtRes, staffRes, hmRes, hvlRes] = await Promise.all([
      supabase.from("events").select("id, name, venue, store_name, prefecture, start_date, end_date, status").order("start_date"),
      supabase.from("event_staff").select("id, event_id, employee_id, start_date, end_date, role, hotel_name, hotel_status, transport_outbound_status, transport_return_status, employees(name)"),
      supabase.from("hotel_master").select("id, name").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("hotel_id, venue_name"),
    ]);
    setEvents(evtRes.data || []);
    setAllStaff((staffRes.data || []) as unknown as StaffRow[]);
    setHotelMasters((hmRes.data || []) as { id: string; name: string }[]);
    setHotelVenueLinks((hvlRes.data || []) as { hotel_id: string; venue_name: string }[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ホテルマスター候補: 選択中の催事の百貨店名で絞り込み
  const hotelCandidates = useMemo(() => {
    if (!selectedEvent) return hotelMasters;
    const venueLabel = selectedEvent.store_name ? `${selectedEvent.venue} ${selectedEvent.store_name}` : selectedEvent.venue;
    const linkedIds = new Set(hotelVenueLinks.filter((l) => l.venue_name === venueLabel).map((l) => l.hotel_id));
    return linkedIds.size > 0 ? hotelMasters.filter((h) => linkedIds.has(h.id)) : hotelMasters;
  }, [selectedEvent, hotelMasters, hotelVenueLinks]);

  // ステータス判定
  const getHotelTransportStatus = (evt: Event) => {
    const staff = allStaff.filter((s) => s.event_id === evt.id);
    if (staff.length === 0) return { hotel: "未登録", transport: "未登録", hasIncomplete: true };
    const hotelOk = staff.every((s) => s.hotel_status === "手配済" || !!s.hotel_name);
    const transportOk = staff.every((s) => s.transport_outbound_status === "手配済" && s.transport_return_status === "手配済");
    return {
      hotel: hotelOk ? "設定済" : "未設定",
      transport: transportOk ? "設定済" : "未設定",
      hasIncomplete: !hotelOk || !transportOk,
    };
  };

  const filtered = filter === "incomplete"
    ? events.filter((e) => e.status !== "終了" && getHotelTransportStatus(e).hasIncomplete)
    : events.filter((e) => e.status !== "終了");

  const getDayOfWeek = (date: Date) => ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];

  // バークリック → 下パネル展開
  const selectEvent = (evt: Event) => {
    setSelectedEvent(evt);
    setPanelStaff(allStaff.filter((s) => s.event_id === evt.id).map((s) => ({ ...s })));
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  // パネル内の即時保存
  const updateStaffField = async (staffId: string, field: string, value: string | null) => {
    setSaving(staffId);
    await supabase.from("event_staff").update({ [field]: value }).eq("id", staffId);
    // ローカルstate更新
    setPanelStaff((prev) => prev.map((s) => s.id === staffId ? { ...s, [field]: value } : s));
    setAllStaff((prev) => prev.map((s) => s.id === staffId ? { ...s, [field]: value } : s));
    setSaving(null);
  };

  const prevMonth = () => {
    let m = calMonth - calSpan;
    let y = calYear;
    while (m < 1) { m += 12; y--; }
    setCalYear(y); setCalMonth(m);
  };
  const nextMonth = () => {
    let m = calMonth + calSpan;
    let y = calYear;
    while (m > 12) { m -= 12; y++; }
    setCalYear(y); setCalMonth(m);
  };
  const goToday = () => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth() + 1); };

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const lastMonth = calMonths[calMonths.length - 1];

  const handlePrint = () => { window.print(); };
  const handleSaveJpg = async () => {
    if (!chartRef.current) return;
    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(chartRef.current, { quality: 0.92, pixelRatio: 2, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `ホテル交通_${calYear}年${calMonth}月.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("JPG保存エラー:", err);
      alert("JPG保存に失敗しました。");
    }
  };

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 8px; }
          nav, aside, header { display: none !important; }
          main, [data-slot="main"] { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
          .print\\:overflow-visible { overflow: visible !important; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">ホテル・交通手配</h1>
        <div className="flex gap-2 items-center print:hidden">
          <div className="flex border rounded-md">
            <Button variant={viewMode === "gantt" ? "default" : "ghost"} size="sm" className="rounded-r-none" onClick={() => setViewMode("gantt")} title="ガントチャート">
              <CalendarRange className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "calendar" ? "default" : "ghost"} size="sm" className="rounded-l-none" onClick={() => setViewMode("calendar")} title="カレンダー">
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />印刷</Button>
          <Button variant="outline" size="sm" onClick={handleSaveJpg}><ImageDown className="h-4 w-4 mr-1" />JPG保存</Button>
        </div>
      </div>

      {/* フィルタ */}
      <div className="flex gap-2 print:hidden">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>すべて</Button>
        <Button variant={filter === "incomplete" ? "default" : "outline"} size="sm" onClick={() => setFilter("incomplete")}>未手配あり</Button>
      </div>

      {/* 月ナビ */}
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-lg font-semibold min-w-[180px] text-center">
          {calYear}年 {calMonth}月 〜 {lastMonth.year}年 {lastMonth.month}月
        </span>
        <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={goToday}>今月</Button>
        {viewMode === "gantt" ? (
          <Select value={ganttSpanSel} onValueChange={(v) => v && setGanttSpanSel(v)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="half-3">半月×3ヶ月</SelectItem>
              <SelectItem value="1">1ヶ月</SelectItem>
              <SelectItem value="3">3ヶ月</SelectItem>
              <SelectItem value="6">6ヶ月</SelectItem>
              <SelectItem value="12">12ヶ月</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Select value={String(calSpan)} onValueChange={(v) => setCalSpan(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3ヶ月</SelectItem>
              <SelectItem value="6">6ヶ月</SelectItem>
              <SelectItem value="12">12ヶ月</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* メインビュー */}
      <div ref={chartRef} className="space-y-4 overflow-x-auto print:overflow-visible">
        <TooltipProvider>
        {viewMode === "gantt" ? (
        ganttCardGroups.map((group, gIdx) => {
          const firstBlock = group[0];
          return (
            <Card key={`${firstBlock.year}-${firstBlock.month}`} className={`overflow-hidden ${gIdx > 0 && gIdx % 2 === 0 ? "print:page-break" : ""}`}>
              <CardContent className="p-0 overflow-x-auto">
                <div className="min-w-[600px]">
                  {group.map((cm, subIdx) => {
                    const daysInMonth = new Date(cm.year, cm.month, 0).getDate();
                    const dayStart = cm.dayStart;
                    const dayEnd = cm.dayEnd;
                    const cellCount = dayEnd - dayStart + 1;
                    const rangeStart = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(dayStart).padStart(2, "0")}`;
                    const rangeEnd = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(dayEnd).padStart(2, "0")}`;
                    const trackMap = assignTracks(filtered, cm.year, cm.month);
                    const maxTrack = trackMap.size > 0 ? Math.max(...Array.from(trackMap.values())) : 0;
                    const trackCount = Math.max(maxTrack + 1, 1);
                    const monthEvents = filtered.filter((e) => e.start_date <= rangeEnd && e.end_date >= rangeStart);
                    const isFirstSub = subIdx === 0;
                    return (
                      <div key={`${cm.halfLabel || "full"}`} className={subIdx > 0 ? "border-t-2 border-sky-200" : ""}>
                        {/* 日付ヘッダ */}
                        <div className="flex border-b bg-white">
                          <div className="w-14 shrink-0 border-r flex flex-col items-center justify-center py-1.5 bg-sky-50">
                            {isFirstSub && <span className="text-sky-700 text-base font-black leading-none">{cm.month}<span className="text-xs">月</span></span>}
                            {cm.halfLabel && <span className={`text-[11px] text-sky-600 font-semibold leading-none ${isFirstSub ? "mt-0.5" : ""}`}>{cm.halfLabel}</span>}
                          </div>
                          <div className="flex-1 flex">
                            {Array.from({ length: cellCount }, (_, i) => {
                              const day = dayStart + i;
                              if (day > daysInMonth) return <div key={day} className="flex-1 bg-muted/10" />;
                              const date = new Date(cm.year, cm.month - 1, day);
                              const dow = date.getDay();
                              const dateStr = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const isHoliday = holidays.has(dateStr);
                              const isRed = dow === 0 || isHoliday;
                              const isToday = date.toDateString() === today.toDateString();
                              return (
                                <div key={day} className={`flex-1 text-center border-r ${isToday ? "bg-primary/10" : isRed ? "bg-red-50/50" : dow === 6 ? "bg-blue-50/50" : ""}`}>
                                  <div className="text-[14px] font-bold leading-tight pt-1">{day}</div>
                                  <div className={`text-[11px] leading-tight pb-1 ${isRed ? "text-red-500 font-bold" : dow === 6 ? "text-blue-500" : "text-muted-foreground"}`}>
                                    {getDayOfWeek(date)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* トラック行 */}
                        {Array.from({ length: trackCount }, (_, trackIdx) => {
                          const trackEvents = monthEvents.filter((e) => trackMap.get(e.id) === trackIdx);
                          return (
                            <div key={trackIdx} className={`flex border-b last:border-b-0 ${trackIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`} style={{ minHeight: 76 }}>
                              <div className="w-14 shrink-0 border-r flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                {TRACK_LABELS[trackIdx] || ""}
                              </div>
                              <div className="flex-1 relative">
                                {/* 背景グリッド */}
                                <div className="absolute inset-0 flex">
                                  {Array.from({ length: cellCount }, (_, i) => {
                                    const day = dayStart + i;
                                    if (day > daysInMonth) return <div key={i} className="flex-1 bg-muted/10" />;
                                    const date = new Date(cm.year, cm.month - 1, day);
                                    const dow = date.getDay();
                                    const dateStr = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                    const isHoliday = holidays.has(dateStr);
                                    const isRed = dow === 0 || isHoliday;
                                    const isToday = date.toDateString() === today.toDateString();
                                    return (
                                      <div key={i} className={`flex-1 border-r last:border-r-0 ${isToday ? "bg-primary/5" : isRed ? "bg-red-50/30" : dow === 6 ? "bg-blue-50/30" : ""}`} />
                                    );
                                  })}
                                </div>

                                {/* 催事バー */}
                                {trackEvents.map((evt) => {
                                  const label = evt.store_name ? `${evt.venue} ${evt.store_name}` : evt.venue;
                                  const barColor = trackBarColors[trackIdx % trackBarColors.length];
                                  const evtStart = new Date(evt.start_date);
                                  const evtEnd = new Date(evt.end_date);
                                  const mStart = new Date(cm.year, cm.month - 1, dayStart);
                                  const mEnd = new Date(cm.year, cm.month - 1, dayEnd);
                                  const effectiveStart = evtStart < mStart ? mStart : evtStart;
                                  const effectiveEnd = evtEnd > mEnd ? mEnd : evtEnd;
                                  const startDay = effectiveStart.getDate();
                                  const endDay = effectiveEnd.getDate();
                                  const left = ((startDay - dayStart) / cellCount) * 100;
                                  const width = ((endDay - startDay + 1) / cellCount) * 100;

                                  const status = getHotelTransportStatus(evt);
                                  const isSelected = selectedEvent?.id === evt.id;
                                  const icons = [
                                    { label: "ホテル", ok: status.hotel === "設定済", na: status.hotel === "未登録" },
                                    { label: "交通", ok: status.transport === "設定済", na: status.transport === "未登録" },
                                  ];
                                  const staffNames = allStaff.filter((s) => s.event_id === evt.id).map((s) => s.employees?.name || "").filter(Boolean).join(", ");

                                  return (
                                    <Tooltip key={evt.id}>
                                      <TooltipTrigger
                                        render={
                                          <div
                                            className={`absolute top-0.5 rounded border text-[11px] leading-snug px-1 py-0.5 overflow-hidden hover:opacity-80 transition-opacity z-[1] cursor-pointer ${barColor} ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""} ${status.hasIncomplete ? "border-orange-400 border-2" : ""}`}
                                            style={{ left: `${left}%`, width: `${width}%`, height: 72 }}
                                            onClick={() => selectEvent(evt)}
                                          >
                                            <div className="truncate font-semibold leading-tight text-[11px] mb-0.5">{label}</div>
                                            <div className="flex gap-0.5 flex-wrap mb-0.5">
                                              {icons.map((ic) => (
                                                <span key={ic.label} className={`inline-block text-[11px] leading-none px-1 py-0.5 rounded font-bold ${ic.na ? "bg-gray-200 text-gray-500" : ic.ok ? "bg-green-600 text-white" : "bg-red-500 text-white"}`}>
                                                  {ic.label}{ic.na ? "" : ic.ok ? "✓" : "✗"}
                                                </span>
                                              ))}
                                            </div>
                                            <div className="truncate text-[10px] text-black/70">{staffNames || "社員未配置"}</div>
                                          </div>
                                        }
                                      />
                                      <TooltipContent side="bottom">
                                        <div className="space-y-0.5">
                                          <div className="font-medium">{evt.name || label}</div>
                                          {evt.name && <div>{label}（{evt.prefecture}）</div>}
                                          <div className="text-muted-foreground">{evt.start_date} 〜 {evt.end_date}</div>
                                          <div>ホテル: {status.hotel} / 交通: {status.transport}</div>
                                          <div className="text-muted-foreground">クリックで手配を編集</div>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
        ) : (
          /* ===== カレンダービュー ===== */
          calMonths.map((cm) => {
            const weeks = getCalendarWeeks(cm.year, cm.month);
            const weekDayNames = ["日", "月", "火", "水", "木", "金", "土"];
            const maxLanesInMonth = weeks.reduce((acc, wk) => {
              const lanes = assignWeekLanes(filtered, wk[0], wk[6]);
              const max = lanes.reduce((a, l) => Math.max(a, l.laneIdx + 1), 0);
              return Math.max(acc, max);
            }, 0);
            const rowHeight = 28 + Math.max(maxLanesInMonth, 2) * 20;
            return (
              <Card key={`${cm.year}-${cm.month}`}>
                <CardContent className="p-3">
                  <h2 className="text-base font-bold mb-2">{cm.year}年 {cm.month}月</h2>
                  <div className="border-t border-l">
                    <div className="grid grid-cols-7">
                      {weekDayNames.map((wd, i) => (
                        <div key={wd} className={`border-r border-b text-center text-xs font-bold py-1 ${i === 0 ? "text-red-600 bg-red-50/50" : i === 6 ? "text-blue-600 bg-blue-50/50" : "bg-muted/30"}`}>{wd}</div>
                      ))}
                    </div>
                    {weeks.map((week, wIdx) => {
                      const weekStart = week[0];
                      const weekEnd = week[6];
                      const lanes = assignWeekLanes(filtered, weekStart, weekEnd);
                      return (
                        <div key={wIdx} className="relative">
                          <div className="grid grid-cols-7">
                            {week.map((date, dIdx) => {
                              const isCurrentMonth = date.getMonth() + 1 === cm.month;
                              const isToday = date.toDateString() === today.toDateString();
                              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                              const isHoliday = holidays.has(dateStr);
                              const isSun = date.getDay() === 0;
                              const isSat = date.getDay() === 6;
                              const dayColor = !isCurrentMonth ? "text-muted-foreground/40" : isSun || isHoliday ? "text-red-600" : isSat ? "text-blue-600" : "";
                              return (
                                <div key={dIdx} className={`border-r border-b ${isToday ? "bg-amber-50" : isCurrentMonth ? "" : "bg-muted/20"}`} style={{ height: rowHeight }}>
                                  <div className={`text-xs px-1 pt-0.5 font-medium ${dayColor}`}>{date.getDate()}</div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="absolute inset-0 pointer-events-none">
                            {lanes.map(({ event, laneIdx, startDay, endDay }) => {
                              const spanDays = endDay - startDay + 1;
                              const label = event.store_name ? `${event.venue} ${event.store_name}` : event.venue;
                              const status = getHotelTransportStatus(event);
                              return (
                                <Tooltip key={`${event.id}-${wIdx}`}>
                                  <TooltipTrigger
                                    render={
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        className={`absolute truncate text-[10px] font-medium px-1 py-0.5 rounded border cursor-pointer pointer-events-auto hover:opacity-80 ${
                                          status.hasIncomplete ? "bg-red-50 border-red-300 text-red-900" : "bg-blue-100 border-blue-300 text-blue-900"
                                        }`}
                                        style={{
                                          left: `calc(${(startDay / 7) * 100}% + 2px)`,
                                          width: `calc(${(spanDays / 7) * 100}% - 4px)`,
                                          top: `${22 + laneIdx * 20}px`,
                                        }}
                                        onClick={() => selectEvent(event)}
                                      >{label}</div>
                                    }
                                  />
                                  <TooltipContent side="bottom">
                                    <div className="space-y-0.5">
                                      <div className="font-medium">{event.name || label}</div>
                                      <div>{label}（{event.prefecture}）</div>
                                      <div className="text-muted-foreground">{event.start_date} 〜 {event.end_date}</div>
                                      <div>ホテル: {status.hotel} / 交通: {status.transport}</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
        </TooltipProvider>
      </div>

      {/* 下パネル: 選択中の催事の手配詳細 */}
      {selectedEvent && (
        <Card ref={panelRef} className="border-primary/30 shadow-md">
          <CardContent className="p-5 space-y-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 text-primary" />
                  <h2 className="text-lg font-bold">
                    {selectedEvent.venue}{selectedEvent.store_name ? ` ${selectedEvent.store_name}` : ""}
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground ml-6">
                  {selectedEvent.name}（{selectedEvent.prefecture}）{selectedEvent.start_date} 〜 {selectedEvent.end_date}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/events/${selectedEvent.id}`} className="text-sm text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />催事詳細ページ
                </Link>
                <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>閉じる</Button>
              </div>
            </div>

            {/* 社員一覧 + インライン編集 */}
            {panelStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                社員が配置されていません。<Link href={`/events/${selectedEvent.id}`} className="text-primary hover:underline">催事詳細ページ</Link>で社員を追加してください。
              </p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                {/* テーブルヘッダー */}
                <div className="grid grid-cols-[100px_1fr_120px_120px] gap-0 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
                  <div className="px-3 py-2">社員名</div>
                  <div className="px-3 py-2 flex items-center gap-1"><Hotel className="h-3 w-3" />ホテル</div>
                  <div className="px-3 py-2 flex items-center gap-1"><Train className="h-3 w-3" />行き</div>
                  <div className="px-3 py-2 flex items-center gap-1"><Train className="h-3 w-3" />帰り</div>
                </div>

                {/* 社員行 */}
                {panelStaff.map((s) => (
                  <div key={s.id} className="grid grid-cols-[100px_1fr_120px_120px] gap-0 border-b last:border-b-0 items-center hover:bg-muted/20">
                    <div className="px-3 py-2">
                      <Badge variant="default" className="text-xs">{s.employees?.name || "不明"}</Badge>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{s.start_date}〜{s.end_date}</div>
                    </div>
                    <div className="px-3 py-2 space-y-1">
                      {canEdit ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Input
                              value={s.hotel_name || ""}
                              onChange={(e) => setPanelStaff((prev) => prev.map((ps) => ps.id === s.id ? { ...ps, hotel_name: e.target.value } : ps))}
                              onBlur={(e) => updateStaffField(s.id, "hotel_name", e.target.value || null)}
                              placeholder="ホテル名（空欄でも手配済OK）"
                              className={`h-8 text-sm flex-1 ${saving === s.id ? "opacity-50" : ""}`}
                            />
                            <button
                              type="button"
                              className={`relative inline-flex h-7 w-[90px] items-center rounded-full transition-colors shrink-0 ${s.hotel_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                              onClick={() => { const next = s.hotel_status === "手配済" ? "未手配" : "手配済"; setPanelStaff((prev) => prev.map((ps) => ps.id === s.id ? { ...ps, hotel_status: next } : ps)); updateStaffField(s.id, "hotel_status", next); }}
                            >
                              <span className={`absolute text-[10px] font-medium ${s.hotel_status === "手配済" ? "left-2 text-white" : "right-2 text-gray-600"}`}>
                                {s.hotel_status === "手配済" ? "手配済" : "未手配"}
                              </span>
                              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${s.hotel_status === "手配済" ? "translate-x-[64px]" : "translate-x-0.5"}`} />
                            </button>
                          </div>
                          {hotelCandidates.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {hotelCandidates.map((h) => (
                                <Badge key={h.id} variant={s.hotel_name === h.name ? "default" : "outline"}
                                  className="cursor-pointer text-[10px] hover:bg-primary/10"
                                  onClick={() => { setPanelStaff((prev) => prev.map((ps) => ps.id === s.id ? { ...ps, hotel_name: h.name } : ps)); updateStaffField(s.id, "hotel_name", h.name); }}
                                >{h.name}</Badge>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{s.hotel_name || "—"}</span>
                          <span className={`text-xs font-medium ${s.hotel_status === "手配済" ? "text-green-700" : "text-gray-500"}`}>
                            {s.hotel_status === "手配済" ? "(手配済)" : "(未手配)"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      {canEdit ? (
                        <button
                          type="button"
                          className={`relative inline-flex h-7 w-[110px] items-center rounded-full transition-colors ${s.transport_outbound_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                          onClick={() => updateStaffField(s.id, "transport_outbound_status", s.transport_outbound_status === "手配済" ? "未手配" : "手配済")}
                        >
                          <span className={`absolute text-[10px] font-medium ${s.transport_outbound_status === "手配済" ? "left-2 text-white" : "right-2 text-gray-600"}`}>
                            {s.transport_outbound_status === "手配済" ? "手配済" : "未手配"}
                          </span>
                          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${s.transport_outbound_status === "手配済" ? "translate-x-[84px]" : "translate-x-0.5"}`} />
                        </button>
                      ) : (
                        <span className={`text-xs font-medium ${s.transport_outbound_status === "手配済" ? "text-green-700" : "text-gray-500"}`}>
                          {s.transport_outbound_status === "手配済" ? "手配済" : "未手配"}
                        </span>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      {canEdit ? (
                        <button
                          type="button"
                          className={`relative inline-flex h-7 w-[110px] items-center rounded-full transition-colors ${s.transport_return_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                          onClick={() => updateStaffField(s.id, "transport_return_status", s.transport_return_status === "手配済" ? "未手配" : "手配済")}
                        >
                          <span className={`absolute text-[10px] font-medium ${s.transport_return_status === "手配済" ? "left-2 text-white" : "right-2 text-gray-600"}`}>
                            {s.transport_return_status === "手配済" ? "手配済" : "未手配"}
                          </span>
                          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${s.transport_return_status === "手配済" ? "translate-x-[84px]" : "translate-x-0.5"}`} />
                        </button>
                      ) : (
                        <span className={`text-xs font-medium ${s.transport_return_status === "手配済" ? "text-green-700" : "text-gray-500"}`}>
                          {s.transport_return_status === "手配済" ? "手配済" : "未手配"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
