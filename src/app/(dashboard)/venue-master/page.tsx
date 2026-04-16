"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, X, Store, PlusCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { prefectures } from "@/lib/prefectures";
import { getAreaForPrefecture } from "@/lib/areas";
import { usePermission } from "@/hooks/usePermission";

type VenueMaster = {
  id: string;
  venue_name: string;
  store_name: string | null;
  prefecture: string | null;
  sanchoku_code_1: string | null;
  sanchoku_memo_1: string | null;
  sanchoku_code_2: string | null;
  sanchoku_memo_2: string | null;
  sanchoku_code_3: string | null;
  sanchoku_memo_3: string | null;
  notes: string | null;
  is_active: boolean;
  area_id: string | null;
};

type AreaItem = { id: string; name: string; region: string | null; prefecture: string | null };
type HotelMasterItem = { id: string; name: string; area_id: string | null };
type HotelVenueLink = { id: string; hotel_id: string; venue_name: string };
type MannequinPerson = { id: string; name: string; agency_name: string | null };
type VenueMannequinLink = { id: string; venue_id: string; mannequin_person_id: string | null; mannequin_agency_id: string | null };

const emptyForm = {
  venue_name: "", store_name: "", prefecture: "", area_id: "",
  sanchoku_code_1: "", sanchoku_memo_1: "",
  sanchoku_code_2: "", sanchoku_memo_2: "",
  sanchoku_code_3: "", sanchoku_memo_3: "",
  notes: "",
};

