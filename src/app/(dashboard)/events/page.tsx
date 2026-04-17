"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, MapPin, Calendar, Printer, ImageDown, ChevronLeft, ChevronRight, LayoutGrid, CalendarDays, X } from "lucide-react";
import Link from "next/link";
import { eventStatuses } from "@/lib/prefectures";
import { getHolidaysForRange } from "@/lib/holidays";
import { usePermission } from "@/hooks/usePermission";

type VenueOption = { label: string };
type MannequinSummary = { event_id: string; arrangement_status: string | null };
type StaffWithArrangement = {
  id: string;
  event_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  role: string | null;
  hotel_name: string | null;
  hotel_check_in: string | null;
  hotel_check_out: string | null;
  hotel_status: string | null;
  transport_type: string | null;
  transport_from: string | null;
  transport_to: string | null;
  transport_status: string | null;
  transport_outbound_status: string | null;
  transport_return_status: string | null;
  employees: { name: string } | null;
};

type Event = {
  id: string;
  name: string;
  venue: string;
  store_name: string | null;
  prefecture: string;
  start_date: string;
  end_date: string;
  person_in_charge: string | null;
  status: string;
  application_status: string | null;
  dm_status: string | null;
  dm_count: number | null;
  equipment_from: string | null;
  equipment_to: string | null;
};

