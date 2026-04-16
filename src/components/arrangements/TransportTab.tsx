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

type Transport = {
  id: string;
  transport_type: string | null;
  departure_from: string | null;
  arrival_to: string | null;
  outbound_datetime: string | null;
  return_datetime: string | null;
  passenger_count: number | null;
  price_per_person: number | null;
  reservation_number: string | null;
  reservation_status: string | null;
  notes: string | null;
};

const statusColors: Record<string, string> = {
  "未予約": "bg-red-100 text-red-800",
  "予約済": "bg-green-100 text-green-800",
  "キャンセル": "bg-gray-200 text-gray-500",
};

const transportTypes = ["新幹線", "飛行機", "レンタカー", "社用車", "その他"];

const emptyForm = {
  transport_type: "新幹線", departure_from: "", arrival_to: "",
  outbound_datetime: "", return_datetime: "",
  passenger_count: "", price_per_person: "",
  reservation_number: "", reservation_status: "未予約", notes: "",
};

export function TransportTab({ eventId }: { eventId: string }) {
  const supabase = createClient();
  const [items, setItems] = useState<Transport[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from("transportations").select("*").eq("event_id", eventId).order("outbound_datetime");
    setItems(data || []);
  }, [supabase, eventId]);

  useEffect(() => { fetch(); }, [fetch]);

  const calcTotal = (t: { passenger_count: string | number | null; price_per_person: string | number | null }) => {
    return (Number(t.passenger_count) || 0) * (Number(t.price_per_person) || 0);
  };

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (t: Transport) => {
    setEditingId(t.id);
    setForm({
      transport_type: t.transport_type || "新幹線", departure_from: t.departure_from || "",
      arrival_to: t.arrival_to || "",
      outbound_datetime: t.outbound_datetime ? t.outbound_datetime.slice(0, 16) : "",
      return_datetime: t.return_datetime ? t.return_datetime.slice(0, 16) : "",
      passenger_count: t.passenger_count ? String(t.passenger_count) : "",
      price_per_person: t.price_per_person ? String(t.price_per_person) : "",
      reservation_number: t.reservation_number || "", reservation_status: t.reservation_status || "未予約",
      notes: t.notes || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const payload = {
      event_id: eventId,
      transport_type: form.transport_type,
      departure_from: form.departure_from.trim() || null,
      arrival_to: form.arrival_to.trim() || null,
      outbound_datetime: form.outbound_datetime || null,
      return_datetime: form.return_datetime || null,
      passenger_count: form.passenger_count ? parseInt(form.passenger_count) : null,
      price_per_person: form.price_per_person ? parseInt(form.price_per_person) : null,
      reservation_number: form.reservation_number.trim() || null,
      reservation_status: form.reservation_status,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      await supabase.from("transportations").update(payload).eq("id", editingId);
      await addLog(supabase, eventId, "交通", `${form.transport_type} ${form.departure_from}→${form.arrival_to}を更新（${form.reservation_status}）`);
    } else {
      await supabase.from("transportations").insert(payload);
      await addLog(supabase, eventId, "交通", `${form.transport_type} ${form.departure_from}→${form.arrival_to}を追加（${form.reservation_status}）`);
    }
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await supabase.from("transportations").delete().eq("id", deletingId);
    setDeleteOpen(false);
    fetch();
  };

  const formatDt = (dt: string | null) => {
    if (!dt) return "—";
    return dt.replace("T", " ").slice(0, 16);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>交通手配</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />追加</Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">交通手配がまだありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>種別</TableHead>
                <TableHead>区間</TableHead>
                <TableHead className="hidden md:table-cell">行き</TableHead>
                <TableHead className="hidden md:table-cell">合計料金</TableHead>
                <TableHead>状況</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><Badge variant="outline">{t.transport_type || "—"}</Badge></TableCell>
                  <TableCell className="text-sm">{t.departure_from || "?"} → {t.arrival_to || "?"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{formatDt(t.outbound_datetime)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{calcTotal(t) > 0 ? `¥${calcTotal(t).toLocaleString()}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[t.reservation_status || ""] || ""}>{t.reservation_status || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setDeletingId(t.id); setDeleteOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "交通手配を編集" : "交通手配を追加"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>交通手段</Label>
              <Select value={form.transport_type} onValueChange={(v) => v && setForm({ ...form, transport_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {transportTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>出発地</Label><Input value={form.departure_from} onChange={(e) => setForm({ ...form, departure_from: e.target.value })} /></div>
              <div className="space-y-2"><Label>到着地</Label><Input value={form.arrival_to} onChange={(e) => setForm({ ...form, arrival_to: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>行き 出発日時</Label><Input type="datetime-local" value={form.outbound_datetime} onChange={(e) => setForm({ ...form, outbound_datetime: e.target.value })} /></div>
              <div className="space-y-2"><Label>帰り 出発日時</Label><Input type="datetime-local" value={form.return_datetime} onChange={(e) => setForm({ ...form, return_datetime: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>利用人数</Label><Input type="number" value={form.passenger_count} onChange={(e) => setForm({ ...form, passenger_count: e.target.value })} /></div>
              <div className="space-y-2"><Label>1人あたり料金(円)</Label><Input type="number" value={form.price_per_person} onChange={(e) => setForm({ ...form, price_per_person: e.target.value })} /></div>
            </div>
            {calcTotal(form) > 0 && <p className="text-sm font-medium">合計: ¥{calcTotal(form).toLocaleString()}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>予約番号</Label><Input value={form.reservation_number} onChange={(e) => setForm({ ...form, reservation_number: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>予約状況</Label>
                <Select value={form.reservation_status} onValueChange={(v) => v && setForm({ ...form, reservation_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="未予約">未予約</SelectItem>
                    <SelectItem value="予約済">予約済</SelectItem>
                    <SelectItem value="キャンセル">キャンセル</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>備考</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="座席指定、便名、往復/片道など" /></div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={save}>{editingId ? "更新" : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>交通手配を削除しますか？</DialogTitle></DialogHeader>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
