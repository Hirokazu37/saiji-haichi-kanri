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

type Employee = { id: string; name: string; position: string | null };
type StaffAssignment = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  role: string | null;
  notes: string | null;
  employees: { name: string; position: string | null } | null;
};

const emptyForm = { employee_id: "", start_date: "", end_date: "", role: "", notes: "" };

export function StaffTab({ eventId, startDate, endDate }: { eventId: string; startDate: string; endDate: string }) {
  const supabase = createClient();
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetch = useCallback(async () => {
    const [staffRes, empRes] = await Promise.all([
      supabase.from("event_staff").select("*, employees(name, position)").eq("event_id", eventId).order("start_date"),
      supabase.from("employees").select("id, name, position").order("sort_order").order("name"),
    ]);
    setAssignments(staffRes.data as StaffAssignment[] || []);
    setEmployees(empRes.data || []);
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
      employee_id: a.employee_id,
      start_date: a.start_date,
      end_date: a.end_date,
      role: a.role || "",
      notes: a.notes || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.employee_id || !form.start_date || !form.end_date) return;
    const payload = {
      event_id: eventId,
      employee_id: form.employee_id,
      start_date: form.start_date,
      end_date: form.end_date,
      role: form.role.trim() || null,
      notes: form.notes.trim() || null,
    };
    const empName = employees.find((e) => e.id === form.employee_id)?.name || "";
    if (editingId) {
      await supabase.from("event_staff").update(payload).eq("id", editingId);
      await addLog(supabase, eventId, "社員配置", `${empName}の配置を更新（${form.start_date}〜${form.end_date} ${form.role || ""}）`);
    } else {
      await supabase.from("event_staff").insert(payload);
      await addLog(supabase, eventId, "社員配置", `${empName}を配置（${form.start_date}〜${form.end_date} ${form.role || ""}）`);
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>社員配置</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />追加</Button>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">社員配置がまだありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>社員名</TableHead>
                <TableHead>期間</TableHead>
                <TableHead className="hidden md:table-cell">役割</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.employees?.name || "—"}</TableCell>
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
              <Label>社員 *</Label>
              <Select value={form.employee_id} onValueChange={(v) => v && setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="社員を選択" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <Button onClick={save} disabled={!form.employee_id || !form.start_date || !form.end_date}>{editingId ? "更新" : "追加"}</Button>
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
