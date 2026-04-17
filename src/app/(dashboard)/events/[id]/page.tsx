"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Trash2, ArrowLeft, X, Building2, Save, Check } from "lucide-react";
import Link from "next/link";
import { prefectures, eventStatuses } from "@/lib/prefectures";
import { ArrangementEditor } from "@/components/arrangements/ArrangementEditor";
import { StaffTab } from "@/components/arrangements/StaffTab";
import { usePermission } from "@/hooks/usePermission";

type EventData = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  prefecture: string;
  start_date: string;
  end_date: string;
  closing_time: string | null;
  person_in_charge: string | null;
  status: string;
  application_status: string | null;
  application_submitted_date: string | null;
  application_method: string | null;
  notes: string | null;
};

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
    person_in_charge: "",
    status: "",
    application_status: "未提出",
    application_submitted_date: "",
    application_method: "",
    notes: "",
  });

  const fetchEvent = useCallback(async () => {
    const [eventRes, empRes, staffRes] = await Promise.all([
      supabase.from("events").select("*").eq("id", id).single(),
      supabase.from("employees").select("id, name").order("sort_order").order("name"),
      supabase.from("event_staff").select("id, employee_id").eq("event_id", id).eq("role", "担当者"),
    ]);
    if (eventRes.data) {
      setEvent(eventRes.data);
      setForm({
        name: eventRes.data.name || "",
        venue: eventRes.data.venue,
        store_name: eventRes.data.store_name || "",
        prefecture: eventRes.data.prefecture,
        closing_time: eventRes.data.closing_time || "",
        start_date: eventRes.data.start_date,
        end_date: eventRes.data.end_date,
        person_in_charge: eventRes.data.person_in_charge || "",
        status: eventRes.data.status,
        application_status: eventRes.data.application_status || "未提出",
        application_submitted_date: eventRes.data.application_submitted_date || "",
        application_method: eventRes.data.application_method || "",
        notes: eventRes.data.notes || "",
      });
    }
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
        person_in_charge: allNames.length > 0 ? allNames.join("、") : null,
        status: form.status,
        application_status: form.application_status,
        application_submitted_date: form.application_submitted_date || null,
        application_method: form.application_method || null,
        notes: form.notes.trim() || null,
      })
      .eq("id", id);

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
          <><Save className="h-4 w-4 mr-1" />基本情報を保存</>
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
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={statusColor[event.status] || ""}
          >
            {event.status}
          </Badge>
          {canEdit && <SaveButton />}
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
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
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
          {canEdit && (
            <div className="flex justify-end">
              <SaveButton />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 手配状況 */}
      <ArrangementEditor eventId={id} venue={event?.venue || ""} storeName={event?.store_name || null} startDate={event.start_date} endDate={event.end_date} />

      {/* 社員配置 */}
      <StaffTab eventId={id} startDate={event.start_date} endDate={event.end_date} />

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
