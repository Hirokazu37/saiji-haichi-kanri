"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wallet, Download, Plus, Pencil, Trash2, ArrowUpRight, Calculator, Calendar as CalendarIcon, LayoutGrid, BarChart3, List, ChevronDown, ChevronRight } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { computePlannedPaymentDate } from "@/lib/payment-cycle";
import { PaymentAlertsCard } from "@/components/layout/PaymentAlertsCard";

type EventLite = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  revenue: number | null;
};

type VenueMasterLite = {
  id: string;
  venue_name: string;
  store_name: string | null;
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
  default_payer_id: string | null;
};

type PayerLite = {
  id: string;
  name: string;
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
  is_active: boolean;
};

type PaymentRow = {
  id: string;
  event_id: string;
  venue_master_id: string | null;
  payer_master_id: string | null;
  planned_date: string | null;
  planned_amount: number | null;
  planned_tax_type: "excluded" | "included" | null;
  actual_date: string | null;
  actual_amount: number | null;
  method: "transfer" | "cash" | "other" | null;
  status: "予定" | "入金済" | "保留" | "キャンセル";
  notes: string | null;
  applied_rate: number | null;
  // 締日跨ぎ催事の分割管理
  period_start_date: string | null;
  period_end_date: string | null;
  installment_no: number;
  installment_total: number;
  events: EventLite | null;
};

// 「1回目/2回目」ラベル (installment_total が 1 ならラベル無し)
const installmentLabel = (no: number, total: number): string => {
  if (!total || total <= 1) return "";
  return ` (${no}/${total}回目)`;
};

const STATUS_OPTIONS = ["予定", "入金済", "保留", "キャンセル"] as const;
const STATUS_COLOR: Record<string, string> = {
  予定: "bg-amber-100 text-amber-800 border-amber-300",
  入金済: "bg-green-100 text-green-800 border-green-300",
  保留: "bg-gray-100 text-gray-700 border-gray-300",
  キャンセル: "bg-rose-100 text-rose-800 border-rose-300",
};

const METHOD_LABEL: Record<string, string> = {
  transfer: "振込",
  cash: "現金",
  other: "その他",
};

const emptyForm = {
  event_id: "",
  payer_kind: "venue" as "venue" | "payer", // venue=直取引 / payer=帳合経由
  venue_master_id: "",
  payer_master_id: "",
  planned_date: "",
  planned_amount: "",
  planned_tax_type: "excluded" as "excluded" | "included",
  actual_date: "",
  actual_amount: "",
  method: "transfer" as "transfer" | "cash" | "other",
  status: "予定" as typeof STATUS_OPTIONS[number],
  notes: "",
  applied_rate: "" as string, // "80" など
};

export default function PaymentsPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">読み込み中...</p>}>
      <PaymentsPageInner />
    </Suspense>
  );
}

