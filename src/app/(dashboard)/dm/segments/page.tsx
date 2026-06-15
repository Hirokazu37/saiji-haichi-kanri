"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";

type Segment = {
  id: string;
  kbn_no: number;
  code: number;
  segment_name: string;
  venue_id: string | null;
  notes: string | null;
  is_active: boolean;
};

type Venue = {
  id: string;
  venue_name: string;
  store_name: string | null;
  is_active: boolean;
};

const emptyForm = { kbn_no: "3", code: "", segment_name: "", venue_id: "", notes: "" };

// 区分ごとのテーマカラー (タブ・見出しで共通)
// tab: 非選択時は薄い色、選択時 (data-active) は濃い色+白文字
const KBN_COLORS: Record<number, { dot: string; tab: string; header: string }> = {
  3:  { dot: "bg-rose-500",    tab: "bg-rose-100 text-rose-700 hover:bg-rose-200 hover:text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 data-active:bg-rose-500 data-active:text-white dark:data-active:bg-rose-600 dark:data-active:text-white",                         header: "bg-rose-50 dark:bg-rose-950/30" },
  4:  { dot: "bg-orange-500",  tab: "bg-orange-100 text-orange-700 hover:bg-orange-200 hover:text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 data-active:bg-orange-500 data-active:text-white dark:data-active:bg-orange-600 dark:data-active:text-white",           header: "bg-orange-50 dark:bg-orange-950/30" },
  5:  { dot: "bg-amber-500",   tab: "bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 data-active:bg-amber-500 data-active:text-white dark:data-active:bg-amber-600 dark:data-active:text-white",                  header: "bg-amber-50 dark:bg-amber-950/30" },
  6:  { dot: "bg-lime-600",    tab: "bg-lime-100 text-lime-700 hover:bg-lime-200 hover:text-lime-800 dark:bg-lime-900/30 dark:text-lime-300 data-active:bg-lime-600 data-active:text-white dark:data-active:bg-lime-600 dark:data-active:text-white",                          header: "bg-lime-50 dark:bg-lime-950/30" },
  7:  { dot: "bg-emerald-500", tab: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 data-active:bg-emerald-500 data-active:text-white dark:data-active:bg-emerald-600 dark:data-active:text-white",  header: "bg-emerald-50 dark:bg-emerald-950/30" },
  8:  { dot: "bg-sky-500",     tab: "bg-sky-100 text-sky-700 hover:bg-sky-200 hover:text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 data-active:bg-sky-500 data-active:text-white dark:data-active:bg-sky-600 dark:data-active:text-white",                                  header: "bg-sky-50 dark:bg-sky-950/30" },
  9:  { dot: "bg-violet-500",  tab: "bg-violet-100 text-violet-700 hover:bg-violet-200 hover:text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 data-active:bg-violet-500 data-active:text-white dark:data-active:bg-violet-600 dark:data-active:text-white",          header: "bg-violet-50 dark:bg-violet-950/30" },
  10: { dot: "bg-fuchsia-500", tab: "bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-200 hover:text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 data-active:bg-fuchsia-500 data-active:text-white dark:data-active:bg-fuchsia-600 dark:data-active:text-white",  header: "bg-fuchsia-50 dark:bg-fuchsia-950/30" },
};
const kbnColor = (k: number) => KBN_COLORS[k] ?? { dot: "bg-gray-400", tab: "", header: "bg-muted/50" };

export default function DmSegmentsPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [activeKbn, setActiveKbn] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Segment | null>(null);

  const fetchData = useCallback(async () => {
    const [segRes, venRes] = await Promise.all([
      supabase.from("sanchoku_segments").select("*").order("kbn_no").order("code"),
      supabase.from("venue_master").select("id, venue_name, store_name, is_active").order("sort_order"),
    ]);
    setSegments(segRes.data || []);
    setVenues(venRes.data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const venueLabel = useCallback((id: string | null) => {
    if (!id) return null;
    const v = venues.find((x) => x.id === id);
    if (!v) return null;
    return v.store_name ? `${v.venue_name} ${v.store_name}` : v.venue_name;
  }, [venues]);

  const venueItems: ComboboxItem[] = useMemo(() =>
    venues.filter((v) => v.is_active).map((v) => {
      // この百貨店に紐付いている区分を補足表示 (例: 区3-101・区4-112)
      const linked = segments
        .filter((s) => s.venue_id === v.id)
        .map((s) => `区${s.kbn_no}-${s.code}`);
      const shown = linked.slice(0, 3).join("・");
      return {
        value: v.id,
        label: v.store_name ? `${v.venue_name} ${v.store_name}` : v.venue_name,
        sublabel: linked.length > 0 ? (linked.length > 3 ? `${shown} 他${linked.length - 3}件` : shown) : undefined,
      };
    }), [venues, segments]);

  const updateVenue = async (seg: Segment, venueId: string | null) => {
    setSegments((prev) => prev.map((s) => s.id === seg.id ? { ...s, venue_id: venueId } : s));
    await supabase.from("sanchoku_segments").update({ venue_id: venueId, updated_at: new Date().toISOString() }).eq("id", seg.id);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (seg: Segment) => {
    setEditingId(seg.id);
    setForm({
      kbn_no: String(seg.kbn_no),
      code: String(seg.code),
      segment_name: seg.segment_name,
      venue_id: seg.venue_id || "",
      notes: seg.notes || "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.kbn_no || !form.code || !form.segment_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        kbn_no: parseInt(form.kbn_no),
        code: parseInt(form.code),
        segment_name: form.segment_name.trim(),
        venue_id: form.venue_id || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error } = await supabase.from("sanchoku_segments").update(payload).eq("id", editingId);
        if (error) { alert(`保存に失敗しました: ${error.message}`); return; }
      } else {
        const { error } = await supabase.from("sanchoku_segments").insert(payload);
        if (error) {
          alert(error.code === "23505" ? `区分${form.kbn_no}-${form.code} は既に登録されています。` : `保存に失敗しました: ${error.message}`);
          return;
        }
      }
      setDialogOpen(false);
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("sanchoku_segments").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    fetchData();
  };

  // 検索・未紐付けフィルタ適用後 (タブの件数表示にも使う)
  const baseFiltered = segments.filter((s) => {
    if (onlyUnlinked && s.venue_id) return false;
    if (!search.trim()) return true;
    const q = search.trim();
    return s.segment_name.includes(q)
      || String(s.code).includes(q)
      || `区分${s.kbn_no}`.includes(q)
      || (venueLabel(s.venue_id) || "").includes(q);
  });
  const filtered = activeKbn === "all"
    ? baseFiltered
    : baseFiltered.filter((s) => s.kbn_no === Number(activeKbn));

  const allKbns = [...new Set(segments.map((s) => s.kbn_no))].sort((a, b) => a - b);
  const kbnGroups = [...new Set(filtered.map((s) => s.kbn_no))].sort((a, b) => a - b);
  const unlinkedCount = segments.filter((s) => !s.venue_id).length;

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/dm" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="h-4 w-4 mr-1" />DMハガキ一覧
        </Link>
        <h1 className="text-2xl font-bold">DM区分マスター（産直君 汎用マスター）</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        ヤマト「産直君」の汎用マスター区分と百貨店マスターの紐付けを管理します。
        紐付けると百貨店マスター・DMハガキ一覧に区分コードが表示されます。
      </p>

      <div className="flex gap-2 flex-wrap items-center">
        <Input
          value={search}
          onChange={(e) => {
            // 検索を始めたら全区分から探せるよう「すべて」タブに切り替える
            if (e.target.value && !search) setActiveKbn("all");
            setSearch(e.target.value);
          }}
          placeholder="名称・コード・百貨店で検索"
          className="h-9 w-64 bg-white"
        />
        <Button
          variant={onlyUnlinked ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyUnlinked(!onlyUnlinked)}
        >
          未紐付けのみ ({unlinkedCount})
        </Button>
        {canEdit && (
          <Button size="sm" className="ml-auto" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />区分を追加
          </Button>
        )}
      </div>

      <Tabs value={activeKbn} onValueChange={(v) => setActiveKbn(String(v))} className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
          <TabsTrigger value="all" className="data-active:bg-foreground data-active:text-background dark:data-active:bg-foreground dark:data-active:text-background">
            すべて
            <span className="ml-1 text-[10px] opacity-70">{baseFiltered.length}</span>
          </TabsTrigger>
          {allKbns.map((k) => {
            const count = baseFiltered.filter((s) => s.kbn_no === k).length;
            const c = kbnColor(k);
            return (
              <TabsTrigger key={k} value={String(k)} className={c.tab}>
                区分{k}
                <span className="ml-0.5 text-[10px] opacity-70">{count}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {kbnGroups.map((kbn) => (
        <Card key={kbn}>
          <CardContent className="p-0 overflow-x-auto">
            <div className={`px-4 py-2 border-b font-semibold text-sm flex items-center gap-2 ${kbnColor(kbn).header}`}>
              <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${kbnColor(kbn).dot}`} />
              区分{kbn}
              <span className="text-xs font-normal text-muted-foreground">
                {filtered.filter((s) => s.kbn_no === kbn).length}件
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">コード</TableHead>
                  <TableHead>産直君上の名称</TableHead>
                  <TableHead className="min-w-52">紐付け先（百貨店マスター）</TableHead>
                  <TableHead className="hidden md:table-cell">備考</TableHead>
                  {canEdit && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.filter((s) => s.kbn_no === kbn).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.code}</TableCell>
                    <TableCell className="text-sm">{s.segment_name}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <Combobox
                            items={venueItems}
                            value={s.venue_id || ""}
                            onChange={(v) => updateVenue(s, v || null)}
                            placeholder="（未紐付け）"
                            searchPlaceholder="百貨店を検索..."
                            allowCustom={false}
                            className="w-full max-w-60"
                          />
                          {s.venue_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-1.5 text-xs text-muted-foreground"
                              onClick={() => updateVenue(s, null)}
                            >
                              解除
                            </Button>
                          )}
                        </div>
                      ) : (
                        venueLabel(s.venue_id)
                          ? <span className="text-sm">{venueLabel(s.venue_id)}</span>
                          : <Badge variant="outline" className="text-amber-600 border-amber-300">未紐付け</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{s.notes || ""}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget(s)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "区分を編集" : "区分を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">区分番号 *</Label>
                <Input
                  type="number"
                  value={form.kbn_no}
                  onChange={(e) => setForm({ ...form, kbn_no: e.target.value })}
                  className="bg-white"
                />
              </div>
              <div>
                <Label className="text-xs">コード *</Label>
                <Input
                  type="number"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="bg-white"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">産直君上の名称 *</Label>
              <Input
                value={form.segment_name}
                onChange={(e) => setForm({ ...form, segment_name: e.target.value })}
                placeholder="例: 札幌大丸"
                className="bg-white"
              />
            </div>
            <div>
              <Label className="text-xs">紐付け先（百貨店マスター）</Label>
              <Combobox
                items={venueItems}
                value={form.venue_id}
                onChange={(v) => setForm({ ...form, venue_id: v })}
                placeholder="（未紐付け）"
                searchPlaceholder="百貨店を検索..."
                allowCustom={false}
              />
            </div>
            <div>
              <Label className="text-xs">備考</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={save} disabled={saving || !form.kbn_no || !form.code || !form.segment_name.trim()}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>区分を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              区分{deleteTarget?.kbn_no}-{deleteTarget?.code}「{deleteTarget?.segment_name}」を削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
