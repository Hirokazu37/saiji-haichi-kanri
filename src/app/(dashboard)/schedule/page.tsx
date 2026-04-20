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
import { ChevronLeft, ChevronRight, Printer, ImageDown, X, Hotel, Users } from "lucide-react";
import Link from "next/link";
import { getHolidaysForRange } from "@/lib/holidays";

type Employee = { id: string; name: string };
type PersonKind = "employee" | "mannequin";
type Person = { id: string; name: string; kind: PersonKind };
type StaffAssignment = {
  id: string;
  person_type: PersonKind | null;
  employee_id: string | null;
  mannequin_person_id: string | null;
  event_id: string;
  start_date: string;
  end_date: string;
  role: string | null;
  hotel_name: string | null;
  hotel_check_in: string | null;
  hotel_check_out: string | null;
  events: { id: string; name: string | null; venue: string; store_name: string | null } | null;
};

const personKey = (a: StaffAssignment): string | null => {
  if (a.person_type === "mannequin") return a.mannequin_person_id ? `m:${a.mannequin_person_id}` : null;
  return a.employee_id ? `e:${a.employee_id}` : null;
};

const makePersonKey = (p: Person) => `${p.kind === "mannequin" ? "m" : "e"}:${p.id}`;

// 重複バーの段組み計算
function computeRows(assignments: StaffAssignment[]): Map<string, number> {
  const sorted = [...assignments].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const rowMap = new Map<string, number>();
  const rows: { end: string }[] = [];

  for (const a of sorted) {
    let placed = false;
    for (let r = 0; r < rows.length; r++) {
      if (a.start_date > rows[r].end) {
        rows[r].end = a.end_date;
        rowMap.set(a.id, r);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rowMap.set(a.id, rows.length);
      rows.push({ end: a.end_date });
    }
  }
  return rowMap;
}

function getRowCount(assignments: StaffAssignment[]): number {
  if (assignments.length === 0) return 1;
  const rowMap = computeRows(assignments);
  return Math.max(...Array.from(rowMap.values())) + 1;
}

export default function SchedulePage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [mannequinPeople, setMannequinPeople] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);
  // 横スワイプで月切替するためのタッチ開始位置
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthSpan, setMonthSpan] = useState(1);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  const people: Person[] = useMemo(() => [
    ...employees.map((e) => ({ id: e.id, name: e.name, kind: "employee" as const })),
    ...mannequinPeople.map((m) => ({ id: m.id, name: m.name, kind: "mannequin" as const })),
  ], [employees, mannequinPeople]);

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

  // 祝日マップ
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

    const [empRes, mpRes, staffRes] = await Promise.all([
      supabase.from("employees").select("id, name").order("sort_order").order("name"),
      supabase.from("mannequin_people").select("id, name").order("name"),
      supabase
        .from("event_staff")
        .select("id, person_type, employee_id, mannequin_person_id, event_id, start_date, end_date, role, hotel_name, hotel_check_in, hotel_check_out, events(id, name, venue, store_name)")
        .gte("end_date", startOfRange)
        .lte("start_date", endOfRange)
        .order("start_date"),
    ]);
    setEmployees(empRes.data || []);
    setMannequinPeople(mpRes.data || []);
    setAssignments((staffRes.data as unknown as StaffAssignment[]) || []);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, year, month, monthSpan]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); } else { setMonth(month - 1); }
  };
  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); } else { setMonth(month + 1); }
  };

  const togglePerson = (key: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  const displayPeople = selectedEmployeeIds.length > 0
    ? people.filter((p) => selectedEmployeeIds.includes(makePersonKey(p)))
    : people;

  // 全日付のフラットリスト
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
  const isHoliday = (dateStr: string) => holidays.has(dateStr);
  const isRedDay = (date: Date, dateStr: string) => isSunday(date) || isHoliday(dateStr);
  const isToday = (date: Date) => {
    const t = new Date();
    return t.getFullYear() === date.getFullYear() && t.getMonth() === date.getMonth() && t.getDate() === date.getDate();
  };

  // 今日のインデックス（縦ライン用）
  const todayIndex = allDays.findIndex((d) => isToday(d.date));

  const getAssignmentsForPerson = (p: Person) => assignments.filter((a) => {
    const kind: PersonKind = a.person_type ?? "employee";
    if (kind !== p.kind) return false;
    return kind === "mannequin" ? a.mannequin_person_id === p.id : a.employee_id === p.id;
  });

  const getBarStyle = (assignment: StaffAssignment) => {
    const start = new Date(assignment.start_date);
    const end = new Date(assignment.end_date);
    const rangeStart = allDays[0].date;
    const rangeEnd = allDays[allDays.length - 1].date;

    const effectiveStart = start < rangeStart ? rangeStart : start;
    const effectiveEnd = end > rangeEnd ? rangeEnd : end;

    const startIdx = allDays.findIndex((d) =>
      d.date.getFullYear() === effectiveStart.getFullYear() &&
      d.date.getMonth() === effectiveStart.getMonth() &&
      d.date.getDate() === effectiveStart.getDate()
    );
    const endIdx = allDays.findIndex((d) =>
      d.date.getFullYear() === effectiveEnd.getFullYear() &&
      d.date.getMonth() === effectiveEnd.getMonth() &&
      d.date.getDate() === effectiveEnd.getDate()
    );

    if (startIdx === -1 || endIdx === -1) return { left: "0%", width: "0%" };

    const left = (startIdx / totalDays) * 100;
    const width = ((endIdx - startIdx + 1) / totalDays) * 100;
    return { left: `${left}%`, width: `${width}%` };
  };

  // 色定義（左アクセント付きスタイル）
  const colors = [
    { bar: "bg-blue-100 border-y border-r border-blue-300 border-l-4 border-l-blue-500", dot: "bg-blue-500" },
    { bar: "bg-green-100 border-y border-r border-green-300 border-l-4 border-l-green-500", dot: "bg-green-500" },
    { bar: "bg-orange-100 border-y border-r border-orange-300 border-l-4 border-l-orange-500", dot: "bg-orange-500" },
    { bar: "bg-purple-100 border-y border-r border-purple-300 border-l-4 border-l-purple-500", dot: "bg-purple-500" },
    { bar: "bg-pink-100 border-y border-r border-pink-300 border-l-4 border-l-pink-500", dot: "bg-pink-500" },
    { bar: "bg-cyan-100 border-y border-r border-cyan-300 border-l-4 border-l-cyan-500", dot: "bg-cyan-500" },
    { bar: "bg-yellow-100 border-y border-r border-yellow-300 border-l-4 border-l-yellow-500", dot: "bg-yellow-500" },
    { bar: "bg-red-100 border-y border-r border-red-300 border-l-4 border-l-red-500", dot: "bg-red-500" },
    { bar: "bg-indigo-100 border-y border-r border-indigo-300 border-l-4 border-l-indigo-500", dot: "bg-indigo-500" },
    { bar: "bg-teal-100 border-y border-r border-teal-300 border-l-4 border-l-teal-500", dot: "bg-teal-500" },
  ];
  const eventColorMap = new Map<string, (typeof colors)[0]>();
  let colorIdx = 0;
  assignments.forEach((a) => {
    if (!eventColorMap.has(a.event_id)) {
      eventColorMap.set(a.event_id, colors[colorIdx % colors.length]);
      colorIdx++;
    }
  });

  // 横スワイプで月切り替え（左スワイプ=翌月、右スワイプ=前月）
  const SWIPE_THRESHOLD = 60; // px。これ以上横に動いたらスワイプ扱い
  const onGanttTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onGanttTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // 横方向が十分大きく、縦方向の動きより大きい時だけスワイプ扱い
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.3) return;
    if (dx < 0) nextMonth();
    else prevMonth();
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
      link.download = `社員スケジュール_${year}年${month}月.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("JPG保存エラー:", err);
      alert("JPG保存に失敗しました。");
    }
  };

  const monthLabel = monthSpan === 1
    ? `${year}年 ${month}月`
    : `${year}年 ${month}月 〜 ${monthRange[monthRange.length - 1].year}年 ${monthRange[monthRange.length - 1].month}月`;

  // バーの高さ定数
  const BAR_HEIGHT = 32; // px
  const BAR_GAP = 2; // px
  const ROW_PADDING = 4; // px (top + bottom)

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-4">
      {/* 印刷用スタイル */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">社員スケジュール</h1>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" />印刷
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveJpg}>
            <ImageDown className="h-4 w-4 mr-1" />JPG保存
          </Button>
        </div>
      </div>

      {/* コントロール */}
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

      {/* 社員・マネキンフィルタ */}
      <div className="print:hidden">
        <p className="text-xs text-muted-foreground mb-1">表示する社員・マネキン（未選択で全員表示）</p>
        <div className="flex flex-wrap gap-1">
          {people.map((p) => {
            const key = makePersonKey(p);
            const selected = selectedEmployeeIds.includes(key);
            const isMann = p.kind === "mannequin";
            return (
              <Badge
                key={key}
                variant={selected ? "default" : "outline"}
                className={`cursor-pointer text-xs ${selected && isMann ? "bg-pink-600 hover:bg-pink-600" : ""} ${!selected && isMann ? "border-pink-400 text-pink-700" : ""}`}
                onClick={() => togglePerson(key)}
              >
                {p.name}{isMann ? "(ﾏﾈｷﾝ)" : ""}
                {selected && <X className="h-3 w-3 ml-1" />}
              </Badge>
            );
          })}
          {selectedEmployeeIds.length > 0 && (
            <Badge variant="ghost" className="cursor-pointer text-xs text-muted-foreground" onClick={() => setSelectedEmployeeIds([])}>
              全員表示
            </Badge>
          )}
        </div>
      </div>

      {/* 凡例 */}
      {eventColorMap.size > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground font-medium">凡例:</span>
          {Array.from(eventColorMap.entries()).map(([eventId, color]) => {
            const a = assignments.find((x) => x.event_id === eventId);
            return (
              <span key={eventId} className="flex items-center gap-1.5">
                <span className={`inline-block w-3 h-3 rounded-sm ${color.dot}`} />
                <span>{a?.events?.venue}{a?.events?.store_name ? ` ${a.events.store_name}` : ""}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* タイムライン */}
      <div ref={tableRef}>
        {/* 印刷用タイトル */}
        <div className="hidden print:block text-center mb-3">
          <h2 className="text-lg font-bold">社員スケジュール</h2>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>

        {/* ===== モバイル: カードビュー ===== */}
        <div className="md:hidden space-y-3">
          {(() => {
            const todayStr = new Date().toISOString().slice(0, 10);
            type Grouped = {
              eventId: string;
              event: NonNullable<StaffAssignment["events"]>;
              assignments: StaffAssignment[];
              start: string;
              end: string;
            };
            const byEvent = new Map<string, Grouped>();
            assignments.forEach((a) => {
              if (!a.events) return;
              const existing = byEvent.get(a.event_id);
              if (existing) {
                existing.assignments.push(a);
                if (a.start_date < existing.start) existing.start = a.start_date;
                if (a.end_date > existing.end) existing.end = a.end_date;
              } else {
                byEvent.set(a.event_id, {
                  eventId: a.event_id,
                  event: a.events,
                  assignments: [a],
                  start: a.start_date,
                  end: a.end_date,
                });
              }
            });
            const filteredGroups = selectedEmployeeIds.length > 0
              ? Array.from(byEvent.values()).filter((g) =>
                  g.assignments.some((a) => {
                    const k = personKey(a);
                    return k !== null && selectedEmployeeIds.includes(k);
                  })
                )
              : Array.from(byEvent.values());
            const list = filteredGroups
              .filter((g) => g.end >= todayStr)
              .sort((a, b) => a.start.localeCompare(b.start));
            if (list.length === 0) {
              return (
                <p className="text-sm text-muted-foreground text-center py-8">
                  この期間の配置はまだありません。
                </p>
              );
            }
            const fmt = (ymd: string) => {
              const d = new Date(ymd + "T00:00:00");
              return `${d.getMonth() + 1}/${d.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][d.getDay()]})`;
            };
            return list.map((g) => {
              const venueLabel = g.event.store_name ? `${g.event.venue} ${g.event.store_name}` : g.event.venue;
              const staff = g.assignments
                .map((a) => {
                  const kind: PersonKind = a.person_type ?? "employee";
                  const name = kind === "mannequin"
                    ? mannequinPeople.find((p) => p.id === a.mannequin_person_id)?.name
                    : employees.find((e) => e.id === a.employee_id)?.name;
                  return {
                    id: a.id,
                    name: name || "不明",
                    kind,
                    hotel: a.hotel_name,
                    start: a.start_date,
                    end: a.end_date,
                  };
                })
                .sort((a, b) => a.name.localeCompare(b.name, "ja"));
              return (
                <Link key={g.eventId} href={`/events/${g.eventId}`} className="block active:opacity-80 transition-opacity">
                  <Card className="border-l-4 border-l-primary">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-base leading-tight truncate">{venueLabel}</div>
                          {g.event.name && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">{g.event.name}</div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground text-right shrink-0 leading-tight">
                          <div>{fmt(g.start)}</div>
                          <div>〜 {fmt(g.end)}</div>
                        </div>
                      </div>
                      <div className="pt-2 border-t space-y-1.5">
                        {staff.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 text-sm flex-wrap">
                            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium">{s.name}</span>
                            {s.kind === "mannequin" && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-pink-100 text-pink-800 font-medium">ﾏﾈｷﾝ</span>
                            )}
                            {(s.start !== g.start || s.end !== g.end) && (
                              <span className="text-xs text-muted-foreground">
                                ({fmt(s.start)}〜{fmt(s.end)})
                              </span>
                            )}
                            {s.hotel && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-primary ml-auto">
                                <Hotel className="h-3 w-3" />
                                {s.hotel}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            });
          })()}
        </div>

        {/* ===== PC: ガントチャート ===== */}
        <TooltipProvider>
          <Card className="hidden md:block">
            <CardContent
              className="p-0 [touch-action:pan-y_pinch-zoom]"
              onTouchStart={onGanttTouchStart}
              onTouchEnd={onGanttTouchEnd}
            >
              <div>
                {/* 月ヘッダー（複数月時） */}
                {monthSpan > 1 && (
                  <div className="flex border-b">
                    <div className="w-28 shrink-0 border-r" />
                    <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${allDays.length}, minmax(0, 1fr))` }}>
                      {monthRange.map((m) => (
                        <div
                          key={`${m.year}-${m.month}`}
                          className="text-center text-xs font-bold py-1 border-r bg-muted/50"
                          style={{ gridColumn: `span ${m.days}` }}
                        >
                          {m.year}年{m.month}月
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 日付ヘッダー */}
                <div className="flex border-b sticky top-0 bg-background z-10">
                  <div className="w-28 shrink-0 p-2 border-r font-medium text-sm">社員名</div>
                  <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${allDays.length}, minmax(0, 1fr))` }}>
                    {allDays.map((d, i) => {
                      const holiday = holidays.get(d.dateStr);
                      const red = isRedDay(d.date, d.dateStr);
                      const sat = isSaturday(d.date);
                      return (
                        <div
                          key={i}
                          className={`text-center text-xs py-1 border-r ${
                            isToday(d.date) ? "bg-primary/10 font-bold" : ""
                          } ${red ? "bg-red-50/60" : sat ? "bg-blue-50/60" : ""}`}
                          title={holiday || undefined}
                        >
                          <div>{d.day}</div>
                          <div className={red ? "text-red-500" : sat ? "text-blue-500" : "text-muted-foreground"}>
                            {getDayOfWeek(d.date)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 各社員・マネキン行 */}
                {displayPeople.map((p, empIdx) => {
                  const empAssignments = getAssignmentsForPerson(p);
                  const rowCount = getRowCount(empAssignments);
                  const rowMap = computeRows(empAssignments);
                  const rowHeight = ROW_PADDING * 2 + rowCount * BAR_HEIGHT + (rowCount - 1) * BAR_GAP;
                  const minHeight = Math.max(40, rowHeight);

                  return (
                    <div
                      key={makePersonKey(p)}
                      className={`flex border-b last:border-b-0 ${empIdx % 2 === 1 ? "bg-muted/20" : ""}`}
                      style={{ minHeight }}
                    >
                      <div className="w-28 shrink-0 p-2 border-r text-sm font-medium flex items-center gap-1">
                        <span className="truncate">{p.name}</span>
                        {p.kind === "mannequin" && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-pink-100 text-pink-800 font-medium shrink-0">ﾏﾈｷﾝ</span>
                        )}
                      </div>
                      <div className="flex-1 relative">
                        {/* 背景グリッド */}
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${allDays.length}, minmax(0, 1fr))` }}>
                          {allDays.map((d, i) => {
                            const red = isRedDay(d.date, d.dateStr);
                            const sat = isSaturday(d.date);
                            return (
                              <div
                                key={i}
                                className={`border-r ${
                                  isToday(d.date) ? "bg-primary/5" : ""
                                } ${red ? "bg-red-50/30" : sat ? "bg-blue-50/30" : ""}`}
                              />
                            );
                          })}
                        </div>
                        {/* 今日の縦ライン */}
                        {todayIndex >= 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-[5] pointer-events-none"
                            style={{ left: `${((todayIndex + 0.5) / totalDays) * 100}%` }}
                          />
                        )}
                        {/* 担当バー */}
                        {empAssignments.map((a) => {
                          const style = getBarStyle(a);
                          const color = eventColorMap.get(a.event_id) || colors[0];
                          const row = rowMap.get(a.id) || 0;
                          const top = ROW_PADDING + row * (BAR_HEIGHT + BAR_GAP);
                          return (
                            <Tooltip key={a.id}>
                              <TooltipTrigger
                                render={
                                  <Link
                                    href={`/events/${a.event_id}`}
                                    className={`absolute rounded text-xs leading-snug px-1.5 flex items-center overflow-hidden whitespace-nowrap hover:opacity-80 transition-opacity z-[1] ${color.bar}`}
                                    style={{
                                      left: style.left,
                                      width: style.width,
                                      top: `${top}px`,
                                      height: `${BAR_HEIGHT}px`,
                                    }}
                                  >
                                    <div className="truncate font-bold">{a.events?.venue}{a.events?.store_name ? ` ${a.events.store_name}` : ""}</div>
                                    {a.hotel_name && (
                                      <div className="truncate text-[11px] opacity-70">🏨 {a.hotel_name}</div>
                                    )}
                                  </Link>
                                }
                              />
                              <TooltipContent side="bottom" className="max-w-xs">
                                <div className="space-y-0.5">
                                  <div className="font-medium">{a.events?.name}</div>
                                  <div>{a.events?.venue}{a.events?.store_name ? ` ${a.events.store_name}` : ""}</div>
                                  <div className="text-muted-foreground">{a.start_date} 〜 {a.end_date}</div>
                                  {a.role && <div>役割: {a.role}</div>}
                                  {a.hotel_name && (
                                    <div>宿泊: {a.hotel_name}{a.hotel_check_in ? ` (${a.hotel_check_in}〜${a.hotel_check_out})` : ""}</div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {displayPeople.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">表示する社員・マネキンがありません。</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TooltipProvider>
      </div>
    </div>
  );
}
