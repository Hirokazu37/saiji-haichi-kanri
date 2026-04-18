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
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { addLog } from "@/lib/log";

type PersonType = "employee" | "mannequin";

type Employee = { id: string; name: string; position: string | null };
type MannequinPerson = { id: string; name: string; agency_id: string | null };
type Agency = { id: string; name: string };

type StaffAssignment = {
  id: string;
  person_type: PersonType;
  employee_id: string | null;
  mannequin_person_id: string | null;
  start_date: string;
  end_date: string;
  role: string | null;
  notes: string | null;
  employees: { name: string; position: string | null } | null;
  mannequin_people: { name: string; agency_id: string | null } | null;
};

type FormState = {
  person_type: PersonType;
  employee_id: string;
  mannequin_person_id: string;
  start_date: string;
  end_date: string;
  role: string;
  notes: string;
};

const emptyForm: FormState = {
  person_type: "employee",
  employee_id: "",
  mannequin_person_id: "",
  start_date: "",
  end_date: "",
  role: "",
  notes: "",
};

export function StaffTab({ eventId, startDate, endDate }: { eventId: string; startDate: string; endDate: string }) {
  const supabase = createClient();
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [mannequinPeople, setMannequinPeople] = useState<MannequinPerson[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const fetch = useCallback(async () => {
    const [staffRes, empRes, mpRes, agRes] = await Promise.all([
      supabase
        .from("event_staff")
        .select("id, person_type, employee_id, mannequin_person_id, start_date, end_date, role, notes, employees(name, position), mannequin_people(name, agency_id)")
        .eq("event_id", eventId)
        .order("start_date"),
      supabase.from("employees").select("id, name, position").order("sort_order").order("name"),
      supabase.from("mannequin_people").select("id, name, agency_id").order("name"),
      supabase.from("mannequin_agencies").select("id, name").order("name"),
    ]);
    setAssignments((staffRes.data as unknown as StaffAssignment[]) || []);
    setEmployees(empRes.data || []);
    setMannequinPeople(mpRes.data || []);
    setAgencies(agRes.data || []);
  }, [supabase, eventId]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, start_date: startDate, end_date: endDate });
    setDialogOpen(true);
  };

  const openEdit = (a: StaffAssignment) => {
    setEditingId(a.id);
    setForm({
      person_type: a.person_type,
      employee_id: a.employee_id || "",
      mannequin_person_id: a.mannequin_person_id || "",
      start_date: a.start_date,
      end_date: a.end_date,
      role: a.role || "",
      notes: a.notes || "",
    });
    setDialogOpen(true);
  };

  const canSave =
    (form.person_type === "employee" ? !!form.employee_id : !!form.mannequin_person_id) &&
    !!form.start_date &&
    !!form.end_date;

  const save = async () => {
    if (!canSave) return;
    const payload = {
      event_id: eventId,
      person_type: form.person_type,
      employee_id: form.person_type === "employee" ? form.employee_id : null,
      mannequin_person_id: form.person_type === "mannequin" ? form.mannequin_person_id : null,
      start_date: form.start_date,
      end_date: form.end_date,
      role: form.role.trim() || null,
      notes: form.notes.trim() || null,
    };
    const personName =
      form.person_type === "employee"
        ? employees.find((e) => e.id === form.employee_id)?.name || ""
        : mannequinPeople.find((p) => p.id === form.mannequin_person_id)?.name || "";
    const personLabel = form.person_type === "mannequin" ? `マネキン:${personName}` : personName;
    if (editingId) {
      await supabase.from("event_staff").update(payload).eq("id", editingId);
      await addLog(supabase, eventId, "社員配置", `${personLabel}の配置を更新（${form.start_date}〜${form.end_date} ${form.role || ""}）`);
    } else {
      await supabase.from("event_staff").insert(payload);
      await addLog(supabase, eventId, "社員配置", `${personLabel}を配置（${form.start_date}〜${form.end_date} ${form.role || ""}）`);
    }
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await supabase.from("event_staff").delete().eq("id", deletingId);
    setDeleteOpen(false);
    fetch();
  };

  const displayName = (a: StaffAssignment): string => {
    if (a.person_type === "mannequin") return a.mannequin_people?.name || "（削除済みマネキン）";
    return a.employees?.name || "（削除済み社員）";
  };

  const selectedEmployeeLabel = form.employee_id
    ? (employees.find((e) => e.id === form.employee_id)?.name ?? "（削除済み社員）")
    : undefined;

  const selectedMannequinLabel = form.mannequin_person_id
    ? (() => {
        const p = mannequinPeople.find((x) => x.id === form.mannequin_person_id);
        if (!p) return "（削除済みマネキン）";
        const agency = agencies.find((a) => a.id === p.agency_id)?.name;
        return agency ? `${p.name}（${agency}）` : p.name;
      })()
    : undefined;

  return (
    <Card className="border-l-4 border-l-cyan-500 bg-cyan-50/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-600" />
          <CardTitle className="text-cyan-800">社員配置</CardTitle>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />追加</Button>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">社員配置がまだありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">種別</TableHead>
                <TableHead>氏名</TableHead>
                <TableHead>期間</TableHead>
                <TableHead className="hidden md:table-cell">役割</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {a.person_type === "mannequin" ? (
                      <Badge className="bg-pink-100 text-pink-800 hover:bg-pink-100">マネキン</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">社員</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{displayName(a)}</TableCell>
                  <TableCell className="text-sm">{a.start_date} 〜 {a.end_date}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {a.role ? <Badge variant="outline">{a.role}</Badge> : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setDeletingId(a.id); setDeleteOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "社員配置を編集" : "社員配置を追加"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>種別 *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.person_type === "employee" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm({ ...form, person_type: "employee", mannequin_person_id: "" })}
                >社員</Button>
                <Button
                  type="button"
                  variant={form.person_type === "mannequin" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm({ ...form, person_type: "mannequin", employee_id: "" })}
                >マネキン</Button>
              </div>
            </div>

            {form.person_type === "employee" ? (
              <div className="space-y-2">
                <Label>社員 *</Label>
                <Select value={form.employee_id} onValueChange={(v) => v && setForm({ ...form, employee_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="社員を選択">
                      {selectedEmployeeLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>マネキン *</Label>
                <Select value={form.mannequin_person_id} onValueChange={(v) => v && setForm({ ...form, mannequin_person_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="マネキンを選択">
                      {selectedMannequinLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {mannequinPeople.map((p) => {
                      const agency = agencies.find((a) => a.id === p.agency_id)?.name;
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{agency ? `（${agency}）` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {mannequinPeople.length === 0 && (
                  <p className="text-xs text-muted-foreground">マネキンマスターに登録がありません。/mannequins で登録してください。</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>開始日 *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>終了日 *</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>役割</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="責任者 / 販売 / 応援" />
            </div>
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={save} disabled={!canSave}>{editingId ? "更新" : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>社員配置を削除しますか？</DialogTitle></DialogHeader>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
