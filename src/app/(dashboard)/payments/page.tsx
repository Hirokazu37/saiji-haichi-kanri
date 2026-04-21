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
import { Wallet, Download, Plus, Pencil, Trash2, ArrowUpRight, Calculator } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { computePlannedPaymentDate } from "@/lib/payment-cycle";

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
  events: EventLite | null;
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

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [venues, setVenues] = useState<VenueMasterLite[]>([]);
  const [payers, setPayers] = useState<PayerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

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
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        unpaidAmount += p.planned_amount || 0;
        if (p.planned_date && p.planned_date < today) overdue++;
      }
      if (p.planned_date && p.planned_date >= today && p.planned_date < nextMonthStart && (p.status === "予定" || p.status === "保留")) {
        thisMonthPlanned += p.planned_amount || 0;
      }
    }
    return { unpaidCount, unpaidAmount, thisMonthPlanned, overdue };
  }, [payments]);

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
      salesTotal = taxType === "included" ? r : Math.round(r / 1.08);
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
      "催事名", "会場", "開催期間", "入金元", "予定日", "予定額", "税区分",
      "実入金日", "実入金額", "方法", "ステータス", "備考"
    ];
    const rows = filtered.map((p) => {
      const ev = p.events;
      return [
        ev?.name || "",
        eventLabel(ev),
        ev ? `${ev.start_date}〜${ev.end_date}` : "",
        paymentDisplayPayer(p),
        p.planned_date || "",
        p.planned_amount != null ? String(p.planned_amount) : "",
        p.planned_tax_type === "excluded" ? "税抜" : p.planned_tax_type === "included" ? "税込" : "",
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
      <div className="flex items-end justify-between flex-wrap gap-2">
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

      {/* サマリ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <div className="text-xs text-muted-foreground">未入金合計</div>
            <div className="text-xl font-bold">¥{summary.unpaidAmount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">今月の入金予定</div>
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

      {/* フィルタ */}
      <Card>
        <CardContent className="p-3 flex gap-2 flex-wrap items-center">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="催事名・会場で検索"
            className="w-60 h-9"
          />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
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
        <p className="text-muted-foreground">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          表示する入金レコードがありません。
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>催事</TableHead>
                <TableHead>入金元</TableHead>
                <TableHead>予定日</TableHead>
                <TableHead className="text-right">予定額</TableHead>
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
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                    <div className="text-[10px] text-muted-foreground">{p.events?.start_date}〜{p.events?.end_date}</div>
                  </TableCell>
                  <TableCell className="text-sm">{paymentDisplayPayer(p)}</TableCell>
                  <TableCell className="text-sm">{p.planned_date || "—"}</TableCell>
                  <TableCell className="text-right text-sm">
                    {p.planned_amount != null ? `¥${p.planned_amount.toLocaleString()}` : "—"}
                    {p.planned_tax_type && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({p.planned_tax_type === "excluded" ? "税抜" : "税込"})
                      </span>
                    )}
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
                        {p.status !== "入金済" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => markPaid(p)} title="入金済にする">
                            ✓
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

      {/* 追加/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "入金を編集" : "入金を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 催事選択 */}
            <div className="space-y-2">
              <Label>催事 *</Label>
              <Select value={form.event_id} onValueChange={(v) => v && setForm({ ...form, event_id: v })}>
                <SelectTrigger><SelectValue placeholder="催事を選択" /></SelectTrigger>
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
              <Label>入金元 *</Label>
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
                <Select value={form.venue_master_id || "none"} onValueChange={(v) => setForm({ ...form, venue_master_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="百貨店を選択" /></SelectTrigger>
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
                <Select value={form.payer_master_id || "none"} onValueChange={(v) => setForm({ ...form, payer_master_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="帳合先を選択" /></SelectTrigger>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
