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
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Printer, ImageDown, X, Hotel, Users, Plus } from "lucide-react";
import Link from "next/link";
import { getHolidaysForRange } from "@/lib/holidays";
import { StaffAssignmentDialog, type StaffChange } from "@/components/arrangements/StaffAssignmentDialog";
import { usePermission } from "@/hooks/usePermission";

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
  events: { id: string; name: string | null; venue: string; store_name: string | null; start_date: string; end_date: string } | null;
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
  // ガントチャートの横スクロール用コンテナ
  const ganttScrollRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [monthSpan, setMonthSpan] = useState(1);

  // 印刷設定（向きのみ。全社員を A4 1枚に行数比例で配分）
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printOpts, setPrintOpts] = useState({
    orientation: "landscape" as "landscape" | "portrait",
  });
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  // モバイル専用のビュー切替（カード / カレンダー / ガント）
  const [mobileView, setMobileView] = useState<"card" | "calendar" | "gantt">("card");
  // 印刷モード（window.print() 実行中はTRUE）。レンダリング範囲を絞って用紙に収めるため
  const [printMode, setPrintMode] = useState(false);
  // 配置編集ダイアログの状態
  const { canEdit } = usePermission();
  const [editOpen, setEditOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialPersonKey, setCreateInitialPersonKey] = useState<string | null>(null);

  // ドラッグ中のバー（日程調整＋担当者差替え）。nullなら通常表示、値があればドラッグ中のゴースト表示
  type DragState = {
    assignmentId: string;
    handle: "left" | "right" | "move";
    startX: number;
    origStart: string; // YYYY-MM-DD
    origEnd: string;
    currentStart: string;
    currentEnd: string;
    moved: boolean; // 5px以上動いたらtrue（クリックと区別）
    // 移動(move)時: 元の担当者・差替え先候補（別社員行に落としたときの行先）
    origPersonKey: string; // 例: "e:xxx" or "m:yyy"
    targetPersonKey: string; // 現在ホバー中の行のキー。origPersonKeyと同じなら差替えなし
  };
  const [dragState, setDragState] = useState<DragState | null>(null);

  // 直近の変更（元に戻す用）。ドラッグ・ダイアログ保存・削除 全部をカバー
  const [lastChange, setLastChange] = useState<StaffChange | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 変更を記録してトースト表示（自動消去しない：ユーザー要望）
  // 次の変更が来れば上書き、×ボタン or 元に戻すクリックで明示的に閉じる
  const recordChange = (change: StaffChange) => {
    setLastChange(change);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
  };

  // 元に戻す実行
  const handleUndo = async () => {
    const c = lastChange;
    if (!c) return;
    if (c.type === "update") {
      await supabase
        .from("event_staff")
        .update({
          event_id: c.prev.event_id,
          person_type: c.prev.person_type,
          employee_id: c.prev.employee_id,
          mannequin_person_id: c.prev.mannequin_person_id,
          start_date: c.prev.start_date,
          end_date: c.prev.end_date,
          role: c.prev.role,
          notes: c.prev.notes,
        })
        .eq("id", c.assignmentId);
    } else if (c.type === "create") {
      await supabase.from("event_staff").delete().eq("id", c.assignmentId);
    } else if (c.type === "delete") {
      await supabase.from("event_staff").insert(c.row);
    }
    setLastChange(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    fetchData();
  };

  // 空白セルをドラッグして新規配置する
  type NewDragState = {
    personKey: string;
    personLabel: string;
    rowLeft: number; // バー領域のviewport x (clientX基準)
    startIdx: number;
    currentIdx: number;
    startClientX: number;
  };
  const [newDrag, setNewDrag] = useState<NewDragState | null>(null);
  // ドラッグ完了後に開くダイアログの初期値
  const [newDragInit, setNewDragInit] = useState<{ personKey: string; start: string; end: string } | null>(null);

  const people: Person[] = useMemo(() => [
    ...employees.map((e) => ({ id: e.id, name: e.name, kind: "employee" as const })),
    ...mannequinPeople.map((m) => ({ id: m.id, name: m.name, kind: "mannequin" as const })),
  ], [employees, mannequinPeople]);

  // monthSpan の値だけ連続した月を返す
  // 通常は最小6ヶ月描画（右スクロールで先の月まで見られる）
  // 印刷モードでは monthSpan そのまま（用紙に収める）
  const RENDER_MIN_MONTHS = 6;
  const getMonthRange = () => {
    const months: { year: number; month: number; days: number }[] = [];
    const span = printMode ? monthSpan : Math.max(monthSpan, RENDER_MIN_MONTHS);
    for (let i = 0; i < span; i++) {
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
      supabase.from("mannequin_people").select("id, name, treat_as_employee").order("name"),
      supabase
        .from("event_staff")
        .select("id, person_type, employee_id, mannequin_person_id, event_id, start_date, end_date, role, hotel_name, hotel_check_in, hotel_check_out, events(id, name, venue, store_name, start_date, end_date)")
        .gte("end_date", startOfRange)
        .lte("start_date", endOfRange)
        .order("start_date"),
    ]);
    setEmployees(empRes.data || []);
    // 社員扱い(treat_as_employee)のマネキン + 期間内にevent_staff配置があるマネキン(過去互換)のみを表示
    const assignedMpIds = new Set(
      (staffRes.data || [])
        .filter((s: { person_type: PersonKind | null; mannequin_person_id: string | null }) => s.person_type === "mannequin" && s.mannequin_person_id)
        .map((s: { mannequin_person_id: string | null }) => s.mannequin_person_id as string)
    );
    const mpFiltered = (mpRes.data || [])
      .filter((m: { id: string; treat_as_employee: boolean }) => m.treat_as_employee || assignedMpIds.has(m.id))
      .map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }));
    setMannequinPeople(mpFiltered);
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

  // 1日あたりのカラム幅（PX）。狭くするほど同時に多くの日が見える
  const COL_WIDTH_BY_SPAN: Record<number, number> = { 1: 48, 2: 28, 3: 22 };
  const colWidth = COL_WIDTH_BY_SPAN[monthSpan] ?? 32;
  const labelColWidth = 112; // 社員名列の幅（w-28）
  const ganttMinWidth = labelColWidth + allDays.length * colWidth;

  // ロード完了・月切替・表示月数変更時に基準月（表示範囲の先頭）へスクロール
  // NOTE: 依存は「year/month/monthSpan/loading」だけに絞る。
  //       allDays/scrollToBaseMonthを入れると、バーをクリックした瞬間の
  //       dragState更新で useEffect が再発火してスクロール位置が戻ってしまう。
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      const container = ganttScrollRef.current;
      if (!container) return;
      // 表示範囲の先頭（year/month の1日）がコンテナのスクロール位置 0 に対応する
      container.scrollTo({ left: 0, behavior: "smooth" });
    }, 120);
    return () => clearTimeout(t);
  }, [year, month, monthSpan, loading]);

  // --- バーのドラッグで日程調整（PC向け） ---
  const DRAG_THRESHOLD_PX = 5;
  const addDaysToYmd = (ymd: string, days: number): string => {
    const [y, m, d] = ymd.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  const dayDelta = (dx: number) => Math.round(dx / colWidth);
  // YYYY-MM-DD 同士の日数差（b - a）。正なら b の方が未来
  const diffDaysYmd = (a: string, b: string) => {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    const da = new Date(ay, am - 1, ad).getTime();
    const db = new Date(by, bm - 1, bd).getTime();
    return Math.round((db - da) / 86400000);
  };

  const beginDrag = (
    e: React.PointerEvent<HTMLElement>,
    assignmentId: string,
    handle: "left" | "right" | "move",
    origStart: string,
    origEnd: string,
    origPersonKey: string,
  ) => {
    if (!canEdit) return;
    // タッチデバイスはドラッグ無効（スクロールとの競合回避。タップ=編集ダイアログに任せる）
    if (e.pointerType === "touch") return;
    e.stopPropagation();
    e.preventDefault();
    setDragState({
      assignmentId,
      handle,
      startX: e.clientX,
      origStart,
      origEnd,
      currentStart: origStart,
      currentEnd: origEnd,
      moved: false,
      origPersonKey,
      targetPersonKey: origPersonKey,
    });
  };

  // 空白領域のドラッグ開始
  const beginNewDrag = (e: React.PointerEvent<HTMLDivElement>, personKey: string, personLabel: string) => {
    if (!canEdit) return;
    if (e.pointerType === "touch") return;
    // バー本体のonPointerDownが stopPropagation 済みなので空白のみここに来る
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(allDays.length - 1, Math.floor(localX / colWidth)));
    e.preventDefault();
    setNewDrag({
      personKey,
      personLabel,
      rowLeft: rect.left,
      startIdx: idx,
      currentIdx: idx,
      startClientX: e.clientX,
    });
  };

  // 新規ドラッグ中のムーブ/アップ
  useEffect(() => {
    if (!newDrag) return;
    const onMove = (e: PointerEvent) => {
      const localX = e.clientX - newDrag.rowLeft;
      const idx = Math.max(0, Math.min(allDays.length - 1, Math.floor(localX / colWidth)));
      setNewDrag((prev) => (prev ? { ...prev, currentIdx: idx } : prev));
    };
    const onUp = (e: PointerEvent) => {
      const st = newDrag;
      setNewDrag(null);
      if (!st) return;
      const dx = Math.abs(e.clientX - st.startClientX);
      if (dx < DRAG_THRESHOLD_PX) return; // 誤タップは無視
      const from = Math.min(st.startIdx, st.currentIdx);
      const to = Math.max(st.startIdx, st.currentIdx);
      const startDate = allDays[from]?.dateStr;
      const endDate = allDays[to]?.dateStr;
      if (!startDate || !endDate) return;
      setNewDragInit({ personKey: st.personKey, start: startDate, end: endDate });
      setCreateInitialPersonKey(st.personKey);
      setCreateOpen(true);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newDrag, colWidth, allDays.length]);

  // ドラッグ中のマウスムーブ/アップはドキュメントで監視
  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - dragState.startX;
      const moved = Math.abs(dx) >= DRAG_THRESHOLD_PX;
      const delta = dayDelta(dx);
      let ns = dragState.origStart;
      let ne = dragState.origEnd;
      if (dragState.handle === "left") {
        ns = addDaysToYmd(dragState.origStart, delta);
        if (ns > ne) ns = ne;
      } else if (dragState.handle === "right") {
        ne = addDaysToYmd(dragState.origEnd, delta);
        if (ne < ns) ne = ns;
      } else {
        ns = addDaysToYmd(dragState.origStart, delta);
        ne = addDaysToYmd(dragState.origEnd, delta);
      }
      // 催事の会期内にクランプ（その催事の start_date 〜 end_date を超えないように）
      const a = assignments.find((x) => x.id === dragState.assignmentId);
      const evStart = a?.events?.start_date;
      const evEnd = a?.events?.end_date;
      if (evStart && evEnd) {
        if (dragState.handle === "move") {
          // 期間長を保ちつつ催事期間内にシフト
          if (ns < evStart) {
            const shift = diffDaysYmd(evStart, ns);
            ns = evStart;
            ne = addDaysToYmd(ne, -shift);
          }
          if (ne > evEnd) {
            const shift = diffDaysYmd(ne, evEnd);
            ne = evEnd;
            ns = addDaysToYmd(ns, shift);
          }
        } else {
          if (ns < evStart) ns = evStart;
          if (ne > evEnd) ne = evEnd;
        }
      }
      // 担当者差替え検出: move の時のみ、ポインタ下の社員行を特定
      let target = dragState.targetPersonKey;
      if (dragState.handle === "move") {
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const rowEl = els.find((el) => (el as HTMLElement).dataset && (el as HTMLElement).dataset.personRowKey) as HTMLElement | undefined;
        if (rowEl) {
          target = rowEl.dataset.personRowKey || dragState.origPersonKey;
        }
      }
      setDragState((prev) => (prev ? { ...prev, currentStart: ns, currentEnd: ne, moved, targetPersonKey: target } : prev));
    };
    const onUp = async () => {
      const st = dragState;
      setDragState(null);
      if (!st) return;
      if (!st.moved) return; // 実質クリック扱い（button onClick が編集ダイアログを開く）
      const personChanged = st.handle === "move" && st.targetPersonKey !== st.origPersonKey;
      const datesChanged = st.currentStart !== st.origStart || st.currentEnd !== st.origEnd;
      if (datesChanged || personChanged) {
        const a = assignments.find((x) => x.id === st.assignmentId);
        const origPersonName =
          a?.person_type === "mannequin"
            ? mannequinPeople.find((p) => p.id === a?.mannequin_person_id)?.name || ""
            : employees.find((e) => e.id === a?.employee_id)?.name || "";
        const venueLabel = a?.events
          ? (a.events.store_name ? `${a.events.venue} ${a.events.store_name}` : a.events.venue)
          : "";

        // 担当者差替え: targetPersonKey から新しい person_type/employee_id/mannequin_person_id を決定
        let newPersonType: "employee" | "mannequin" = (a?.person_type ?? "employee") as "employee" | "mannequin";
        let newEmployeeId: string | null = a?.employee_id ?? null;
        let newMannequinId: string | null = a?.mannequin_person_id ?? null;
        let newPersonName = origPersonName;
        if (personChanged) {
          if (st.targetPersonKey.startsWith("m:")) {
            newPersonType = "mannequin";
            newEmployeeId = null;
            newMannequinId = st.targetPersonKey.slice(2);
            newPersonName = mannequinPeople.find((p) => p.id === newMannequinId!)?.name || "";
          } else if (st.targetPersonKey.startsWith("e:")) {
            newPersonType = "employee";
            newEmployeeId = st.targetPersonKey.slice(2);
            newMannequinId = null;
            newPersonName = employees.find((p) => p.id === newEmployeeId!)?.name || "";
          }
        }

        const updatePayload: Record<string, unknown> = {};
        if (datesChanged) {
          updatePayload.start_date = st.currentStart;
          updatePayload.end_date = st.currentEnd;
        }
        if (personChanged) {
          updatePayload.person_type = newPersonType;
          updatePayload.employee_id = newEmployeeId;
          updatePayload.mannequin_person_id = newMannequinId;
        }
        await supabase.from("event_staff").update(updatePayload).eq("id", st.assignmentId);

        // 元に戻す用の記録
        const prev = {
          event_id: a?.event_id ?? "",
          person_type: (a?.person_type ?? "employee") as "employee" | "mannequin",
          employee_id: a?.employee_id ?? null,
          mannequin_person_id: a?.mannequin_person_id ?? null,
          start_date: st.origStart,
          end_date: st.origEnd,
          role: a?.role ?? null,
          notes: null,
        };
        const next = {
          event_id: a?.event_id ?? "",
          person_type: newPersonType,
          employee_id: newEmployeeId,
          mannequin_person_id: newMannequinId,
          start_date: st.currentStart,
          end_date: st.currentEnd,
          role: a?.role ?? null,
          notes: null,
        };
        const action = personChanged
          ? `${origPersonName} → ${newPersonName} に差替え${datesChanged ? "・日程変更" : ""}`
          : `${origPersonName ? origPersonName + " の " : ""}${venueLabel ? "「" + venueLabel + "」 " : ""}日程を変更`;
        recordChange({
          type: "update",
          assignmentId: st.assignmentId,
          prev,
          next,
          label: action,
        });
        fetchData();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, colWidth]);

  // 印刷ダイアログ呼出し前後で printMode を切替（レンダリング範囲を用紙に合わせる）
  useEffect(() => {
    const onBefore = () => setPrintMode(true);
    const onAfter = () => setPrintMode(false);
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  // 印刷設定ダイアログを開く
  const handleOpenPrintDialog = () => setPrintDialogOpen(true);

  // 印刷を実行（printMode=trueで月数を monthSpan 通りに固定してから window.print）
  const handleDoPrint = () => {
    setPrintDialogOpen(false);
    setPrintMode(true);
    // React の再レンダリングを待ってから print（月数が monthSpan 通りに縮まるのを待つ）
    setTimeout(() => window.print(), 250);
  };

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
      {/* 印刷用スタイル（A4 1枚・ガントのみ・社員行を flex で均等配分） */}
      <style>{`
        @media print {
          @page { size: A4 ${printOpts.orientation} !important; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px; }
          /* globals.css の「* { overflow: visible !important }」と
             「[data-slot=card] { break-inside: avoid }」を上書き */
          .gantt-bar { overflow: hidden !important; }
          .gantt-emp-row { overflow: hidden !important; }
          .gantt-inner { overflow: hidden !important; }
          .interactive-gantt,
          .interactive-gantt[data-slot="card"] {
            break-inside: auto !important;
            page-break-inside: auto !important;
          }
          /* AppShellのサイドバー/ヘッダー/フッタ/FAB/ボトムナビを非表示 */
          aside, header, footer, nav { display: none !important; }
          /* サイドバー左余白と main の全paddingを明示的に解除して紙面をフル活用 */
          .md\\:pl-60 { padding-left: 0 !important; }
          main {
            padding: 0 !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
            max-width: 100% !important;
          }
          /* 外側の min-h-screen (100vh) が絶対高さを保証してしまうのを解除 */
          .min-h-screen { min-height: 0 !important; }

          /* モバイル用のカード/カレンダービュー・ビュー切替タブは印刷しない */
          .mobile-only-view { display: none !important; }
          /* 対話用ガントはモバイルでも印刷時は必ず表示する */
          .interactive-gantt { display: block !important; }

          /* ===== 1ページ厳守: Cardの余白を消して gantt-inner を絶対高さに固定 ===== */
          .interactive-gantt {
            padding: 0 !important;
            gap: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            ring-width: 0 !important;
          }
          [data-slot="card-content"] { padding: 0 !important; }
          .gantt-scroll { overflow: visible !important; }
          .gantt-inner {
            min-width: 0 !important;
            width: 100% !important;
            /* 100vh = 用紙全体(297mm portrait/210mm landscape)を含むため
               calc は使わず向き別の明示的なmm値で固定する（印刷ヘッダー+@pageマージンを差し引いた安全値）*/
            height: ${printOpts.orientation === "portrait" ? "255mm" : "168mm"} !important;
            max-height: ${printOpts.orientation === "portrait" ? "255mm" : "168mm"} !important;
            min-height: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }
          .gantt-label-cell { position: static !important; }
          /* 月/日付ヘッダーは自然高さ、社員行は flex:1 で均等割付け */
          .gantt-header-row { flex: 0 0 auto !important; }
          .gantt-emp-row {
            flex: var(--emp-ratio, 1) 1 0 !important;
            min-height: 0 !important;
            overflow: hidden;
          }
          /* バー(.gantt-bar) の高さ/位置を行サイズに比例させる（ピクセル固定をやめる） */
          .gantt-bar {
            top: calc((var(--bar-row, 0) / var(--bar-rowcount, 1)) * 100%) !important;
            height: calc((1 / var(--bar-rowcount, 1)) * 100% - 1px) !important;
          }
          /* 画面上のフローティング要素（ドラッグヒント・Undoトースト等）は印刷しない */
          .fixed { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold print:hidden">社員スケジュール</h1>
        <div className="flex gap-2 print:hidden flex-wrap">
          {canEdit && (
            <Button
              size="sm"
              onClick={() => { setCreateInitialPersonKey(null); setCreateOpen(true); }}
              className="bg-cyan-700 hover:bg-cyan-800"
            >
              <Plus className="h-4 w-4 mr-1" />社員を配置
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleOpenPrintDialog}>
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
          <SelectTrigger className="w-28"><SelectValue>{`${monthSpan}ヶ月`}</SelectValue></SelectTrigger>
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

      {/* モバイル用ビュー切替（カード / カレンダー / ガント） */}
      <div className="mobile-only-view md:hidden flex gap-1 rounded-md border p-0.5 bg-muted/30 w-fit print:hidden">
        {([
          { k: "card" as const, label: "カード" },
          { k: "calendar" as const, label: "カレンダー" },
          { k: "gantt" as const, label: "ガント" },
        ]).map((m) => (
          <Button
            key={m.k}
            variant={mobileView === m.k ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMobileView(m.k)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      {/* 凡例 */}
      {eventColorMap.size > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs print:hidden">
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
      <div ref={tableRef} data-print-tableref>
        {/* 印刷用タイトル（1行・省スペース） */}
        <div className="hidden print:flex items-baseline justify-between gap-2 mb-1 border-b pb-0.5">
          <h2 className="text-sm font-bold">社員スケジュール　{monthLabel}</h2>
          <p className="text-[10px] text-muted-foreground">印刷日時 {new Date().toLocaleString("ja-JP")}</p>
        </div>

        {/* ===== モバイル: カードビュー（mobileView='card'の時のみ） ===== */}
        <div className={`mobile-only-view ${mobileView === "card" ? "block" : "hidden"} md:hidden space-y-3`}>
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
                          <div
                            key={s.id}
                            className={`flex items-center gap-2 text-sm flex-wrap ${canEdit ? "cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1" : ""}`}
                            onClick={canEdit ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditingAssignmentId(s.id);
                              setEditOpen(true);
                            } : undefined}
                          >
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

        {/* ===== モバイル: カレンダービュー（mobileView='calendar'の時のみ） ===== */}
        {mobileView === "calendar" && (() => {
          // 基準月（year/month）の日カレンダーを7列で描画
          const baseMonth = { year, month, days: new Date(year, month, 0).getDate() };
          const firstDay = new Date(baseMonth.year, baseMonth.month - 1, 1);
          const startOffset = firstDay.getDay(); // 0=日
          const totalCells = Math.ceil((startOffset + baseMonth.days) / 7) * 7;
          const cells: (Date | null)[] = [];
          for (let i = 0; i < totalCells; i++) {
            const dayNum = i - startOffset + 1;
            if (dayNum < 1 || dayNum > baseMonth.days) cells.push(null);
            else cells.push(new Date(baseMonth.year, baseMonth.month - 1, dayNum));
          }
          const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

          const assignmentsOn = (date: Date) => {
            const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            return assignments.filter((a) => a.start_date <= ymd && a.end_date >= ymd).filter((a) => {
              // 選択中フィルタ
              if (selectedEmployeeIds.length === 0) return true;
              const k = personKey(a);
              return k !== null && selectedEmployeeIds.includes(k);
            });
          };

          return (
            <div className="mobile-only-view md:hidden">
              <Card>
                <CardContent className="p-2">
                  <div className="text-center text-sm font-bold mb-2">{baseMonth.year}年 {baseMonth.month}月</div>
                  <div className="grid grid-cols-7 text-center text-[10px] font-semibold mb-1">
                    {weekdays.map((w, i) => (
                      <div key={w} className={i === 0 ? "text-red-600" : i === 6 ? "text-blue-600" : "text-muted-foreground"}>{w}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-px bg-border">
                    {cells.map((date, i) => {
                      if (!date) return <div key={i} className="bg-muted/30 min-h-[56px]" />;
                      const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                      const dayAssigns = assignmentsOn(date);
                      const isTodayFlag = isToday(date);
                      const isSun = date.getDay() === 0;
                      const isSat = date.getDay() === 6;
                      const isHol = holidays.has(ymd);
                      // 催事単位でまとめて色表示
                      const eventIds = Array.from(new Set(dayAssigns.map((a) => a.event_id)));
                      return (
                        <div
                          key={i}
                          className={`bg-background min-h-[56px] p-0.5 ${isTodayFlag ? "ring-2 ring-primary ring-inset" : ""}`}
                        >
                          <div className={`text-[10px] font-semibold ${isSun || isHol ? "text-red-600" : isSat ? "text-blue-600" : "text-foreground"}`}>
                            {date.getDate()}
                          </div>
                          <div className="space-y-0.5">
                            {eventIds.slice(0, 3).map((eid) => {
                              const a = dayAssigns.find((x) => x.event_id === eid);
                              const color = eventColorMap.get(eid);
                              const label = a?.events ? (a.events.store_name ? `${a.events.venue} ${a.events.store_name}` : a.events.venue) : "";
                              return (
                                <Link
                                  key={eid}
                                  href={`/events/${eid}`}
                                  className={`block text-[9px] leading-tight rounded px-0.5 truncate ${color?.bar || "bg-muted"}`}
                                  title={label}
                                >
                                  {label}
                                </Link>
                              );
                            })}
                            {eventIds.length > 3 && (
                              <div className="text-[9px] text-muted-foreground">+{eventIds.length - 3}件</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* ===== ガントチャート（PC は常に、モバイルは gantt 選択時のみ表示） ===== */}
        <TooltipProvider>
          <Card className={`interactive-gantt ${mobileView === "gantt" ? "block" : "hidden"} md:block`}>
            <CardContent className="p-0">
              <div
                ref={ganttScrollRef}
                className="gantt-scroll overflow-x-auto print:overflow-visible [touch-action:pan-x_pan-y_pinch-zoom]"
              >
                <div className="gantt-inner" style={{ minWidth: `${ganttMinWidth}px` }}>
                {/* 月ヘッダー（常時表示：右スクロールで5月/6月/7月...を見られるように） */}
                <div className="gantt-header-row flex border-b">
                  <div className="gantt-label-cell w-28 shrink-0 border-r sticky left-0 bg-background z-20" />
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

                {/* 日付ヘッダー */}
                <div className="gantt-header-row flex border-b sticky top-0 bg-background z-10">
                  <div className="gantt-label-cell w-28 shrink-0 p-2 border-r font-medium text-sm sticky left-0 bg-background z-20">社員名</div>
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

                  const isDropTarget =
                    dragState?.handle === "move" &&
                    dragState.moved &&
                    dragState.targetPersonKey === makePersonKey(p) &&
                    dragState.targetPersonKey !== dragState.origPersonKey;
                  return (
                    <div
                      key={makePersonKey(p)}
                      data-person-row-key={makePersonKey(p)}
                      className={`gantt-emp-row flex border-b last:border-b-0 ${empIdx % 2 === 1 ? "bg-muted/20" : ""} ${isDropTarget ? "ring-2 ring-primary ring-inset bg-primary/10" : ""}`}
                      style={{ minHeight, ["--emp-ratio" as string]: String(rowCount) }}
                    >
                      <div className={`gantt-label-cell w-28 shrink-0 p-2 border-r text-sm font-medium flex items-center gap-1 sticky left-0 z-[8] ${empIdx % 2 === 1 ? "bg-muted/80" : "bg-background"}`}>
                        <span className="truncate">{p.name}</span>
                        {p.kind === "mannequin" && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-pink-100 text-pink-800 font-medium shrink-0">ﾏﾈｷﾝ</span>
                        )}
                      </div>
                      <div
                        className={`flex-1 relative ${canEdit ? "cursor-cell" : ""}`}
                        onPointerDown={(e) => beginNewDrag(e, makePersonKey(p), p.name)}
                      >
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
                        {/* 新規ドラッグ選択中のハイライト */}
                        {newDrag && newDrag.personKey === makePersonKey(p) && (() => {
                          const from = Math.min(newDrag.startIdx, newDrag.currentIdx);
                          const to = Math.max(newDrag.startIdx, newDrag.currentIdx);
                          const left = (from / allDays.length) * 100;
                          const width = ((to - from + 1) / allDays.length) * 100;
                          return (
                            <div
                              className="absolute top-1 bottom-1 bg-primary/30 border-2 border-primary border-dashed rounded z-[3] pointer-events-none"
                              style={{ left: `${left}%`, width: `${width}%` }}
                            />
                          );
                        })()}
                        {/* 今日の縦ライン */}
                        {todayIndex >= 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-[5] pointer-events-none"
                            style={{ left: `${((todayIndex + 0.5) / totalDays) * 100}%` }}
                          />
                        )}
                        {/* 担当バー */}
                        {empAssignments.map((a) => {
                          // 印刷時は表示範囲より前に始まったイベント（前月からの継続）は表示しない
                          // （画面上は従来通り先月の名残りが見える・印刷時のみ当月分の催事だけに絞る）
                          if (printMode && a.start_date < allDays[0].dateStr) return null;
                          const color = eventColorMap.get(a.event_id) || colors[0];
                          const row = rowMap.get(a.id) || 0;
                          const top = ROW_PADDING + row * (BAR_HEIGHT + BAR_GAP);
                          // ドラッグ中はゴーストの日付でバー位置を計算
                          const isDragging = dragState?.assignmentId === a.id;
                          const effectiveStart = isDragging ? dragState!.currentStart : a.start_date;
                          const effectiveEnd = isDragging ? dragState!.currentEnd : a.end_date;
                          const style = getBarStyle({ ...a, start_date: effectiveStart, end_date: effectiveEnd });
                          return (
                            <Tooltip key={a.id}>
                              <TooltipTrigger
                                render={
                                  canEdit ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        // ドラッグ直後の onClick は無視（ドラッグで日付変わった時）
                                        if (dragState && dragState.assignmentId === a.id && dragState.moved) return;
                                        setEditingAssignmentId(a.id);
                                        setEditOpen(true);
                                      }}
                                      onPointerDown={(e) => beginDrag(e, a.id, "move", a.start_date, a.end_date, makePersonKey(p))}
                                      className={`gantt-bar group absolute rounded text-xs leading-snug flex items-center overflow-hidden whitespace-nowrap hover:opacity-80 hover:ring-2 hover:ring-primary/40 transition-shadow z-[1] text-left ${isDragging ? "cursor-grabbing opacity-80 ring-2 ring-primary" : "cursor-grab"} ${color.bar}`}
                                      style={{
                                        left: style.left,
                                        width: style.width,
                                        top: `${top}px`,
                                        height: `${BAR_HEIGHT}px`,
                                        ["--bar-row" as string]: String(row),
                                        ["--bar-rowcount" as string]: String(rowCount),
                                      }}
                                      aria-label={`${a.events?.venue} の配置を編集`}
                                    >
                                      {/* 左端リサイズハンドル */}
                                      <span
                                        onPointerDown={(e) => beginDrag(e, a.id, "left", a.start_date, a.end_date, makePersonKey(p))}
                                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10"
                                        aria-hidden
                                      />
                                      <div className="px-1.5 flex-1 min-w-0">
                                        <div className="truncate font-bold">{a.events?.venue}{a.events?.store_name ? ` ${a.events.store_name}` : ""}</div>
                                        {a.hotel_name && (
                                          <div className="truncate text-[11px] opacity-70">🏨 {a.hotel_name}</div>
                                        )}
                                      </div>
                                      {/* 右端リサイズハンドル */}
                                      <span
                                        onPointerDown={(e) => beginDrag(e, a.id, "right", a.start_date, a.end_date, makePersonKey(p))}
                                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/10"
                                        aria-hidden
                                      />
                                    </button>
                                  ) : (
                                    <Link
                                      href={`/events/${a.event_id}`}
                                      className={`gantt-bar absolute rounded text-xs leading-snug px-1.5 flex items-center overflow-hidden whitespace-nowrap hover:opacity-80 transition-opacity z-[1] ${color.bar}`}
                                      style={{
                                        left: style.left,
                                        width: style.width,
                                        top: `${top}px`,
                                        height: `${BAR_HEIGHT}px`,
                                        ["--bar-row" as string]: String(row),
                                        ["--bar-rowcount" as string]: String(rowCount),
                                      }}
                                    >
                                      <div className="truncate font-bold">{a.events?.venue}{a.events?.store_name ? ` ${a.events.store_name}` : ""}</div>
                                      {a.hotel_name && (
                                        <div className="truncate text-[11px] opacity-70">🏨 {a.hotel_name}</div>
                                      )}
                                    </Link>
                                  )
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
              </div>
            </CardContent>
          </Card>
        </TooltipProvider>

      </div>

      {/* 空白ドラッグ中の範囲プレビュー */}
      {newDrag && (() => {
        const from = Math.min(newDrag.startIdx, newDrag.currentIdx);
        const to = Math.max(newDrag.startIdx, newDrag.currentIdx);
        const startStr = allDays[from]?.dateStr ?? "";
        const endStr = allDays[to]?.dateStr ?? "";
        const days = to - from + 1;
        return (
          <div className="fixed bottom-4 right-4 z-50 bg-primary text-primary-foreground px-3 py-2 rounded-md shadow-lg text-sm font-medium pointer-events-none">
            {newDrag.personLabel} に新規配置: <span className="font-bold">{startStr} 〜 {endStr}</span>（{days}日）
          </div>
        );
      })()}

      {/* ドラッグ中の日付ヒント（画面右下にフロート表示） */}
      {dragState && dragState.moved && (() => {
        const isSwap = dragState.handle === "move" && dragState.targetPersonKey !== dragState.origPersonKey;
        const targetName = (() => {
          const k = dragState.targetPersonKey;
          if (k.startsWith("m:")) return mannequinPeople.find((p) => p.id === k.slice(2))?.name || "";
          if (k.startsWith("e:")) return employees.find((p) => p.id === k.slice(2))?.name || "";
          return "";
        })();
        return (
          <div className={`fixed bottom-4 right-4 z-50 px-3 py-2 rounded-md shadow-lg text-sm font-medium pointer-events-none ${isSwap ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {dragState.handle === "left" && (
              <>開始日: <span className="font-bold">{dragState.currentStart}</span></>
            )}
            {dragState.handle === "right" && (
              <>終了日: <span className="font-bold">{dragState.currentEnd}</span></>
            )}
            {dragState.handle === "move" && !isSwap && (
              <>期間: <span className="font-bold">{dragState.currentStart} 〜 {dragState.currentEnd}</span></>
            )}
            {dragState.handle === "move" && isSwap && (
              <>🔁 <span className="font-bold">{targetName}</span> に差替え（{dragState.currentStart}〜{dragState.currentEnd}）</>
            )}
          </div>
        );
      })()}

      {/* 元に戻すトースト（ドラッグ・ダイアログ保存・削除 全部をカバー） */}
      {lastChange && !dragState && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 max-w-[min(560px,calc(100vw-2rem))]">
          <div className="text-sm min-w-0">
            <div className="font-medium truncate">
              {lastChange.type === "create" && "✨ "}
              {lastChange.type === "delete" && "🗑 "}
              {lastChange.label}
            </div>
            <div className="text-xs opacity-70 truncate">
              {lastChange.type === "update" && (
                <>{lastChange.prev.start_date}〜{lastChange.prev.end_date} → {lastChange.next.start_date}〜{lastChange.next.end_date}</>
              )}
              {lastChange.type === "create" && "元に戻すと追加した配置を取り消します"}
              {lastChange.type === "delete" && "元に戻すと削除した配置を復元します"}
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0"
            onClick={handleUndo}
          >
            元に戻す
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0 h-7 w-7 text-background hover:bg-background/20"
            onClick={() => {
              setLastChange(null);
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            }}
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* 配置編集ダイアログ（バークリック時） */}
      <StaffAssignmentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        assignmentId={editingAssignmentId}
        onSaved={fetchData}
        onChange={recordChange}
      />
      {/* 新規配置ダイアログ（「社員を配置」ボタン / 空白ドラッグ後） */}
      <StaffAssignmentDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setNewDragInit(null);
        }}
        assignmentId={null}
        initialPersonKey={createInitialPersonKey}
        defaultStart={newDragInit?.start ?? ""}
        defaultEnd={newDragInit?.end ?? ""}
        showEventSelect={true}
        onSaved={fetchData}
        onChange={recordChange}
      />

      {/* 印刷設定ダイアログ（向きのみ・全社員をA4 1枚に行数比例で配分） */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>社員スケジュールの印刷設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">用紙の向き</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={printOpts.orientation === "landscape" ? "default" : "outline"}
                  onClick={() => setPrintOpts((p) => ({ ...p, orientation: "landscape" }))}
                >
                  横（landscape）
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={printOpts.orientation === "portrait" ? "default" : "outline"}
                  onClick={() => setPrintOpts((p) => ({ ...p, orientation: "portrait" }))}
                >
                  縦（portrait）
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                表示中の期間（{monthSpan}ヶ月）と社員をA4 1枚に行数比例で収めます
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">キャンセル</Button>} />
            <Button onClick={handleDoPrint}>
              <Printer className="h-4 w-4 mr-1" />印刷を実行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
