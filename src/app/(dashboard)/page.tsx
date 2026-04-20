"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  CalendarDays, AlertTriangle, CheckCircle, MapPin, Train, Hotel as HotelIcon,
  LogIn, LogOut, FileText, ChevronLeft, ChevronRight, Users, Plus,
} from "lucide-react";
import Link from "next/link";
import { getHolidaysForRange } from "@/lib/holidays";
import { usePermission } from "@/hooks/usePermission";

type Event = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  prefecture: string;
  start_date: string;
  end_date: string;
  status: string;
  application_status: string | null;
  application_submitted_date: string | null;
  person_in_charge: string | null;
  dm_status: string | null;
  dm_count: number | null;
  equipment_from: string | null;
  equipment_to: string | null;
};

type StaffRow = {
  id: string;
  event_id: string;
  person_type: "employee" | "mannequin" | null;
  start_date: string;
  end_date: string;
  role: string | null;
  hotel_name: string | null;
  hotel_check_in: string | null;
  hotel_check_out: string | null;
  hotel_status: string | null;
  transport_outbound_status: string | null;
  transport_return_status: string | null;
  employees: { name: string } | null;
  mannequin_people: { name: string } | null;
  events: { id: string; name: string | null; venue: string; store_name: string | null; prefecture: string; start_date: string; end_date: string } | null;
};

type MannequinRow = { event_id: string; arrangement_status: string | null };

type DeadlineAlert = {
  event: Event;
  deadline: string; // 催事開始2ヶ月前
  daysUntilDeadline: number; // 負なら遅延
};

type UnarrangedAlert = {
  event: Event;
  daysUntilStart: number;
  missing: { key: string; label: string; short: string }[];
};

const statusColor: Record<string, string> = {
  "準備中": "bg-gray-100 text-gray-800",
  "手配中": "bg-yellow-100 text-yellow-800",
  "手配完了": "bg-blue-100 text-blue-800",
  "開催中": "bg-green-100 text-green-800",
  "終了": "bg-gray-200 text-gray-500",
};

const DEADLINE_DAYS_BEFORE = 60; // 2ヶ月前
const DEADLINE_WARN_WINDOW = 14; // 締切まで14日以内で警告

const fmtLocalYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const parseLocalYmd = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const todayStr = () => fmtLocalYmd(new Date());
const addDays = (dateStr: string, days: number) => {
  const d = parseLocalYmd(dateStr);
  d.setDate(d.getDate() + days);
  return fmtLocalYmd(d);
};
const diffDays = (fromStr: string, toStr: string) => {
  const ms = parseLocalYmd(toStr).getTime() - parseLocalYmd(fromStr).getTime();
  return Math.round(ms / 86400000);
};
const fmtDateShort = (s: string) => {
  const d = parseLocalYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const fmtWeekday = (s: string) => ["日","月","火","水","木","金","土"][parseLocalYmd(s).getDay()];

const venueLabel = (e: { venue: string; store_name: string | null }) =>
  e.store_name ? `${e.venue} ${e.store_name}` : e.venue;

export default function DashboardPage() {
  const supabase = createClient();
  const { canEdit } = usePermission();
  const [loading, setLoading] = useState(true);
  // SSR時にサーバー(UTC)とクライアント(JST)で日付がズレるため、クライアントマウント後に初期化する
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState<string>("");
  const [nowWeekday, setNowWeekday] = useState<string>("");
  useEffect(() => {
    const d = new Date();
    setToday(fmtLocalYmd(d));
    setNowWeekday(["日","月","火","水","木","金","土"][d.getDay()]);
    setMounted(true);
  }, []);
  const [counts, setCounts] = useState({ thisMonth: 0, preparing: 0, active: 0 });
  const [monthEvents, setMonthEvents] = useState<Event[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [todayStaff, setTodayStaff] = useState<StaffRow[]>([]);
  const [deadlineAlerts, setDeadlineAlerts] = useState<DeadlineAlert[]>([]);
  const [unarrangedAlerts, setUnarrangedAlerts] = useState<UnarrangedAlert[]>([]);

  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth() + 1);
  const [expandedCard, setExpandedCard] = useState<"thisMonth" | "preparing" | "active" | null>(null);
  // カレンダー日付タップで表示するボトムシート（選択日の催事一覧）
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const t = todayStr();
    const twoWeeksLater = addDays(t, 14);
    const monthStart = `${t.slice(0, 7)}-01`;
    const tDate = parseLocalYmd(t);
    const monthEnd = fmtLocalYmd(new Date(tDate.getFullYear(), tDate.getMonth() + 1, 0));
    const horizonEnd = addDays(t, 120); // 締切アラート用の広め範囲

    const [monthRes, upcomingRes, touringRes, horizonRes, mannRes] = await Promise.all([
      // 今月にかかる催事（end_date >= today の開催中/未開催のみ）
      supabase.from("events").select("*").gte("start_date", monthStart).lte("start_date", monthEnd).gte("end_date", t),
      supabase.from("events").select("*").gte("start_date", t).lte("start_date", twoWeeksLater).order("start_date"),
      supabase.from("event_staff").select("id, event_id, person_type, start_date, end_date, role, hotel_name, hotel_check_in, hotel_check_out, hotel_status, transport_outbound_status, transport_return_status, employees(name), mannequin_people(name), events(id, name, venue, store_name, prefecture, start_date, end_date)").lte("start_date", t).gte("end_date", t),
      supabase.from("events").select("*").gte("start_date", t).lte("start_date", horizonEnd).order("start_date"),
      supabase.from("mannequins").select("event_id, arrangement_status"),
    ]);

    const me = monthRes.data || [];
    const upcoming = (upcomingRes.data || []) as Event[];
    const touring = (touringRes.data || []) as unknown as StaffRow[];
    const horizon = (horizonRes.data || []) as Event[];
    const manns = (mannRes.data || []) as MannequinRow[];

    // 今月の催事
    setMonthEvents(me as Event[]);
    setUpcomingEvents(upcoming);
    setTodayStaff(touring);

    // 集計
    setCounts({
      thisMonth: me.length,
      preparing: me.filter((e) => e.status === "準備中" || e.status === "手配中").length,
      active: me.filter((e) => e.status === "開催中" || (e.start_date <= t && e.end_date >= t)).length,
    });

    // 締切アラート: 申込書 未提出 & 催事開始 <= today + 120 & 締切まで14日以内 or 過ぎた
    const dAlerts: DeadlineAlert[] = [];
    for (const e of horizon) {
      if (e.application_status === "提出済") continue;
      const deadline = addDays(e.start_date, -DEADLINE_DAYS_BEFORE);
      const daysUntilDeadline = diffDays(t, deadline);
      if (daysUntilDeadline <= DEADLINE_WARN_WINDOW) {
        dAlerts.push({ event: e, deadline, daysUntilDeadline });
      }
    }
    dAlerts.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline);
    setDeadlineAlerts(dAlerts);

    // 未手配アラート: 直近1ヶ月 の催事のうち、未完成の項目がある
    const oneMonth = addDays(t, 30);
    const eventIds = horizon.filter((e) => e.start_date <= oneMonth).map((e) => e.id);
    const [hotelsRes, transportsRes, staffAllRes] = await Promise.all([
      supabase.from("hotels").select("event_id, reservation_status").in("event_id", eventIds),
      supabase.from("transportations").select("event_id, reservation_status").in("event_id", eventIds),
      supabase.from("event_staff").select("event_id, hotel_name, hotel_status, transport_outbound_status, transport_return_status").in("event_id", eventIds),
    ]);
    const hotels = hotelsRes.data || [];
    const transports = transportsRes.data || [];
    const allStaff = staffAllRes.data || [];

    const uAlerts: UnarrangedAlert[] = [];
    for (const evt of horizon) {
      if (evt.start_date > oneMonth) break;

      const evtStaff = allStaff.filter((s) => s.event_id === evt.id);
      const hotelOk = evtStaff.length > 0 && evtStaff.every((s) => s.hotel_status === "手配済" || !!s.hotel_name);
      const hotelHas = evtStaff.length > 0;
      const transportOk = evtStaff.length > 0 && evtStaff.every((s) => s.transport_outbound_status === "手配済" && s.transport_return_status === "手配済");
      const transportHas = evtStaff.length > 0;

      const legacyHotels = hotels.filter((h) => h.event_id === evt.id);
      const legacyTransports = transports.filter((t2) => t2.event_id === evt.id);
      const legacyHotelOk = legacyHotels.length > 0 && legacyHotels.every((h) => h.reservation_status === "予約済");
      const legacyTransportOk = legacyTransports.length > 0 && legacyTransports.every((t2) => t2.reservation_status === "予約済");

      const evtManns = manns.filter((m) => m.event_id === evt.id);
      const mannOk = evtManns.length === 0 || evtManns.every((m) => m.arrangement_status === "手配済");
      const mannHas = evtManns.length > 0;

      const equipOk = !!evt.equipment_from && !!evt.equipment_to;
      const appOk = evt.application_status === "提出済";
      const dmOk = evt.dm_status === null || evt.dm_status === "印刷済み";
      const staffOk = evtStaff.length > 0;

      const missing: { key: string; label: string; short: string }[] = [];
      if (!staffOk) missing.push({ key: "staff", label: "社員未配置", short: "員" });
      if (!appOk) missing.push({ key: "app", label: "申込書未提出", short: "申" });
      if (!(hotelOk || legacyHotelOk) && (hotelHas || legacyHotels.length > 0)) missing.push({ key: "hotel", label: "ホテル未手配", short: "ホ" });
      if (!(transportOk || legacyTransportOk) && (transportHas || legacyTransports.length > 0)) missing.push({ key: "transport", label: "交通未手配", short: "交" });
      if (mannHas && !mannOk) missing.push({ key: "mann", label: "マネキン未手配", short: "マ" });
      if (!equipOk) missing.push({ key: "equip", label: "備品搬入元・搬出先未設定", short: "備" });
      if (!dmOk) missing.push({ key: "dm", label: `DM ${evt.dm_status}`, short: "DM" });

      if (missing.length > 0) {
        uAlerts.push({ event: evt, daysUntilStart: diffDays(t, evt.start_date), missing });
      }
    }
    uAlerts.sort((a, b) => a.daysUntilStart - b.daysUntilStart);
    setUnarrangedAlerts(uAlerts);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkSubmitted = async (evtId: string) => {
    const t = todayStr();
    await supabase.from("events").update({ application_status: "提出済", application_submitted_date: t }).eq("id", evtId);
    setDeadlineAlerts((prev) => prev.filter((d) => d.event.id !== evtId));
    setUnarrangedAlerts((prev) => prev.map((a) => a.event.id === evtId ? { ...a, missing: a.missing.filter((m) => m.key !== "app") } : a).filter((a) => a.missing.length > 0));
  };

  const holidays = useMemo(() => getHolidaysForRange([calYear]), [calYear]);
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth - 1, 1);
    const dim = new Date(calYear, calMonth, 0).getDate();
    const firstDow = firstDay.getDay();
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: null });
    for (let d = 1; d <= dim; d++) cells.push({ date: new Date(calYear, calMonth - 1, d) });
    return cells;
  }, [calYear, calMonth]);

  const expandedEvents = useMemo<Event[]>(() => {
    if (expandedCard === "thisMonth") return monthEvents;
    if (expandedCard === "preparing") return monthEvents.filter((e) => e.status === "準備中" || e.status === "手配中");
    if (expandedCard === "active") return monthEvents.filter((e) => e.status === "開催中" || (e.start_date <= today && e.end_date >= today));
    return [];
  }, [expandedCard, monthEvents, today]);

  const expandedTitle = expandedCard === "thisMonth" ? "今月の催事"
    : expandedCard === "preparing" ? "準備中・手配中"
    : expandedCard === "active" ? "今日 開催中"
    : "";

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of monthEvents) {
      const [ys, ms, ds] = e.start_date.split("-").map(Number);
      const [ye, me, de] = e.end_date.split("-").map(Number);
      const start = new Date(ys, ms - 1, ds);
      const end = new Date(ye, me - 1, de);
      const cur = new Date(start);
      while (cur <= end) {
        if (cur.getFullYear() === calYear && cur.getMonth() + 1 === calMonth) {
          const key = fmtLocalYmd(cur);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(e);
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [monthEvents, calYear, calMonth]);

  const prevMonth = () => {
    if (calMonth === 1) { setCalYear(calYear - 1); setCalMonth(12); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 12) { setCalYear(calYear + 1); setCalMonth(1); }
    else setCalMonth(calMonth + 1);
  };

  if (!mounted || loading) return <p className="text-muted-foreground p-4">読み込み中...</p>;

  const todayDate = parseLocalYmd(today);
  const todayFmt = `${todayDate.getFullYear()}年${todayDate.getMonth() + 1}月${todayDate.getDate()}日（${nowWeekday}）`;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">ダッシュボード</h1>
          <p className="text-xl md:text-2xl font-bold text-foreground mt-1">{todayFmt}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/events" className="inline-flex items-center gap-1 text-xs px-3 py-1.5 border rounded-md hover:bg-muted transition-colors">
            <CalendarDays className="h-3 w-3" />日程表を開く
          </Link>
          {canEdit && (
            <Link href="/events/new" className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-red-600 text-white font-bold rounded-md hover:bg-red-700 transition-colors">
              ＋ 催事を新規作成
            </Link>
          )}
        </div>
      </div>

      {/* サマリー */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        {([
          { key: "thisMonth" as const, label: "今月の催事", count: counts.thisMonth, icon: <CalendarDays className="h-4 w-4 text-muted-foreground" /> },
          { key: "preparing" as const, label: "準備中・手配中", count: counts.preparing, icon: <AlertTriangle className="h-4 w-4 text-orange-500" /> },
          { key: "active" as const, label: "今日 開催中", count: counts.active, icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
        ]).map((c) => {
          const isActive = expandedCard === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setExpandedCard(isActive ? null : c.key)}
              className="text-left"
            >
              <Card className={`transition-all ${isActive ? "ring-2 ring-sky-500 shadow-md" : "hover:shadow-md"}`}>
                <CardHeader className="flex flex-row items-center justify-between pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
                  {c.icon}
                </CardHeader>
                <CardContent className="pb-3 px-4 flex items-baseline justify-between">
                  <div className="text-2xl font-bold">{c.count} 件</div>
                  <span className="text-[10px] text-muted-foreground">{isActive ? "閉じる ▲" : "一覧 ▼"}</span>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* 展開リスト */}
      {expandedCard && (
        <Card className="border-l-4 border-l-sky-500">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                {expandedTitle}
                <Badge variant="outline" className="text-xs">{expandedEvents.length}</Badge>
              </CardTitle>
              <button onClick={() => setExpandedCard(null)} className="text-xs text-muted-foreground hover:text-foreground">閉じる ✕</button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {expandedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">該当する催事はありません。</p>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {expandedEvents
                  .slice()
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .map((event) => {
                    const d = diffDays(today, event.start_date);
                    const isActive = event.start_date <= today && event.end_date >= today;
                    return (
                      <Link key={event.id} href={`/events/${event.id}`} className="block p-2 rounded border hover:bg-muted/40 transition-colors">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-sm font-bold">{venueLabel(event)}</span>
                          <div className="flex gap-1 items-center">
                            <Badge variant="outline" className={statusColor[event.status] || ""}>{event.status}</Badge>
                            <span className="text-xs font-bold text-muted-foreground ml-1">
                              {isActive ? "開催中" : d === 0 ? "今日開始" : d > 0 ? `あと${d}日` : `${Math.abs(d)}日前終了`}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {event.name ? `${event.name}（${event.prefecture}）| ` : `${event.prefecture} | `}{event.start_date} 〜 {event.end_date}
                          {event.person_in_charge ? ` | 担当: ${event.person_in_charge}` : ""}
                        </p>
                      </Link>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 今日の動き */}
      <Card className="border-l-4 border-l-sky-500">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-bold text-sky-800 flex items-center gap-2">
            <MapPin className="h-4 w-4" />今日の動き
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {todayStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground">今日出張中の社員はいません。</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 max-w-3xl mx-auto">
              {todayStaff.map((s) => {
                const isCheckIn = s.hotel_check_in === today;
                const isCheckOut = s.hotel_check_out === today;
                const isLastDay = s.end_date === today;
                const isFirstDay = s.start_date === today;
                return (
                  <Link key={s.id} href={s.events ? `/events/${s.events.id}` : "/events"} className="block rounded-md border bg-white p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-sky-600 shrink-0" />
                      <span className="font-bold text-sm">{(s.person_type === "mannequin" ? s.mannequin_people?.name : s.employees?.name) || "不明"}</span>
                      {s.person_type === "mannequin" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 text-pink-800 font-medium">マネキン</span>
                      )}
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-sm font-medium truncate">{s.events ? venueLabel(s.events) : "催事不明"}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 ml-[22px]">
                      {s.events?.prefecture}・{fmtDateShort(s.start_date)}〜{fmtDateShort(s.end_date)}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px] ml-[22px]">
                      {isFirstDay && <Badge variant="outline" className="bg-sky-50 border-sky-300 text-sky-800 text-[10px]">初日</Badge>}
                      {isLastDay && <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-800 text-[10px]">最終日</Badge>}
                      {isCheckIn && <span className="inline-flex items-center gap-0.5 text-blue-700 font-semibold"><LogIn className="h-3 w-3" />IN</span>}
                      {isCheckOut && <span className="inline-flex items-center gap-0.5 text-orange-700 font-semibold"><LogOut className="h-3 w-3" />OUT</span>}
                      {s.hotel_name && (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                          <HotelIcon className="h-3 w-3" />{s.hotel_name}
                          {s.hotel_status === "手配済" && <span className="ml-0.5 text-green-700 font-bold">✓</span>}
                        </span>
                      )}
                      {isFirstDay && s.transport_outbound_status && (
                        <span className="inline-flex items-center gap-0.5">
                          <Train className="h-3 w-3 text-muted-foreground" />
                          <span className={s.transport_outbound_status === "手配済" ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>
                            行き{s.transport_outbound_status === "手配済" ? "✓" : "✗"}
                          </span>
                        </span>
                      )}
                      {isLastDay && s.transport_return_status && (
                        <span className="inline-flex items-center gap-0.5">
                          <Train className="h-3 w-3 text-muted-foreground" />
                          <span className={s.transport_return_status === "手配済" ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>
                            帰り{s.transport_return_status === "手配済" ? "✓" : "✗"}
                          </span>
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 出店申込書 締切アラート */}
      {deadlineAlerts.length > 0 && (
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-bold text-red-800 flex items-center gap-2">
              <FileText className="h-4 w-4" />出店申込書 締切アラート
              <Badge variant="outline" className="bg-red-100 text-red-800 text-xs">{deadlineAlerts.length}</Badge>
            </CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">催事開始 2ヶ月前（{DEADLINE_DAYS_BEFORE}日前）を締切として、14日前以内・遅延を表示</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1.5">
              {deadlineAlerts.slice(0, 10).map((a) => {
                const overdue = a.daysUntilDeadline < 0;
                return (
                  <div key={a.event.id} className={`flex items-center gap-2 p-2 rounded-md border ${overdue ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                    <Link href={`/events/${a.event.id}`} className="flex-1 min-w-0 hover:underline">
                      <div className="text-sm font-bold truncate">{venueLabel(a.event)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        催事 {a.event.start_date} 〜 {a.event.end_date}・締切 {a.deadline}
                      </div>
                    </Link>
                    <div className={`text-xs font-bold shrink-0 ${overdue ? "text-red-700" : "text-amber-700"}`}>
                      {overdue ? `${Math.abs(a.daysUntilDeadline)}日 遅延` : `残り${a.daysUntilDeadline}日`}
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 bg-white" onClick={() => handleMarkSubmitted(a.event.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" />提出済
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 未手配アラート */}
      <Card className="border-l-4 border-l-orange-500">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-bold text-orange-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />未手配アラート（直近1ヶ月）
            <Badge variant="outline" className="bg-orange-100 text-orange-800 text-xs">{unarrangedAlerts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {unarrangedAlerts.length === 0 ? (
            <p className="text-sm text-green-600">直近1ヶ月は全ての手配が完了しています。 ✓</p>
          ) : (
            <div className="space-y-1.5">
              {unarrangedAlerts.slice(0, 12).map((a) => {
                const imminent = a.daysUntilStart <= 7;
                return (
                  <Link key={a.event.id} href={`/events/${a.event.id}`} className={`flex items-center gap-2 p-2 rounded-md border hover:bg-muted/40 transition-colors ${imminent ? "bg-red-50 border-red-200" : "bg-white"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{venueLabel(a.event)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {a.event.start_date} 〜 {a.event.end_date}
                        {a.event.person_in_charge ? ` ・ ${a.event.person_in_charge}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end shrink-0 max-w-[60%]">
                      {a.missing.map((m) => (
                        <Badge key={m.key} variant="outline" className="bg-red-100 border-red-300 text-red-800 text-[10px] px-1.5" title={m.label}>
                          {m.label}
                        </Badge>
                      ))}
                    </div>
                    <div className={`text-xs font-bold shrink-0 min-w-[56px] text-right ${imminent ? "text-red-700" : "text-muted-foreground"}`}>
                      {a.daysUntilStart === 0 ? "今日" : a.daysUntilStart < 0 ? "開催中" : `あと${a.daysUntilStart}日`}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 今月のカレンダー */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />カレンダー
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-3 w-3" /></Button>
              <span className="text-sm font-bold min-w-[120px] text-center">{calYear}年 {calMonth}月</span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={nextMonth}><ChevronRight className="h-3 w-3" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-7 gap-1">
            {["日","月","火","水","木","金","土"].map((wd, i) => (
              <div key={wd} className={`text-[10px] font-bold text-center py-1 ${i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-muted-foreground"}`}>
                {wd}
              </div>
            ))}
            {calendarCells.map((cell, idx) => {
              if (!cell.date) return <div key={idx} />;
              const dateStr = fmtLocalYmd(cell.date);
              const dayEvents = eventsByDate.get(dateStr) || [];
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              const isHoliday = holidays.has(dateStr);
              const dow = cell.date.getDay();
              const isSun = dow === 0;
              const isSat = dow === 6;
              const dayColor = isSun || isHoliday ? "text-red-600" : isSat ? "text-blue-600" : "";
              const bg = isSelected
                ? "bg-primary/10 border-primary ring-2 ring-primary"
                : isToday
                  ? "bg-amber-100 border-amber-400"
                  : "bg-white";
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`relative border rounded p-1.5 min-h-[96px] md:min-h-[110px] hover:bg-sky-50 transition-colors text-left w-full ${bg}`}
                  title={dayEvents.map((e) => venueLabel(e)).join("\n")}
                >
                  <div className={`text-sm font-bold ${dayColor}`}>{cell.date.getDate()}</div>
                  <div className="space-y-1 mt-1">
                    {dayEvents.slice(0, 3).map((e) => (
                      <div key={e.id} className="text-[10px] truncate px-1 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200 leading-tight">
                        {venueLabel(e)}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3}件</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 直近2週間の催事 */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />直近2週間の催事
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">直近2週間に開始予定の催事はありません。</p>
          ) : (
            <div className="space-y-1.5">
              {upcomingEvents.map((event) => {
                const d = diffDays(today, event.start_date);
                return (
                  <Link key={event.id} href={`/events/${event.id}`} className="block p-2 rounded hover:bg-muted transition-colors border">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-bold">{venueLabel(event)}</span>
                      <div className="flex gap-1 items-center">
                        <Badge variant="outline" className={statusColor[event.status] || ""}>{event.status}</Badge>
                        <Badge variant="outline" className={event.application_status === "提出済" ? "bg-green-100 text-green-800 text-xs" : "bg-red-100 text-red-800 text-xs"}>
                          申込書: {event.application_status || "未提出"}
                        </Badge>
                        <span className="text-xs font-bold text-muted-foreground ml-1">{d === 0 ? "今日" : `あと${d}日`}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {event.name ? `${event.name}（${event.prefecture}）| ` : `${event.prefecture} | `}{event.start_date} 〜 {event.end_date}
                      {event.person_in_charge ? ` | 担当: ${event.person_in_charge}` : ""}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 日付タップで表示するボトムシート（その日の催事一覧） ===== */}
      <Sheet open={!!selectedDate} onOpenChange={(open) => { if (!open) setSelectedDate(null); }}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl pb-8">
          {selectedDate && (() => {
            const dayEvents = eventsByDate.get(selectedDate) || [];
            const d = parseLocalYmd(selectedDate);
            const weekday = ["日","月","火","水","木","金","土"][d.getDay()];
            const title = `${d.getMonth() + 1}月${d.getDate()}日（${weekday}）の催事`;
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{title}</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-4 space-y-2">
                  {dayEvents.length === 0 ? (
                    <div className="text-center py-6 space-y-3">
                      <p className="text-sm text-muted-foreground">この日に催事はありません。</p>
                      {canEdit && (
                        <Link
                          href="/events/new"
                          onClick={() => setSelectedDate(null)}
                          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          <Plus className="h-4 w-4" />この日で新規作成
                        </Link>
                      )}
                    </div>
                  ) : (
                    dayEvents.map((e) => (
                      <Link
                        key={e.id}
                        href={`/events/${e.id}`}
                        onClick={() => setSelectedDate(null)}
                        className="block p-3 rounded-md border hover:bg-muted active:bg-muted transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-base truncate">{venueLabel(e)}</div>
                            {e.name && <div className="text-xs text-muted-foreground truncate mt-0.5">{e.name}</div>}
                            <div className="text-xs text-muted-foreground mt-1">
                              {fmtDateShort(e.start_date)}（{fmtWeekday(e.start_date)}）〜 {fmtDateShort(e.end_date)}（{fmtWeekday(e.end_date)}）
                            </div>
                            {e.person_in_charge && (
                              <div className="text-xs text-muted-foreground">担当: {e.person_in_charge}</div>
                            )}
                          </div>
                          <Badge variant="outline" className={`shrink-0 ${statusColor[e.status] || ""}`}>{e.status}</Badge>
                        </div>
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          <Badge variant="outline" className={e.application_status === "提出済" ? "bg-green-100 text-green-800 text-[11px]" : "bg-red-100 text-red-800 text-[11px]"}>
                            申込書: {e.application_status || "未提出"}
                          </Badge>
                          {e.dm_status && (
                            <Badge variant="outline" className={e.dm_status === "印刷済み" ? "bg-green-100 text-green-800 text-[11px]" : "bg-amber-100 text-amber-800 text-[11px]"}>
                              DM: {e.dm_status}{e.dm_count ? ` ${e.dm_count}枚` : ""}
                            </Badge>
                          )}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
