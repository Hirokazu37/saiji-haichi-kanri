"use client";

import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from "react";
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
import { Plus, MapPin, Calendar, Printer, ImageDown, ChevronLeft, ChevronRight, LayoutGrid, CalendarDays, CalendarRange, X, Package, Users, Clock, UserCheck } from "lucide-react";
import Link from "next/link";
import { areaMap, areaNames } from "@/lib/areas";
import { getHolidaysForRange } from "@/lib/holidays";
import { usePermission } from "@/hooks/usePermission";

type VenueOption = { label: string };
type MannequinSummary = { event_id: string; arrangement_status: string | null };
type StaffWithArrangement = {
  id: string;
  event_id: string;
  person_type: "employee" | "mannequin" | null;
  employee_id: string | null;
  mannequin_person_id: string | null;
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
  mannequin_people: { name: string } | null;
};

type Event = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  prefecture: string;
  start_date: string;
  end_date: string;
  last_day_closing_time: string | null;
  person_in_charge: string | null;
  status: string;
  application_status: string | null;
  application_submitted_date: string | null;
  application_method: string | null;
  dm_status: string | null;
  dm_count: number | null;
  equipment_from: string | null;
  equipment_to: string | null;
  notes: string | null;
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

/** ローカル日付を YYYY-MM-DD に（タイムゾーンずれ回避） */
function fmtLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 指定週内の催事をレーンに割り当てる（日曜始まり） */
function assignWeekLanes(
  evts: Event[],
  weekStart: Date,
  weekEnd: Date
): { event: Event; laneIdx: number; startDay: number; endDay: number }[] {
  const ws = fmtLocalYmd(weekStart);
  const we = fmtLocalYmd(weekEnd);
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
    result.push({
      event: evt,
      laneIdx: lane,
      startDay: effStart.getDay(),
      endDay: effEnd.getDay(),
    });
  }
  return result;
}

