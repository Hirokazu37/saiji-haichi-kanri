"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { addLog } from "@/lib/log";

type MannequinRecord = {
  id: string;
  agency_name: string | null;
  staff_name: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  work_hours: string | null;
  daily_rate: number | null;
  phone: string | null;
  arrangement_status: string | null;
  skills: string | null;
  notes: string | null;
  mannequin_person_id: string | null;
  mannequin_agency_id: string | null;
};

type MannequinPerson = {
  id: string;
  name: string;
  agency_id: string | null;
  phone: string | null;
  mobile_phone: string | null;
  daily_rate: number | null;
  skills: string | null;
  treat_as_employee: boolean;
};

type Agency = { id: string; name: string };
type StaffNameRow = { person_type: string | null; employee_id: string | null; mannequin_person_id: string | null; employees: { name: string } | null; mannequin_people: { name: string } | null };

const statusColors: Record<string, string> = {
  "未手配": "bg-red-100 text-red-800",
  "依頼中": "bg-yellow-100 text-yellow-800",
  "確定": "bg-green-100 text-green-800",
  "キャンセル": "bg-gray-200 text-gray-500",
};

const emptyForm = {
  mode: "select" as "select" | "manual",
  mannequin_person_id: "",
  agency_name: "", staff_name: "",
  work_start_date: "", work_end_date: "", work_hours: "",
  daily_rate: "", phone: "",
  arrangement_status: "未手配", skills: "", notes: "",
};

