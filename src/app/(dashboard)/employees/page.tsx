"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  sort_order: number;
};

const emptyForm = { name: "", position: "", phone: "", email: "", notes: "" };

function SortableRow({
  emp,
  onEdit,
  onDelete,
}: {
  emp: Employee;
  onEdit: (emp: Employee) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: emp.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-10">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell className="font-medium">{emp.name}</TableCell>
      <TableCell className="hidden md:table-cell">{emp.position || "—"}</TableCell>
      <TableCell className="hidden md:table-cell">{emp.phone || "—"}</TableCell>
      <TableCell className="hidden lg:table-cell">{emp.email || "—"}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => onEdit(emp)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(emp.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function EmployeesPage() {
  const supabase = createClient();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from("employees")
      .select("*")
      .order("sort_order")
      .order("name");
    setEmployees(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = employees.findIndex((e) => e.id === active.id);
    const newIndex = employees.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(employees, oldIndex, newIndex);

    // UIを即座に更新
    setEmployees(reordered);

    // DBに保存
    const updates = reordered.map((emp, i) =>
      supabase.from("employees").update({ sort_order: i }).eq("id", emp.id)
    );
    await Promise.all(updates);
  };

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({ name: emp.name, position: emp.position || "", phone: emp.phone || "", email: emp.email || "", notes: emp.notes || "" });
    setDialogOpen(true);
  };
  const openDelete = (id: string) => { setDeletingId(id); setDeleteDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      position: form.position.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      await supabase.from("employees").update(payload).eq("id", editingId);
    } else {
      await supabase.from("employees").insert({ ...payload, sort_order: employees.length });
    }
    setDialogOpen(false);
    fetchEmployees();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await supabase.from("employees").delete().eq("id", deletingId);
    setDeleteDialogOpen(false);
    setDeletingId(null);
    fetchEmployees();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">社員マスター</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          社員追加
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">読み込み中...</p>
      ) : employees.length === 0 ? (
        <p className="text-muted-foreground">
          社員が登録されていません。「社員追加」から登録してください。
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>氏名</TableHead>
                <TableHead className="hidden md:table-cell">役職・部署</TableHead>
                <TableHead className="hidden md:table-cell">電話番号</TableHead>
                <TableHead className="hidden lg:table-cell">メール</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={employees.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                <TableBody>
                  {employees.map((emp) => (
                    <SortableRow key={emp.id} emp={emp} onEdit={openEdit} onDelete={openDelete} />
                  ))}
                </TableBody>
              </SortableContext>
            </DndContext>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "社員情報を編集" : "社員を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>氏名 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="山田 太郎" /></div>
            <div className="space-y-2"><Label>役職・部署</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="営業部" /></div>
            <div className="space-y-2"><Label>電話番号</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="090-1234-5678" /></div>
            <div className="space-y-2"><Label>メールアドレス</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="yamada@yasuoka.co.jp" /></div>
            <div className="space-y-2"><Label>備考</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="食品販売経験あり、など" /></div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={handleSave} disabled={!form.name.trim()}>{editingId ? "更新" : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>社員を削除しますか？</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">この社員に紐づく催事配置データも削除されます。この操作は取り消せません。</p>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