const statusColor: Record<string, string> = {
  "準備中": "bg-gray-100 text-gray-800 border-gray-300",
  "手配中": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "手配完了": "bg-blue-100 text-blue-800 border-blue-300",
  "開催中": "bg-green-100 text-green-800 border-green-300",
  "終了": "bg-gray-200 text-gray-500 border-gray-300",
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

/** 月内の催事をトラック（A-H）に割り当てる */
function assignTracks(evts: Event[], y: number, m: number): Map<string, number> {
  const dim = new Date(y, m, 0).getDate();
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;

  // この月にかかる催事を開始日順でソート
  const inMonth = evts
    .filter((e) => e.start_date <= monthEnd && e.end_date >= monthStart)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const trackMap = new Map<string, number>();
  const trackEnds: string[] = []; // 各トラックの最後の終了日

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

export default function EventsPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"calendar" | "card">("calendar");
  const listRef = useRef<HTMLDivElement>(null);

  // 手配データ
  const [allStaff, setAllStaff] = useState<StaffWithArrangement[]>([]);
  const [mannequinSummaries, setMannequinSummaries] = useState<MannequinSummary[]>([]);
  const [pastVenues, setPastVenues] = useState<VenueOption[]>([]);
  const [hotelMasters, setHotelMasters] = useState<{ id: string; name: string }[]>([]);
  const [hotelVenueLinks, setHotelVenueLinks] = useState<{ hotel_id: string; venue_name: string }[]>([]);

  // 全手配ダイアログ
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEvent, setDialogEvent] = useState<Event | null>(null);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogStaff, setDialogStaff] = useState<StaffWithArrangement[]>([]);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [calSpan, setCalSpan] = useState(6);

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

  const holidays = useMemo(() => {
    const years = [...new Set(calMonths.map((m) => m.year))];
    return getHolidaysForRange(years);
  }, [calMonths]);

  const handlePrint = () => window.print();
  const handleSaveJpg = async () => {
    if (!listRef.current) return;
    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(listRef.current, {
        quality: 0.92,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `日程表_${calYear}年${calMonth}月.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("JPG保存エラー:", err);
      alert("JPG保存に失敗しました。");
    }
  };

  const fetchEvents = useCallback(async () => {
    const [evtRes, staffRes, mannRes, venueRes, hmRes, hvlRes] = await Promise.all([
      supabase.from("events").select("*").order("start_date", { ascending: true }),
      supabase.from("event_staff").select("id, event_id, employee_id, start_date, end_date, role, hotel_name, hotel_check_in, hotel_check_out, hotel_status, transport_type, transport_from, transport_to, transport_status, transport_outbound_status, transport_return_status, employees(name)"),
      supabase.from("mannequins").select("event_id, arrangement_status"),
      supabase.from("events").select("venue, store_name").order("created_at", { ascending: false }).limit(100),
      supabase.from("hotel_master").select("id, name").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("hotel_id, venue_name"),
    ]);
    setEvents(evtRes.data || []);
    setAllStaff((staffRes.data || []) as unknown as StaffWithArrangement[]);
    setMannequinSummaries((mannRes.data || []) as MannequinSummary[]);
    setHotelMasters((hmRes.data || []) as { id: string; name: string }[]);
    setHotelVenueLinks((hvlRes.data || []) as { hotel_id: string; venue_name: string }[]);
    const seen = new Set<string>();
    const venues: VenueOption[] = [];
    (venueRes.data || []).forEach((e: { venue: string; store_name: string | null }) => {
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (!seen.has(label)) { seen.add(label); venues.push({ label }); }
    });
    setPastVenues(venues);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const filtered = filterStatus === "all" ? events : events.filter((e) => e.status === filterStatus);

  // ホテルマスター候補: 百貨店名で絞り込み、該当なければ全件
  const getHotelCandidates = (venue: string, storeName: string | null) => {
    const venueLabel = storeName ? `${venue} ${storeName}` : venue;
    const linkedIds = new Set(hotelVenueLinks.filter((l) => l.venue_name === venueLabel).map((l) => l.hotel_id));
    const candidates = linkedIds.size > 0 ? hotelMasters.filter((h) => linkedIds.has(h.id)) : hotelMasters;
    return candidates;
  };

  const getDayOfWeek = (date: Date) => ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];

  // --- 手配状況ヘルパー ---
  const getArrangementStatus = (evt: Event) => {
    const staff = allStaff.filter((s) => s.event_id === evt.id);

    const hotelCount = staff.filter((s) => s.hotel_name).length;
    const hotelOk = staff.length > 0 && staff.every((s) => s.hotel_name);
    const transportCount = staff.filter((s) => s.transport_outbound_status === "手配済" && s.transport_return_status === "手配済").length;
    const transportOk = staff.length > 0 && staff.every((s) => s.transport_outbound_status === "手配済" && s.transport_return_status === "手配済");

    const manns = mannequinSummaries.filter((m) => m.event_id === evt.id);
    const mannOk = manns.length > 0 && manns.every((m) => m.arrangement_status === "手配済");

    const equipOk = !!evt.equipment_from && !!evt.equipment_to;
    const equipPartial = !!evt.equipment_from || !!evt.equipment_to;

    return {
      hotel: staff.length === 0 ? "未登録" : hotelOk ? "設定済" : hotelCount > 0 ? "一部未設定" : "未設定",
      transport: staff.length === 0 ? "未登録" : transportOk ? "設定済" : transportCount > 0 ? "一部未設定" : "未設定",
      shipment: equipOk ? "設定済" : equipPartial ? "一部未設定" : "未設定",
      application: evt.application_status || "未提出",
      dm: evt.dm_status || null,
      mannequin: manns.length === 0 ? "na" : mannOk ? "ok" : "ng",
      equipmentFrom: evt.equipment_from,
      equipmentTo: evt.equipment_to,
      staff,
    };
  };

  // --- 全手配ダイアログ ---
  const openDialog = (evt: Event) => {
    setDialogEvent(evt);
    setDialogStaff(allStaff.filter((s) => s.event_id === evt.id).map((s) => ({ ...s })));
    setDialogOpen(true);
  };

  const toggleApplicationStatus = async (e: React.MouseEvent, evtId: string, current: string | null) => {
    e.stopPropagation();
    const next = (current === "提出済") ? "未提出" : "提出済";
    await supabase.from("events").update({ application_status: next }).eq("id", evtId);
    setEvents((prev) => prev.map((ev) => ev.id === evtId ? { ...ev, application_status: next } : ev));
    // ダイアログが開いていて同じイベントなら同期
    if (dialogEvent?.id === evtId) setDialogEvent({ ...dialogEvent, application_status: next } as Event);
  };

  const updateEventField = async (field: string, value: string | null) => {
    if (!dialogEvent) return;
    await supabase.from("events").update({ [field]: value }).eq("id", dialogEvent.id);
    setDialogEvent({ ...dialogEvent, [field]: value } as Event);
  };

  const handleDialogSave = async () => {
    if (!dialogEvent) return;
    setDialogSaving(true);

    // 備品の流れ（equipment_from/toはupdateEventFieldで即時保存済み）

    // 社員ごとのホテル・交通を更新
    for (const s of dialogStaff) {
      await supabase.from("event_staff").update({
        hotel_name: s.hotel_name || null,
        transport_outbound_status: s.transport_outbound_status || "未手配",
        transport_return_status: s.transport_return_status || "未手配",
      }).eq("id", s.id);
    }

    setDialogSaving(false);
    setDialogOpen(false);
    fetchEvents();
  };

  const prevMonth = () => {
    if (calMonth === 1) { setCalYear(calYear - 1); setCalMonth(12); } else { setCalMonth(calMonth - 1); }
  };
  const nextMonth = () => {
    if (calMonth === 12) { setCalYear(calYear + 1); setCalMonth(1); } else { setCalMonth(calMonth + 1); }
  };

  const spanLabel = calSpan === 1
    ? `${calYear}年 ${calMonth}月`
    : `${calYear}年 ${calMonth}月 〜 ${calMonths[calMonths.length - 1].year}年 ${calMonths[calMonths.length - 1].month}月`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">日程表</h1>
        <div className="flex gap-2 items-center">
          <div className="flex border rounded-md print:hidden">
            <Button variant={viewMode === "calendar" ? "default" : "ghost"} size="sm" className="rounded-r-none" onClick={() => setViewMode("calendar")}>
              <CalendarDays className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "card" ? "default" : "ghost"} size="sm" className="rounded-l-none" onClick={() => setViewMode("card")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint} className="print:hidden"><Printer className="h-4 w-4 mr-1" />印刷</Button>
          <Button variant="outline" size="sm" onClick={handleSaveJpg} className="print:hidden"><ImageDown className="h-4 w-4 mr-1" />JPG保存</Button>
          {canEdit && (
            <Link href="/events/new" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 print:hidden">
              <Plus className="h-4 w-4" />新規作成
            </Link>
          )}
        </div>
      </div>

      {/* ステータスフィルタ */}
      <div className="flex gap-2 flex-wrap print:hidden">
        <Button variant={filterStatus === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterStatus("all")}>すべて</Button>
        {eventStatuses.map((s) => (
          <Button key={s} variant={filterStatus === s ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(s)}>{s}</Button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">読み込み中...</p>
      ) : viewMode === "calendar" ? (
        /* ===== ガントチャート日程表 ===== */
        <>
        <div className="flex items-center gap-3 mb-4 print:hidden">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-lg font-semibold min-w-[200px] text-center">{spanLabel}</span>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth() + 1); }}>今月</Button>
          <Select value={String(calSpan)} onValueChange={(v) => v && setCalSpan(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3ヶ月</SelectItem>
              <SelectItem value="6">6ヶ月</SelectItem>
              <SelectItem value="12">12ヶ月</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div ref={listRef}>
          {/* 印刷用タイトル */}
          <div className="hidden print:block text-center mb-2">
            <h2 className="text-base font-bold">日程表　{spanLabel}</h2>
            <p className="text-xs text-muted-foreground">印刷日時 {new Date().toLocaleString("ja-JP")}</p>
          </div>

          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 8mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 8px; }
              nav, aside, header { display: none !important; }
              main, [data-slot="main"] { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
              .print\\:overflow-visible { overflow: visible !important; }
              .print\\:page-break { page-break-before: always; break-before: page; }
            }
          `}</style>

          <TooltipProvider>
            <div className="space-y-4">
              {calMonths.map((cm, cmIdx) => {
                const daysInMonth = new Date(cm.year, cm.month, 0).getDate();
                const trackMap = assignTracks(filtered, cm.year, cm.month);
                const maxTrack = trackMap.size > 0 ? Math.max(...Array.from(trackMap.values())) : -1;
                const trackCount = Math.max(maxTrack + 1, 1);

                // この月の催事をトラック別に整理
                const monthStart = `${cm.year}-${String(cm.month).padStart(2, "0")}-01`;
                const monthEnd = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
                const monthEvents = filtered.filter((e) => e.start_date <= monthEnd && e.end_date >= monthStart);

                return (
                  <Card key={`${cm.year}-${cm.month}`} className={`overflow-hidden ${cmIdx > 0 && cmIdx % 2 === 0 ? "print:page-break" : ""}`}>
                    <CardContent className="p-0 overflow-x-auto print:overflow-visible">
                      <div className="min-w-[800px]">
                        {/* 月タイトル */}
                        <div className="flex border-b bg-white">
                          <div className="w-12 shrink-0 border-r flex items-center justify-center text-base font-black py-1.5 bg-sky-50">
                            <span className="text-sky-700">{cm.month}<span className="text-xs">月</span></span>
                          </div>
                          <div className="flex-1 flex">
                            {Array.from({ length: 31 }, (_, i) => {
                              const day = i + 1;
                              if (day > daysInMonth) {
                                return <div key={day} className="flex-1 bg-muted/10" />;
                              }
                              const date = new Date(cm.year, cm.month - 1, day);
                              const dateStr = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const holiday = holidays.get(dateStr);
                              const isSun = date.getDay() === 0;
                              const isSat = date.getDay() === 6;
                              const isRed = isSun || !!holiday;
                              const isT = today.getFullYear() === cm.year && today.getMonth() + 1 === cm.month && today.getDate() === day;
                              return (
                                <div
                                  key={day}
                                  className={`flex-1 text-center border-r ${isT ? "bg-primary/10" : isRed ? "bg-red-50/50" : isSat ? "bg-blue-50/50" : ""}`}
                                  title={holiday || undefined}
                                >
                                  <div className="text-[10px] font-medium leading-tight pt-0.5">{day}</div>
                                  <div className={`text-[9px] leading-tight pb-0.5 ${isRed ? "text-red-500 font-bold" : isSat ? "text-blue-500" : "text-muted-foreground"}`}>
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
                              <div className="w-12 shrink-0 border-r flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                {TRACK_LABELS[trackIdx] || String(trackIdx + 1)}
                              </div>
                              <div className="flex-1 relative">
                                {/* 背景グリッド */}
                                <div className="absolute inset-0 flex">
                                  {Array.from({ length: 31 }, (_, i) => {
                                    const day = i + 1;
                                    if (day > daysInMonth) {
                                      return <div key={i} className="flex-1 bg-muted/10" />;
                                    }
                                    const date = new Date(cm.year, cm.month - 1, day);
                                    const dateStr = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                    const isSun = date.getDay() === 0;
                                    const isSat = date.getDay() === 6;
                                    const isRed = isSun || !!holidays.has(dateStr);
                                    const isT = today.getFullYear() === cm.year && today.getMonth() + 1 === cm.month && today.getDate() === day;
                                    return (
                                      <div key={i} className={`flex-1 border-r ${isT ? "bg-primary/5" : isRed ? "bg-red-50/30" : isSat ? "bg-blue-50/30" : ""}`} />
                                    );
                                  })}
                                </div>

                                {/* 催事バー */}
                                {trackEvents.map((evt) => {
                                  const label = evt.store_name ? `${evt.venue} ${evt.store_name}` : evt.venue;
                                  const barColor = trackBarColors[trackIdx % trackBarColors.length];

                                  // 月内でのバー位置計算
                                  const evtStart = new Date(evt.start_date);
                                  const evtEnd = new Date(evt.end_date);
                                  const mStart = new Date(cm.year, cm.month - 1, 1);
                                  const mEnd = new Date(cm.year, cm.month - 1, daysInMonth);

                                  const effectiveStart = evtStart < mStart ? mStart : evtStart;
                                  const effectiveEnd = evtEnd > mEnd ? mEnd : evtEnd;

                                  const startDay = effectiveStart.getDate();
                                  const endDay = effectiveEnd.getDate();
                                  const left = ((startDay - 1) / 31) * 100;
                                  const width = ((endDay - startDay + 1) / 31) * 100;

                                  const arr = getArrangementStatus(evt);
                                  const icons = [
                                    { label: "申込", ok: arr.application === "提出済", na: false },
                                    { label: evt.dm_count ? `DM${evt.dm_count}枚` : "DM", ok: arr.dm === "印刷済み", na: arr.dm === null },
                                    { label: "ホテル", ok: arr.hotel === "設定済", na: arr.hotel === "未登録" },
                                    { label: "交通", ok: arr.transport === "設定済", na: arr.transport === "未登録" },
                                    { label: "マネキン", ok: arr.mannequin === "ok", na: arr.mannequin === "na" },
                                    { label: "備品", ok: arr.shipment === "設定済", na: false },
                                  ];
                                  return (
                                    <Tooltip key={evt.id}>
                                      <TooltipTrigger
                                        render={
                                          <div
                                            className={`absolute top-0.5 rounded border text-[11px] leading-snug px-1 py-0.5 overflow-hidden hover:opacity-80 transition-opacity z-[1] cursor-pointer ${barColor}`}
                                            style={{
                                              left: `${left}%`,
                                              width: `${width}%`,
                                              height: 72,
                                            }}
                                            onClick={() => openDialog(evt)}
                                          >
                                            <div className="truncate font-semibold leading-tight text-[11px] mb-0.5">{label}</div>
                                            <div className="flex gap-0.5 flex-wrap">
                                              {icons.map((ic) => (
                                                <span key={ic.label} className={`inline-block text-[11px] leading-none px-1 py-0.5 rounded font-bold ${ic.label === "申込" ? "cursor-pointer hover:opacity-70" : ""} ${ic.na ? "bg-gray-200 text-gray-500" : ic.ok ? "bg-green-600 text-white" : "bg-red-500 text-white"}`}
                                                  onMouseDown={ic.label === "申込" ? (e) => e.stopPropagation() : undefined}
                                                  onClick={ic.label === "申込" ? (e) => toggleApplicationStatus(e, evt.id, evt.application_status) : undefined}
                                                >{ic.label}{ic.na ? "" : ic.ok ? "✓" : "✗"}</span>
                                              ))}
                                            </div>
                                            {(arr.equipmentFrom || arr.equipmentTo) && (
                                              <div className="truncate text-[10px] text-black/70 mt-0.5">
                                                {arr.equipmentFrom ? `←${arr.equipmentFrom}` : ""}{arr.equipmentFrom && arr.equipmentTo ? " " : ""}{arr.equipmentTo ? `→${arr.equipmentTo}` : ""}
                                              </div>
                                            )}
                                          </div>
                                        }
                                      />
                                      <TooltipContent side="bottom">
                                        <div className="space-y-0.5">
                                          <div className="font-medium">{evt.name || label}</div>
                                          {evt.name && <div>{label}（{evt.prefecture}）</div>}
                                          {!evt.name && <div>{evt.prefecture}</div>}
                                          <div className="text-muted-foreground">{evt.start_date} 〜 {evt.end_date}</div>
                                          {evt.person_in_charge && <div>担当: {evt.person_in_charge}</div>}
                                          <div>ホテル: {arr.hotel} / 交通: {arr.transport}</div>
                                          <div>備品: {arr.shipment} / 申込書: {arr.application}{arr.dm !== null ? ` / DM: ${arr.dm}${evt.dm_count ? `（${evt.dm_count}枚）` : ""}` : ""}</div>
                                          <div className="text-muted-foreground">クリックで手配を設定</div>
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
              })}
            </div>
          </TooltipProvider>
        </div>
        </>
      ) : (
        /* ===== カード表示 ===== */
        filtered.length === 0 ? (
          <p className="text-muted-foreground">
            {filterStatus === "all" ? "催事がまだありません。「新規作成」から登録してください。" : `「${filterStatus}」の催事はありません。`}
          </p>
        ) : (
          <div ref={listRef} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{event.venue}{event.store_name ? ` ${event.store_name}` : ""}</CardTitle>
                      <Badge variant="outline" className={statusColor[event.status] || ""}>{event.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.name || `${event.venue}${event.store_name ? ` ${event.store_name}` : ""}`}（{event.prefecture}）</div>
                    <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />{event.start_date} 〜 {event.end_date}</div>
                    {event.person_in_charge && <div>担当: {event.person_in_charge}</div>}
                    <Badge variant="outline" className={event.application_status === "提出済" ? "bg-green-100 text-green-800 text-xs" : "bg-red-100 text-red-800 text-xs"}>
                      申込書: {event.application_status || "未提出"}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      )}

      {/* 全手配ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (open) setDialogOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" showCloseButton={false} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Escape") setDialogOpen(false); }}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>手配設定</DialogTitle>
              <button onClick={() => setDialogOpen(false)} className="p-1 rounded hover:bg-red-100 hover:text-red-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>
          {dialogEvent && (() => {
            const venueLabel = dialogEvent.store_name ? `${dialogEvent.venue} ${dialogEvent.store_name}` : dialogEvent.venue;
            return (
              <div className="space-y-3">
                {/* 催事情報 */}
                <div className="text-sm border-b pb-3">
                  <div className="font-bold text-base">{venueLabel}</div>
                  {dialogEvent.name && <div className="text-muted-foreground">{dialogEvent.name}（{dialogEvent.prefecture}）</div>}
                  {!dialogEvent.name && <div className="text-muted-foreground">{dialogEvent.prefecture}</div>}
                  <div className="text-muted-foreground text-xs">{dialogEvent.start_date} 〜 {dialogEvent.end_date}</div>
                </div>

                {/* 出店申込書 */}
                <div className="rounded-md border-l-4 border-l-green-500 bg-green-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-green-800">出店申込書</span>
                    <div className="flex gap-1">
                      {["未提出", "提出済"].map((s) => (
                        <Badge key={s} variant={dialogEvent.application_status === s ? "default" : "outline"} className="cursor-pointer text-xs"
                          onClick={() => updateEventField("application_status", s)}>
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ホテル */}
                <div className="rounded-md border-l-4 border-l-blue-500 bg-blue-50/50 p-3 space-y-2">
                  <span className="text-sm font-bold text-blue-800">ホテル</span>
                  {dialogStaff.length > 0 ? dialogStaff.map((s, i) => {
                    const updateStaff = (field: string, value: string | null) => {
                      const next = [...dialogStaff];
                      next[i] = { ...next[i], [field]: value };
                      setDialogStaff(next);
                    };
                    return (
                      <div key={`hotel-${s.id}`} className="bg-white rounded border p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs">{s.employees?.name || "不明"}</Badge>
                          <span className="text-[10px] text-muted-foreground">{s.start_date}〜{s.end_date}</span>
                        </div>
                        <Input value={s.hotel_name || ""} onChange={(e) => updateStaff("hotel_name", e.target.value)} placeholder="ホテル名を入力" className="h-7 text-xs" />
                        {dialogEvent && getHotelCandidates(dialogEvent.venue, dialogEvent.store_name).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {getHotelCandidates(dialogEvent.venue, dialogEvent.store_name).map((h) => (
                              <Badge key={h.id} variant={s.hotel_name === h.name ? "default" : "outline"}
                                className="cursor-pointer text-[10px] hover:bg-primary/10"
                                onClick={() => updateStaff("hotel_name", h.name)}
                              >{h.name}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="text-sm text-muted-foreground">社員が配置されていません。</div>
                  )}
                </div>

                {/* 交通 */}
                <div className="rounded-md border-l-4 border-l-orange-500 bg-orange-50/50 p-3 space-y-2">
                  <span className="text-sm font-bold text-orange-800">交通</span>
                  {dialogStaff.length > 0 ? dialogStaff.map((s, i) => {
                    const updateStaff = (field: string, value: string | null) => {
                      const next = [...dialogStaff];
                      next[i] = { ...next[i], [field]: value };
                      setDialogStaff(next);
                    };
                    return (
                      <div key={`transport-${s.id}`} className="bg-white rounded border p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="default" className="text-xs">{s.employees?.name || "不明"}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">行き</span>
                          <button
                            type="button"
                            className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors ${s.transport_outbound_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                            onClick={() => updateStaff("transport_outbound_status", s.transport_outbound_status === "手配済" ? "未手配" : "手配済")}
                          >
                            <span className={`absolute text-[9px] font-medium ${s.transport_outbound_status === "手配済" ? "left-1.5 text-white" : "right-1.5 text-gray-600"}`}>
                              {s.transport_outbound_status === "手配済" ? "手配済" : "未手配"}
                            </span>
                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${s.transport_outbound_status === "手配済" ? "translate-x-[60px]" : "translate-x-0.5"}`} />
                          </button>
                          <span className="text-[10px] text-muted-foreground">帰り</span>
                          <button
                            type="button"
                            className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors ${s.transport_return_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                            onClick={() => updateStaff("transport_return_status", s.transport_return_status === "手配済" ? "未手配" : "手配済")}
                          >
                            <span className={`absolute text-[9px] font-medium ${s.transport_return_status === "手配済" ? "left-1.5 text-white" : "right-1.5 text-gray-600"}`}>
                              {s.transport_return_status === "手配済" ? "手配済" : "未手配"}
                            </span>
                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${s.transport_return_status === "手配済" ? "translate-x-[60px]" : "translate-x-0.5"}`} />
                          </button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-sm text-muted-foreground">社員が配置されていません。</div>
                  )}
                </div>

                {/* DMハガキ */}
                <div className="rounded-md border-l-4 border-l-purple-500 bg-purple-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-purple-800">DMハガキ</span>
                    <div className="flex gap-1">
                      {["なし", "未着手", "校正中", "印刷済み"].map((s) => {
                        const current = dialogEvent.dm_status || "なし";
                        return (
                          <Badge key={s} variant={current === s ? "default" : "outline"} className="cursor-pointer text-xs"
                            onClick={() => updateEventField("dm_status", s === "なし" ? null : s)}>
                            {s}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 催事詳細リンク */}
                <div className="pt-3 border-t text-center">
                  <Link href={`/events/${dialogEvent.id}`} className="inline-block px-4 py-2 text-sm font-bold rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors">
                    催事詳細ページで編集 →
                  </Link>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleDialogSave} disabled={dialogSaving}>{dialogSaving ? "保存中..." : "保存する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
