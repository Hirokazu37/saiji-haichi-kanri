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
import { ChevronLeft, ChevronRight, ChevronDown, Hotel, Train, ExternalLink, Printer, ImageDown } from "lucide-react";
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

  const holidays = useMemo(() => {
    const years = [...new Set(calMonths.map((m) => m.year))];
    return getHolidaysForRange(years);
  }, [calMonths]);

  const fetchData = useCallback(async () => {
    const [evtRes, staffRes, hmRes, hvlRes] = await Promise.all([
      supabase.from("events").select("id, name, venue, store_name, prefecture, start_date, end_date, status").order("start_date"),
      supabase.from("event_staff").select("id, event_id, employee_id, start_date, end_date, role, hotel_name, transport_outbound_status, transport_return_status, employees(name)"),
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
    const hotelOk = staff.every((s) => s.hotel_name);
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
        <div className="flex gap-2 print:hidden">
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
        <Select value={String(calSpan)} onValueChange={(v) => setCalSpan(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">3ヶ月</SelectItem>
            <SelectItem value="6">6ヶ月</SelectItem>
            <SelectItem value="12">12ヶ月</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ガントチャート */}
      <div ref={chartRef} className="space-y-4 overflow-x-auto print:overflow-visible">
        {calMonths.map((cm) => {
          const daysInMonth = new Date(cm.year, cm.month, 0).getDate();
          const trackMap = assignTracks(filtered, cm.year, cm.month);
          const maxTrack = trackMap.size > 0 ? Math.max(...Array.from(trackMap.values())) : 0;
          const trackCount = Math.max(maxTrack + 1, 1);

          const monthStart = `${cm.year}-${String(cm.month).padStart(2, "0")}-01`;
          const monthEnd = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
          const monthEvents = filtered.filter((e) => e.start_date <= monthEnd && e.end_date >= monthStart);

          return (
            <Card key={`${cm.year}-${cm.month}`} className="overflow-hidden">
              <CardContent className="p-0 overflow-x-auto">
                <div className="min-w-[900px]">
                  {/* 日付ヘッダー */}
                  <div className="flex border-b bg-white">
                    <div className="w-12 shrink-0 border-r flex items-center justify-center text-base font-black py-1.5 bg-sky-50">
                      <span className="text-sky-700">{cm.month}<span className="text-xs">月</span></span>
                    </div>
                    <div className="flex-1 flex">
                      {Array.from({ length: 31 }, (_, i) => {
                        const day = i + 1;
                        if (day > daysInMonth) return <div key={day} className="flex-1 bg-muted/10" />;
                        const date = new Date(cm.year, cm.month - 1, day);
                        const dow = date.getDay();
                        const dateStr = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const isHoliday = holidays.has(dateStr);
                        const isRed = dow === 0 || isHoliday;
                        const isToday = date.toDateString() === today.toDateString();
                        return (
                          <div key={day} className={`flex-1 text-center border-r ${isToday ? "bg-primary/10" : isRed ? "bg-red-50/50" : dow === 6 ? "bg-blue-50/50" : ""}`}>
                            <div className="text-[10px] font-medium leading-tight pt-0.5">{day}</div>
                            <div className={`text-[9px] leading-tight pb-0.5 ${isRed ? "text-red-500 font-bold" : dow === 6 ? "text-blue-500" : "text-muted-foreground"}`}>
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
                      <div key={trackIdx} className={`flex border-b last:border-b-0 ${trackIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`} style={{ minHeight: 54 }}>
                        <div className="w-12 shrink-0 border-r flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                          {TRACK_LABELS[trackIdx] || ""}
                        </div>
                        <div className="flex-1 relative">
                          {/* 背景グリッド */}
                          <div className="absolute inset-0 flex">
                            {Array.from({ length: 31 }, (_, i) => {
                              const day = i + 1;
                              if (day > daysInMonth) return <div key={day} className="flex-1" />;
                              const date = new Date(cm.year, cm.month - 1, day);
                              const dow = date.getDay();
                              const dateStr = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const isHoliday = holidays.has(dateStr);
                              const isRed = dow === 0 || isHoliday;
                              const isToday = date.toDateString() === today.toDateString();
                              return (
                                <div key={day} className={`flex-1 border-r last:border-r-0 ${isToday ? "bg-primary/5" : isRed ? "bg-red-50/50" : dow === 6 ? "bg-blue-50/50" : ""}`} />
                              );
                            })}
                          </div>

                        {/* 催事バー */}
                        {trackEvents.map((evt) => {
                          const label = evt.store_name ? `${evt.venue} ${evt.store_name}` : evt.venue;
                          const barColor = trackBarColors[trackIdx % trackBarColors.length];
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

                          const status = getHotelTransportStatus(evt);
                          const isSelected = selectedEvent?.id === evt.id;
                          const icons = [
                            { label: "ホテル", ok: status.hotel === "設定済", na: status.hotel === "未登録" },
                            { label: "交通", ok: status.transport === "設定済", na: status.transport === "未登録" },
                          ];

                          return (
                            <Tooltip key={evt.id}>
                              <TooltipTrigger
                                render={
                                  <div
                                    className={`absolute top-0.5 rounded border text-sm leading-snug px-1.5 overflow-hidden hover:opacity-80 transition-opacity z-[1] cursor-pointer ${barColor} ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""} ${status.hasIncomplete ? "border-orange-400 border-2" : ""}`}
                                    style={{ left: `${left}%`, width: `${width}%`, height: 50 }}
                                    onClick={() => selectEvent(evt)}
                                  >
                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                      <span className="truncate font-bold">{label}</span>
                                      <span className="flex gap-0.5 ml-auto shrink-0">
                                        {icons.map((ic) => (
                                          <span key={ic.label} className={`inline-block text-[11px] leading-none px-1 py-0.5 rounded font-bold ${ic.na ? "bg-gray-200 text-gray-500" : ic.ok ? "bg-green-600 text-white" : "bg-red-500 text-white"}`}>
                                            {ic.label}{ic.na ? "" : ic.ok ? "✓" : "✗"}
                                          </span>
                                        ))}
                                      </span>
                                    </div>
                                    <div className="truncate text-xs text-black/70 mt-0.5">
                                      {allStaff.filter((s) => s.event_id === evt.id).map((s) => s.employees?.name || "").filter(Boolean).join(", ") || "社員未配置"}
                                    </div>
                                  </div>
                                }
                              />
                              <TooltipContent side="bottom">
                                <div className="space-y-0.5">
                                  <div className="font-medium">{evt.name}</div>
                                  <div>{label}（{evt.prefecture}）</div>
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
              </CardContent>
            </Card>
          );
        })}
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
                          <Input
                            value={s.hotel_name || ""}
                            onChange={(e) => setPanelStaff((prev) => prev.map((ps) => ps.id === s.id ? { ...ps, hotel_name: e.target.value } : ps))}
                            onBlur={(e) => updateStaffField(s.id, "hotel_name", e.target.value || null)}
                            placeholder="ホテル名を入力"
                            className={`h-8 text-sm ${saving === s.id ? "opacity-50" : ""}`}
                          />
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
                        <span className="text-sm">{s.hotel_name || "—"}</span>
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