function PaymentsPageInner() {
  const supabase = createClient();
  const { canEdit, canViewPayments, loading: permLoading } = usePermission();
  const searchParams = useSearchParams();
  const eventFilter = searchParams?.get("event") || "";
  const autoEditFlag = searchParams?.get("edit") || "";

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [venues, setVenues] = useState<VenueMasterLite[]>([]);
  const [payers, setPayers] = useState<PayerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  // 月別カードビューの折りたたみ状態: 今月と来月を初期展開
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    const today = new Date();
    const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
    const cur = ym(today.getFullYear(), today.getMonth() + 1);
    const next = ym(today.getFullYear() + (today.getMonth() === 11 ? 1 : 0), today.getMonth() === 11 ? 1 : today.getMonth() + 2);
    return new Set([cur, next]);
  });
  const toggleMonth = (m: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // 初回 fetchData が完了したことを示すフラグ (auto-edit が早すぎないようにするため)
  const [fetched, setFetched] = useState(false);
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [paymentsRes, evtRes, vmRes, pyRes] = await Promise.all([
      supabase
        .from("event_payments")
        .select("*, events(id, name, venue, store_name, start_date, end_date, revenue)")
        .order("planned_date", { ascending: true, nullsFirst: false }),
      supabase.from("events").select("id, name, venue, store_name, start_date, end_date, revenue").order("start_date", { ascending: false }).limit(300),
      supabase.from("venue_master").select("id, venue_name, store_name, closing_day, pay_month_offset, pay_day, default_payer_id"),
      supabase.from("payer_master").select("id, name, closing_day, pay_month_offset, pay_day, is_active"),
    ]);
    setPayments((paymentsRes.data || []) as unknown as PaymentRow[]);
    setEvents((evtRes.data || []) as EventLite[]);
    setVenues((vmRes.data || []) as VenueMasterLite[]);
    setPayers((pyRes.data || []) as PayerLite[]);
    setLoading(false);
    setFetched(true);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // クエリ ?edit=auto&event=<id> で来た場合、データ取得後に該当催事の編集ダイアログを自動で開く
  // (催事詳細「入金管理ページで編集」リンクからの遷移時の「堂巡り」を防ぐため)
  // ※ fetched=true を確認することで、payments の取得が完了する前に
  //   誤って openCreate が走って空レコードが作られるのを防ぐ
  const [autoEditTried, setAutoEditTried] = useState(false);
  useEffect(() => {
    if (!fetched || autoEditTried) return; // データ取得が完了するまで待つ
    if (autoEditFlag !== "auto" || !eventFilter) return;
    setAutoEditTried(true);
    // 該当催事の event_payments を探す (installment_no 順で最初の1件)
    const target = payments
      .filter((p) => p.event_id === eventFilter)
      .sort((a, b) => (a.installment_no || 1) - (b.installment_no || 1))[0];
    if (target) {
      // 既存の payment を編集 (UPDATE)
      openEdit(target);
    }
    // 既存無しの場合は dialog を開かない (新規作成は誤操作リスクが高いため、
    // ユーザーが明示的に「+入金を追加」ボタンから開く運用にする)
    // URL から ?edit=auto を取り除き、戻るボタンで再オープンを防ぐ
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("edit");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetched, autoEditFlag, eventFilter, payments]);

  // 自動バックフィル: planned_amount=null かつ event_daily_revenue がある event_payments を補完
  // 1時間に1回まで（負荷制限）。ユーザー操作なしで未補完の入金額が埋まる。
  useEffect(() => {
    if (loading || !canViewPayments) return;
    const STORAGE_KEY = "payments_autofill_lastcheck";
    const INTERVAL_MS = 60 * 60 * 1000; // 1時間
    const lastCheck = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const now = Date.now();
    if (lastCheck && now - parseInt(lastCheck, 10) < INTERVAL_MS) return;

    (async () => {
      // planned_amount が null で applied_rate がある行を取得
      const { data: missing } = await supabase
        .from("event_payments")
        .select("id, event_id, planned_tax_type, applied_rate")
        .is("planned_amount", null)
        .not("applied_rate", "is", null);
      if (!missing || missing.length === 0) {
        if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, String(now));
        return;
      }
      let filled = 0;
      for (const p of missing as { id: string; event_id: string; planned_tax_type: "excluded" | "included" | null; applied_rate: number }[]) {
        const { data: daily } = await supabase
          .from("event_daily_revenue")
          .select("amount, tax_type, tax_rate")
          .eq("event_id", p.event_id);
        if (!daily || daily.length === 0) continue;
        let excludedTotal = 0;
        let includedTotal = 0;
        for (const d of daily as { amount: number; tax_type: "excluded" | "included"; tax_rate: number | null }[]) {
          if (d.tax_type === "excluded") {
            excludedTotal += d.amount;
            includedTotal += Math.round(d.amount * (1 + (d.tax_rate ?? 0.08)));
          } else {
            includedTotal += d.amount;
            excludedTotal += Math.round(d.amount / (1 + (d.tax_rate ?? 0.08)));
          }
        }
        const base = p.planned_tax_type === "included" ? includedTotal : excludedTotal;
        if (base === 0) continue;
        const amount = Math.round((base * p.applied_rate) / 100);
        await supabase.from("event_payments").update({ planned_amount: amount }).eq("id", p.id);
        filled++;
      }
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, String(now));
      if (filled > 0) {
        console.log(`[payments auto-backfill] ${filled} 件の planned_amount を補完`);
        await fetchData(); // 補完した分を再取得
      }
    })();
  }, [loading, canViewPayments, supabase, fetchData]);

  // 絞り込み
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (eventFilter && p.event_id !== eventFilter) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (q) {
        const ev = p.events;
        const hay = [ev?.name, ev?.venue, ev?.store_name].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [payments, filterStatus, search, eventFilter]);

  // 税込換算ヘルパー (planned_tax_type を見て統一)
  // 税抜なら 軽減税率 8% で概算換算
  const toIncludedAmt = (amount: number | null, taxType: "excluded" | "included" | null) => {
    if (amount == null) return 0;
    if (taxType === "excluded") return Math.round(amount * 1.08);
    return amount;
  };

  // サマリ
  const summary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const inMonth = new Date();
    inMonth.setMonth(inMonth.getMonth() + 1);
    const nextMonthStart = `${inMonth.getFullYear()}-${String(inMonth.getMonth() + 1).padStart(2, "0")}-01`;
    let unpaidCount = 0;
    let unpaidAmount = 0;
    let thisMonthPlanned = 0;
    let overdue = 0;
    for (const p of payments) {
      if (p.status === "予定" || p.status === "保留") {
        unpaidCount++;
        unpaidAmount += toIncludedAmt(p.planned_amount, p.planned_tax_type);
        if (p.planned_date && p.planned_date < today) overdue++;
      }
      if (p.planned_date && p.planned_date >= today && p.planned_date < nextMonthStart && (p.status === "予定" || p.status === "保留")) {
        thisMonthPlanned += toIncludedAmt(p.planned_amount, p.planned_tax_type);
      }
    }
    return { unpaidCount, unpaidAmount, thisMonthPlanned, overdue };
  }, [payments]);

  // 月次サマリ用ヘルパー: planned_tax_type を見て税込額に揃える
  // (税抜なら 軽減税率 8% で概算換算)
  const toIncludedAmount = (amount: number | null, taxType: "excluded" | "included" | null) => {
    if (amount == null) return 0;
    if (taxType === "excluded") return Math.round(amount * 1.08);
    return amount;
  };

  // 月次サマリ（予定日ベース・税込）
  // 過去6ヶ月+今月+未来6ヶ月 = 13ヶ月
  const monthlySummary = useMemo(() => {
    const today = new Date();
    const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const months: { ym: string; label: string; isCurrent: boolean }[] = [];
    for (let i = -6; i <= 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      months.push({ ym, label, isCurrent: ym === currentYm });
    }

    type MonthData = {
      planned: number;     // 予定額合計（税込）
      paid: number;        // 入金済額合計（税込・actual_amount そのまま）
      unpaid: number;      // 未入金額合計（税込・予定額ベース）
      count: number;
      byPayer: Map<string, number>;
    };
    const summary = new Map<string, MonthData>();
    for (const { ym } of months) {
      summary.set(ym, { planned: 0, paid: 0, unpaid: 0, count: 0, byPayer: new Map() });
    }

    // 入金元ラベル（useMemo 内では state を直接参照してクロージャを安定化）
    const resolvePayer = (p: PaymentRow): string => {
      if (p.venue_master_id) {
        const v = venues.find((x) => x.id === p.venue_master_id);
        return v ? `${v.venue_name}${v.store_name ? ` ${v.store_name}` : ""}` : "（百貨店）";
      }
      if (p.payer_master_id) {
        return payers.find((x) => x.id === p.payer_master_id)?.name || "（帳合先）";
      }
      return p.events ? (p.events.store_name ? `${p.events.venue} ${p.events.store_name}` : p.events.venue) : "—";
    };

    const payerTotals = new Map<string, number>();

    for (const p of payments) {
      if (!p.planned_date) continue;
      if (p.status === "キャンセル") continue;
      const ym = p.planned_date.slice(0, 7);
      const s = summary.get(ym);
      if (!s) continue; // 表示期間外

      const planned = toIncludedAmount(p.planned_amount, p.planned_tax_type);
      s.planned += planned;
      s.count += 1;
      if (p.status === "入金済") {
        s.paid += p.actual_amount || 0;
      } else {
        s.unpaid += planned;
      }

      const payerKey = resolvePayer(p);
      s.byPayer.set(payerKey, (s.byPayer.get(payerKey) || 0) + planned);
      payerTotals.set(payerKey, (payerTotals.get(payerKey) || 0) + planned);
    }

    // 入金元を予定額合計が大きい順にソート
    const payerList = Array.from(payerTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    // 全体トータル
    const totals = { planned: 0, paid: 0, unpaid: 0, count: 0 };
    for (const s of summary.values()) {
      totals.planned += s.planned;
      totals.paid += s.paid;
      totals.unpaid += s.unpaid;
      totals.count += s.count;
    }

    return { months, summary, payerList, payerTotals, totals };
  }, [payments, venues, payers]);

  // 催事カレンダー: /events と同じガント構造で月別表示
  // トラック(A-H)に催事を割当てて、バーに「百貨店名・入金予定日・予定額」を表示
  const calendarMonths = useMemo(() => {
    type EventEntry = {
      payment: PaymentRow;
      eventStart: string;
      eventEnd: string;
      venueLabelStr: string;
    };
    type MonthData = {
      ym: string;
      year: number;
      month: number; // 1-12
      label: string;
      isCurrent: boolean;
      daysInMonth: number;
      // /events と同じく Map<paymentId, trackIdx> 形式
      trackMap: Map<string, number>;
      trackCount: number;
      entries: EventEntry[];
    };

    const today = new Date();
    const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const months: MonthData[] = [];

    // 表示範囲: 今年の1月 ～ 今月+6ヶ月（"1月から入力している"のニーズに対応）
    const startOffset = -today.getMonth(); // 今月から1月までのオフセット (May=>-4)
    const endOffset = 6;
    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const ym = `${year}-${String(month).padStart(2, "0")}`;
      const label = `${year}年${month}月`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const monthStartStr = `${ym}-01`;
      const monthEndStr = `${ym}-${String(daysInMonth).padStart(2, "0")}`;

      const entries = payments
        .filter((p) => p.status !== "キャンセル")
        .filter((p) => p.events && p.events.start_date <= monthEndStr && p.events.end_date >= monthStartStr)
        .map((p): EventEntry => ({
          payment: p,
          eventStart: p.events!.start_date,
          eventEnd: p.events!.end_date,
          venueLabelStr: p.events!.store_name ? `${p.events!.venue} ${p.events!.store_name}` : p.events!.venue,
        }))
        .sort((a, b) => a.eventStart.localeCompare(b.eventStart));

      // /events と同じトラック割当ロジック
      const trackMap = new Map<string, number>();
      const trackEnds: string[] = [];
      for (const e of entries) {
        let placed = false;
        for (let t = 0; t < trackEnds.length; t++) {
          if (e.eventStart > trackEnds[t]) {
            trackEnds[t] = e.eventEnd;
            trackMap.set(e.payment.id, t);
            placed = true;
            break;
          }
        }
        if (!placed) {
          trackMap.set(e.payment.id, trackEnds.length);
          trackEnds.push(e.eventEnd);
        }
      }
      const trackCount = Math.max(trackEnds.length, 1);

      months.push({ ym, year, month, label, isCurrent: ym === currentYm, daysInMonth, trackMap, trackCount, entries });
    }
    return months;
  }, [payments]);

  // /events と同じカラーパレット
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

  // 月別カードビュー: 今年1月 〜 今月+6ヶ月
  // 各月の入金予定カードを並べる（キャンセルは除外）
  const cardsByMonth = useMemo(() => {
    const today = new Date();
    const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const months: { ym: string; label: string; isCurrent: boolean }[] = [];
    const startOffset = -today.getMonth();
    const endOffset = 6;
    for (let i = startOffset; i <= endOffset; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      months.push({ ym, label, isCurrent: ym === currentYm });
    }

    const byMonth = new Map<string, PaymentRow[]>();
    for (const { ym } of months) byMonth.set(ym, []);
    for (const p of payments) {
      if (!p.planned_date) continue;
      if (p.status === "キャンセル") continue;
      const ym = p.planned_date.slice(0, 7);
      const arr = byMonth.get(ym);
      if (arr) arr.push(p);
    }
    for (const arr of byMonth.values()) {
      arr.sort((a, b) => (a.planned_date || "").localeCompare(b.planned_date || ""));
    }
    return { months, byMonth };
  }, [payments]);

  // 入金予定日からの経過日数ラベル
  const daysDiffLabel = (plannedDate: string | null): { text: string; tone: "past" | "today" | "soon" | "future" } => {
    if (!plannedDate) return { text: "", tone: "future" };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = plannedDate.split("-").map(Number);
    if (!y || !m || !d) return { text: "", tone: "future" };
    const target = new Date(y, m - 1, d);
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { text: `${-diff}日前`, tone: "past" };
    if (diff === 0) return { text: "本日", tone: "today" };
    if (diff <= 7) return { text: `${diff}日後`, tone: "soon" };
    return { text: `${diff}日後`, tone: "future" };
  };

  // 催事ラベル
  const eventLabel = (e: { venue: string; store_name: string | null } | null | undefined) => {
    if (!e) return "—";
    return e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
  };
  const paymentDisplayPayer = (p: PaymentRow) => {
    if (p.venue_master_id) {
      const v = venues.find((x) => x.id === p.venue_master_id);
      return v ? `${v.venue_name}${v.store_name ? ` ${v.store_name}` : ""}` : "（百貨店直取引）";
    }
    if (p.payer_master_id) {
      return payers.find((x) => x.id === p.payer_master_id)?.name || "（帳合先）";
    }
    // 紐付けなし → 催事のvenueを表示
    return eventLabel(p.events);
  };

  // ダイアログ: 新規作成
  const openCreate = (prefillEventId?: string) => {
    setEditingId(null);
    setForm({ ...emptyForm, event_id: prefillEventId || eventFilter || "" });
    setDialogOpen(true);
  };

  const openEdit = (p: PaymentRow) => {
    setEditingId(p.id);
    setForm({
      event_id: p.event_id,
      payer_kind: p.payer_master_id ? "payer" : "venue",
      venue_master_id: p.venue_master_id || "",
      payer_master_id: p.payer_master_id || "",
      planned_date: p.planned_date || "",
      planned_amount: p.planned_amount != null ? String(p.planned_amount) : "",
      planned_tax_type: (p.planned_tax_type ?? "excluded") as "excluded" | "included",
      actual_date: p.actual_date || "",
      actual_amount: p.actual_amount != null ? String(p.actual_amount) : "",
      method: (p.method ?? "transfer") as "transfer" | "cash" | "other",
      status: p.status,
      notes: p.notes || "",
      applied_rate: p.applied_rate != null ? String(p.applied_rate) : "",
    });
    setDialogOpen(true);
  };

  // 売上から予定額をコピー（applied_rate が入っていれば掛け算して入金率を適用）
  const copyFromRevenue = async (taxType: "excluded" | "included") => {
    if (!form.event_id) return;
    const { data: dailyData } = await supabase
      .from("event_daily_revenue")
      .select("amount, tax_type, tax_rate")
      .eq("event_id", form.event_id);
    const daily = (dailyData || []) as { amount: number; tax_type: "excluded" | "included"; tax_rate: number }[];
    let salesTotal = 0;
    if (daily.length > 0) {
      for (const d of daily) {
        if (d.tax_type === taxType) {
          salesTotal += d.amount;
        } else if (taxType === "included" && d.tax_type === "excluded") {
          salesTotal += Math.round(d.amount * (1 + d.tax_rate));
        } else if (taxType === "excluded" && d.tax_type === "included") {
          salesTotal += Math.round(d.amount / (1 + d.tax_rate));
        }
      }
    } else {
      // 日別が無い場合は events.revenue（税込合計として扱う）を使う
      const ev = events.find((e) => e.id === form.event_id);
      const r = ev?.revenue ?? 0;
      if (taxType === "included") {
        salesTotal = r;
      } else if (r > 0) {
        // 税抜換算には品目ごとの税率が必要だが、events.revenue は税込合計しか持たない。
        // 日別売上が未入力なら正確な税抜が出せないので、確認したうえで軽減税率 8% 概算で続行。
        const ok = confirm(
          "日別売上が未入力です。\n\n" +
          "税抜換算には品目ごとの税率が必要ですが、現在は税込合計しか保存されていません。" +
          "概算で 軽減税率 8% として換算します（酒類等 10% を含む場合は誤差が出ます）。\n\n" +
          "OK で続行 / キャンセルで中止し、日別売上を先に入力してください。"
        );
        if (!ok) return;
        salesTotal = Math.round(r / 1.08);
      } else {
        salesTotal = 0;
      }
    }
    // 入金率（applied_rate）が設定されていれば乗算
    const rate = form.applied_rate.trim() ? parseFloat(form.applied_rate) : NaN;
    const finalAmount = !isNaN(rate) ? Math.round(salesTotal * rate / 100) : salesTotal;
    setForm((prev) => ({ ...prev, planned_amount: String(finalAmount), planned_tax_type: taxType }));
  };

  // 振込サイクルから予定日を自動計算
  const calcPlannedDate = () => {
    const ev = events.find((e) => e.id === form.event_id);
    if (!ev) return;
    let cycle: { closing_day?: number | null; pay_month_offset?: number | null; pay_day?: number | null } | null = null;
    if (form.payer_kind === "payer" && form.payer_master_id) {
      const py = payers.find((p) => p.id === form.payer_master_id);
      if (py) cycle = { closing_day: py.closing_day, pay_month_offset: py.pay_month_offset, pay_day: py.pay_day };
    } else if (form.payer_kind === "venue" && form.venue_master_id) {
      const vm = venues.find((v) => v.id === form.venue_master_id);
      if (vm) cycle = { closing_day: vm.closing_day, pay_month_offset: vm.pay_month_offset, pay_day: vm.pay_day };
    }
    if (!cycle) return;
    const d = computePlannedPaymentDate(ev.end_date, cycle);
    if (d) setForm((prev) => ({ ...prev, planned_date: d }));
  };

  const save = async () => {
    if (!form.event_id) return;
    setSaving(true);
    try {
      const payload = {
        event_id: form.event_id,
        venue_master_id: form.payer_kind === "venue" ? (form.venue_master_id || null) : null,
        payer_master_id: form.payer_kind === "payer" ? (form.payer_master_id || null) : null,
        planned_date: form.planned_date || null,
        planned_amount: form.planned_amount.trim() ? parseInt(form.planned_amount) : null,
        planned_tax_type: form.planned_tax_type,
        actual_date: form.actual_date || null,
        actual_amount: form.actual_amount.trim() ? parseInt(form.actual_amount) : null,
        method: form.method,
        status: form.status,
        notes: form.notes.trim() || null,
        applied_rate: form.applied_rate.trim() ? parseFloat(form.applied_rate) : null,
      };
      if (editingId) {
        await supabase.from("event_payments").update(payload).eq("id", editingId);
      } else {
        await supabase.from("event_payments").insert(payload);
      }
      setDialogOpen(false);
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await supabase.from("event_payments").delete().eq("id", deletingId);
    setDeleteOpen(false);
    setDeletingId(null);
    fetchData();
  };

  // 行の状態トグル: 予定 → 入金済 （実入金日・額が空なら今日・予定額でプリセット）
  const markPaid = async (p: PaymentRow) => {
    const update: Record<string, unknown> = { status: "入金済" };
    if (!p.actual_date) update.actual_date = new Date().toISOString().slice(0, 10);
    if (p.actual_amount == null && p.planned_amount != null) update.actual_amount = p.planned_amount;
    await supabase.from("event_payments").update(update).eq("id", p.id);
    fetchData();
  };

  // CSV エクスポート（Excel互換 UTF-8 BOM）
  const exportCsv = () => {
    const headers = [
      "催事名", "会場", "開催期間", "入金元", "回数", "対象期間", "予定日", "予定額(税込)",
      "実入金日", "実入金額", "方法", "ステータス", "備考"
    ];
    const rows = filtered.map((p) => {
      const ev = p.events;
      return [
        ev?.name || "",
        eventLabel(ev),
        ev ? `${ev.start_date}〜${ev.end_date}` : "",
        paymentDisplayPayer(p),
        p.installment_total > 1 ? `${p.installment_no}/${p.installment_total}回目` : "",
        p.installment_total > 1 && p.period_start_date && p.period_end_date ? `${p.period_start_date}〜${p.period_end_date}` : "",
        p.planned_date || "",
        p.planned_amount != null ? String(toIncludedAmt(p.planned_amount, p.planned_tax_type)) : "",
        p.actual_date || "",
        p.actual_amount != null ? String(p.actual_amount) : "",
        p.method ? METHOD_LABEL[p.method] : "",
        p.status,
        p.notes || "",
      ];
    });
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `入金管理_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (permLoading) return <p className="text-muted-foreground">読み込み中...</p>;
  if (!canViewPayments) return <p className="text-muted-foreground">このページを閲覧する権限がありません。</p>;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* 印刷設定: A4縦・余白控えめ・ナビ非表示で印刷枚数を最小化 */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; background: white !important; }
          nav, aside, header, footer { display: none !important; }
          main, [data-slot="main"] { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
          .md\\:pl-60 { padding-left: 0 !important; }
          /* カードの影は印刷時カット */
          [data-slot="card"] { box-shadow: none !important; }
        }
      `}</style>
      <div className="flex items-end justify-between flex-wrap gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />入金管理
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            催事ごとの入金予定・実績を管理します。催事作成時に自動で1件追加されます。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" />CSV出力
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="h-4 w-4 mr-1" />入金を追加
            </Button>
          )}
        </div>
      </div>

      {/* アラート（印刷時非表示） */}
      <div className="print:hidden">
        <PaymentAlertsCard />
      </div>

      {/* サマリ（印刷時非表示） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">未入金件数</div>
            <div className="text-xl font-bold">{summary.unpaidCount} 件</div>
            {summary.overdue > 0 && (
              <div className="text-[10px] text-destructive mt-0.5">うち予定日超過 {summary.overdue} 件</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">未入金合計<span className="text-[10px] ml-1">(税込)</span></div>
            <div className="text-xl font-bold">¥{summary.unpaidAmount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">今月の入金予定<span className="text-[10px] ml-1">(税込)</span></div>
            <div className="text-xl font-bold">¥{summary.thisMonthPlanned.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">表示中の件数</div>
            <div className="text-xl font-bold">{filtered.length} 件</div>
          </CardContent>
        </Card>
      </div>

      {/* タブで切り替え（カレンダー / 月別 / 入金元別 / 一覧） */}
      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="w-full justify-start print:hidden">
          <TabsTrigger value="calendar"><CalendarIcon className="h-3.5 w-3.5" />カレンダー</TabsTrigger>
          <TabsTrigger value="monthly"><LayoutGrid className="h-3.5 w-3.5" />月別</TabsTrigger>
          <TabsTrigger value="payer"><BarChart3 className="h-3.5 w-3.5" />入金元別</TabsTrigger>
          <TabsTrigger value="list"><List className="h-3.5 w-3.5" />一覧</TabsTrigger>
        </TabsList>

        {/* タブ: カレンダー */}
        <TabsContent value="calendar" keepMounted className="space-y-4 print:!block print:!opacity-100">

      {/* 催事カレンダー（/events と同じガント構造で入金情報を表示） */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-700" />
            <h2 className="text-sm font-bold">催事カレンダー（入金予定日・金額付き）</h2>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-muted-foreground">今年1月 〜 未来6ヶ月</span>
            <span className="inline-flex items-center gap-2 text-[10px] flex-wrap">
              <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-yellow-100 border-2 border-yellow-500 rounded-sm"></span>未入金</span>
              <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-green-100 border-2 border-green-500 rounded-sm"></span>入金済</span>
              <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-rose-100 border-2 border-rose-500 rounded-sm"></span>予定日超過</span>
              <span className="inline-flex items-center gap-0.5"><span className="inline-block w-3 h-3 bg-gray-100 border-2 border-gray-400 rounded-sm"></span>保留</span>
            </span>
          </div>
        </div>
        {calendarMonths.map((m) => {
          const todayStr = new Date().toISOString().slice(0, 10);
          return (
            <Card key={m.ym} className="overflow-hidden print:break-inside-avoid">
              <CardContent className="p-0 overflow-x-auto print:overflow-visible">
                <div className="min-w-[600px]">
                  {/* 月タイトル + 日付ヘッダ (/events と同じ構造) */}
                  <div className="flex border-b bg-white">
                    <div className="w-14 shrink-0 border-r flex flex-col items-center justify-center py-1.5 bg-sky-50">
                      <span className="text-sky-700 text-base font-black leading-none">
                        {m.month}<span className="text-xs">月</span>
                      </span>
                      {m.isCurrent && <span className="text-[10px] text-amber-700 font-semibold mt-0.5">今月</span>}
                    </div>
                    <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${m.daysInMonth}, minmax(0, 1fr))` }}>
                      {Array.from({ length: m.daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const date = new Date(m.year, m.month - 1, day);
                        const dateStr = `${m.ym}-${String(day).padStart(2, "0")}`;
                        const isSun = date.getDay() === 0;
                        const isSat = date.getDay() === 6;
                        const isToday = dateStr === todayStr;
                        const wday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
                        return (
                          <div
                            key={day}
                            className={`text-center border-r ${isToday ? "bg-primary/10" : isSun ? "bg-red-50/50" : isSat ? "bg-blue-50/50" : ""}`}
                          >
                            <div className="text-[14px] font-bold leading-tight pt-1">{day}</div>
                            <div className={`text-[11px] leading-tight pb-1 ${isSun ? "text-red-500 font-bold" : isSat ? "text-blue-500" : "text-muted-foreground"}`}>
                              {wday}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* トラック行 (A-H) */}
                  {m.entries.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground italic">この月に催事はありません</div>
                  ) : (
                    Array.from({ length: m.trackCount }, (_, trackIdx) => {
                      const trackEntries = m.entries.filter((e) => m.trackMap.get(e.payment.id) === trackIdx);
                      return (
                        <div
                          key={trackIdx}
                          className={`flex border-b last:border-b-0 ${trackIdx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}`}
                          style={{ minHeight: 64 }}
                        >
                          <div className="w-14 shrink-0 border-r flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                            {TRACK_LABELS[trackIdx] || String(trackIdx + 1)}
                          </div>
                          <div className="flex-1 relative">
                            {/* 背景グリッド */}
                            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${m.daysInMonth}, minmax(0, 1fr))` }}>
                              {Array.from({ length: m.daysInMonth }, (_, i) => {
                                const day = i + 1;
                                const date = new Date(m.year, m.month - 1, day);
                                const dateStr = `${m.ym}-${String(day).padStart(2, "0")}`;
                                const isSun = date.getDay() === 0;
                                const isSat = date.getDay() === 6;
                                const isToday = dateStr === todayStr;
                                return (
                                  <div
                                    key={i}
                                    className={`border-r ${isToday ? "bg-primary/5" : isSun ? "bg-red-50/30" : isSat ? "bg-blue-50/30" : ""}`}
                                  />
                                );
                              })}
                            </div>
                            {/* 催事バー */}
                            {trackEntries.map((entry) => {
                              const [esy, esm, esd] = entry.eventStart.split("-").map(Number);
                              const [eey, eem, eed] = entry.eventEnd.split("-").map(Number);
                              const startDay = esy === m.year && esm === m.month ? esd : 1;
                              const endDay = eey === m.year && eem === m.month ? eed : m.daysInMonth;
                              const left = ((startDay - 1) / m.daysInMonth) * 100;
                              const width = ((endDay - startDay + 1) / m.daysInMonth) * 100;
                              const isPaid = entry.payment.status === "入金済";
                              const isHeld = entry.payment.status === "保留";
                              const isOverdue = !!entry.payment.planned_date && entry.payment.planned_date < todayStr && !isPaid && !isHeld;
                              const barColor = isPaid
                                ? "bg-green-100 border-green-500 text-green-900"
                                : isHeld
                                  ? "bg-gray-100 border-gray-400 text-gray-700"
                                  : isOverdue
                                    ? "bg-rose-100 border-rose-500 text-rose-900"
                                    : "bg-yellow-100 border-yellow-500 text-yellow-900";
                              const plannedDateLabel = entry.payment.planned_date
                                ? (() => {
                                    const [, pmo, pd] = entry.payment.planned_date.split("-").map(Number);
                                    return `${pmo}月${pd}日`;
                                  })()
                                : "未設定";
                              const plannedAmtIncl = toIncludedAmt(entry.payment.planned_amount, entry.payment.planned_tax_type);
                              return (
                                <Link
                                  key={entry.payment.id}
                                  href={`/events/${entry.payment.event_id}`}
                                  className={`absolute top-0.5 rounded border-2 text-[11px] leading-snug px-1 py-0.5 overflow-hidden hover:opacity-80 transition-opacity z-[1] cursor-pointer print:no-underline ${barColor}`}
                                  style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    height: 60,
                                  }}
                                  title={`${entry.venueLabelStr}${installmentLabel(entry.payment.installment_no, entry.payment.installment_total)} (${entry.eventStart}〜${entry.eventEnd}) ${entry.payment.status}`}
                                >
                                  <div className="truncate font-semibold leading-tight text-[11px]">
                                    {entry.venueLabelStr}
                                    {entry.payment.installment_total > 1 && (
                                      <span className="ml-0.5 text-[9px] text-blue-700">[{entry.payment.installment_no}/{entry.payment.installment_total}]</span>
                                    )}
                                    {isPaid && <span className="ml-0.5 text-[10px]">✓</span>}
                                  </div>
                                  <div className="truncate text-[10px] leading-tight">
                                    入金予定日: {plannedDateLabel}
                                  </div>
                                  <div className="truncate text-[10px] leading-tight font-semibold">
                                    予定額: ¥{plannedAmtIncl > 0 ? plannedAmtIncl.toLocaleString() : "—"}
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
        </TabsContent>

        {/* タブ: 月別 (カードビュー + 月次サマリ表) */}
        <TabsContent value="monthly" keepMounted className="space-y-4 print:!block print:!opacity-100">

      {/* 月別カードビュー（メインの可視化） */}
      <Card className="print-card-view">
        <CardContent className="p-3 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-700" />
              <h2 className="text-sm font-bold">入金予定（月別・催事ごと）</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">今年1月 〜 未来6ヶ月</span>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="h-7 text-xs">
                印刷
              </Button>
            </div>
          </div>
          {/* 印刷時のヘッダ（画面表示時は非表示） */}
          <div className="hidden print:block mb-2 border-b pb-2">
            <h1 className="text-base font-bold">入金予定一覧（月別・催事ごと）</h1>
            <p className="text-xs text-muted-foreground">
              発行日: {new Date().toLocaleDateString("ja-JP")}　表示期間: {cardsByMonth.months[0]?.label} 〜 {cardsByMonth.months[cardsByMonth.months.length - 1]?.label}　※金額はすべて税込
            </p>
          </div>
          {/* 全展開/全折りたたみ コントロール */}
          <div className="flex items-center justify-end gap-2 print:hidden">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] text-muted-foreground"
              onClick={() => setExpandedMonths(new Set(cardsByMonth.months.map((m) => m.ym)))}
            >
              全て展開
            </Button>
            <span className="text-[10px] text-muted-foreground">|</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] text-muted-foreground"
              onClick={() => setExpandedMonths(new Set())}
            >
              全て折りたたみ
            </Button>
          </div>
          <div className="space-y-5 print:space-y-3">
            {cardsByMonth.months.map((m) => {
              const cards = cardsByMonth.byMonth.get(m.ym) || [];
              const totalPlanned = cards.reduce((s, p) => s + toIncludedAmt(p.planned_amount, p.planned_tax_type), 0);
              const paidCount = cards.filter((p) => p.status === "入金済").length;
              const unpaidCount = cards.length - paidCount;
              const isExpanded = expandedMonths.has(m.ym);
              return (
                <section
                  key={m.ym}
                  className="space-y-2 print:break-inside-avoid"
                >
                  <button
                    type="button"
                    onClick={() => toggleMonth(m.ym)}
                    className={`w-full flex items-baseline justify-between gap-2 border-b-2 pb-1 cursor-pointer hover:bg-muted/30 transition-colors text-left ${m.isCurrent ? "border-amber-500" : "border-gray-300"} print:cursor-default print:hover:bg-transparent`}
                    aria-expanded={isExpanded}
                  >
                    <h3 className="text-base font-bold flex items-center gap-1.5">
                      <span className="print:hidden">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </span>
                      {m.label}
                      {m.isCurrent && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">今月</span>}
                    </h3>
                    <div className="text-sm">
                      <span className="text-muted-foreground">合計</span>{" "}
                      <span className="font-bold text-emerald-800">¥{totalPlanned.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {cards.length}件 (入金済{paidCount}・未入金{unpaidCount})
                      </span>
                    </div>
                  </button>
                  {/* 折りたたまれていても印刷時は表示 */}
                  {cards.length === 0 ? (
                    isExpanded && <p className="text-xs text-muted-foreground italic pl-2 print:hidden">— 予定なし</p>
                  ) : (
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-2 print:grid-cols-2 ${isExpanded ? "" : "hidden print:!grid"}`}>
                      {cards.map((p) => {
                        const dd = daysDiffLabel(p.planned_date);
                        const plannedAmtIncl = toIncludedAmt(p.planned_amount, p.planned_tax_type);
                        const eventRevenue = p.events?.revenue;
                        const isPaid = p.status === "入金済";
                        const isHeld = p.status === "保留";
                        return (
                          <div
                            key={p.id}
                            className={`rounded-lg border p-3 space-y-2 print:break-inside-avoid ${isPaid ? "bg-green-50/50 border-green-300" : isHeld ? "bg-gray-50 border-gray-300" : dd.tone === "past" ? "bg-rose-50/50 border-rose-300" : "bg-white border-gray-200"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <Link href={`/events/${p.event_id}`} className="font-semibold text-sm hover:underline block truncate print:no-underline print:text-inherit">
                                  {eventLabel(p.events)}
                                  {p.installment_total > 1 && (
                                    <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">{p.installment_no}/{p.installment_total}回目</span>
                                  )}
                                </Link>
                                <p className="text-[11px] text-muted-foreground">
                                  催事 {p.events?.start_date}〜{p.events?.end_date}
                                  {p.installment_total > 1 && p.period_start_date && p.period_end_date && (
                                    <span className="block text-blue-700">対象期間: {p.period_start_date}〜{p.period_end_date}</span>
                                  )}
                                  {eventRevenue && (
                                    <> ・売上 <span className="font-medium">¥{eventRevenue.toLocaleString()}</span>(税込)</>
                                  )}
                                </p>
                              </div>
                              <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COLOR[p.status]}`}>{p.status}</Badge>
                            </div>
                            <div className="border-t pt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                              <div>
                                <div className="text-[10px] text-muted-foreground">入金予定日</div>
                                <div className="text-sm font-semibold">
                                  {p.planned_date || "—"}
                                  {dd.text && !isPaid && (
                                    <span className={`ml-1 text-[10px] ${dd.tone === "past" ? "text-rose-700 font-bold" : dd.tone === "today" ? "text-amber-700 font-bold" : dd.tone === "soon" ? "text-amber-700" : "text-muted-foreground"}`}>
                                      ({dd.text})
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-muted-foreground">予定額(税込)</div>
                                <div className="text-base font-bold text-emerald-800">¥{plannedAmtIncl.toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground">入金元</div>
                                <div className="text-xs">{paymentDisplayPayer(p)}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-muted-foreground">入金率</div>
                                <div className="text-xs">{p.applied_rate != null ? `${p.applied_rate}%` : "—"}</div>
                              </div>
                            </div>
                            {isPaid && p.actual_date && (
                              <div className="border-t pt-1.5 text-[11px] text-green-700">
                                ✓ {p.actual_date} に ¥{(p.actual_amount ?? 0).toLocaleString()} 入金{p.method ? ` (${METHOD_LABEL[p.method]})` : ""}
                              </div>
                            )}
                            {canEdit && (
                              <div className="border-t pt-1.5 flex items-center gap-1 print:hidden">
                                {!isPaid ? (
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => markPaid(p)}>
                                    ✓ 入金済にする
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[10px] px-2"
                                    onClick={async () => {
                                      if (!confirm("この入金を「予定」状態に戻しますか？\n実入金日・実入金額もクリアされます。")) return;
                                      const { error } = await supabase
                                        .from("event_payments")
                                        .update({ status: "予定", actual_date: null, actual_amount: null })
                                        .eq("id", p.id);
                                      if (error) {
                                        alert(`戻すのに失敗しました: ${error.message}`);
                                      } else {
                                        fetchData();
                                      }
                                    }}
                                    title="間違えて入金済にした場合に「予定」に戻す"
                                  >
                                    ↶ 予定に戻す
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 ml-auto" onClick={() => openEdit(p)}>
                                  編集
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 月次サマリ（予定日ベース・税込）（印刷時非表示） */}
      <Card className="print:hidden">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-700" />
              <h2 className="text-sm font-bold">月次入金予定（予定日ベース・税込）</h2>
            </div>
            <div className="text-[11px] text-muted-foreground">
              13ヶ月分 (過去6ヶ月 〜 未来6ヶ月) ・ キャンセルは除外
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月</TableHead>
                  <TableHead className="text-right">予定合計</TableHead>
                  <TableHead className="text-right">入金済</TableHead>
                  <TableHead className="text-right">未入金</TableHead>
                  <TableHead className="text-right w-20">件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlySummary.months.map((m) => {
                  const s = monthlySummary.summary.get(m.ym)!;
                  const isPast = !m.isCurrent && new Date(m.ym + "-01") < new Date(new Date().getFullYear(), new Date().getMonth(), 1);
                  return (
                    <TableRow key={m.ym} className={m.isCurrent ? "bg-amber-50 font-semibold" : isPast ? "text-muted-foreground" : ""}>
                      <TableCell>{m.label}{m.isCurrent && <span className="ml-1 text-[10px] text-amber-700">(今月)</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.planned > 0 ? `¥${s.planned.toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-700">{s.paid > 0 ? `¥${s.paid.toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-700">{s.unpaid > 0 ? `¥${s.unpaid.toLocaleString()}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.count > 0 ? `${s.count}件` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 font-bold bg-muted/30">
                  <TableCell>合計（13ヶ月）</TableCell>
                  <TableCell className="text-right tabular-nums">¥{monthlySummary.totals.planned.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-green-700">¥{monthlySummary.totals.paid.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700">¥{monthlySummary.totals.unpaid.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{monthlySummary.totals.count}件</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        {/* タブ: 入金元別 (クロス表) */}
        <TabsContent value="payer" keepMounted className="space-y-4 print:!block print:!opacity-100">

      {/* 入金元別 月次内訳（予定日ベース・税込）（印刷時非表示） */}
      {monthlySummary.payerList.length > 0 && (
        <Card className="print:hidden">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-700" />
              <h2 className="text-sm font-bold">入金元別 月次内訳（予定額・税込）</h2>
              <span className="text-[11px] text-muted-foreground ml-auto">
                合計額の大きい入金元順
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[160px]">入金元</TableHead>
                    {monthlySummary.months.map((m) => (
                      <TableHead key={m.ym} className={`text-right min-w-[90px] ${m.isCurrent ? "bg-amber-50" : ""}`}>
                        {m.label.replace(/^\d{4}年/, "")}
                      </TableHead>
                    ))}
                    <TableHead className="text-right min-w-[110px] bg-muted/30">合計</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlySummary.payerList.map((payer) => {
                    const total = monthlySummary.payerTotals.get(payer) || 0;
                    return (
                      <TableRow key={payer}>
                        <TableCell className="sticky left-0 bg-background z-10 font-medium">{payer}</TableCell>
                        {monthlySummary.months.map((m) => {
                          const s = monthlySummary.summary.get(m.ym)!;
                          const amt = s.byPayer.get(payer) || 0;
                          return (
                            <TableCell key={m.ym} className={`text-right tabular-nums text-xs ${m.isCurrent ? "bg-amber-50/60 font-semibold" : ""} ${amt === 0 ? "text-muted-foreground" : ""}`}>
                              {amt > 0 ? `¥${amt.toLocaleString()}` : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right tabular-nums font-bold bg-muted/30">¥{total.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              ※ 13ヶ月以外の入金は集計対象外。「キャンセル」ステータスは除外。
            </p>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        {/* タブ: 一覧 (フィルタ + 詳細表) */}
        <TabsContent value="list" keepMounted className="space-y-4 print:!block print:!opacity-100">

      {/* フィルタ（印刷時非表示） */}
      <Card className="print:hidden">
        <CardContent className="p-3 flex gap-2 flex-wrap items-center">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="催事名・会場で検索"
            className="w-60 h-9"
          />
          <Select value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {eventFilter && (
            <Link href="/payments" className="text-xs text-primary hover:underline">
              催事フィルタを解除
            </Link>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground print:hidden">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground print:hidden">
          表示する入金レコードがありません。
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto print:hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>催事</TableHead>
                <TableHead>入金元</TableHead>
                <TableHead>予定日</TableHead>
                <TableHead className="text-right">予定額<span className="text-[10px] text-muted-foreground ml-1">(税込)</span></TableHead>
                <TableHead>実入金日</TableHead>
                <TableHead className="text-right">実入金額</TableHead>
                <TableHead>ステータス</TableHead>
                {canEdit && <TableHead className="w-24">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">
                    {p.events && (
                      <Link href={`/events/${p.event_id}`} className="hover:underline inline-flex items-center gap-1">
                        {eventLabel(p.events)}
                        {p.installment_total > 1 && (
                          <span className="text-[9px] px-1 rounded bg-blue-100 text-blue-800 font-bold">{p.installment_no}/{p.installment_total}回目</span>
                        )}
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      {p.events?.start_date}〜{p.events?.end_date}
                      {p.installment_total > 1 && p.period_start_date && p.period_end_date && (
                        <span className="ml-1 text-blue-700">[{p.period_start_date.slice(5)}〜{p.period_end_date.slice(5)}]</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{paymentDisplayPayer(p)}</TableCell>
                  <TableCell className="text-sm">{p.planned_date || "—"}</TableCell>
                  <TableCell className="text-right text-sm">
                    {p.planned_amount != null ? `¥${toIncludedAmt(p.planned_amount, p.planned_tax_type).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{p.actual_date || "—"}</TableCell>
                  <TableCell className="text-right text-sm">
                    {p.actual_amount != null ? `¥${p.actual_amount.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_COLOR[p.status]}`}>{p.status}</Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        {p.status !== "入金済" ? (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => markPaid(p)} title="入金済にする">
                            ✓
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            title="間違えて入金済にした場合「予定」に戻す"
                            onClick={async () => {
                              if (!confirm("この入金を「予定」状態に戻しますか？\n実入金日・実入金額もクリアされます。")) return;
                              const { error } = await supabase
                                .from("event_payments")
                                .update({ status: "予定", actual_date: null, actual_amount: null })
                                .eq("id", p.id);
                              if (error) alert(`戻すのに失敗しました: ${error.message}`);
                              else fetchData();
                            }}
                          >
                            ↶
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDeletingId(p.id); setDeleteOpen(true); }}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
        </TabsContent>
      </Tabs>

      {/* 追加/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "入金を編集" : "入金を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 催事選択 */}
            <div className="space-y-2">
              <Label className="text-xs">催事<span className="text-rose-500 ml-0.5">*</span></Label>
              <Select value={form.event_id} onValueChange={(v) => v && setForm({ ...form, event_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="催事を選択">
                    {(value: string | null) => {
                      if (!value) return null;
                      const e = events.find((x) => x.id === value);
                      return e ? `${eventLabel(e)} (${e.start_date}〜${e.end_date})` : value;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {eventLabel(e)} ({e.start_date}〜{e.end_date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 入金元 */}
            <div className="space-y-2">
              <Label className="text-xs">入金元<span className="text-rose-500 ml-0.5">*</span></Label>
              <div className="flex gap-2 text-sm">
                <Button
                  type="button"
                  size="sm"
                  variant={form.payer_kind === "venue" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, payer_kind: "venue" })}
                >百貨店（直取引）</Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.payer_kind === "payer" ? "default" : "outline"}
                  onClick={() => setForm({ ...form, payer_kind: "payer" })}
                >帳合先経由</Button>
              </div>
              {form.payer_kind === "venue" ? (
                <Select value={form.venue_master_id || "none"} onValueChange={(v) => setForm({ ...form, venue_master_id: !v || v === "none" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="百貨店を選択">
                      {(value: string | null) => {
                        if (!value || value === "none") return "未選択";
                        const v = venues.find((x) => x.id === value);
                        return v ? `${v.venue_name}${v.store_name ? ` ${v.store_name}` : ""}` : value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="none">未選択</SelectItem>
                    {venues.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.venue_name}{v.store_name ? ` ${v.store_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={form.payer_master_id || "none"} onValueChange={(v) => setForm({ ...form, payer_master_id: !v || v === "none" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="帳合先を選択">
                      {(value: string | null) => {
                        if (!value || value === "none") return "未選択";
                        return payers.find((p) => p.id === value)?.name ?? value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未選択</SelectItem>
                    {payers.filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* 予定 */}
            <div className="rounded-lg border-2 border-amber-300 p-3 space-y-2 bg-amber-50/30">
              <p className="text-xs font-semibold text-amber-800">入金予定</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">予定日</Label>
                  <div className="flex gap-1">
                    <Input type="date" value={form.planned_date} onChange={(e) => setForm({ ...form, planned_date: e.target.value })} />
                    <Button type="button" variant="outline" size="sm" onClick={calcPlannedDate} title="振込サイクルから自動計算">
                      <Calculator className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">予定額（円）</Label>
                  <Input
                    type="number"
                    value={form.planned_amount}
                    onChange={(e) => setForm({ ...form, planned_amount: e.target.value })}
                    placeholder="例: 300000"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => copyFromRevenue("excluded")} disabled={!form.event_id}>
                  売上から税抜をコピー
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => copyFromRevenue("included")} disabled={!form.event_id}>
                  売上から税込をコピー
                </Button>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  現在の税区分: {form.planned_tax_type === "excluded" ? "税抜" : "税込"}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">入金率（%）— 売上から予定額をコピーする際にこの率を乗算</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.applied_rate}
                    onChange={(e) => setForm({ ...form, applied_rate: e.target.value })}
                    placeholder="例: 80（催事作成時に自動セット）"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* 実績 */}
            <div className="rounded-lg border-2 border-green-300 p-3 space-y-2 bg-green-50/30">
              <p className="text-xs font-semibold text-green-800">入金実績</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">実入金日</Label>
                  <Input type="date" value={form.actual_date} onChange={(e) => setForm({ ...form, actual_date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">実入金額（円・手数料引き後）</Label>
                  <Input
                    type="number"
                    value={form.actual_amount}
                    onChange={(e) => setForm({ ...form, actual_amount: e.target.value })}
                    placeholder="振込手数料が引かれた後の金額"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">入金方法</Label>
                  <Select value={form.method} onValueChange={(v) => v && setForm({ ...form, method: v as "transfer" | "cash" | "other" })}>
                    <SelectTrigger>
                      <SelectValue>
                        {(value: string | null) => (value ? METHOD_LABEL[value] ?? value : null)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transfer">振込</SelectItem>
                      <SelectItem value="cash">現金</SelectItem>
                      <SelectItem value="other">その他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">ステータス</Label>
                  <Select value={form.status} onValueChange={(v) => v && setForm({ ...form, status: v as typeof STATUS_OPTIONS[number] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 備考 */}
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">キャンセル</Button>} />
            <Button onClick={save} disabled={!form.event_id || saving}>
              {saving ? "保存中..." : editingId ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この入金レコードを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
