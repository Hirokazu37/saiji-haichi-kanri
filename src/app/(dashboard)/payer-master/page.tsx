"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Store } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { formatPaymentCycle } from "@/lib/payment-cycle";

type Payer = {
  id: string;
  name: string;
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

const DAY_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "月末" },
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}日` })),
];
const MONTH_OFFSET_OPTIONS = [
  { value: "0", label: "当月" },
  { value: "1", label: "翌月" },
  { value: "2", label: "翌々月" },
  { value: "3", label: "3ヶ月後" },
];

const emptyForm = {
  name: "",
  closing_day: "0",
  pay_month_offset: "1",
  pay_day: "0",
  notes: "",
  is_active: true,
};

export default function PayerMasterPage() {
  const supabase = createClient();
  const { canEdit } = usePermission();
  const [payers, setPayers] = useState<Payer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payer_master")
      .select("*")
      .order("created_at");
    setPayers((data || []) as Payer[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: Payer) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      closing_day: p.closing_day == null ? "0" : String(p.closing_day),
      pay_month_offset: p.pay_month_offset == null ? "1" : String(p.pay_month_offset),
      pay_day: p.pay_day == null ? "0" : String(p.pay_day),
      notes: p.notes || "",
      is_active: p.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      closing_day: parseInt(form.closing_day),
      pay_month_offset: parseInt(form.pay_month_offset),
      pay_day: parseInt(form.pay_day),
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    if (editingId) {
      await supabase.from("payer_master").update(payload).eq("id", editingId);
    } else {
      await supabase.from("payer_master").insert(payload);
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await supabase.from("payer_master").delete().eq("id", deletingId);
    setDeleteOpen(false);
    setDeletingId(null);
    fetchData();
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6" />帳合先マスター
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            百貨店経由ではなく問屋・仲卸経由で入金がある場合の取引先。振込サイクルを登録しておくと入金予定日が自動計算されます。
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />帳合先を追加
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground">読み込み中...</p>
      ) : payers.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          帳合先が登録されていません。「帳合先を追加」から登録してください。
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名前</TableHead>
                <TableHead>振込サイクル</TableHead>
                <TableHead>備考</TableHead>
                <TableHead>状態</TableHead>
                {canEdit && <TableHead className="w-24">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-sm">
                    {formatPaymentCycle({
                      closing_day: p.closing_day,
                      pay_month_offset: p.pay_month_offset,
                      pay_day: p.pay_day,
                    })}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                    {p.notes || "—"}
                  </TableCell>
                  <TableCell>
                    {p.is_active ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">使用中</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">停止</span>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setDeletingId(p.id); setDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 追加/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "帳合先を編集" : "帳合先を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>名前 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 瀬戸内ブランディング" />
            </div>
            <div className="space-y-2">
              <Label>振込サイクル</Label>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">締め日</div>
                  <Select value={form.closing_day} onValueChange={(v) => v && setForm({ ...form, closing_day: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {DAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">支払月</div>
                  <Select value={form.pay_month_offset} onValueChange={(v) => v && setForm({ ...form, pay_month_offset: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTH_OFFSET_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-1">支払日</div>
                  <Select value={form.pay_day} onValueChange={(v) => v && setForm({ ...form, pay_day: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {DAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                プレビュー: {formatPaymentCycle({
                  closing_day: parseInt(form.closing_day),
                  pay_month_offset: parseInt(form.pay_month_offset),
                  pay_day: parseInt(form.pay_day),
                })}
              </p>
            </div>
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="例: 翌々月10日になる時もある"
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <Label>使用中</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} className="data-[state=checked]:bg-green-700" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">キャンセル</Button>} />
            <Button onClick={save} disabled={!form.name.trim()}>
              {editingId ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>帳合先を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この帳合先の振込サイクル情報が削除されます。関連する入金レコードの紐付けも外れます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