export function MannequinTab({ eventId, startDate, endDate }: { eventId: string; startDate: string; endDate: string }) {
  const supabase = createClient();
  const [records, setRecords] = useState<MannequinRecord[]>([]);
  const [people, setPeople] = useState<MannequinPerson[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  // この催事で「担当者」(event_staff role=担当者) として登録されている人の名前一覧。
  // ここに含まれる名前をマネキン手配に追加すると二重登録になる → 警告表示。
  const [staffNames, setStaffNames] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetch = useCallback(async () => {
    const [recRes, pplRes, agRes, stRes] = await Promise.all([
      supabase.from("mannequins").select("*").eq("event_id", eventId).order("work_start_date"),
      supabase.from("mannequin_people").select("id, name, agency_id, phone, mobile_phone, daily_rate, skills, treat_as_employee").order("name"),
      supabase.from("mannequin_agencies").select("id, name").order("name"),
      // 同じ催事で担当者として登録されている社員/マネキンの名前を取得
      supabase
        .from("event_staff")
        .select("person_type, employee_id, mannequin_person_id, employees:employee_id(name), mannequin_people:mannequin_person_id(name)")
        .eq("event_id", eventId),
    ]);
    setRecords(recRes.data || []);
    setPeople(pplRes.data || []);
    setAgencies(agRes.data || []);
    const names = new Set<string>();
    ((stRes.data as unknown) as StaffNameRow[] || []).forEach((r) => {
      if (r.person_type === "employee" && r.employees?.name) names.add(r.employees.name);
      else if (r.person_type === "mannequin" && r.mannequin_people?.name) names.add(r.mannequin_people.name);
    });
    setStaffNames(names);
  }, [supabase, eventId]);

  useEffect(() => { fetch(); }, [fetch]);

  const getAgencyName = (id: string | null) => agencies.find((a) => a.id === id)?.name || "";

  const calcTotal = (r: { work_start_date: string | null; work_end_date: string | null; daily_rate: string | number | null }) => {
    if (!r.work_start_date || !r.work_end_date || !r.daily_rate) return 0;
    const days = Math.max(1, Math.ceil((new Date(r.work_end_date as string).getTime() - new Date(r.work_start_date as string).getTime()) / 86400000) + 1);
    return days * (Number(r.daily_rate) || 0);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, work_start_date: startDate, work_end_date: endDate });
    setDialogOpen(true);
  };

  const openEdit = (r: MannequinRecord) => {
    setEditingId(r.id);
    setForm({
      mode: r.mannequin_person_id ? "select" : "manual",
      mannequin_person_id: r.mannequin_person_id || "",
      agency_name: r.agency_name || "", staff_name: r.staff_name || "",
      work_start_date: r.work_start_date || "", work_end_date: r.work_end_date || "",
      work_hours: r.work_hours || "",
      daily_rate: r.daily_rate ? String(r.daily_rate) : "",
      phone: r.phone || "",
      arrangement_status: r.arrangement_status || "未手配",
      skills: r.skills || "", notes: r.notes || "",
    });
    setDialogOpen(true);
  };

  const onSelectPerson = (personId: string) => {
    const person = people.find((p) => p.id === personId);
    if (person) {
      setForm({
        ...form,
        mannequin_person_id: personId,
        staff_name: person.name,
        agency_name: getAgencyName(person.agency_id),
        phone: person.mobile_phone || person.phone || "",
        daily_rate: person.daily_rate ? String(person.daily_rate) : form.daily_rate,
        skills: person.skills || form.skills,
      });
    }
  };

  const save = async () => {
    const selectedPerson = form.mode === "select" ? form.mannequin_person_id || null : null;
    const selectedAgency = selectedPerson ? people.find((p) => p.id === selectedPerson)?.agency_id || null : null;

    const payload = {
      event_id: eventId,
      mannequin_person_id: selectedPerson,
      mannequin_agency_id: selectedAgency,
      agency_name: form.agency_name.trim() || null,
      staff_name: form.staff_name.trim() || null,
      work_start_date: form.work_start_date || null,
      work_end_date: form.work_end_date || null,
      work_hours: form.work_hours.trim() || null,
      daily_rate: form.daily_rate ? parseInt(form.daily_rate) : null,
      phone: form.phone.trim() || null,
      arrangement_status: form.arrangement_status,
      skills: form.skills.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      await supabase.from("mannequins").update(payload).eq("id", editingId);
      await addLog(supabase, eventId, "マネキン", `${form.staff_name || "マネキン"}を更新（${form.arrangement_status}）`);
    } else {
      await supabase.from("mannequins").insert(payload);
      await addLog(supabase, eventId, "マネキン", `${form.staff_name || "マネキン"}を追加（${form.arrangement_status}）`);
    }
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await supabase.from("mannequins").delete().eq("id", deletingId);
    setDeleteOpen(false);
    fetch();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>マネキン手配</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />追加</Button>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">マネキン手配がまだありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>氏名</TableHead>
                <TableHead className="hidden md:table-cell">会社</TableHead>
                <TableHead>期間</TableHead>
                <TableHead className="hidden md:table-cell">合計費用</TableHead>
                <TableHead>状況</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => {
                const conflict = r.staff_name && staffNames.has(r.staff_name);
                return (
                <TableRow key={r.id} className={conflict ? "bg-amber-50" : ""}>
                  <TableCell className="font-medium">
                    {r.staff_name || "—"}
                    {conflict && <span className="ml-1 text-[10px] text-amber-700" title="担当者と二重登録">⚠️</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{r.agency_name || "—"}</TableCell>
                  <TableCell className="text-sm">{r.work_start_date || "?"} 〜 {r.work_end_date || "?"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{calcTotal(r) > 0 ? `¥${calcTotal(r).toLocaleString()}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[r.arrangement_status || ""] || ""}>{r.arrangement_status || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setDeletingId(r.id); setDeleteOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "マネキン手配を編集" : "マネキン手配を追加"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* 登録済みマネキンから選択 or 手入力 */}
            <div className="flex gap-2">
              <Badge variant={form.mode === "select" ? "default" : "outline"} className="cursor-pointer" onClick={() => setForm({ ...form, mode: "select" })}>
                登録済みから選択
              </Badge>
              <Badge variant={form.mode === "manual" ? "default" : "outline"} className="cursor-pointer" onClick={() => setForm({ ...form, mode: "manual" })}>
                手入力
              </Badge>
            </div>

            {form.mode === "select" ? (
              <div className="space-y-2">
                <Label>マネキンさん *</Label>
                <Select value={form.mannequin_person_id} onValueChange={(v) => v && onSelectPerson(v)}>
                  <SelectTrigger><SelectValue placeholder="マネキンさんを選択" /></SelectTrigger>
                  <SelectContent>
                    {people.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-muted-foreground">
                        候補なし。マネキンマスターで登録してください。
                      </div>
                    ) : (
                      people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.treat_as_employee ? " 🧑‍💼" : ""}{p.agency_id ? ` (${getAgencyName(p.agency_id)})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  🧑‍💼マークは社員扱いにも設定されている人。マネキン扱いで手配する場合はここ、社員扱いで配置する場合は社員配置から。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>氏名</Label><Input value={form.staff_name} onChange={(e) => setForm({ ...form, staff_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>マネキン会社</Label><Input value={form.agency_name} onChange={(e) => setForm({ ...form, agency_name: e.target.value })} /></div>
              </div>
            )}

            {/* 二重登録の警告: 同じ催事で担当者(社員配置)に既にいる人をマネキン手配にも入れようとしている */}
            {form.staff_name.trim() && staffNames.has(form.staff_name.trim()) && (
              <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                ⚠️ {form.staff_name} さんはこの催事で既に「担当者（社員配置）」に登録されています。社員扱いとマネキン扱いのどちらかに統一してください。
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>勤務開始日</Label><Input type="date" value={form.work_start_date} onChange={(e) => setForm({ ...form, work_start_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>勤務終了日</Label><Input type="date" value={form.work_end_date} onChange={(e) => setForm({ ...form, work_end_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>勤務時間</Label><Input value={form.work_hours} onChange={(e) => setForm({ ...form, work_hours: e.target.value })} placeholder="9:30〜18:00" /></div>
              <div className="space-y-2"><Label>日当(円)</Label><Input type="number" value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} /></div>
            </div>
            {calcTotal(form) > 0 && <p className="text-sm font-medium">合計: ¥{calcTotal(form).toLocaleString()}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>連絡先</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>手配状況</Label>
                <Select value={form.arrangement_status} onValueChange={(v) => v && setForm({ ...form, arrangement_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="未手配">未手配</SelectItem>
                    <SelectItem value="依頼中">依頼中</SelectItem>
                    <SelectItem value="確定">確定</SelectItem>
                    <SelectItem value="キャンセル">キャンセル</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>備考</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={save}>{editingId ? "更新" : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>マネキン手配を削除しますか？</DialogTitle></DialogHeader>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
