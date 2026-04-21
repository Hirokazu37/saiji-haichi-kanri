"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Trash2, ArrowLeft, X, Building2, Save, Check, Copy, TrendingUp, MapPin, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { prefectures, eventStatuses } from "@/lib/prefectures";
import { ArrangementEditor, type ArrangementEditorHandle } from "@/components/arrangements/ArrangementEditor";
import { StaffTab } from "@/components/arrangements/StaffTab";
import { PaymentSummaryCard } from "@/components/arrangements/PaymentSummaryCard";
import { PayerSourceSection } from "@/components/arrangements/PayerSourceSection";
import { usePermission } from "@/hooks/usePermission";
import { downloadIcs, mapsUrl } from "@/lib/ics";

type EventData = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  prefecture: string;
  start_date: string;
  end_date: string;
  closing_time: string | null;
  last_day_closing_time: string | null;
  person_in_charge: string | null;
  status: string;
  application_status: string | null;
  application_submitted_date: string | null;
  application_method: string | null;
  notes: string | null;
  revenue: number | null;
  retrospective: string | null;
  payer_master_id: string | null;
  force_direct: boolean;
};

type TaxType = "excluded" | "included";
type DailyRevenueRow = {
  id: string;
  event_id: string;
  date: string;
  amount: number | null;
  tax_type: TaxType;
  tax_rate: number;
};
type DailyInput = { amount: string; tax_type: TaxType; tax_rate: number };

// 税抜 ↔ 税込 変換（整数四捨五入）
const toIncluded = (excludedAmount: number, rate: number) => Math.round(excludedAmount * (1 + rate));
const toExcluded = (includedAmount: number, rate: number) => Math.round(includedAmount / (1 + rate));

