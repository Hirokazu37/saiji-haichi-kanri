"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, GripVertical, MapPin } from "lucide-react";
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
import { areaMap, areaNames, getAreaForPrefecture } from "@/lib/areas";
import { prefectures } from "@/lib/prefectures";
import { usePermission } from "@/hooks/usePermission";

type Area = {
  id: string;
  name: string;
  region: string | null;
  prefecture: string | null;
  color: string | null;
  sort_order: number;
};

const emptyForm = { name: "", region: "", prefecture: "", color: "" };

const regionColors: Record<string, string> = {
  "北海道": "#EF4444", "東北": "#8B5CF6", "関東": "#F97316", "北陸": "#06B6D4",
  "中部": "#10B981", "関西": "#F59E0B", "中国": "#EC4899", "四国": "#3B82F6",
  "九州": "#14B8A6", "沖縄": "#6366F1",
};

function SortableRow({
  area,
  hotelCount,
  venueCount,
  onEdit,
  onDelete,
  canEdit,
}: {
  area: Area;
  hotelCount: number;
  venueCount: number;
  onEdit: (a: Area) => void;
  onDelete: (a: Area) => void;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: area.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-10">
        {canEdit && (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: area.color || "#ccc" }} />
          {area.region || "—"}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{area.prefecture || "—"}</TableCell>
      <TableCell className="font-medium">{area.name}</TableCell>
      <TableCell className="text-sm">{hotelCount}件</TableCell>
      <TableCell className="text-sm">{venueCount}件</TableCell>
      {canEdit && (
        <TableCell>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(area)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(area)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

export default function AreaMasterPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [areas, setAreas] = useState<Area[]>([]);
  const [hotelCounts, setHotelCounts] = useState<Record<string, number>>({});
  const [venueCounts, setVenueCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Area | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchData = useCallback(async () => {
    const [areaRes, hotelRes, venueRes] = await Promise.all([
      supabase.from("area_master").select("*").order("sort_order").order("name"),
      supabase.from("hotel_master").select("area_id").not("area_id", "is", null),
      supabase.from("venue_master").select("area_id").not("area_id", "is", null),
    ]);
    setAreas(areaRes.data || []);

    const hc: Record<string, number> = {};
    (hotelRes.data || []).forEach((h: { area_id: string }) => { hc[h.area_id] = (hc[h.area_id] || 0) + 1; });
    setHotelCounts(hc);

    const vc: Record<string, number> = {};
    (venueRes.data || []).forEach((v: { area_id: string }) => { vc[v.area_id] = (vc[v.area_id] || 0) + 1; });
    setVenueCounts(vc);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = areas.findIndex((a) => a.id === active.id);
    const newIndex = areas.findIndex((a) => a.id === over.id);
    const reordered = arrayMove(areas, oldIndex, newIndex);
    setAreas(reordered);
    const updates = reordered.map((a, i) =>
      supabase.from("area_master").update({ sort_order: i }).eq("id", a.id)
    );
    await Promise.all(updates);
  };

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (a: Area) => {
    setEditingId(a.id);
    setForm({ name: a.name, region: a.region || "", prefecture: a.prefecture || "", color: a.color || "" });
    setDialogOpen(true);
  };

  // 都道府県変更時に地方を自動セット
  const handlePrefectureChange = (pref: string) => {
    const region = getAreaForPrefecture(pref) || "";
    setForm({ ...form, prefecture: pref, region, color: form.color || regionColors[region] || "" });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      region: form.region || null,
      prefecture: form.prefecture || null,
      color: form.color || null,
    };
    if (editingId) {
      await supabase.from("area_master").update(payload).eq("id", editingId);
    } else {
      await supabase.from("area_master").insert({ ...payload, sort_order: areas.length });
    }
    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("area_master").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    fetchData();
  };

  // 地方でフィルタした都道府県リスト
  const filteredPrefectures = form.region && areaMap[form.region]
    ? areaMap[form.region]
    : prefectures;

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  // 地方でグルーピング表示
  const regionGroups = new Map<string, Area[]>();
  areas.forEach((a) => {
    const key = a.region || "未分類";
    if (!regionGroups.has(key)) regionGroups.set(key, []);
    regionGroups.get(key)!.push(a);
  });

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6" />エリアマスター
        </h1>
        {canEdit && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新規登録</Button>}
      </div>

      {areas.length === 0 ? (
        <p className="text-muted-foreground">エリアが登録されていません。「新規登録」から追加してください。</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-20">地方</TableHead>
                <TableHead className="w-24">都道府県</TableHead>
                <TableHead>エリア名</TableHead>
                <TableHead className="w-20">ホテル数</TableHead>
                <TableHead className="w-20">百貨店数</TableHead>
                {canEdit && <TableHead className="w-24">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={areas.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <TableBody>
                  {areas.map((area) => (
                    <SortableRow
                      key={area.id}
                      area={area}
                      hotelCount={hotelCounts[area.id] || 0}
                      venueCount={venueCounts[area.id] || 0}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                      canEdit={canEdit}
                    />
                  ))}
                </TableBody>
              </SortableContext>
            </DndContext>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{areas.length}件登録済み</p>

      {/* 登録/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={(open, event) => { if (!open && event?.reason === 'outside-press') return; setDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "エリアを編集" : "エリアを新規登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>地方</Label>
                <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v, prefecture: "", color: form.color || regionColors[v] || "" })}>
                  <SelectTrigger><SelectValue placeholder="地方選択" /></SelectTrigger>
                  <SelectContent>
                    {areaNames.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>都道府県</Label>
                <Select value={form.prefecture} onValueChange={handlePrefectureChange}>
                  <SelectTrigger><SelectValue placeholder="都道府県選択" /></SelectTrigger>
                  <SelectContent>
                    {filteredPrefectures.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>エリア名 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 宇和島、新宿、梅田" onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} />
              <p className="text-xs text-muted-foreground">ホテルを探すときの地域名を入力してください</p>
            </div>
            <div className="space-y-2">
              <Label>色</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color || "#cccccc"} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                <span className="text-xs text-muted-foreground">{form.color || "自動（地方で決定）"}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "保存中..." : editingId ? "更新する" : "登録する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={!!deleteTarget} onOpenChange={(open, event) => { if (!open && event?.reason === 'outside-press') return; if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>エリアを削除しますか？</DialogTitle></DialogHeader>
          {deleteTarget && (hotelCounts[deleteTarget.id] || venueCounts[deleteTarget.id]) ? (
            <p className="text-sm text-muted-foreground">
              このエリアにはホテル{hotelCounts[deleteTarget.id] || 0}件、百貨店{venueCounts[deleteTarget.id] || 0}件が紐づいています。
              削除すると紐づけが解除されます。
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">この操作は取り消せません。</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>キャンセル</Button>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
