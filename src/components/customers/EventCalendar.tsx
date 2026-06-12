"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { EventLite } from "./types";

/** 日程表（カレンダービュー）と同じ見た目で催事を選ぶインラインカレンダー */

const barColors = [
  "bg-blue-100 border-blue-300 hover:bg-blue-200",
  "bg-green-100 border-green-300 hover:bg-green-200",
  "bg-amber-100 border-amber-300 hover:bg-amber-200",
  "bg-rose-100 border-rose-300 hover:bg-rose-200",
  "bg-purple-100 border-purple-300 hover:bg-purple-200",
  "bg-orange-100 border-orange-300 hover:bg-orange-200",
  "bg-cyan-100 border-cyan-300 hover:bg-cyan-200",
  "bg-pink-100 border-pink-300 hover:bg-pink-200",
];

function fmtLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 月のカレンダー週構造（日曜始まり） */
function getCalendarWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month - 1, 1);
  const dim = new Date(year, month, 0).getDate();
  const firstDow = firstDay.getDay();
  const weeks: Date[][] = [];
  const start = new Date(year, month - 1, 1 - firstDow);
  const totalCells = Math.ceil((firstDow + dim) / 7) * 7;
  for (let w = 0; w < totalCells / 7; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
    }
    weeks.push(week);
  }
  return weeks;
}

/** 週内の催事をレーンに割り当てる */
function assignWeekLanes(
  evts: EventLite[],
  weekStart: Date,
  weekEnd: Date
): { event: EventLite; laneIdx: number; startDay: number; endDay: number }[] {
  const ws = fmtLocalYmd(weekStart);
  const we = fmtLocalYmd(weekEnd);
  const weekEvents = evts
    .filter((e) => e.start_date <= we && e.end_date >= ws)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const laneEnds: string[] = [];
  const result: { event: EventLite; laneIdx: number; startDay: number; endDay: number }[] = [];
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

type Props = {
  events: EventLite[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function EventCalendar({ events, selectedId, onSelect }: Props) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);

  // 選択中の催事が変わったら、その催事の月へジャンプ
  // （propsの変化に合わせたレンダー中の状態調整パターン）
  const [prevSelectedId, setPrevSelectedId] = useState("");
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    const sel = events.find((e) => e.id === selectedId);
    if (sel) {
      const base = new Date(sel.start_date + "T00:00:00");
      setCalYear(base.getFullYear());
      setCalMonth(base.getMonth() + 1);
    }
  }

  const prevMonth = () => {
    if (calMonth === 1) { setCalYear(calYear - 1); setCalMonth(12); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 12) { setCalYear(calYear + 1); setCalMonth(1); }
    else setCalMonth(calMonth + 1);
  };

  const weeks = getCalendarWeeks(calYear, calMonth);
  const weekDayNames = ["日", "月", "火", "水", "木", "金", "土"];
  // 月内の最大レーン数で行高を統一
  const maxLanes = weeks.reduce((acc, wk) => {
    const lanes = assignWeekLanes(events, wk[0], wk[6]);
    return Math.max(acc, lanes.reduce((a, l) => Math.max(a, l.laneIdx + 1), 0));
  }, 0);
  const rowHeight = 24 + Math.max(maxLanes, 2) * 24;

  // 色は催事IDで安定させる（月をまたいでも同じ色になるように）
  const colorOf = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return barColors[h % barColors.length];
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-semibold min-w-[120px] text-center">
          {calYear}年 {calMonth}月
        </span>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth() + 1); }}
        >
          今月
        </Button>
        <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
          催事のバーをクリックすると選択されます
        </span>
      </div>

      <div className="border-t border-l">
        <div className="grid grid-cols-7">
          {weekDayNames.map((wd, i) => (
            <div
              key={wd}
              className={`border-r border-b text-center text-xs font-bold py-1 ${
                i === 0 ? "text-red-600 bg-red-50/50" : i === 6 ? "text-blue-600 bg-blue-50/50" : "bg-muted/30"
              }`}
            >
              {wd}
            </div>
          ))}
        </div>
        {weeks.map((week, wIdx) => {
          const lanes = assignWeekLanes(events, week[0], week[6]);
          return (
            <div key={wIdx} className="relative">
              <div className="grid grid-cols-7">
                {week.map((date, dIdx) => {
                  const isCurrentMonth = date.getMonth() + 1 === calMonth;
                  const isToday =
                    today.getFullYear() === date.getFullYear() &&
                    today.getMonth() === date.getMonth() &&
                    today.getDate() === date.getDate();
                  const isSun = date.getDay() === 0;
                  const isSat = date.getDay() === 6;
                  const dayColor = !isCurrentMonth
                    ? "text-muted-foreground/40"
                    : isSun ? "text-red-600" : isSat ? "text-blue-600" : "";
                  return (
                    <div
                      key={dIdx}
                      className={`border-r border-b ${isToday ? "bg-amber-50" : isCurrentMonth ? "" : "bg-muted/20"}`}
                      style={{ height: rowHeight }}
                    >
                      <div className={`text-xs px-1 pt-0.5 font-medium ${dayColor}`}>{date.getDate()}</div>
                    </div>
                  );
                })}
              </div>
              {/* 催事バー（クリックで選択） */}
              <div className="absolute inset-0 pointer-events-none">
                {lanes.map(({ event, laneIdx, startDay, endDay }) => {
                  const spanDays = endDay - startDay + 1;
                  const name = event.store_name ? `${event.venue} ${event.store_name}` : event.venue;
                  // DM枚数はバー上に常時表示（幅が狭いバーでは省略されるが、ツールチップで確認できる）
                  const label = event.dm_count != null
                    ? `${name}〔DM ${event.dm_count.toLocaleString()}〕`
                    : name;
                  const isSelected = event.id === selectedId;
                  return (
                    <button
                      key={`${event.id}-${wIdx}`}
                      type="button"
                      onClick={() => onSelect(event.id)}
                      title={`${name}（${event.start_date}〜${event.end_date}）${event.dm_count != null ? ` DM ${event.dm_count.toLocaleString()}枚` : ""}`}
                      className={`pointer-events-auto absolute rounded border px-1 text-[11px] font-medium text-left truncate transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : colorOf(event.id)
                      }`}
                      style={{
                        left: `calc(${(startDay / 7) * 100}% + 2px)`,
                        width: `calc(${(spanDays / 7) * 100}% - 4px)`,
                        top: 22 + laneIdx * 24,
                        height: 20,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
