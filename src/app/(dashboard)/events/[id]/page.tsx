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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Pencil, Trash2, ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { prefectures, eventStatuses } from "@/lib/prefectures";
import { ArrangementEditor } from "@/components/arrangements/ArrangementEditor";
import { StaffTab } from "@/components/arrangements/StaffTab";

type EventData = {
  id: string;
  name: string;
  venue: string;
  store_name: string | null;
  prefecture: string;
  start_date: string;
  end_date: string;
  closing_time: string | null;
  person_in_charge: string | null;
  status: string;
  application_status: string | null;
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
  const supabase = createClient();
  const router = useRouter();
  type Employee = { id: string; name: string };
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
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
        name: eventRes.data.name,
        venue: eventRes.data.venue,
        store_name: eventRes.data.store_name || "",
        prefecture: eventRes.data.prefecture,
        closing_time: eventRes.data.closing_time || "",
        start_date: eventRes.data.start_date,
        end_date: eventRes.data.end_date,
        person_in_charge: eventRes.data.person_in_charge || "",
        status: eventRes.data.status,
        application_status: eventRes.data.application_status || "未提出",
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
        name: form.name.trim(),
        venue: form.venue.trim(),
        store_name: form.store_name.trim() || null,
        prefecture: form.prefecture,
        start_date: form.start_date,
        end_date: form.end_date,
        closing_time: form.closing_time.trim() || null,
        person_in_charge: allNames.length > 0 ? allNames.join("、") : null,
        status: form.status,
        application_status: form.application_status,
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

    setEditOpen(false);
    fetchEvent();
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
            <span>{event.name}（{event.prefecture}）</span>
            <span>|</span>
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
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" />
            編集
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1 text-destructive" />
            削除
          </Button>
        </div>
      </div>

      {/* タブ */}
      <Tabs defaultValue="prep">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="prep">手配状況</TabsTrigger>
          <TabsTrigger value="staff">社員配置</TabsTrigger>
          <TabsTrigger value="info">基本情報</TabsTrigger>
        </TabsList>

        <TabsContent value="prep">
          <ArrangementEditor eventId={id} venue={event?.venue || ""} storeName={event?.store_name || null} startDate={event.start_date} endDate={event.end_date} />
        </TabsContent>

        <TabsContent value="staff">
          <StaffTab eventId={id} startDate={event.start_date} endDate={event.end_date} />
        </TabsContent>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">催事名</span>
                  <p className="font-medium">{event.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">百貨店名</span>
                  <p className="font-medium">{event.venue}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">店舗名</span>
                  <p className="font-medium">{event.store_name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">開催地</span>
                  <p className="font-medium">{event.prefecture}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">ステータス</span>
                  <p className="font-medium">{event.status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">開始日</span>
                  <p className="font-medium">{event.start_date}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">終了日</span>
                  <p className="font-medium">{event.end_date}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">最終日 閉場時間</span>
                  <p className="font-medium">{event.closing_time || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">担当者</span>
                  <p className="font-medium">{event.person_in_charge || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">出店申込書</span>
                  <p className="font-medium">
                    <Badge variant="outline" className={event.application_status === "提出済" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {event.application_status || "未提出"}
                    </Badge>
                  </p>
                </div>
              </div>
              {event.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">備考</span>
                  <p className="font-medium whitespace-pre-wrap">{event.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 編集ダイアログ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" preventBackdropClose>
          <DialogHeader>
            <DialogTitle>催事情報を編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>百貨店名 *</Label>
                <Input
                  value={form.venue}
                  onChange={(e) => setForm({ ...form, venue: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>店舗名</Label>
                <Input
                  value={form.store_name}
                  onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>催事名 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>開催地 *</Label>
              <Select
                value={form.prefecture}
                onValueChange={(v) => v && setForm({ ...form, prefecture: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {prefectures.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>開始日 *</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>終了日 *</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>最終日 閉場時間</Label>
              <Input
                type="time"
                value={form.closing_time}
                onChange={(e) => setForm({ ...form, closing_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>担当者</Label>
              <Input
                value={buildPersonInCharge()}
                readOnly
                className="bg-muted/50"
              />
              <div className="flex flex-wrap gap-2">
                {employees.map((emp) => {
                  const selected = selectedEmployeeIds.includes(emp.id);
                  return (
                    <Badge
                      key={emp.id}
                      variant={selected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleEmployee(emp.id)}
                    >
                      {emp.name}
                      {selected && <X className="h-3 w-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>
              <Input
                value={form.person_in_charge}
                onChange={(e) => setForm({ ...form, person_in_charge: e.target.value })}
                placeholder="その他（社員マスターにない人がいれば入力）"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => v && setForm({ ...form, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>出店申込書</Label>
                <Select
                  value={form.application_status}
                  onValueChange={(v) => v && setForm({ ...form, application_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="未提出">未提出</SelectItem>
                    <SelectItem value="提出済">提出済</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">キャンセル</Button>
            </DialogClose>
            <Button onClick={handleUpdate}>更新する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
