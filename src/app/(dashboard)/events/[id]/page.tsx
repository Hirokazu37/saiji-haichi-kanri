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
  const { canEdit, canViewPayments } = usePermission();
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
  const [selectedMannequinIds, setSelectedMannequinIds] = useState<string[]>([]);
  const [mannequinOptions, setMannequinOptions] = useState<{ id: string; name: string }[]>([]);
  const [originalStaffRecords, setOriginalStaffRecords] = useState<{ id: string; person_type: "employee" | "mannequin"; employee_id: string | null; mannequin_person_id: string | null }[]>([]);
  // この催事の マネキン手配(mannequins) に登録されているスタッフ名一覧（二重登録警告用）
  const [mannequinHandledNames, setMannequinHandledNames] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    name: "",
    venue: "",
    store_name: "",
    prefecture: "",
    start_date: "",
    end_date: "",
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
    const [eventRes, empRes, staffRes, dailyRes, mpRes, mannRes] = await Promise.all([
      supabase.from("events").select("*").eq("id", id).single(),
      supabase.from("employees").select("id, name").order("sort_order").order("name"),
      supabase.from("event_staff").select("id, person_type, employee_id, mannequin_person_id").eq("event_id", id).eq("role", "担当者"),
      supabase.from("event_daily_revenue").select("*").eq("event_id", id).order("date"),
      supabase.from("mannequin_people").select("id, name").eq("treat_as_employee", true).order("name"),
      supabase.from("mannequins").select("staff_name").eq("event_id", id),
    ]);
    if (eventRes.data) {
      setEvent(eventRes.data);
      setForm({
        name: eventRes.data.name || "",
        venue: eventRes.data.venue,
        store_name: eventRes.data.store_name || "",
        prefecture: eventRes.data.prefecture,
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
    const mpOptions = (mpRes.data || []) as { id: string; name: string }[];
    setMannequinOptions(mpOptions);
    const staffRecords = (staffRes.data || []) as { id: string; person_type: "employee" | "mannequin"; employee_id: string | null; mannequin_person_id: string | null }[];
    setOriginalStaffRecords(staffRecords);
    const staffEmpIds = staffRecords.filter((s) => s.person_type === "employee" && s.employee_id).map((s) => s.employee_id as string);
    const staffMpIds = staffRecords.filter((s) => s.person_type === "mannequin" && s.mannequin_person_id).map((s) => s.mannequin_person_id as string);
    setSelectedEmployeeIds(staffEmpIds);
    setSelectedMannequinIds(staffMpIds);
    // マネキン手配で登録されている氏名一覧
    const mannNames = new Set<string>(
      ((mannRes.data || []) as { staff_name: string | null }[])
        .map((r) => (r.staff_name || "").trim())
        .filter(Boolean)
    );
    setMannequinHandledNames(mannNames);
    // person_in_chargeからバッジ選択済みの名前を除外し、自由入力分だけformに残す
    if (eventRes.data) {
      const selectedNames = new Set([
        ...emps.filter((e) => staffEmpIds.includes(e.id)).map((e) => e.name),
        ...mpOptions.filter((p) => staffMpIds.includes(p.id)).map((p) => p.name),
      ]);
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
    const selectedNames = [
      ...employees.filter((e) => selectedEmployeeIds.includes(e.id)).map((e) => e.name),
      ...mannequinOptions.filter((p) => selectedMannequinIds.includes(p.id)).map((p) => p.name),
    ];
    const extra = form.person_in_charge.trim();
    // 自由入力から選択済み名前を除外
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
  const toggleMannequin = (mpId: string) => {
    setSelectedMannequinIds((prev) =>
      prev.includes(mpId) ? prev.filter((x) => x !== mpId) : [...prev, mpId]
    );
  };

  const handleUpdate = async () => {
    setSaveState("saving");
    // エラーが出たら最後にまとめて表示する
    const errors: string[] = [];

    // 担当者テキスト = 選択した社員/マネキン名 + 自由入力テキスト
    const selectedNames = [
      ...employees.filter((e) => selectedEmployeeIds.includes(e.id)).map((e) => e.name),
      ...mannequinOptions.filter((p) => selectedMannequinIds.includes(p.id)).map((p) => p.name),
    ];
    const extraText = form.person_in_charge.trim();
    // person_in_charge から選択済み名前を除いた自由入力部分だけ保持
    const freeText = extraText
      .split(/[、,]/)
      .map((s) => s.trim())
      .filter((s) => s && !selectedNames.includes(s))
      .join("、");
    const allNames = [...selectedNames, ...(freeText ? [freeText] : [])];

    // 日別売上の税込・税抜合計を計算（events.revenue には税込合計を格納）
    let includedTotal = 0;
    let excludedTotal = 0;
    let hasAnyDaily = false;
    for (const v of dailyRevenue.values()) {
      const n = v.amount.trim() ? parseInt(v.amount) : NaN;
      if (isNaN(n)) continue;
      hasAnyDaily = true;
      if (v.tax_type === "excluded") {
        excludedTotal += n;
        includedTotal += toIncluded(n, v.tax_rate);
      } else {
        includedTotal += n;
        excludedTotal += toExcluded(n, v.tax_rate);
      }
    }
    const revenueToSave = hasAnyDaily
      ? includedTotal
      : form.revenue.trim() ? parseInt(form.revenue) : null;

    // 入金元設定を分解
    const payerSource = form.payer_source;
    const payerMasterIdToSave = payerSource.startsWith("payer:") ? payerSource.slice(6) : null;
    const forceDirectToSave = payerSource === "direct";

    const evtUpdate = await supabase
      .from("events")
      .update({
        name: form.name.trim() || null,
        venue: form.venue.trim(),
        store_name: form.store_name.trim() || null,
        prefecture: form.prefecture,
        start_date: form.start_date,
        end_date: form.end_date,
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
    if (evtUpdate.error) {
      console.error("[events update] error:", evtUpdate.error);
      errors.push(`催事情報の保存に失敗: ${evtUpdate.error.message}`);
    }

    // 日別売上テーブルを差分更新
    // 現在DBにある行を取得 → 新しいMapと突き合わせて upsert / delete
    const { data: existingDaily, error: dailyReadErr } = await supabase
      .from("event_daily_revenue")
      .select("id, date, amount")
      .eq("event_id", id);
    if (dailyReadErr) {
      console.error("[event_daily_revenue read] error:", dailyReadErr);
      errors.push(`日別売上の取得に失敗: ${dailyReadErr.message}`);
    }
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
      const delRes = await supabase.from("event_daily_revenue").delete().in("id", toDelete);
      if (delRes.error) {
        console.error("[event_daily_revenue delete] error:", delRes.error);
        errors.push(`日別売上の削除に失敗: ${delRes.error.message}`);
      }
    }
    if (toUpsert.length > 0) {
      const upRes = await supabase.from("event_daily_revenue").upsert(toUpsert, { onConflict: "event_id,date" });
      if (upRes.error) {
        console.error("[event_daily_revenue upsert] error:", upRes.error);
        errors.push(`日別売上の保存に失敗: ${upRes.error.message}`);
      }
    }

    // 入金管理: 売上が入ったら event_payments の planned_amount が空の行に自動で金額を埋める。
    // また、event_payments 自体が無い催事（古い催事）にはレコードを自動作成する。
    // ※ event_payments の RLS は経理閲覧権限を要求するため、権限がないユーザーは
    //   SELECT が空配列で返り auto-create を試みて INSERT で弾かれてしまう。
    //   その場合は auto-fill 処理ごとスキップする。
    if (hasAnyDaily && canViewPayments) {
      try {
        const { data: paymentRows, error: payReadErr } = await supabase
          .from("event_payments")
          .select("id, planned_date, planned_amount, planned_tax_type, applied_rate, venue_master_id, payer_master_id")
          .eq("event_id", id);
        if (payReadErr) {
          console.error("[event_payments read for autofill] error:", payReadErr);
        } else if (paymentRows && paymentRows.length > 0) {
          // 既存行の planned_date / planned_amount / applied_rate が空のものを埋める
          // venue_master から rate/サイクル をフォールバックで取得
          type VenueRow = {
            default_payer_id: string | null;
            direct_receive_rate: number | null;
            chouai_receive_rate: number | null;
            closing_day: number | null;
            pay_month_offset: number | null;
            pay_day: number | null;
          };
          let venueRow: VenueRow | null = null;
          try {
            const { data: vmRows } = await supabase
              .from("venue_master")
              .select("venue_name, store_name, default_payer_id, direct_receive_rate, chouai_receive_rate, closing_day, pay_month_offset, pay_day")
              .eq("venue_name", form.venue);
            const vm = (vmRows ?? []).find((v: { store_name: string | null }) => (v.store_name ?? "") === (form.store_name ?? "")) as VenueRow | undefined;
            if (vm) venueRow = vm;
          } catch (e) {
            console.warn("[autofill venue lookup] error:", e);
          }
          // payer_master 取得 (planned_date 計算用)
          const { data: payerRowsForCycle } = await supabase
            .from("payer_master")
            .select("id, closing_day, pay_month_offset, pay_day");
          // 動的 import で payment-cycle ヘルパー
          const { computePlannedPaymentDate } = await import("@/lib/payment-cycle");

          for (const pr of paymentRows as Array<{
            id: string;
            planned_date: string | null;
            planned_amount: number | null;
            planned_tax_type: TaxType | null;
            applied_rate: number | null;
            venue_master_id: string | null;
            payer_master_id: string | null;
          }>) {
            const updates: Record<string, unknown> = {};

            // (1) planned_date 補完: null なら現在のサイクルから計算
            if (pr.planned_date == null && form.end_date) {
              let cycle: { closing_day: number | null; pay_month_offset: number | null; pay_day: number | null } | null = null;
              if (pr.payer_master_id) {
                const py = (payerRowsForCycle ?? []).find((p: { id: string }) => p.id === pr.payer_master_id) as
                  | { closing_day: number | null; pay_month_offset: number | null; pay_day: number | null }
                  | undefined;
                if (py) cycle = { closing_day: py.closing_day, pay_month_offset: py.pay_month_offset, pay_day: py.pay_day };
              } else if (venueRow) {
                cycle = { closing_day: venueRow.closing_day, pay_month_offset: venueRow.pay_month_offset, pay_day: venueRow.pay_day };
              }
              if (cycle) {
                const planned = computePlannedPaymentDate(form.end_date, cycle);
                if (planned) updates.planned_date = planned;
              }
            }

            // (2) applied_rate 補完: null なら venue_master から
            let rate = pr.applied_rate;
            if (rate == null && venueRow) {
              const isChouai = form.payer_source.startsWith("payer:") ||
                (form.payer_source === "venue" && !!venueRow.default_payer_id);
              const fallbackRate = isChouai ? venueRow.chouai_receive_rate : venueRow.direct_receive_rate;
              if (fallbackRate != null) {
                rate = fallbackRate;
                updates.applied_rate = rate;
              }
            }

            // (3) planned_amount 補完: null かつ rate がある なら売上から計算
            if (pr.planned_amount == null && rate != null) {
              const taxType: TaxType = pr.planned_tax_type ?? "excluded";
              const base = taxType === "excluded" ? excludedTotal : includedTotal;
              if (base > 0) {
                updates.planned_amount = Math.round((base * rate) / 100);
              }
            }

            if (Object.keys(updates).length > 0) {
              const upRes2 = await supabase
                .from("event_payments")
                .update(updates)
                .eq("id", pr.id);
              if (upRes2.error) {
                console.error("[event_payments autofill] error:", upRes2.error);
                errors.push(`入金情報の自動補完に失敗: ${upRes2.error.message}`);
              }
            }
          }
        } else if (paymentRows && paymentRows.length === 0) {
          // event_payments がそもそも無い催事（古い催事や手動作成された催事）
          // venue_master と payer_master を見て新規作成する
          const { resolvePaymentSource, computePlannedPaymentDate } = await import("@/lib/payment-cycle");
          const { data: vmRows } = await supabase
            .from("venue_master")
            .select("id, venue_name, store_name, closing_day, pay_month_offset, pay_day, default_payer_id, direct_receive_rate, chouai_receive_rate")
            .eq("venue_name", form.venue);
          const vm = (vmRows ?? []).find((v) => (v.store_name ?? "") === (form.store_name ?? "")) as
            | { id: string; venue_name: string; store_name: string | null; closing_day: number | null; pay_month_offset: number | null; pay_day: number | null; default_payer_id: string | null; direct_receive_rate: number | null; chouai_receive_rate: number | null }
            | undefined;
          const { data: pyData } = await supabase
            .from("payer_master")
            .select("id, name, closing_day, pay_month_offset, pay_day")
            .eq("is_active", true);
          if (vm) {
            const resolved = resolvePaymentSource(
              {
                payer_master_id: form.payer_source.startsWith("payer:") ? form.payer_source.slice(6) : null,
                force_direct: form.payer_source === "direct",
              },
              vm,
              (pyData ?? []) as { id: string; name: string; closing_day: number | null; pay_month_offset: number | null; pay_day: number | null }[],
            );
            const plannedDate = (resolved.cycle.closing_day != null && resolved.cycle.pay_month_offset != null && resolved.cycle.pay_day != null)
              ? computePlannedPaymentDate(form.end_date, resolved.cycle)
              : null;
            // 入金率があれば金額も計算
            const rate = resolved.appliedRate;
            const planned_amount = rate != null ? Math.round((excludedTotal * rate) / 100) : null;
            const insRes = await supabase.from("event_payments").insert({
              event_id: id,
              venue_master_id: resolved.venueMasterId,
              payer_master_id: resolved.payerMasterId,
              planned_date: plannedDate,
              planned_amount,
              planned_tax_type: "excluded",
              status: "予定",
              method: "transfer",
              applied_rate: rate,
            });
            if (insRes.error) {
              console.error("[event_payments auto-create] error:", insRes.error);
              errors.push(`入金レコードの自動作成に失敗: ${insRes.error.message}`);
            }
          }
        }
      } catch (err) {
        console.error("[event_payments autofill] exception:", err);
      }
    }

    // event_staff の担当者を差分更新（他ロールのレコードを壊さない）
    const origEmpIds = originalStaffRecords.filter((r) => r.person_type === "employee" && r.employee_id).map((r) => r.employee_id as string);
    const origMpIds = originalStaffRecords.filter((r) => r.person_type === "mannequin" && r.mannequin_person_id).map((r) => r.mannequin_person_id as string);
    const toRemoveRecords = originalStaffRecords.filter((r) => {
      if (r.person_type === "employee") return !selectedEmployeeIds.includes(r.employee_id || "");
      return !selectedMannequinIds.includes(r.mannequin_person_id || "");
    });
    const empsToAdd = selectedEmployeeIds.filter((empId) => !origEmpIds.includes(empId));
    const mpsToAdd = selectedMannequinIds.filter((mpId) => !origMpIds.includes(mpId));

    if (toRemoveRecords.length > 0) {
      const remRes = await supabase.from("event_staff").delete().in("id", toRemoveRecords.map((r) => r.id));
      if (remRes.error) {
        console.error("[event_staff delete] error:", remRes.error);
        errors.push(`担当者の削除に失敗: ${remRes.error.message}`);
      }
    }
    const newRecords: Array<{ event_id: string; person_type: "employee" | "mannequin"; employee_id: string | null; mannequin_person_id: string | null; start_date: string; end_date: string; role: string }> = [];
    empsToAdd.forEach((empId) => {
      newRecords.push({
        event_id: id,
        person_type: "employee",
        employee_id: empId,
        mannequin_person_id: null,
        start_date: form.start_date,
        end_date: form.end_date,
        role: "担当者",
      });
    });
    mpsToAdd.forEach((mpId) => {
      newRecords.push({
        event_id: id,
        person_type: "mannequin",
        employee_id: null,
        mannequin_person_id: mpId,
        start_date: form.start_date,
        end_date: form.end_date,
        role: "担当者",
      });
    });
    if (newRecords.length > 0) {
      const insRes = await supabase.from("event_staff").insert(newRecords);
      if (insRes.error) {
        console.error("[event_staff insert] error:", insRes.error);
        errors.push(`担当者の追加に失敗: ${insRes.error.message}`);
      }
    }

    // 手配状況（出店申込書・ホテル・交通・マネキン・DM・備品）も一緒に保存
    try {
      await arrangementRef.current?.save();
    } catch (e) {
      console.error("[arrangement save] error:", e);
      errors.push(`手配状況の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
    }

    await fetchEvent();

    if (errors.length > 0) {
      alert(`保存中にエラーが発生しました:\n\n${errors.join("\n")}\n\n（詳細はブラウザのコンソールを確認してください）`);
      setSaveState("idle");
      return;
    }

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
                  event.last_day_closing_time ? `最終日閉場: ${event.last_day_closing_time}` : "",
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
              <Label>最終日の閉場時間</Label>
              <Input
                type="time"
                value={form.last_day_closing_time}
                onChange={(e) => setForm({ ...form, last_day_closing_time: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>担当者</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              ここで選んだ社員は「社員配置」にも会期全日で自動登録されます（日別のシフトは下の「社員配置」で調整）。一覧・カードに「担当: ○○」と表示する短い見出しとしても使われます。
            </p>
            <div className="flex flex-wrap gap-2">
              {employees.map((emp) => {
                const selected = selectedEmployeeIds.includes(emp.id);
                return (
                  <Badge key={emp.id} variant={selected ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleEmployee(emp.id)}>
                    {emp.name}{selected && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                );
              })}
              {mannequinOptions.map((p) => {
                const selected = selectedMannequinIds.includes(p.id);
                return (
                  <Badge
                    key={`m:${p.id}`}
                    variant={selected ? "default" : "outline"}
                    className={`cursor-pointer ${selected ? "bg-pink-600 hover:bg-pink-700" : "border-pink-400 text-pink-700 hover:bg-pink-50"}`}
                    onClick={() => toggleMannequin(p.id)}
                    title="社員扱いマネキン"
                  >
                    {p.name}{selected && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                );
              })}
            </div>
            {/* 二重登録警告: 担当者として選択中の人がマネキン手配にも入っている */}
            {(() => {
              const selectedNames = [
                ...employees.filter((e) => selectedEmployeeIds.includes(e.id)).map((e) => e.name),
                ...mannequinOptions.filter((p) => selectedMannequinIds.includes(p.id)).map((p) => p.name),
              ];
              const conflicts = selectedNames.filter((n) => mannequinHandledNames.has(n));
              if (conflicts.length === 0) return null;
              return (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  ⚠️ {conflicts.join("、")} さんはマネキン手配にも登録されています。社員扱いとマネキン扱いのどちらかに統一してください。
                </p>
              );
            })()}
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

          {/* 催事終了後 14日以内で売上未入力の催事には目立つヒントを出す */}
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            if (!form.end_date || form.end_date >= today) return null;
            const [y, m, d] = form.end_date.split("-").map(Number);
            const endDate = new Date(y, (m || 1) - 1, d || 1);
            const daysSinceEnd = Math.floor((Date.now() - endDate.getTime()) / 86400000);
            const hasAnyAmount = Array.from(dailyRevenue.values()).some((v) => v.amount.trim());
            if (hasAnyAmount) return null;
            const dayLabel = daysSinceEnd === 0 ? "本日" : `${daysSinceEnd}日前`;
            const isUrgent = daysSinceEnd <= 14;
            return (
              <div className={`text-xs rounded px-2.5 py-2 border ${isUrgent ? "bg-rose-50 border-rose-300 text-rose-800" : "bg-amber-50 border-amber-300 text-amber-800"}`}>
                {isUrgent ? "🔥 " : "⚠️ "}この催事は <span className="font-bold">{dayLabel}に終了</span>しました。下の入力欄に日別売上を入力してください。
              </div>
            );
          })()}

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
                              <SelectValue>
                                {(v: string) => v === "0.08" ? "8%" : v === "0.1" ? "10%" : v}
                              </SelectValue>
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