/** 月のカレンダー週構造を返す（日曜始まり） */
function getCalendarWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month - 1, 1);
  const dim = new Date(year, month, 0).getDate();
  const firstDow = firstDay.getDay(); // 0=Sun
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
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [filterPrefecture, setFilterPrefecture] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // 終了した催事もカレンダー・一覧に残す運用（ユーザー要望: 過去を隠さない）
  const [showPast] = useState(true);
  const [viewMode, setViewMode] = useState<"gantt" | "calendar" | "card">("gantt");
  const [showArrangementIcons, setShowArrangementIcons] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // モバイル幅(768px未満)は初期表示をカードビューに切り替える
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setViewMode("card");
    }
  }, []);

  // 手配データ
  const [allStaff, setAllStaff] = useState<StaffWithArrangement[]>([]);
  const [mannequinSummaries, setMannequinSummaries] = useState<MannequinSummary[]>([]);
  const [pastVenues, setPastVenues] = useState<VenueOption[]>([]);
  const [hotelMasters, setHotelMasters] = useState<{ id: string; name: string }[]>([]);
  const [hotelVenueLinks, setHotelVenueLinks] = useState<{ hotel_id: string; venue_name: string }[]>([]);
  // 百貨店マスターのフリガナ（検索で「たかしまや」→「高島屋」を拾うため）
  const [venueReadings, setVenueReadings] = useState<Map<string, string>>(new Map());

  // 全手配ダイアログ
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEvent, setDialogEvent] = useState<Event | null>(null);
  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogStaff, setDialogStaff] = useState<StaffWithArrangement[]>([]);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [calSpan, setCalSpan] = useState(6);
  // ガント専用: "half-3" | "1" | "3" | "6" | "12"
  //   half-3   : 3ヶ月分を各月前半/後半の2段に分割（1月=1カード内に2行）
  //   1/3/6/12 : 1ヶ月1カードで月数分表示
  const [ganttSpanSel, setGanttSpanSel] = useState<string>("6");

  // 印刷設定（向き / 1ページの月数）
  // 向きごとのおすすめ月数: 縦=4ヶ月、横=3ヶ月
  const recommendedMpp = (o: "landscape" | "portrait") => (o === "portrait" ? 4 : 3);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printOpts, setPrintOpts] = useState({
    orientation: "portrait" as "landscape" | "portrait",
    monthsPerPage: 4,
  });

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

  // ガント用の表示ブロック（各ブロック = 1カード）
  // { year, month, dayStart, dayEnd, halfLabel? }
  const ganttBlocks = useMemo(() => {
    type Block = { year: number; month: number; dayStart: number; dayEnd: number; halfLabel?: "前半" | "後半" };
    const blocks: Block[] = [];
    const pushMonthFull = (y: number, m: number) => {
      blocks.push({ year: y, month: m, dayStart: 1, dayEnd: 31 });
    };
    const pushMonthHalves = (y: number, m: number) => {
      blocks.push({ year: y, month: m, dayStart: 1, dayEnd: 15, halfLabel: "前半" });
      blocks.push({ year: y, month: m, dayStart: 16, dayEnd: 31, halfLabel: "後半" });
    };
    const nextYM = (i: number) => {
      let m = calMonth + i, y = calYear;
      while (m > 12) { m -= 12; y++; }
      return { y, m };
    };
    if (ganttSpanSel === "half-3") {
      for (let i = 0; i < 3; i++) {
        const { y, m } = nextYM(i);
        pushMonthHalves(y, m);
      }
    } else {
      const months = parseInt(ganttSpanSel) || 1;
      for (let i = 0; i < months; i++) {
        const { y, m } = nextYM(i);
        pushMonthFull(y, m);
      }
    }
    return blocks;
  }, [calYear, calMonth, ganttSpanSel]);

  // 同じ月(year+month)の連続ブロックを1つのカードにまとめる
  const ganttCardGroups = useMemo(() => {
    type Block = typeof ganttBlocks[number];
    const groups: Block[][] = [];
    for (const b of ganttBlocks) {
      const last = groups[groups.length - 1];
      if (last && last[0].year === b.year && last[0].month === b.month) {
        last.push(b);
      } else {
        groups.push([b]);
      }
    }
    return groups;
  }, [ganttBlocks]);

  const holidays = useMemo(() => {
    const years = [...new Set(calMonths.map((m) => m.year))];
    return getHolidaysForRange(years);
  }, [calMonths]);

  const handleOpenPrintDialog = () => {
    // 開くたびに現在の向きに合わせておすすめ値にリセット
    setPrintOpts((p) => ({ ...p, monthsPerPage: recommendedMpp(p.orientation) }));
    setPrintDialogOpen(true);
  };
  const handleDoPrint = () => {
    setPrintDialogOpen(false);
    // DialogのcloseアニメをやめてからprintしないとUIが残ったまま映る
    setTimeout(() => window.print(), 150);
  };
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
    const [evtRes, staffRes, mannRes, venueRes, hmRes, hvlRes, vmRes] = await Promise.all([
      supabase.from("events").select("*").order("start_date", { ascending: true }),
      supabase.from("event_staff").select("id, event_id, person_type, employee_id, mannequin_person_id, start_date, end_date, role, hotel_name, hotel_check_in, hotel_check_out, hotel_status, transport_type, transport_from, transport_to, transport_status, transport_outbound_status, transport_return_status, employees(name), mannequin_people(name)"),
      supabase.from("mannequins").select("event_id, arrangement_status"),
      supabase.from("events").select("venue, store_name").order("created_at", { ascending: false }).limit(100),
      supabase.from("hotel_master").select("id, name").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("hotel_id, venue_name"),
      supabase.from("venue_master").select("venue_name, store_name, reading"),
    ]);
    setEvents(evtRes.data || []);
    setAllStaff((staffRes.data || []) as unknown as StaffWithArrangement[]);
    setMannequinSummaries((mannRes.data || []) as MannequinSummary[]);
    setHotelMasters((hmRes.data || []) as { id: string; name: string }[]);
    setHotelVenueLinks((hvlRes.data || []) as { hotel_id: string; venue_name: string }[]);
    // reading マップ: 「venue_name」「venue_name store_name」「store_name」で引けるようにする
    const rmap = new Map<string, string>();
    for (const v of (vmRes.data || []) as { venue_name: string; store_name: string | null; reading: string | null }[]) {
      if (!v.reading) continue;
      rmap.set(v.venue_name, v.reading);
      if (v.store_name) rmap.set(`${v.venue_name} ${v.store_name}`, v.reading);
    }
    setVenueReadings(rmap);
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

  const todayIsoStr = fmtLocalYmd(new Date());
  // カタカナをひらがなへ揃えて比較（ひらがな/カタカナどちらで入力しても当たるように）
  const toHiragana = (s: string) =>
    s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const normalize = (s: string) => toHiragana(s).toLowerCase();
  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = normalize(trimmedQuery);

  const filtered = events.filter((e) => {
    if (!showPast && e.end_date < todayIsoStr) return false;
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (filterRegion !== "all") {
      const regionPrefs = areaMap[filterRegion];
      if (!regionPrefs || !regionPrefs.includes(e.prefecture)) return false;
    }
    if (filterPrefecture !== "all" && e.prefecture !== filterPrefecture) return false;
    if (trimmedQuery) {
      const venueLabel = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      const reading =
        venueReadings.get(venueLabel) ||
        venueReadings.get(e.venue) ||
        "";
      const haystack = [
        e.name ?? "",
        e.venue,
        e.store_name ?? "",
        e.prefecture,
        e.person_in_charge ?? "",
        reading,
      ].join(" ");
      if (!normalize(haystack).includes(normalizedQuery)) return false;
    }
    return true;
  });

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

    // ホテルは hotel_status が「手配済」 OR ホテル名が入っていれば OK（空欄でも手配済にできる）
    const hotelArranged = (s: StaffWithArrangement) => s.hotel_status === "手配済" || !!s.hotel_name;
    const hotelCount = staff.filter(hotelArranged).length;
    const hotelOk = staff.length > 0 && staff.every(hotelArranged);
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
    setEvents((prev) => prev.map((ev) => ev.id === dialogEvent.id ? { ...ev, [field]: value } as Event : ev));
  };

  const updateDmCount = async (count: number | null) => {
    if (!dialogEvent) return;
    await supabase.from("events").update({ dm_count: count }).eq("id", dialogEvent.id);
    setEvents((prev) => prev.map((ev) => ev.id === dialogEvent.id ? { ...ev, dm_count: count } : ev));
  };

  const handleDialogSave = async () => {
    if (!dialogEvent) return;
    setDialogSaving(true);

    // 備品の流れ（equipment_from/toはupdateEventFieldで即時保存済み）

    // 社員ごとのホテル・交通を更新
    for (const s of dialogStaff) {
      await supabase.from("event_staff").update({
        hotel_name: s.hotel_name || null,
        hotel_status: s.hotel_status || "未手配",
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

  const ganttSpanLabel = (() => {
    if (ganttBlocks.length === 0) return `${calYear}年 ${calMonth}月`;
    const last = ganttBlocks[ganttBlocks.length - 1];
    if (ganttBlocks.length === 1 && !ganttBlocks[0].halfLabel) return `${calYear}年 ${calMonth}月`;
    if (ganttSpanSel === "half-3") return `${calYear}年 ${calMonth}月 〜 ${last.year}年 ${last.month}月（半月2段）`;
    return `${calYear}年 ${calMonth}月 〜 ${last.year}年 ${last.month}月`;
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold print:hidden">日程表</h1>
        <div className="flex gap-2 items-center">
          <div className="flex border rounded-md print:hidden">
            <Button variant={viewMode === "gantt" ? "default" : "ghost"} size="sm" className="rounded-r-none" onClick={() => setViewMode("gantt")} title="ガントチャート">
              <CalendarRange className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "calendar" ? "default" : "ghost"} size="sm" className="rounded-none border-x" onClick={() => setViewMode("calendar")} title="カレンダー">
              <CalendarDays className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "card" ? "default" : "ghost"} size="sm" className="rounded-l-none" onClick={() => setViewMode("card")} title="カード">
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleOpenPrintDialog} className="print:hidden"><Printer className="h-4 w-4 mr-1" />印刷</Button>
          <Button variant="outline" size="sm" onClick={handleSaveJpg} className="print:hidden"><ImageDown className="h-4 w-4 mr-1" />JPG保存</Button>
          {canEdit && (
            <Link href="/events/new" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 print:hidden">
              <Plus className="h-4 w-4" />新規作成
            </Link>
          )}
        </div>
      </div>

      {/* 検索・地方フィルタ */}
      <div className="flex gap-2 flex-wrap print:hidden items-center">
        <div className="relative">
          <Input
            type="search"
            placeholder="催事名・百貨店・担当者（ひらがなOK）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-60 h-9 pr-8"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="検索をクリア"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* 地方・都道府県を1つのSelectに統合。先頭に地方、インデントで都道府県を並べる */}
        <Select
          value={
            filterPrefecture !== "all"
              ? `pref:${filterPrefecture}`
              : filterRegion !== "all"
                ? `region:${filterRegion}`
                : "all"
          }
          onValueChange={(v) => {
            if (v === "all") {
              setFilterRegion("all");
              setFilterPrefecture("all");
            } else if (v.startsWith("region:")) {
              setFilterRegion(v.slice(7));
              setFilterPrefecture("all");
            } else if (v.startsWith("pref:")) {
              const pref = v.slice(5);
              setFilterPrefecture(pref);
              const region = areaNames.find((a) => areaMap[a].includes(pref));
              setFilterRegion(region ?? "all");
            }
          }}
        >
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="地域で絞り込み" />
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            <SelectItem value="all">すべての地域</SelectItem>
            {areaNames.map((a) => (
              <Fragment key={a}>
                <SelectItem value={`region:${a}`} className="font-semibold">
                  {a}（全県）
                </SelectItem>
                {areaMap[a].map((p) => (
                  <SelectItem key={p} value={`pref:${p}`} className="pl-8 text-muted-foreground">
                    {p}
                  </SelectItem>
                ))}
              </Fragment>
            ))}
          </SelectContent>
        </Select>
        {(searchQuery || filterRegion !== "all" || filterPrefecture !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearchQuery(""); setFilterRegion("all"); setFilterPrefecture("all"); }}
            className="text-xs"
          >
            条件クリア
          </Button>
        )}
      </div>

      {/* ステータスフィルタ（「すべて」「開催中」「終了」のみに簡素化） */}
      <div className="flex gap-2 flex-wrap print:hidden items-center">
        <Button variant={filterStatus === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterStatus("all")}>すべて</Button>
        {(["開催中", "終了"] as const).map((s) => (
          <Button key={s} variant={filterStatus === s ? "default" : "outline"} size="sm" onClick={() => setFilterStatus(s)}>{s}</Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/archive" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            履歴ページ →
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">読み込み中...</p>
      ) : viewMode === "gantt" ? (
        /* ===== ガントチャート日程表 ===== */
        <>
        <div className="flex items-center gap-2 sm:gap-3 mb-4 flex-wrap print:hidden">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-base sm:text-lg font-semibold min-w-[180px] sm:min-w-[240px] text-center">{ganttSpanLabel}</span>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth() + 1); }}>今月</Button>
          <Select value={ganttSpanSel} onValueChange={(v) => v && setGanttSpanSel(v)}>
            <SelectTrigger className="w-32 sm:w-36"><SelectValue>{
              ganttSpanSel === "half-3" ? "半月×3ヶ月" : `${ganttSpanSel}ヶ月`
            }</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="half-3">半月×3ヶ月</SelectItem>
              <SelectItem value="1">1ヶ月</SelectItem>
              <SelectItem value="3">3ヶ月</SelectItem>
              <SelectItem value="6">6ヶ月</SelectItem>
              <SelectItem value="12">12ヶ月</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={showArrangementIcons ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArrangementIcons((v) => !v)}
            title="手配アイコンの表示/非表示を切替"
          >
            手配アイコン: {showArrangementIcons ? "ON" : "OFF"}
          </Button>
        </div>

        <div ref={listRef} className="events-print-zone" data-mpp={printOpts.monthsPerPage}>
          {/* 印刷用タイトル（1行にまとめて省スペース化） */}
          <div className="hidden print:flex items-baseline justify-between gap-2 mb-1 border-b pb-0.5">
            <h2 className="text-sm font-bold">日程表　{ganttSpanLabel}</h2>
            <p className="text-[10px] text-muted-foreground">印刷日時 {new Date().toLocaleString("ja-JP")}</p>
          </div>

          <style>{`
            @media print {
              @page { size: A4 ${printOpts.orientation}; margin: 8mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; }
              nav, aside, header, footer { display: none !important; }
              main, [data-slot="main"] { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
              .md\\:pl-60 { padding-left: 0 !important; }
              .print\\:overflow-visible { overflow: visible !important; }

              /* ===== 1ページ強制 + 行数比例レイアウト ===== */
              /* ページ区切りは使わない（全部1ページ強制） */
              .events-page-break { page-break-before: auto !important; break-before: auto !important; }

              /* カード一覧コンテナを flex-col にして縦に並べる */
              .events-cards-container {
                display: flex !important;
                flex-direction: column !important;
                min-height: calc(100vh - 14mm);
                gap: 2mm !important;
              }
              /* 各月カード: --ratio (行数) に比例して高さを取る */
              .events-cards-container > [data-slot="card"] {
                flex: var(--ratio, 1) 1 0 !important;
                min-height: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden;
              }
              .events-cards-container > [data-slot="card"] > [data-slot="card-content"] {
                flex: 1 !important;
                min-height: 0 !important;
                display: flex;
                flex-direction: column;
              }
              .events-cards-container > [data-slot="card"] > [data-slot="card-content"] > div {
                flex: 1 !important;
                min-height: 0 !important;
                display: flex;
                flex-direction: column;
                min-width: 0 !important;
              }
              .events-cards-container > [data-slot="card"] > [data-slot="card-content"] > div > div {
                flex: 1 !important;
                min-height: 0 !important;
                display: flex;
                flex-direction: column;
              }
              /* 日付ヘッダは自然高さ、トラック行は flex:1 で均等割付け */
              .events-day-header { flex: 0 0 auto !important; }
              .events-track-row {
                flex: 1 1 0 !important;
                min-height: 0 !important;
              }
            }
          `}</style>

          <TooltipProvider>
            <div className="space-y-4 events-cards-container">
              {ganttCardGroups.map((group, gIdx) => {
                const firstBlock = group[0];
                const cardKey = `${firstBlock.year}-${firstBlock.month}`;
                // この月の実トラック数（ABCDE…の数）を計算して flex 比率に使う
                const cardRatio = group.reduce((sum, cm) => {
                  const tm = assignTracks(filtered, cm.year, cm.month);
                  const mt = tm.size > 0 ? Math.max(...Array.from(tm.values())) + 1 : 1;
                  return sum + mt;
                }, 0);
                return (
                  <Card
                    key={cardKey}
                    className={`overflow-hidden ${gIdx > 0 && gIdx % printOpts.monthsPerPage === 0 ? "events-page-break" : ""}`}
                    style={{ ["--ratio" as string]: String(cardRatio) }}
                  >
                    <CardContent className="p-0 overflow-x-auto print:overflow-visible [touch-action:pan-x_pan-y_pinch-zoom]">
                      <div className="min-w-[600px]">
                        {group.map((cm, subIdx) => {
                          const daysInMonth = new Date(cm.year, cm.month, 0).getDate();
                          const dayStart = cm.dayStart;
                          const dayEnd = cm.dayEnd;
                          const cellCount = dayEnd - dayStart + 1;
                          const rangeStart = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(dayStart).padStart(2, "0")}`;
                          const rangeEnd = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(dayEnd).padStart(2, "0")}`;

                          const trackMap = assignTracks(filtered, cm.year, cm.month);
                          const maxTrack = trackMap.size > 0 ? Math.max(...Array.from(trackMap.values())) : -1;
                          const trackCount = Math.max(maxTrack + 1, 1);

                          // 表示範囲にかかる催事
                          const monthEvents = filtered.filter((e) => e.start_date <= rangeEnd && e.end_date >= rangeStart);
                          const isFirstSub = subIdx === 0;
                          return (
                            <div key={`${cm.halfLabel || "full"}`} className={subIdx > 0 ? "border-t-2 border-sky-200" : ""}>
                        {/* 月タイトル */}
                        <div className="events-day-header flex border-b bg-white">
                          <div className="w-14 shrink-0 border-r flex flex-col items-center justify-center py-1.5 bg-sky-50">
                            {isFirstSub && <span className="text-sky-700 text-base font-black leading-none">{cm.month}<span className="text-xs">月</span></span>}
                            {cm.halfLabel && <span className={`text-[11px] text-sky-600 font-semibold leading-none ${isFirstSub ? "mt-0.5" : ""}`}>{cm.halfLabel}</span>}
                          </div>
                          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))` }}>
                            {Array.from({ length: cellCount }, (_, i) => {
                              const day = dayStart + i;
                              if (day > daysInMonth) {
                                return <div key={day} className="bg-muted/10" />;
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
                                  className={`text-center border-r ${isT ? "bg-primary/10" : isRed ? "bg-red-50/50" : isSat ? "bg-blue-50/50" : ""}`}
                                  title={holiday || undefined}
                                >
                                  <div className="text-[14px] font-bold leading-tight pt-1">{day}</div>
                                  <div className={`text-[11px] leading-tight pb-1 ${isRed ? "text-red-500 font-bold" : isSat ? "text-blue-500" : "text-muted-foreground"}`}>
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
                          const rowMinHeight = showArrangementIcons ? 76 : 44;
                          return (
                            <div key={trackIdx} className={`events-track-row flex border-b last:border-b-0 ${trackIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`} style={{ minHeight: rowMinHeight }}>
                              <div className="w-14 shrink-0 border-r flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                {TRACK_LABELS[trackIdx] || String(trackIdx + 1)}
                              </div>
                              <div className="flex-1 relative">
                                {/* 背景グリッド */}
                                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))` }}>
                                  {Array.from({ length: cellCount }, (_, i) => {
                                    const day = dayStart + i;
                                    if (day > daysInMonth) {
                                      return <div key={i} className="bg-muted/10" />;
                                    }
                                    const date = new Date(cm.year, cm.month - 1, day);
                                    const dateStr = `${cm.year}-${String(cm.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                    const isSun = date.getDay() === 0;
                                    const isSat = date.getDay() === 6;
                                    const isRed = isSun || !!holidays.has(dateStr);
                                    const isT = today.getFullYear() === cm.year && today.getMonth() + 1 === cm.month && today.getDate() === day;
                                    return (
                                      <div key={i} className={`border-r ${isT ? "bg-primary/5" : isRed ? "bg-red-50/30" : isSat ? "bg-blue-50/30" : ""}`} />
                                    );
                                  })}
                                </div>

                                {/* 催事バー */}
                                {trackEvents.map((evt) => {
                                  const label = evt.store_name ? `${evt.venue} ${evt.store_name}` : evt.venue;
                                  const barColor = trackBarColors[trackIdx % trackBarColors.length];

                                  // 表示範囲内でのバー位置計算（半月モード対応）
                                  const evtStart = new Date(evt.start_date);
                                  const evtEnd = new Date(evt.end_date);
                                  const mStart = new Date(cm.year, cm.month - 1, dayStart);
                                  const mEnd = new Date(cm.year, cm.month - 1, Math.min(dayEnd, daysInMonth));

                                  const effectiveStart = evtStart < mStart ? mStart : evtStart;
                                  const effectiveEnd = evtEnd > mEnd ? mEnd : evtEnd;

                                  const startDay = effectiveStart.getDate();
                                  const endDay = effectiveEnd.getDate();
                                  const left = ((startDay - dayStart) / cellCount) * 100;
                                  const width = ((endDay - startDay + 1) / cellCount) * 100;

                                  const arr = getArrangementStatus(evt);
                                  const icons = [
                                    { label: "申込", ok: arr.application === "提出済", na: false },
                                    { label: evt.dm_count ? `DM${evt.dm_count}枚` : "DM", ok: arr.dm === "印刷済み", na: arr.dm === null },
                                    { label: "ホテル", ok: arr.hotel === "設定済", na: arr.hotel === "未登録" },
                                    { label: "交通", ok: arr.transport === "設定済", na: arr.transport === "未登録" },
                                    { label: "マネキン", ok: arr.mannequin === "ok", na: arr.mannequin === "na" },
                                    { label: "備品", ok: arr.shipment === "設定済", na: false },
                                  ];
                                  const barHeight = showArrangementIcons ? 72 : 40;
                                  return (
                                    <Tooltip key={evt.id}>
                                      <TooltipTrigger
                                        render={
                                          <div
                                            className={`absolute top-0.5 rounded border text-[11px] leading-snug px-1 py-0.5 overflow-hidden hover:opacity-80 transition-opacity z-[1] cursor-pointer ${barColor}`}
                                            style={{
                                              left: `${left}%`,
                                              width: `${width}%`,
                                              height: barHeight,
                                            }}
                                            onClick={() => openDialog(evt)}
                                          >
                                            <div className="truncate font-semibold leading-tight text-[11px] mb-0.5">{label}</div>
                                            {showArrangementIcons ? (
                                              <>
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
                                              </>
                                            ) : (
                                              evt.person_in_charge && (
                                                <div className="truncate text-[10px] text-black/70 leading-tight">担当: {evt.person_in_charge}</div>
                                              )
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
      ) : viewMode === "calendar" ? (
        /* ===== カレンダービュー（月グリッド・日曜始まり） ===== */
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

        <div ref={listRef} className="space-y-6">
          <TooltipProvider>
            {calMonths.map((cm) => {
              const weeks = getCalendarWeeks(cm.year, cm.month);
              const weekDayNames = ["日", "月", "火", "水", "木", "金", "土"];
              // 月内全週の最大レーン数を算出して、行高を統一する
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
                          <div key={wd} className={`border-r border-b text-center text-xs font-bold py-1 ${i === 0 ? "text-red-600 bg-red-50/50" : i === 6 ? "text-blue-600 bg-blue-50/50" : "bg-muted/30"}`}>
                            {wd}
                          </div>
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
                                const isToday = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate();
                                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                                const isHoliday = holidays.has(dateStr);
                                const isSun = date.getDay() === 0;
                                const isSat = date.getDay() === 6;
                                const dayColor = !isCurrentMonth ? "text-muted-foreground/40" : isSun || isHoliday ? "text-red-600" : isSat ? "text-blue-600" : "";
                                return (
                                  <div
                                    key={dIdx}
                                    className={`border-r border-b ${isToday ? "bg-amber-50" : isCurrentMonth ? "" : "bg-muted/20"}`}
                                    style={{ height: rowHeight }}
                                  >
                                    <div className={`text-xs px-1 pt-0.5 font-medium ${dayColor}`}>
                                      {date.getDate()}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* イベントバー（週セルの上にオーバーレイ） */}
                            <div className="absolute inset-0 pointer-events-none">
                              {lanes.map(({ event, laneIdx, startDay, endDay }) => {
                                const spanDays = endDay - startDay + 1;
                                const label = event.store_name ? `${event.venue} ${event.store_name}` : event.venue;
                                const arr = getArrangementStatus(event);
                                return (
                                  <Tooltip key={`${event.id}-${wIdx}`}>
                                    <TooltipTrigger
                                      render={
                                        <div
                                          role="button"
                                          tabIndex={0}
                                          className={`absolute truncate text-[10px] font-medium px-1 py-0.5 rounded border cursor-pointer pointer-events-auto hover:opacity-80 ${
                                            event.status === "実施済" ? "bg-gray-100 border-gray-300 text-gray-600" :
                                            arr.application === "提出済" ? "bg-green-100 border-green-300 text-green-900" :
                                            "bg-blue-100 border-blue-300 text-blue-900"
                                          }`}
                                          style={{
                                            left: `calc(${(startDay / 7) * 100}% + 2px)`,
                                            width: `calc(${(spanDays / 7) * 100}% - 4px)`,
                                            top: `${22 + laneIdx * 20}px`,
                                          }}
                                          onClick={() => openDialog(event)}
                                          onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") openDialog(event); }}
                                        >
                                          {label}
                                        </div>
                                      }
                                    />
                                    <TooltipContent side="bottom">
                                      <div className="space-y-0.5">
                                        <div className="font-medium">{event.name || label}</div>
                                        {event.name && <div>{label}（{event.prefecture}）</div>}
                                        <div className="text-muted-foreground">{event.start_date} 〜 {event.end_date}</div>
                                        <div>申込書: {arr.application} / ホテル: {arr.hotel} / 交通: {arr.transport}</div>
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
          </TooltipProvider>
        </div>
        </>
      ) : (
        /* ===== カード表示 ===== */
        filtered.length === 0 ? (
          <p className="text-muted-foreground">
            {searchQuery || filterRegion !== "all" || filterPrefecture !== "all"
              ? "該当する催事が見つかりません。条件を変えてお試しください。"
              : filterStatus === "all"
                ? "催事がまだありません。「新規作成」から登録してください。"
                : `「${filterStatus}」の催事はありません。`}
          </p>
        ) : (
          <div ref={listRef} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((event) => {
              const arr = getArrangementStatus(event);
              type StatusKind = "ok" | "partial" | "ng" | "na";
              const classify = (label: string, v: string | null): { kind: StatusKind; text: string } => {
                if (label === "申込") return { kind: v === "提出済" ? "ok" : "ng", text: v === "提出済" ? "提出済" : "未提出" };
                if (label === "DM") return v === null ? { kind: "na", text: "なし" } : v === "印刷済み" ? { kind: "ok", text: "印刷済" } : { kind: "partial", text: v };
                if (label === "マネキン") return v === "na" ? { kind: "na", text: "不要" } : v === "ok" ? { kind: "ok", text: "手配済" } : { kind: "ng", text: "未手配" };
                // hotel / transport / shipment
                if (v === "設定済") return { kind: "ok", text: "設定済" };
                if (v === "一部未設定") return { kind: "partial", text: "一部" };
                if (v === "未登録") return { kind: "na", text: "未登録" };
                return { kind: "ng", text: "未設定" };
              };
              const rows: { label: string; status: { kind: StatusKind; text: string } }[] = [
                { label: "申込", status: classify("申込", arr.application) },
                { label: "DM", status: classify("DM", arr.dm) },
                { label: "ホテル", status: classify("ホテル", arr.hotel) },
                { label: "交通", status: classify("交通", arr.transport) },
                { label: "マネキン", status: classify("マネキン", arr.mannequin) },
                { label: "備品", status: classify("備品", arr.shipment) },
              ];
              const kindClass: Record<StatusKind, string> = {
                ok: "bg-green-100 text-green-800 border-green-200",
                partial: "bg-amber-100 text-amber-800 border-amber-200",
                ng: "bg-red-100 text-red-800 border-red-200",
                na: "bg-muted text-muted-foreground border-border",
              };
              return (
                <Link key={event.id} href={`/events/${event.id}`} className="block active:opacity-80 transition-opacity">
                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-tight">
                          {event.venue}{event.store_name ? ` ${event.store_name}` : ""}
                        </CardTitle>
                        <Badge variant="outline" className={`shrink-0 ${statusColor[event.status] || ""}`}>{event.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="space-y-1 text-muted-foreground">
                        <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{event.start_date} 〜 {event.end_date}</div>
                        <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.prefecture}{event.name ? `・${event.name}` : ""}</div>
                        {event.person_in_charge && <div>担当: {event.person_in_charge}</div>}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        {rows.map((r) => (
                          <div key={r.label} className={`text-[11px] rounded-md border px-1.5 py-1 text-center leading-tight ${kindClass[r.status.kind]}`}>
                            <div className="font-semibold">{r.label}</div>
                            <div className="font-medium">{r.status.text}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
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
            const manns = mannequinSummaries.filter((m) => m.event_id === dialogEvent.id);
            const mannArranged = manns.filter((m) => m.arrangement_status === "手配済").length;
            return (
              <div className="space-y-3">
                {/* 催事情報 */}
                <div className="text-sm border-b pb-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-base">{venueLabel}</span>
                    <Badge variant="outline" className={statusColor[dialogEvent.status] || ""}>{dialogEvent.status}</Badge>
                  </div>
                  {dialogEvent.name && <div className="text-muted-foreground">{dialogEvent.name}（{dialogEvent.prefecture}）</div>}
                  {!dialogEvent.name && <div className="text-muted-foreground">{dialogEvent.prefecture}</div>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{dialogEvent.start_date} 〜 {dialogEvent.end_date}</span>
                    {dialogEvent.last_day_closing_time && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />最終日閉場 {dialogEvent.last_day_closing_time}</span>}
                  </div>
                  {dialogEvent.person_in_charge && (
                    <div className="flex items-start gap-1 text-xs">
                      <Users className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <span><span className="text-muted-foreground">担当: </span>{dialogEvent.person_in_charge}</span>
                    </div>
                  )}
                  {dialogEvent.notes && (
                    <div className="text-xs bg-muted/30 rounded px-2 py-1 mt-1 whitespace-pre-wrap">
                      <span className="text-muted-foreground">備考: </span>{dialogEvent.notes}
                    </div>
                  )}
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
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className={`text-xs ${s.person_type === "mannequin" ? "bg-pink-600 hover:bg-pink-600" : ""}`}>{(s.person_type === "mannequin" ? s.mannequin_people?.name : s.employees?.name) || "不明"}{s.person_type === "mannequin" ? "(ﾏﾈｷﾝ)" : ""}</Badge>
                            <span className="text-[10px] text-muted-foreground">{s.start_date}〜{s.end_date}</span>
                          </div>
                          <button
                            type="button"
                            className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors shrink-0 ${s.hotel_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                            onClick={() => updateStaff("hotel_status", s.hotel_status === "手配済" ? "未手配" : "手配済")}
                          >
                            <span className={`absolute text-[9px] font-medium ${s.hotel_status === "手配済" ? "left-1.5 text-white" : "right-1.5 text-gray-600"}`}>
                              {s.hotel_status === "手配済" ? "手配済" : "未手配"}
                            </span>
                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${s.hotel_status === "手配済" ? "translate-x-[60px]" : "translate-x-0.5"}`} />
                          </button>
                        </div>
                        <Input value={s.hotel_name || ""} onChange={(e) => updateStaff("hotel_name", e.target.value)} placeholder="ホテル名（空欄でも手配済にできます）" className="h-7 text-xs" />
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

                {/* マネキン */}
                <div className="rounded-md border-l-4 border-l-pink-500 bg-pink-50/50 p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-bold text-pink-800 inline-flex items-center gap-1">
                      <UserCheck className="h-4 w-4" />マネキン手配
                    </span>
                    <span className="text-xs">
                      {manns.length === 0 ? (
                        <span className="text-muted-foreground">未登録</span>
                      ) : (
                        <span className={mannArranged === manns.length ? "text-green-700 font-bold" : "text-orange-600"}>
                          {mannArranged} / {manns.length} 人手配済
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">編集は催事詳細ページで</p>
                </div>

                {/* DMハガキ */}
                <div className="rounded-md border-l-4 border-l-purple-500 bg-purple-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-bold text-purple-800">DMハガキ</span>
                    <div className="flex gap-1 flex-wrap">
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
                  {dialogEvent.dm_status && dialogEvent.dm_status !== "なし" && (
                    <div className="flex items-center gap-2 bg-white rounded border p-2">
                      <Label className="text-xs text-purple-800 font-bold shrink-0">印刷枚数</Label>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        value={dialogEvent.dm_count ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const next = v === "" ? null : parseInt(v);
                          setDialogEvent({ ...dialogEvent, dm_count: next } as Event);
                        }}
                        onBlur={() => updateDmCount(dialogEvent.dm_count)}
                        placeholder="例: 500"
                        className="h-8 text-xs w-28"
                      />
                      <span className="text-xs text-muted-foreground">枚</span>
                    </div>
                  )}
                </div>

                {/* 備品の流れ */}
                <div className="rounded-md border-l-4 border-l-amber-500 bg-amber-50/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-amber-700" />
                    <span className="text-sm font-bold text-amber-800">備品の流れ</span>
                  </div>
                  <div className="text-xs space-y-1 bg-white rounded border p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground shrink-0 w-14">搬入元:</span>
                      <span className={dialogEvent.equipment_from ? "font-medium" : "text-orange-600"}>
                        {dialogEvent.equipment_from || "未設定"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground shrink-0 w-14">搬出先:</span>
                      <span className={dialogEvent.equipment_to ? "font-medium" : "text-orange-600"}>
                        {dialogEvent.equipment_to || "未設定"}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">編集は催事詳細ページで</p>
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

      {/* 印刷設定ダイアログ（向きのみ・全月をA4 1枚に行数比例で配分） */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>日程表の印刷設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">用紙の向き</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={printOpts.orientation === "portrait" ? "default" : "outline"}
                  onClick={() => setPrintOpts((p) => ({ ...p, orientation: "portrait" }))}
                >
                  縦（portrait）
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={printOpts.orientation === "landscape" ? "default" : "outline"}
                  onClick={() => setPrintOpts((p) => ({ ...p, orientation: "landscape" }))}
                >
                  横（landscape）
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                表示期間: {ganttSpanLabel}（全月をA4 1枚に行数比例で収めます）
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleDoPrint}>
              <Printer className="h-4 w-4 mr-1" />印刷を実行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