const statusColor: Record<string, string> = {
  "準備中": "bg-gray-100 text-gray-800",
  "手配中": "bg-yellow-100 text-yellow-800",
  "手配完了": "bg-blue-100 text-blue-800",
  "開催中": "bg-green-100 text-green-800",
  "終了": "bg-gray-200 text-gray-500",
};

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { canEdit } = usePermission();
  const supabase = createClient();
  const router = useRouter();
  type Employee = { id: string; name: string };
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const arrangementRef = useRef<ArrangementEditorHandle>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [originalStaffRecords, setOriginalStaffRecords] = useState<{ id: string; employee_id: string }[]>([]);
  const [form, setForm] = useState({
    name: "",
    venue: "",
    store_name: "",
    prefecture: "",
    start_date: "",
    end_date: "",
    closing_time: "",
    last_day_closing_time: "",
    person_in_charge: "",
    status: "",
    application_status: "未提出",
    application_submitted_date: "",
    application_method: "",
    notes: "",
    revenue: "",
    retrospective: "",
    // 入金設定（"venue" = 百貨店デフォルト, "direct" = 直取引強制, "payer:<uuid>" = 特定帳合先）
    payer_source: "venue" as string,
  });

  // 日別売上: date(YYYY-MM-DD) -> { 金額文字列, 税抜/税込, 税率 }
  const [dailyRevenue, setDailyRevenue] = useState<Map<string, DailyInput>>(new Map());

  const fetchEvent = useCallback(async () => {
    const [eventRes, empRes, staffRes, dailyRes] = await Promise.all([
      supabase.from("events").select("*").eq("id", id).single(),
      supabase.from("employees").select("id, name").order("sort_order").order("name"),
      supabase.from("event_staff").select("id, employee_id").eq("event_id", id).eq("role", "担当者"),
      supabase.from("event_daily_revenue").select("*").eq("event_id", id).order("date"),
    ]);
    if (eventRes.data) {
      setEvent(eventRes.data);
      setForm({
        name: eventRes.data.name || "",
        venue: eventRes.data.venue,
        store_name: eventRes.data.store_name || "",
        prefecture: eventRes.data.prefecture,
        closing_time: eventRes.data.closing_time || "",
        last_day_closing_time: eventRes.data.last_day_closing_time || "",
        start_date: eventRes.data.start_date,
        end_date: eventRes.data.end_date,
        person_in_charge: eventRes.data.person_in_charge || "",
        status: eventRes.data.status,
        application_status: eventRes.data.application_status || "未提出",
        application_submitted_date: eventRes.data.application_submitted_date || "",
        application_method: eventRes.data.application_method || "",
        notes: eventRes.data.notes || "",
        revenue: eventRes.data.revenue != null ? String(eventRes.data.revenue) : "",
        retrospective: eventRes.data.retrospective || "",
        payer_source:
          eventRes.data.payer_master_id ? `payer:${eventRes.data.payer_master_id}` :
          eventRes.data.force_direct ? "direct" : "venue",
      });
    }
    // 日別売上をMapに詰める
    const dailyMap = new Map<string, DailyInput>();
    ((dailyRes.data || []) as DailyRevenueRow[]).forEach((r) => {
      dailyMap.set(r.date, {
        amount: r.amount != null ? String(r.amount) : "",
        tax_type: (r.tax_type ?? "excluded") as TaxType,
        tax_rate: r.tax_rate ?? 0.08,
      });
    });
    setDailyRevenue(dailyMap);
    const emps = empRes.data || [];
    setEmployees(emps);
    const staffRecords = (staffRes.data || []) as { id: string; employee_id: string }[];
    setOriginalStaffRecords(staffRecords);
    const staffEmpIds = staffRecords.map((s) => s.employee_id);
    setSelectedEmployeeIds(staffEmpIds);
    // person_in_chargeからバッジ選択済みの社員名を除外し、自由入力分だけformに残す
    if (eventRes.data) {
      const selectedNames = new Set(emps.filter((e) => staffEmpIds.includes(e.id)).map((e) => e.name));
      const freeText = (eventRes.data.person_in_charge || "")
        .split(/[、,]/)
        .map((s: string) => s.trim())
        .filter((s: string) => s && !selectedNames.has(s))
        .join("、");
      setForm((prev) => ({ ...prev, person_in_charge: freeText }));
    }
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  const buildPersonInCharge = () => {
    const selectedNames = employees
      .filter((e) => selectedEmployeeIds.includes(e.id))
      .map((e) => e.name);
    const extra = form.person_in_charge.trim();
    // 自由入力から選択済み社員名を除外
    const freeText = extra
      .split(/[、,]/)
      .map((s) => s.trim())
      .filter((s) => s && !selectedNames.includes(s))
      .join("、");
    return [...selectedNames, ...(freeText ? [freeText] : [])].join("、");
  };

  const toggleEmployee = (empId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((x) => x !== empId) : [...prev, empId]
    );
  };

  const handleUpdate = async () => {
    setSaveState("saving");
    // 担当者テキスト = 選択した社員名 + 自由入力テキスト
    const selectedNames = employees
      .filter((e) => selectedEmployeeIds.includes(e.id))
      .map((e) => e.name);
    const extraText = form.person_in_charge.trim();
    // person_in_charge から選択済み社員名を除いた自由入力部分だけ保持
    const freeText = extraText
      .split(/[、,]/)
      .map((s) => s.trim())
      .filter((s) => s && !selectedNames.includes(s))
      .join("、");
    const allNames = [...selectedNames, ...(freeText ? [freeText] : [])];

    // 日別売上の税込合計を計算（events.revenue には税込合計を格納）
    let includedTotal = 0;
    let hasAnyDaily = false;
    for (const v of dailyRevenue.values()) {
      const n = v.amount.trim() ? parseInt(v.amount) : NaN;
      if (isNaN(n)) continue;
      hasAnyDaily = true;
      const inc = v.tax_type === "included" ? n : toIncluded(n, v.tax_rate);
      includedTotal += inc;
    }
    const revenueToSave = hasAnyDaily
      ? includedTotal
      : form.revenue.trim() ? parseInt(form.revenue) : null;

    // 入金元設定を分解
    const payerSource = form.payer_source;
    const payerMasterIdToSave = payerSource.startsWith("payer:") ? payerSource.slice(6) : null;
    const forceDirectToSave = payerSource === "direct";

    await supabase
      .from("events")
      .update({
        name: form.name.trim() || null,
        venue: form.venue.trim(),
        store_name: form.store_name.trim() || null,
        prefecture: form.prefecture,
        start_date: form.start_date,
        end_date: form.end_date,
        closing_time: form.closing_time.trim() || null,
        last_day_closing_time: form.last_day_closing_time.trim() || null,
        person_in_charge: allNames.length > 0 ? allNames.join("、") : null,
        status: form.status,
        application_status: form.application_status,
        application_submitted_date: form.application_submitted_date || null,
        application_method: form.application_method || null,
        notes: form.notes.trim() || null,
        revenue: revenueToSave,
        retrospective: form.retrospective.trim() || null,
        payer_master_id: payerMasterIdToSave,
        force_direct: forceDirectToSave,
      })
      .eq("id", id);

    // 日別売上テーブルを差分更新
    // 現在DBにある行を取得 → 新しいMapと突き合わせて upsert / delete
    const { data: existingDaily } = await supabase
      .from("event_daily_revenue")
      .select("id, date, amount")
      .eq("event_id", id);
    const existingByDate = new Map<string, { id: string; amount: number | null }>();
    (existingDaily || []).forEach((r: { id: string; date: string; amount: number | null }) => {
      existingByDate.set(r.date, { id: r.id, amount: r.amount });
    });

    const toUpsert: Array<{
      event_id: string;
      date: string;
      amount: number;
      tax_type: TaxType;
      tax_rate: number;
    }> = [];
    const toDelete: string[] = [];

    for (const [date, input] of dailyRevenue.entries()) {
      const trimmed = input.amount.trim();
      if (!trimmed) {
        // 空入力: 既存行があれば削除
        const ex = existingByDate.get(date);
        if (ex) toDelete.push(ex.id);
        continue;
      }
      const n = parseInt(trimmed);
      if (isNaN(n)) continue;
      toUpsert.push({
        event_id: id,
        date,
        amount: n,
        tax_type: input.tax_type,
        tax_rate: input.tax_rate,
      });
    }
    // dailyRevenue に含まれない日付で既存行があれば削除（会期変更などで日付が外れたケース）
    for (const [date, row] of existingByDate.entries()) {
      if (!dailyRevenue.has(date)) toDelete.push(row.id);
    }

    if (toDelete.length > 0) {
      await supabase.from("event_daily_revenue").delete().in("id", toDelete);
    }
    if (toUpsert.length > 0) {
      await supabase.from("event_daily_revenue").upsert(toUpsert, { onConflict: "event_id,date" });
    }

    // event_staff の担当者を差分更新（他ロールのレコードを壊さない）
    const originalEmpIds = originalStaffRecords.map((r) => r.employee_id);
    const toRemove = originalStaffRecords.filter((r) => !selectedEmployeeIds.includes(r.employee_id));
    const toAdd = selectedEmployeeIds.filter((empId) => !originalEmpIds.includes(empId));

    if (toRemove.length > 0) {
      await supabase.from("event_staff").delete().in("id", toRemove.map((r) => r.id));
    }
    if (toAdd.length > 0) {
      await supabase.from("event_staff").insert(
        toAdd.map((empId) => ({
          event_id: id,
          employee_id: empId,
          start_date: form.start_date,
          end_date: form.end_date,
          role: "担当者",
        }))
      );
    }

    // 手配状況（出店申込書・ホテル・交通・マネキン・DM・備品）も一緒に保存
    await arrangementRef.current?.save();

    await fetchEvent();
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 2500);
  };

  const SaveButton = ({ className = "", size = "lg" }: { className?: string; size?: "lg" | "default" }) => {
    const isSaving = saveState === "saving";
    const isSaved = saveState === "saved";
    return (
      <Button
        onClick={handleUpdate}
        disabled={isSaving}
        size={size}
        className={`min-w-[160px] font-bold shadow-md text-white ${isSaved ? "bg-green-700 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} ${className}`}
      >
        {isSaving ? (
          <>保存中...</>
        ) : isSaved ? (
          <><Check className="h-4 w-4 mr-1" />保存しました</>
        ) : (
          <><Save className="h-4 w-4 mr-1" />このページを保存</>
        )}
      </Button>
    );
  };

  const handleDelete = async () => {
    await supabase.from("events").delete().eq("id", id);
    router.push("/events");
  };

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;
  if (!event) return <p className="text-destructive">催事が見つかりません。</p>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link
            href="/events"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            催事一覧に戻る
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{event.venue}{event.store_name ? ` ${event.store_name}` : ""}</h1>
            {event.person_in_charge && (
              <span className="text-xl font-bold">担当（{event.person_in_charge}）</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {event.name && <><span>{event.name}（{event.prefecture}）</span><span>|</span></>}
            {!event.name && <><span>{event.prefecture}</span><span>|</span></>}
            <span>{event.start_date} 〜 {event.end_date}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={statusColor[event.status] || ""}
          >
            {event.status}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            asChild
            title="会場を Google マップで開く"
          >
            <a
              href={mapsUrl(`${event.venue}${event.store_name ? ` ${event.store_name}` : ""} ${event.prefecture}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin className="h-4 w-4 mr-1" />
              地図
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadIcs({
                id: event.id,
                title: `${event.venue}${event.store_name ? ` ${event.store_name}` : ""}${event.name ? ` - ${event.name}` : ""}`,
                startDate: event.start_date,
                endDate: event.end_date,
                location: `${event.venue}${event.store_name ? ` ${event.store_name}` : ""} (${event.prefecture})`,
                description: [
                  event.person_in_charge ? `担当: ${event.person_in_charge}` : "",
                  event.closing_time ? `閉場: ${event.closing_time}` : "",
                  event.notes || "",
                ].filter(Boolean).join("\n"),
              })
            }
            title="iPhone/Googleカレンダーに追加"
          >
            <CalendarPlus className="h-4 w-4 mr-1" />
            カレンダー
          </Button>
          {canEdit && <SaveButton />}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/events/new?from=${id}`)}
              title="この催事を複製して新規作成"
            >
              <Copy className="h-4 w-4 mr-1" />
              複製
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1 text-destructive" />
              削除
            </Button>
          )}
        </div>
      </div>

      {/* 基本情報 */}
      <Card className="border-l-4 border-l-slate-500 bg-slate-50/50">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-bold text-slate-800">基本情報</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>百貨店名 *</Label>
              <Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>店舗名</Label>
              <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>催事名</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="元祖有名駅弁と全国うまいもの大会" />
            </div>
            <div className="space-y-2">
              <Label>開催地 *</Label>
              <Select value={form.prefecture} onValueChange={(v) => v && setForm({ ...form, prefecture: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{prefectures.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4">
            <div className="space-y-2">
              <Label>開催期間 *</Label>
              <DateRangePicker
                startDate={form.start_date}
                endDate={form.end_date}
                onChange={(start, end) => setForm((prev) => ({ ...prev, start_date: start, end_date: end }))}
              />
            </div>
            <div className="space-y-2">
              <Label>閉場時間</Label>
              <Input type="time" value={form.closing_time} onChange={(e) => setForm({ ...form, closing_time: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>最終日の閉場時間</Label>
              <Input
                type="time"
                value={form.last_day_closing_time}
                onChange={(e) => setForm({ ...form, last_day_closing_time: e.target.value })}
                placeholder="早く閉まる場合のみ"
              />
              <p className="text-[10px] text-muted-foreground">通常より早く閉まる場合のみ入力</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>担当者</Label>
            <div className="flex flex-wrap gap-2">
              {employees.map((emp) => {
                const selected = selectedEmployeeIds.includes(emp.id);
                return (
                  <Badge key={emp.id} variant={selected ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleEmployee(emp.id)}>
                    {emp.name}{selected && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                );
              })}
            </div>
            <Input value={form.person_in_charge} onChange={(e) => setForm({ ...form, person_in_charge: e.target.value })} placeholder="その他（社員マスターにない人がいれば入力）" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>ステータス</Label>
              <Select value={form.status} onValueChange={(v) => v && setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{eventStatuses.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          {/* 入金設定（経理閲覧権限者のみ） */}
          <PayerSourceSection
            venueName={form.venue}
            storeName={form.store_name}
            payerSource={form.payer_source}
            onChange={(v) => setForm({ ...form, payer_source: v })}
          />
        </CardContent>
      </Card>

      {/* 手配状況 */}
      <ArrangementEditor ref={arrangementRef} eventId={id} venue={event?.venue || ""} storeName={event?.store_name || null} startDate={event.start_date} endDate={event.end_date} />

      {/* 社員配置 */}
      <StaffTab eventId={id} startDate={event.start_date} endDate={event.end_date} />

      {/* 入金サマリ（経理閲覧権限がある場合のみ） */}
      <PaymentSummaryCard eventId={id} />

      {/* 実績（売上・振り返り） */}
      <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/30">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-700" />
            <span className="text-sm font-bold text-emerald-800">実績（終了後に記録）</span>
          </div>

          {/* 日別売上 */}
          {(() => {
            // 会期の日付配列を作る
            const days: string[] = [];
            if (form.start_date && form.end_date) {
              const s = new Date(form.start_date + "T00:00:00");
              const e = new Date(form.end_date + "T00:00:00");
              const cur = new Date(s);
              while (cur <= e) {
                const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
                days.push(ymd);
                cur.setDate(cur.getDate() + 1);
              }
            }
            const wdayLabel = (ymd: string) => {
              const d = new Date(ymd + "T00:00:00");
              return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
            };
            const fmt = (ymd: string) => {
              const d = new Date(ymd + "T00:00:00");
              return `${d.getMonth() + 1}/${d.getDate()}（${wdayLabel(ymd)}）`;
            };
            // 税込・税抜の各合計を計算
            let totalExcluded = 0;
            let totalIncluded = 0;
            for (const d of days) {
              const v = dailyRevenue.get(d);
              if (!v) continue;
              const n = v.amount.trim() ? parseInt(v.amount) : NaN;
              if (isNaN(n)) continue;
              if (v.tax_type === "excluded") {
                totalExcluded += n;
                totalIncluded += toIncluded(n, v.tax_rate);
              } else {
                totalIncluded += n;
                totalExcluded += toExcluded(n, v.tax_rate);
              }
            }

            const getInput = (ymd: string): DailyInput => {
              return dailyRevenue.get(ymd) ?? { amount: "", tax_type: "excluded", tax_rate: 0.08 };
            };
            const updateInput = (ymd: string, patch: Partial<DailyInput>) => {
              const next = new Map(dailyRevenue);
              const cur = getInput(ymd);
              next.set(ymd, { ...cur, ...patch });
              setDailyRevenue(next);
            };

            return (
              <div className="space-y-2">
                <Label className="text-xs">売上金額（円） — 日別（税抜/税込を選んでください）</Label>
                {days.length === 0 ? (
                  <p className="text-xs text-muted-foreground">開催期間を入力すると日別の入力欄が表示されます</p>
                ) : (
                  <div className="space-y-1.5">
                    {days.map((ymd, idx) => {
                      const input = getInput(ymd);
                      const n = input.amount.trim() ? parseInt(input.amount) : NaN;
                      const otherLabel = input.tax_type === "excluded"
                        ? (isNaN(n) ? "—" : `税込 ¥${toIncluded(n, input.tax_rate).toLocaleString()}`)
                        : (isNaN(n) ? "—" : `税抜 ¥${toExcluded(n, input.tax_rate).toLocaleString()}`);
                      return (
                        <div key={ymd} className="flex items-center gap-2 flex-wrap">
                          <div className="w-24 text-xs text-muted-foreground shrink-0">
                            {fmt(ymd)}
                            {idx === days.length - 1 && days.length > 1 && (
                              <span className="ml-1 text-[10px] text-amber-700">（最終日）</span>
                            )}
                          </div>
                          <Input
                            type="number"
                            min={0}
                            step={1000}
                            value={input.amount}
                            onChange={(e) => updateInput(ymd, { amount: e.target.value })}
                            placeholder="例: 250000"
                            className="h-9 max-w-[160px]"
                          />
                          {/* 税抜/税込 トグル */}
                          <div className="inline-flex rounded-md border overflow-hidden text-xs">
                            <button
                              type="button"
                              onClick={() => updateInput(ymd, { tax_type: "excluded" })}
                              className={`px-2 py-1 ${input.tax_type === "excluded" ? "bg-emerald-600 text-white font-bold" : "bg-white text-muted-foreground hover:bg-muted"}`}
                            >
                              税抜
                            </button>
                            <button
                              type="button"
                              onClick={() => updateInput(ymd, { tax_type: "included" })}
                              className={`px-2 py-1 border-l ${input.tax_type === "included" ? "bg-emerald-600 text-white font-bold" : "bg-white text-muted-foreground hover:bg-muted"}`}
                            >
                              税込
                            </button>
                          </div>
                          {/* 税率（8% / 10% 切替） */}
                          <Select
                            value={String(input.tax_rate)}
                            onValueChange={(v) => v && updateInput(ymd, { tax_rate: parseFloat(v) })}
                          >
                            <SelectTrigger className="h-9 w-[80px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0.08">8%</SelectItem>
                              <SelectItem value="0.1">10%</SelectItem>
                            </SelectContent>
                          </Select>
                          {/* 自動計算のもう片方 */}
                          <span className="text-xs text-muted-foreground">→ {otherLabel}</span>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-4 pt-2 border-t flex-wrap">
                      <span className="w-24 text-xs font-semibold shrink-0">合計</span>
                      <span className="text-sm">
                        <span className="text-muted-foreground">税抜 </span>
                        <span className="font-bold text-emerald-800">¥{totalExcluded.toLocaleString()}</span>
                      </span>
                      <span className="text-sm">
                        <span className="text-muted-foreground">税込 </span>
                        <span className="font-bold text-emerald-800">¥{totalIncluded.toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                )}
                {/* 旧・一括入力値は後方互換で隠し保持（日別が空の時のみ採用される） */}
                {form.revenue && days.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">※ 旧データ: ¥{parseInt(form.revenue).toLocaleString()}（日別入力を保存すると上書きされます）</p>
                )}
              </div>
            );
          })()}

          <div className="space-y-1 pt-2">
            <Label className="text-xs">振り返りメモ</Label>
            <Textarea
              value={form.retrospective}
              onChange={(e) => setForm({ ...form, retrospective: e.target.value })}
              rows={2}
              placeholder="反省点・来年に活かせる点など"
            />
          </div>
        </CardContent>
      </Card>

      {/* ページ最下部の保存ボタン */}
      {canEdit && (
        <div className="flex justify-center pt-4 pb-8 border-t">
          <SaveButton className="min-w-[240px] text-base" />
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>催事を削除しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            この催事に紐づく全ての手配データ（ホテル・交通・マネキン・社員配置・備品転送）も削除されます。
          </p>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">キャンセル</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete}>
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
