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

type Shipment = {
  id: string;
  item_name: string;
  recipient_name: string;
  recipient_address: string;
  recipient_phone: string | null;
  ship_date: string;
  arrival_date: string | null;
  carrier: string | null;
  tracking_number: string | null;
  shipment_status: string | null;
  notes: string | null;
};

const statusColors: Record<string, string> = {
  "未発送": "bg-red-100 text-red-800",
  "発送済": "bg-blue-100 text-blue-800",
  "到着確認済": "bg-green-100 text-green-800",
};

const emptyForm = {
  item_name: "", recipient_name: "", recipient_address: "", recipient_phone: "",
  ship_date: "", arrival_date: "", carrier: "", tracking_number: "",
  shipment_status: "未発送", notes: "",
};

export function ShipmentTab({ eventId }: { eventId: string }) {
  const supabase = createClient();
  const [items, setItems] = useState<Shipment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from("shipments").select("*").eq("event_id", eventId).order("ship_date");
    setItems(data || []);
  }, [supabase, eventId]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (s: Shipment) => {
    setEditingId(s.id);
    setForm({
      item_name: s.item_name, recipient_name: s.recipient_name,
      recipient_address: s.recipient_address, recipient_phone: s.recipient_phone || "",
      ship_date: s.ship_date, arrival_date: s.arrival_date || "",
      carrier: s.carrier || "", tracking_number: s.tracking_number || "",
      shipment_status: s.shipment_status || "未発送", notes: s.notes || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.item_name.trim() || !form.recipient_name.trim() || !form.recipient_address.trim() || !form.ship_date) return;
    const payload = {
      event_id: eventId,
      item_name: form.item_name.trim(),
      recipient_name: form.recipient_name.trim(),
      recipient_address: form.recipient_address.trim(),
      recipient_phone: form.recipient_phone.trim() || null,
      ship_date: form.ship_date,
      arrival_date: form.arrival_date || null,
      carrier: form.carrier.trim() || null,
      tracking_number: form.tracking_number.trim() || null,
      shipment_status: form.shipment_status,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      await supabase.from("shipments").update(payload).eq("id", editingId);
      await addLog(supabase, eventId, "備品転送", `${form.item_name}を更新（${form.shipment_status}）`);
    } else {
      await supabase.from("shipments").insert(payload);
      await addLog(supabase, eventId, "備品転送", `${form.item_name}を追加（${form.shipment_status}）`);
    }
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await supabase.from("shipments").delete().eq("id", deletingId);
    setDeleteOpen(false);
    fetch();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>備品転送</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />追加</Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">備品転送がまだありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>品名</TableHead>
                <TableHead>宛先</TableHead>
                <TableHead className="hidden md:table-cell">発送日</TableHead>
                <TableHead className="hidden md:table-cell">伝票番号</TableHead>
                <TableHead>状況</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.item_name}</TableCell>
                  <TableCell className="text-sm">{s.recipient_name}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{s.ship_date}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{s.tracking_number || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[s.shipment_status || ""] || ""}>{s.shipment_status || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setDeletingId(s.id); setDeleteOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{editingId ? "備品転送を編集" : "備品転送を追加"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>品名・内容 *</Label><Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} placeholder="のぼり一式、冷蔵ショーケース" /></div>
            <div className="space-y-2"><Label>宛先名 *</Label><Input value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} placeholder="○○百貨店 催事場 担当:△△様" /></div>
            <div className="space-y-2"><Label>宛先住所 *</Label><Input value={form.recipient_address} onChange={(e) => setForm({ ...form, recipient_address: e.target.value })} /></div>
            <div className="space-y-2"><Label>宛先電話番号</Label><Input value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>発送日 *</Label><Input type="date" value={form.ship_date} onChange={(e) => setForm({ ...form, ship_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>到着希望日</Label><Input type="date" value={form.arrival_date} onChange={(e) => setForm({ ...form, arrival_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>配送業者</Label><Input value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} placeholder="ヤマト、佐川など" /></div>
              <div className="space-y-2"><Label>伝票番号</Label><Input value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} /></div>
            </div>
            <div className="space-y-2">
              <Label>発送状況</Label>
              <Select value={form.shipment_status} onValueChange={(v) => v && setForm({ ...form, shipment_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="未発送">未発送</SelectItem>
                  <SelectItem value="発送済">発送済</SelectItem>
                  <SelectItem value="到着確認済">到着確認済</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>備考</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={save} disabled={!form.item_name.trim() || !form.recipient_name.trim() || !form.recipient_address.trim() || !form.ship_date}>{editingId ? "更新" : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>備品転送を削除しますか？</DialogTitle></DialogHeader>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