export default function VenueMasterPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [venues, setVenues] = useState<VenueMaster[]>([]);
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [hotelMasters, setHotelMasters] = useState<HotelMasterItem[]>([]);
  const [hotelLinks, setHotelLinks] = useState<HotelVenueLink[]>([]);
  const [mannequinPeople, setMannequinPeople] = useState<MannequinPerson[]>([]);
  const [mannequinLinks, setMannequinLinks] = useState<VenueMannequinLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // ダイアログ
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedHotelIds, setSelectedHotelIds] = useState<Set<string>>(new Set());
  const [selectedMannequinIds, setSelectedMannequinIds] = useState<Set<string>>(new Set());
  const [hotelSearch, setHotelSearch] = useState("");
  const [mannequinSearch, setMannequinSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // エリア新規作成
  const [showNewArea, setShowNewArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [savingArea, setSavingArea] = useState(false);

  // 削除
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [venueRes, areaRes, hmRes, hlRes, mpRes, mlRes] = await Promise.all([
      supabase.from("venue_master").select("*").order("venue_name"),
      supabase.from("area_master").select("id, name, region, prefecture").order("sort_order"),
      supabase.from("hotel_master").select("id, name, area_id").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("*"),
      supabase.from("mannequin_people").select("id, name, mannequin_agencies(name)").order("name"),
      supabase.from("venue_mannequin_links").select("*"),
    ]);
    setVenues(venueRes.data || []);
    setAreas((areaRes.data || []) as AreaItem[]);
    setHotelMasters((hmRes.data || []) as HotelMasterItem[]);
    setHotelLinks((hlRes.data || []) as HotelVenueLink[]);
    setMannequinPeople(
      ((mpRes.data || []) as unknown as { id: string; name: string; mannequin_agencies: { name: string } | null }[])
        .map((p) => ({ id: p.id, name: p.name, agency_name: p.mannequin_agencies?.name || null }))
    );
    setMannequinLinks((mlRes.data || []) as VenueMannequinLink[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getVenueLabel = (v: VenueMaster) => v.store_name ? `${v.venue_name} ${v.store_name}` : v.venue_name;

  const getHotelsForVenue = (v: VenueMaster) => {
    const label = getVenueLabel(v);
    const hids = hotelLinks.filter((l) => l.venue_name === label).map((l) => l.hotel_id);
    return hotelMasters.filter((h) => hids.includes(h.id));
  };

  const getMannequinsForVenue = (v: VenueMaster) => {
    const pids = mannequinLinks.filter((l) => l.venue_id === v.id).map((l) => l.mannequin_person_id).filter(Boolean) as string[];
    return mannequinPeople.filter((p) => pids.includes(p.id));
  };

  // フィルタ
  const filtered = venues.filter((v) => {
    if (!showInactive && !v.is_active) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = getVenueLabel(v).toLowerCase();
      return label.includes(s);
    }
    return true;
  });

  // ダイアログ操作
  const resetAreaForm = () => {
    setShowNewArea(false);
    setNewAreaName("");
  };

  const handleCreateArea = async () => {
    if (!newAreaName.trim()) return;
    setSavingArea(true);

    // 百貨店の都道府県から地方・都道府県を自動セット
    const pref = form.prefecture || null;
    const region = pref ? getAreaForPrefecture(pref) : null;

    // sort_orderは既存エリアの最大値+1
    const maxOrder = areas.length > 0 ? Math.max(...areas.map((a) => (a as unknown as { sort_order?: number }).sort_order ?? 0)) + 1 : 0;

    const { data } = await supabase.from("area_master").insert({
      name: newAreaName.trim(),
      region,
      prefecture: pref,
      sort_order: maxOrder,
    }).select("id, name, region, prefecture").single();

    if (data) {
      setAreas((prev) => [...prev, data as AreaItem]);
      setForm((prev) => ({ ...prev, area_id: data.id }));
      setSelectedHotelIds(new Set());
    }

    setSavingArea(false);
    resetAreaForm();
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSelectedHotelIds(new Set());
    setSelectedMannequinIds(new Set());
    setHotelSearch("");
    setMannequinSearch("");
    resetAreaForm();
    setDialogOpen(true);
  };

  const openEdit = (v: VenueMaster) => {
    setEditingId(v.id);
    resetAreaForm();
    setForm({
      venue_name: v.venue_name,
      store_name: v.store_name || "",
      prefecture: v.prefecture || "",
      area_id: v.area_id || "",
      sanchoku_code_1: v.sanchoku_code_1 || "",
      sanchoku_memo_1: v.sanchoku_memo_1 || "",
      sanchoku_code_2: v.sanchoku_code_2 || "",
      sanchoku_memo_2: v.sanchoku_memo_2 || "",
      sanchoku_code_3: v.sanchoku_code_3 || "",
      sanchoku_memo_3: v.sanchoku_memo_3 || "",
      notes: v.notes || "",
    });
    const label = getVenueLabel(v);
    const hids = new Set(hotelLinks.filter((l) => l.venue_name === label).map((l) => l.hotel_id));
    setSelectedHotelIds(hids);
    const pids = new Set(mannequinLinks.filter((l) => l.venue_id === v.id).map((l) => l.mannequin_person_id).filter(Boolean) as string[]);
    setSelectedMannequinIds(pids);
    setHotelSearch("");
    setMannequinSearch("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.venue_name.trim()) return;
    setSaving(true);

    const row = {
      venue_name: form.venue_name.trim(),
      store_name: form.store_name.trim() || null,
      prefecture: form.prefecture || null,
      area_id: form.area_id || null,
      sanchoku_code_1: form.sanchoku_code_1.trim() || null,
      sanchoku_memo_1: form.sanchoku_memo_1.trim() || null,
      sanchoku_code_2: form.sanchoku_code_2.trim() || null,
      sanchoku_memo_2: form.sanchoku_memo_2.trim() || null,
      sanchoku_code_3: form.sanchoku_code_3.trim() || null,
      sanchoku_memo_3: form.sanchoku_memo_3.trim() || null,
      notes: form.notes.trim() || null,
    };

    let venueId = editingId;
    if (editingId) {
      await supabase.from("venue_master").update(row).eq("id", editingId);
    } else {
      const { data } = await supabase.from("venue_master").insert(row).select("id").single();
      venueId = data?.id || null;
    }

    if (venueId) {
      const venueLabel = form.store_name.trim() ? `${form.venue_name.trim()} ${form.store_name.trim()}` : form.venue_name.trim();

      // ホテル紐づけ更新（hotel_venue_links）
      await supabase.from("hotel_venue_links").delete().eq("venue_name", venueLabel);
      if (selectedHotelIds.size > 0) {
        await supabase.from("hotel_venue_links").insert(
          Array.from(selectedHotelIds).map((hid) => ({ hotel_id: hid, venue_name: venueLabel }))
        );
      }

      // マネキン紐づけ更新
      await supabase.from("venue_mannequin_links").delete().eq("venue_id", venueId);
      if (selectedMannequinIds.size > 0) {
        await supabase.from("venue_mannequin_links").insert(
          Array.from(selectedMannequinIds).map((pid) => ({ venue_id: venueId, mannequin_person_id: pid }))
        );
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const v = venues.find((x) => x.id === deleteId);
    if (v) {
      const label = getVenueLabel(v);
      await supabase.from("hotel_venue_links").delete().eq("venue_name", label);
    }
    await supabase.from("venue_master").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchData();
  };

  const toggleActive = async (v: VenueMaster) => {
    await supabase.from("venue_master").update({ is_active: !v.is_active }).eq("id", v.id);
    fetchData();
  };

  // 検索付きコンボ: ホテル候補
  // 検索付きコンボ: マネキン候補
  const mannequinCandidates = mannequinSearch
    ? mannequinPeople.filter((p) => !selectedMannequinIds.has(p.id) && (p.name.toLowerCase().includes(mannequinSearch.toLowerCase()) || (p.agency_name || "").toLowerCase().includes(mannequinSearch.toLowerCase())))
    : [];

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="h-6 w-6" />百貨店マスター
        </h1>
        {canEdit && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新規登録</Button>}
      </div>

      {/* 検索 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="百貨店名で検索" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          使用停止も表示
        </label>
      </div>

      {/* 一覧テーブル */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>百貨店名</TableHead>
                <TableHead>店舗名</TableHead>
                <TableHead className="hidden md:table-cell">都道府県</TableHead>
                <TableHead className="hidden md:table-cell">エリア</TableHead>
                <TableHead className="hidden lg:table-cell">産直くん①</TableHead>
                <TableHead className="hidden lg:table-cell">産直くん②</TableHead>
                <TableHead className="hidden lg:table-cell">産直くん③</TableHead>
                <TableHead className="hidden md:table-cell">ホテル</TableHead>
                <TableHead className="hidden md:table-cell">マネキン</TableHead>
                {canEdit && <TableHead>操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => {
                const hotels = getHotelsForVenue(v);
                const mannequins = getMannequinsForVenue(v);
                return (
                  <TableRow key={v.id} className={!v.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{v.venue_name}</TableCell>
                    <TableCell className="text-sm">{v.store_name || "—"}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{v.prefecture || "—"}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{areas.find((a) => a.id === v.area_id)?.name || "—"}</TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">
                      {v.sanchoku_code_1 ? <span>{v.sanchoku_code_1}{v.sanchoku_memo_1 ? <span className="text-muted-foreground text-xs ml-1">({v.sanchoku_memo_1})</span> : ""}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">
                      {v.sanchoku_code_2 ? <span>{v.sanchoku_code_2}{v.sanchoku_memo_2 ? <span className="text-muted-foreground text-xs ml-1">({v.sanchoku_memo_2})</span> : ""}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">
                      {v.sanchoku_code_3 ? <span>{v.sanchoku_code_3}{v.sanchoku_memo_3 ? <span className="text-muted-foreground text-xs ml-1">({v.sanchoku_memo_3})</span> : ""}</span> : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {hotels.length > 0 ? hotels.map((h) => <Badge key={h.id} variant="outline" className="text-xs">{h.name}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {mannequins.length > 0 ? mannequins.map((m) => <Badge key={m.id} variant="outline" className="text-xs">{m.name}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={v.is_active}
                            onCheckedChange={() => toggleActive(v)}
                            className="data-[state=checked]:bg-green-700 scale-90"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(v.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">百貨店が登録されていません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{filtered.length}件登録済み</p>

      {/* 登録/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={(open, event) => { if (!open && event?.reason === 'outside-press') return; setDialogOpen(open); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "百貨店を編集" : "百貨店を新規登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* ① 基本情報 */}
            <div className="rounded-lg border-2 border-blue-300 dark:border-blue-700 p-3 space-y-3">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">基本情報</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">百貨店名 *</Label>
                  <Input value={form.venue_name} onChange={(e) => setForm({ ...form, venue_name: e.target.value })} placeholder="例: 伊勢丹" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">店舗名</Label>
                  <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} placeholder="例: 新宿店" className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">都道府県</Label>
                <Select value={form.prefecture} onValueChange={(v) => setForm({ ...form, prefecture: v })}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    {prefectures.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">エリア</Label>
                    {!showNewArea && (
                      <button type="button" onClick={() => setShowNewArea(true)} className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                        <PlusCircle className="h-3 w-3" />新規エリア
                      </button>
                    )}
                  </div>
                  {!showNewArea ? (
                    <Select value={form.area_id} onValueChange={(v) => { setForm({ ...form, area_id: v }); setSelectedHotelIds(new Set()); }}>
                      <SelectTrigger><SelectValue placeholder="エリア選択">{form.area_id ? (() => { const a = areas.find((x) => x.id === form.area_id); return a ? (a.prefecture ? `${a.prefecture} / ${a.name}` : a.name) : ""; })() : undefined}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const grouped = new Map<string, AreaItem[]>();
                          areas.forEach((a) => { const key = a.region || "未分類"; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key)!.push(a); });
                          return Array.from(grouped.entries()).map(([region, items]) => (
                            <SelectGroup key={region}>
                              <SelectLabel className="text-xs text-muted-foreground">{region}</SelectLabel>
                              {items.map((a) => <SelectItem key={a.id} value={a.id}>{a.prefecture ? `${a.prefecture} / ${a.name}` : a.name}</SelectItem>)}
                            </SelectGroup>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-2 space-y-2">
                      <div className="flex gap-2">
                        <Input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} placeholder="エリア名（例: 梅田）" className="h-7 text-xs flex-1" />
                        <Button type="button" size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 shrink-0" onClick={handleCreateArea} disabled={!newAreaName.trim() || savingArea}>
                          {savingArea ? "..." : "作成"}
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={resetAreaForm}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      {form.prefecture && (
                        <p className="text-[10px] text-muted-foreground">
                          {getAreaForPrefecture(form.prefecture)} / {form.prefecture} に自動紐づけ
                        </p>
                      )}
                    </div>
                  )}
                </div>
              <div className="space-y-1">
                <Label className="text-xs">メモ</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm" />
              </div>
            </div>

            {/* ② 産直くんコード */}
            <div className="rounded-lg border-2 border-amber-300 dark:border-amber-700 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">産直くんコード</p>
              <div className="space-y-2">
                {[1, 2, 3].map((n) => {
                  const codeKey = `sanchoku_code_${n}` as keyof typeof form;
                  const memoKey = `sanchoku_memo_${n}` as keyof typeof form;
                  return (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-base font-bold text-amber-600 dark:text-amber-400 w-5 shrink-0">{n === 1 ? "①" : n === 2 ? "②" : "③"}</span>
                      <Input value={form[codeKey]} onChange={(e) => setForm({ ...form, [codeKey]: e.target.value })} placeholder="コード" className="h-7 text-xs flex-1" />
                      <Input value={form[memoKey]} onChange={(e) => setForm({ ...form, [memoKey]: e.target.value })} placeholder="メモ" className="h-7 text-xs flex-1" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ③ ホテル紐づけ */}
            <div className="rounded-lg border-2 border-green-300 dark:border-green-700 p-3 space-y-2">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">よく使うホテル{form.area_id ? `（${areas.find((a) => a.id === form.area_id)?.name || ""}エリア）` : ""}</p>
              {form.area_id ? (
                (() => {
                  const hotelsInArea = hotelMasters.filter((h) => h.area_id === form.area_id);
                  return hotelsInArea.length > 0 ? (
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {hotelsInArea.map((h) => (
                        <label key={h.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 rounded px-1 py-0.5">
                          <input type="checkbox" checked={selectedHotelIds.has(h.id)} onChange={() => {
                            setSelectedHotelIds((prev) => { const next = new Set(prev); if (next.has(h.id)) next.delete(h.id); else next.add(h.id); return next; });
                          }} className="rounded" />
                          {h.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">このエリアにホテルが未登録です</p>
                  );
                })()
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">エリアを選択するとホテル一覧が表示されます</p>
              )}
              {selectedHotelIds.size > 0 && <p className="text-[10px] text-green-600">{selectedHotelIds.size}件選択中</p>}
            </div>

            {/* ④ マネキン紐づけ */}
            <div className="rounded-lg border-2 border-purple-300 dark:border-purple-700 p-3 space-y-2">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">よく使うマネキン</p>
              {selectedMannequinIds.size > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Array.from(selectedMannequinIds).map((pid) => {
                    const p = mannequinPeople.find((x) => x.id === pid);
                    return p ? (
                      <Badge key={pid} variant="default" className="text-xs cursor-pointer" onClick={() => setSelectedMannequinIds((prev) => { const next = new Set(prev); next.delete(pid); return next; })}>
                        {p.name}{p.agency_name ? ` (${p.agency_name})` : ""}<X className="h-3 w-3 ml-1" />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
              <Input value={mannequinSearch} onChange={(e) => setMannequinSearch(e.target.value)} placeholder="マネキン名・会社名で検索して追加..." className="h-7 text-xs" />
              {mannequinCandidates.length > 0 && (
                <div className="border rounded p-1 max-h-28 overflow-y-auto space-y-0.5">
                  {mannequinCandidates.slice(0, 10).map((p) => (
                    <div key={p.id} className="px-2 py-1 text-sm hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded cursor-pointer" onClick={() => { setSelectedMannequinIds((prev) => new Set(prev).add(p.id)); setMannequinSearch(""); }}>
                      {p.name}{p.agency_name ? <span className="text-muted-foreground ml-1">({p.agency_name})</span> : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving || !form.venue_name.trim()}>
              {saving ? "保存中..." : editingId ? "更新する" : "登録する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={!!deleteId} onOpenChange={(open, event) => { if (!open && event?.reason === 'outside-press') return; setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>百貨店を削除しますか？</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">紐づけ情報（ホテル・マネキン）も削除されます。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>キャンセル</Button>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
