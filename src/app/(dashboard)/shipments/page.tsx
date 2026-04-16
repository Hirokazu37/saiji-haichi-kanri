"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Printer, ImageDown, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { getHolidaysForRange } from "@/lib/holidays";

type EventRecord = {
  id: string;
  name: string;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
};

type ShipmentRecord = {
  id: string;
  event_id: string;
  item_name: string;
  recipient_name: string;
  ship_date: string;
  shipment_status: string | null;
};

type VenueOption = { label: string };

export default function ShipmentsPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [pastVenues, setPastVenues] = useState<VenueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEvent, setDialogEvent] = useState<EventRecord | null>(null);
  const [selectedDests, setSelectedDests] = useState<Map<string, "send" | "return">>(new Map());
  const [saving, setSaving] = useState(false);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthSpan, setMonthSpan] = useState(2);

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

    const [evtRes, shipRes, venueRes] = await Promise.all([
      supabase.from("events").select("id, name, venue, store_name, start_date, end_date, status")
        .gte("end_date", startOfRange).lte("start_date", endOfRange).order("start_date"),
      supabase.from("shipments").select("id, event_id, item_name, recipient_name, ship_date, shipment_status"),
      supabase.from("events").select("venue, store_name").order("created_at", { ascending: false }).limit(100),
    ]);
    setEvents(evtRes.data || []);
    setShipments(shipRes.data || []);

    const seen = new Set<string>();
    const venues: VenueOption[] = [];
    (venueRes.data || []).forEach((e: { venue: string; store_name: string | null }) => {
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (!seen.has(label)) { seen.add(label); venues.push({ label }); }
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
    return { left: `${(startIdx / totalDays) * 100}%`, width: `${(Math.max(endIdx - startIdx + 1, 1) / totalDays) * 100}%` };
  };

  // --- ダイアログ ---
  const openDialog = (evt: EventRecord) => {
    setDialogEvent(evt);
    // 既存のshipmentをプリセット
    const existing = new Map<string, "send" | "return">();
    shipments.filter((s) => s.event_id === evt.id).forEach((s) => {
      existing.set(s.recipient_name, s.item_name === "返送備品" ? "return" : "send");
    });
    setSelectedDests(existing);
    setDialogOpen(true);
  };

  const toggleDest = (label: string, type: "send" | "return") => {
    setSelectedDests((prev) => {
      const next = new Map(prev);
      if (next.has(label)) { next.delete(label); } else { next.set(label, type); }
      return next;
    });
  };

  const handleSave = async () => {
    if (!dialogEvent) return;
    setSaving(true);

    // 既存を削除して全入れ替え
    await supabase.from("shipments").delete().eq("event_id", dialogEvent.id);

    if (selectedDests.size > 0) {
      const rows = Array.from(selectedDests.entries()).map(([name, type]) => ({
        event_id: dialogEvent.id,
        item_name: type === "return" ? "返送備品" : "備品一式",
        recipient_name: name,
        recipient_address: "",
        ship_date: dialogEvent.start_date,
        shipment_status: "未発送",
      }));
      await supabase.from("shipments").insert(rows);
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const getDestinations = (evt: EventRecord) => {
    const venueLabel = evt.store_name ? `${evt.venue} ${evt.store_name}` : evt.venue;
    const dests: { label: string; type: "send" | "return" }[] = [
      { label: venueLabel, type: "send" },
      { label: "本社（安岡蒲鉾）", type: "return" },
      ...pastVenues.filter((v) => v.label !== venueLabel).map((v) => ({ label: v.label, type: "send" as const })),
    ];
    return dests;
  };

  const handlePrint = () => { window.print(); };
  const handleSaveJpg = async () => {
    if (!tableRef.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(tableRef.current, { scale: 2, useCORS: true, scrollX: 0, scrollY: -window.scrollY });
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.save(); ctx.globalAlpha = 0.08; ctx.font = `bold ${Math.floor(canvas.height / 4)}px sans-serif`; ctx.fillStyle = "#000"; ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(-Math.PI / 6); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("社外秘", 0, 0); ctx.restore(); }
    const link = document.createElement("a");
    link.download = `備品転送_${year}年${month}月.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.95);
    link.click();
  };

  const monthLabel = monthSpan === 1 ? `${year}年 ${month}月` : `${year}年 ${month}月 〜 ${monthRange[monthRange.length - 1].year}年 ${monthRange[monthRange.length - 1].month}月`;

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: landscape; margin: 10mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">備品転送</h1>
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
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground print:hidden">※ 左の催事名をクリックして備品転送先を設定できます</p>

      <div ref={tableRef}>
        <div className="hidden print:block text-center mb-3">
          <h2 className="text-lg font-bold">備品転送</h2>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>

        <TooltipProvider>
          <Card>
            <CardContent className="p-0 overflow-x-auto print:overflow-visible">
              <div>
                {monthSpan > 1 && (
                  <div className="flex border-b">
                    <div className="w-40 shrink-0 border-r" />
                    <div className="flex-1 flex">
                      {monthRange.map((m) => (
                        <div key={`${m.year}-${m.month}`} className="text-center text-xs font-bold py-1 border-r last:border-r-0 bg-muted/50" style={{ width: `${(m.days / totalDays) * 100}%` }}>
                          {m.year}年{m.month}月
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex border-b sticky top-0 bg-background z-10">
                  <div className="w-40 shrink-0 p-2 border-r font-medium text-sm">催事</div>
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

                {events.map((evt, evtIdx) => {
                  const eventBarPos = getBarPosition(evt.start_date, evt.end_date);
                  const venueLabel = evt.store_name ? `${evt.venue} ${evt.store_name}` : evt.venue;
                  const evtShipments = shipments.filter((s) => s.event_id === evt.id);

                  return (
                    <div key={evt.id} className={`flex border-b last:border-b-0 ${evtIdx % 2 === 1 ? "bg-muted/20" : ""}`} style={{ minHeight: evtShipments.length > 0 ? 52 : 40 }}>
                      <div
                        className="w-40 shrink-0 p-1.5 border-r text-xs font-medium cursor-pointer hover:bg-muted/50 transition-colors print:cursor-default"
                        onClick={() => openDialog(evt)}
                      >
                        <div className="flex items-center gap-1">
                          <div className="font-bold truncate flex-1">{venueLabel}</div>
                          {evtShipments.length > 0 ? (
                            <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
                          )}
                        </div>
                        {evtShipments.length > 0 ? (
                          <div className="mt-0.5 space-y-0">
                            {evtShipments.map((s) => (
                              <div key={s.id} className={`text-[9px] leading-tight truncate ${s.item_name === "返送備品" ? "text-orange-600" : "text-blue-600"}`}>
                                {s.item_name === "返送備品" ? "← " : "→ "}{s.recipient_name}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[9px] text-muted-foreground mt-0.5">未設定</div>
                        )}
                      </div>
                      <div className="flex-1 relative">
                        <div className="absolute inset-0 flex">
                          {allDays.map((d, i) => {
                            const red = isRedDay(d.date, d.dateStr);
                            const sat = isSaturday(d.date);
                            return (<div key={i} className={`flex-1 border-r last:border-r-0 ${isToday(d.date) ? "bg-primary/5" : ""} ${red ? "bg-red-50/30" : sat ? "bg-blue-50/30" : ""}`} />);
                          })}
                        </div>
                        {todayIndex >= 0 && (<div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-[5] pointer-events-none" style={{ left: `${((todayIndex + 0.5) / totalDays) * 100}%` }} />)}

                        {eventBarPos && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <div
                                  className="absolute rounded bg-gray-200 border border-gray-400 text-[10px] leading-tight px-1 flex items-center overflow-hidden whitespace-nowrap z-[1] cursor-pointer hover:opacity-80"
                                  style={{ left: eventBarPos.left, width: eventBarPos.width, top: 8, height: 22 }}
                                  onClick={() => openDialog(evt)}
                                >
                                  {venueLabel}
                                </div>
                              }
                            />
                            <TooltipContent side="bottom">
                              <div className="space-y-0.5">
                                <div className="font-medium">{evt.name}</div>
                                <div>{venueLabel}</div>
                                <div className="text-muted-foreground">{evt.start_date} 〜 {evt.end_date}</div>
                                <div>{evtShipments.length > 0 ? `備品転送: ${evtShipments.length}件登録済み` : "備品転送: 未登録 — クリックで設定"}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  );
                })}

                {events.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">この期間に催事がありません。</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TooltipProvider>
      </div>

      {/* 備品転送登録ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>備品転送の設定</DialogTitle>
          </DialogHeader>
          {dialogEvent && (
            <div className="space-y-4">
              <div className="text-sm">
                <span className="font-medium">{dialogEvent.venue}{dialogEvent.store_name ? ` ${dialogEvent.store_name}` : ""}</span>
                <span className="text-muted-foreground ml-2">{dialogEvent.name}</span>
                <div className="text-muted-foreground text-xs mt-0.5">{dialogEvent.start_date} 〜 {dialogEvent.end_date}</div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">転送先を選択（複数可）</p>
                <div className="flex flex-wrap gap-2">
                  {getDestinations(dialogEvent).map((dest) => {
                    const isSelected = selectedDests.has(dest.label);
                    return (
                      <Badge
                        key={dest.label}
                        variant={isSelected ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleDest(dest.label, dest.type)}
                      >
                        {dest.type === "return" ? "← " : "→ "}{dest.label}
                      </Badge>
                    );
                  })}
                </div>
                {selectedDests.size > 0 && (
                  <div className="text-xs text-muted-foreground pt-1">
                    {selectedDests.size}件選択中
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">キャンセル</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
