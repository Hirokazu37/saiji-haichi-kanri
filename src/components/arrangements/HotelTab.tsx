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

type Hotel = {
  id: string;
  hotel_name: string | null;
  address: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_count: number | null;
  guest_count: number | null;
  price_per_night: number | null;
  reservation_number: string | null;
  reservation_status: string | null;
  phone: string | null;
  notes: string | null;
};

const statusColors: Record<string, string> = {
  "未予約": "bg-red-100 text-red-800",
  "予約済": "bg-green-100 text-green-800",
  "キャンセル": "bg-gray-200 text-gray-500",
};

const emptyForm = {
  hotel_name: "", address: "", check_in_date: "", check_out_date: "",
  room_count: "", guest_count: "", price_per_night: "",
  reservation_number: "", reservation_status: "未予約", phone: "", notes: "",
};

export function HotelTab({ eventId }: { eventId: string }) {
  const supabase = createClient();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from("hotels").select("*").eq("event_id", eventId).order("check_in_date");
    setHotels(data || []);
  }, [supabase, eventId]);

  useEffect(() => { fetch(); }, [fetch]);

  const calcTotal = (h: Hotel | typeof emptyForm) => {
    const nights = h.check_in_date && h.check_out_date
      ? Math.max(0, Math.ceil((new Date(h.check_out_date as string).getTime() - new Date(h.check_in_date as string).getTime()) / 86400000))
      : 0;
    const rooms = Number(h.room_count) || 0;
    const price = Number(h.price_per_night) || 0;
    return nights * rooms * price;
  };

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (h: Hotel) => {
    setEditingId(h.id);
    setForm({
      hotel_name: h.hotel_name || "", address: h.address || "",
      check_in_date: h.check_in_date || "", check_out_date: h.check_out_date || "",
      room_count: h.room_count ? String(h.room_count) : "", guest_count: h.guest_count ? String(h.guest_count) : "",
      price_per_night: h.price_per_night ? String(h.price_per_night) : "",
      reservation_number: h.reservation_number || "", reservation_status: h.reservation_status || "未予約",
      phone: h.phone || "", notes: h.notes || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const payload = {
      event_id: eventId,
      hotel_name: form.hotel_name.trim() || null,
      address: form.address.trim() || null,
      check_in_date: form.check_in_date || null,
      check_out_date: form.check_out_date || null,
      room_count: form.room_count ? parseInt(form.room_count) : null,
      guest_count: form.guest_count ? parseInt(form.guest_count) : null,
      price_per_night: form.price_per_night ? parseInt(form.price_per_night) : null,
      reservation_number: form.reservation_number.trim() || null,
      reservation_status: form.reservation_status,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      await supabase.from("hotels").update(payload).eq("id", editingId);
      await addLog(supabase, eventId, "ホテル", `${form.hotel_name || "ホテル"}を更新（${form.reservation_status}）`);
    } else {
      await supabase.from("hotels").insert(payload);
      await addLog(supabase, eventId, "ホテル", `${form.hotel_name || "ホテル"}を追加（${form.reservation_status}）`);
    }
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await supabase.from("hotels").delete().eq("id", deletingId);
    setDeleteOpen(false);
    fetch();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>ホテル手配</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />追加</Button>
      </CardHeader>
      <CardContent>
        {hotels.length === 0 ? (
          <p className="text-sm text-muted-foreground">ホテル手配がまだありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ホテル名</TableHead>
                <TableHead>チェックイン/アウト</TableHead>
                <TableHead className="hidden md:table-cell">部屋/人数</TableHead>
                <TableHead className="hidden md:table-cell">合計料金</TableHead>
                <TableHead>状況</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hotels.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.hotel_name || "—"}</TableCell>
                  <TableCell className="text-sm">{h.check_in_date || "?"} 〜 {h.check_out_date || "?"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{h.room_count || 0}室 / {h.guest_count || 0}名</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{calcTotal(h) > 0 ? `¥${calcTotal(h).toLocaleString()}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[h.reservation_status || ""] || ""}>{h.reservation_status || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(h)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { setDeletingId(h.id); setDeleteOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{editingId ? "ホテル情報を編集" : "ホテル手配を追加"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>ホテル名</Label><Input value={form.hotel_name} onChange={(e) => setForm({ ...form, hotel_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>住所</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>チェックイン</Label><Input type="date" value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} /></div>
              <div className="space-y-2"><Label>チェックアウト</Label><Input type="date" value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>部屋数</Label><Input type="number" value={form.room_count} onChange={(e) => setForm({ ...form, room_count: e.target.value })} /></div>
              <div className="space-y-2"><Label>宿泊人数</Label><Input type="number" value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: e.target.value })} /></div>
              <div className="space-y-2"><Label>1泊料金(円)</Label><Input type="number" value={form.price_per_night} onChange={(e) => setForm({ ...form, price_per_night: e.target.value })} /></div>
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
            <div className="space-y-2"><Label>電話番号</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>備考</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="部屋タイプ、朝食有無など" /></div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={save}>{editingId ? "更新" : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ホテル手配を削除しますか？</DialogTitle></DialogHeader>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
