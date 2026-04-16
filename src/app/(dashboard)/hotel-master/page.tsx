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
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { prefectures } from "@/lib/prefectures";

type HotelMaster = {
  id: string;
  name: string;
  phone: string | null;
  price_per_night: number | null;
  prefecture: string | null;
  area_id: string | null;
  notes: string | null;
  is_active: boolean;
};

type AreaItem = { id: string; name: string; region: string | null; prefecture: string | null };

type VenueLink = {
  id: string;
  hotel_id: string;
  venue_name: string;
};

type VenueOption = string;

const emptyForm = { name: "", phone: "", price_per_night: "", prefecture: "", area_id: "", notes: "" };

export default function HotelMasterPage() {
  const supabase = createClient();
  const [hotels, setHotels] = useState<HotelMaster[]>([]);
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [venueLinks, setVenueLinks] = useState<VenueLink[]>([]);
  const [pastVenues, setPastVenues] = useState<VenueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterVenue, setFilterVenue] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // ダイアログ
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedVenues, setSelectedVenues] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 削除
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [hotelRes, linkRes, evtRes, areaRes] = await Promise.all([
      supabase.from("hotel_master").select("*").order("name"),
      supabase.from("hotel_venue_links").select("*"),
      supabase.from("events").select("venue, store_name").order("created_at", { ascending: false }).limit(200),
      supabase.from("area_master").select("id, name, region, prefecture").order("sort_order"),
    ]);
    setHotels(hotelRes.data || []);
    setAreas(areaRes.data || []);
    setVenueLinks(linkRes.data || []);

    const seen = new Set<string>();
    const venues: string[] = [];
    (evtRes.data || []).forEach((e: { venue: string; store_name: string | null }) => {
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (!seen.has(label)) { seen.add(label); venues.push(label); }
    });
    setPastVenues(venues);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getVenuesForHotel = (hotelId: string) => venueLinks.filter((l) => l.hotel_id === hotelId).map((l) => l.venue_name);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setSelectedVenues(new Set());
    setDialogOpen(true);
  };

  const openEdit = (hotel: HotelMaster) => {
    setEditingId(hotel.id);
    setForm({
      name: hotel.name,
      phone: hotel.phone || "",
      price_per_night: hotel.price_per_night?.toString() || "",
      prefecture: hotel.prefecture || "",
      area_id: hotel.area_id || "",
      notes: hotel.notes || "",
    });
    setSelectedVenues(new Set(getVenuesForHotel(hotel.id)));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);

    const hotelData = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      price_per_night: form.price_per_night ? parseInt(form.price_per_night) : null,
      prefecture: form.prefecture || null,
      area_id: form.area_id || null,
      notes: form.notes.trim() || null,
    };

    let hotelId = editingId;
    if (editingId) {
      await supabase.from("hotel_master").update(hotelData).eq("id", editingId);
    } else {
      const { data } = await supabase.from("hotel_master").insert(hotelData).select("id").single();
      hotelId = data?.id || null;
    }

    if (hotelId) {
      await supabase.from("hotel_venue_links").delete().eq("hotel_id", hotelId);
      if (selectedVenues.size > 0) {
        await supabase.from("hotel_venue_links").insert(
          Array.from(selectedVenues).map((v) => ({ hotel_id: hotelId, venue_name: v }))
        );
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("hotel_master").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchData();
  };

  const toggleVenue = (v: string) => {
    setSelectedVenues((prev) => {
      const next = new Set(prev);
      if (next.has(v)) { next.delete(v); } else { next.add(v); }
      return next;
    });
  };

  const toggleActive = async (hotelId: string, current: boolean) => {
    await supabase.from("hotel_master").update({ is_active: !current }).eq("id", hotelId);
    setHotels((prev) => prev.map((h) => h.id === hotelId ? { ...h, is_active: !current } : h));
  };

  // フィルタ
  const filtered = hotels.filter((h) => {
    if (!showInactive && !h.is_active) return false;
    const areaName = areas.find((a) => a.id === h.area_id)?.name || "";
    const matchSearch = !search || h.name.includes(search) || (h.notes || "").includes(search) || areaName.includes(search) || (h.prefecture || "").includes(search);
    const matchVenue = !filterVenue || getVenuesForHotel(h.id).includes(filterVenue);
    return matchSearch && matchVenue;
  });

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">ホテルマスター</h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新規登録</Button>
      </div>

      {/* 検索・フィルタ */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="ホテル名で検索" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
          使用停止も表示
        </label>
        <div className="flex gap-1 flex-wrap">
          <Badge variant={filterVenue === "" ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setFilterVenue("")}>すべて</Badge>
          {pastVenues.slice(0, 15).map((v) => (
            <Badge key={v} variant={filterVenue === v ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => setFilterVenue(filterVenue === v ? "" : v)}>{v}</Badge>
          ))}
        </div>
      </div>

      {/* テーブル */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ホテル名</TableHead>
                <TableHead className="hidden md:table-cell">電話</TableHead>
                <TableHead className="hidden md:table-cell">料金目安</TableHead>
                <TableHead>エリア</TableHead>
                <TableHead>近くの百貨店</TableHead>
                <TableHead className="hidden md:table-cell">メモ</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((h) => {
                const venues = getVenuesForHotel(h.id);
                return (
                  <TableRow key={h.id}>
                    <TableCell className={`font-medium text-sm ${!h.is_active ? "text-muted-foreground line-through" : ""}`}>{h.name}{!h.is_active && <span className="text-[10px] ml-1 text-red-400">停止中</span>}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{h.phone || "—"}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{h.price_per_night ? `${h.price_per_night.toLocaleString()}円` : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {(() => { const an = areas.find((a) => a.id === h.area_id)?.name; return an ? <span>{an}</span> : <span className="text-muted-foreground">—</span>; })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {venues.map((v) => (<Badge key={v} variant="outline" className="text-[10px]">{v}</Badge>))}
                        {venues.length === 0 && <span className="text-xs text-muted-foreground">未設定</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell truncate max-w-[150px]">{h.notes || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 items-center">
                        <Button variant="ghost" size="sm" className={`h-6 text-[10px] px-1.5 ${h.is_active ? "text-green-600" : "text-red-500"}`} onClick={() => toggleActive(h.id, h.is_active)}>
                          {h.is_active ? "使用中" : "停止"}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(h)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(h.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {search || filterVenue ? "該当するホテルがありません" : "ホテルが登録されていません。「新規登録」から追加してください。"}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{hotels.length}件登録済み</p>

      {/* 登録・編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "ホテル編集" : "ホテル新規登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ホテル名 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="○○ホテル" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>電話番号</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03-1234-5678" />
              </div>
              <div className="space-y-2">
                <Label>1泊料金目安</Label>
                <Input type="number" value={form.price_per_night} onChange={(e) => setForm({ ...form, price_per_night: e.target.value })} placeholder="8000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>都道府県</Label>
                <Select value={form.prefecture} onValueChange={(v) => setForm({ ...form, prefecture: v })}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    {prefectures.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>エリア</Label>
                <Select value={form.area_id} onValueChange={(v) => setForm({ ...form, area_id: v })}>
                  <SelectTrigger><SelectValue placeholder="エリア選択">{form.area_id ? (() => { const a = areas.find((x) => x.id === form.area_id); return a ? (a.prefecture ? `${a.prefecture} / ${a.name}` : a.name) : ""; })() : undefined}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const grouped = new Map<string, typeof areas>();
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
              </div>
            </div>
            <div className="space-y-2">
              <Label>メモ</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="朝食あり、駅から徒歩5分 など" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>近くの百貨店（複数選択可）</Label>
              {/* 選択済みだがpastVenuesにない百貨店を解除できるように表示 */}
              {(() => {
                const extraVenues = Array.from(selectedVenues).filter((v) => !pastVenues.includes(v));
                return extraVenues.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-1 mb-1 border-b border-dashed">
                    {extraVenues.map((v) => (
                      <Badge key={v} variant="default" className="cursor-pointer text-xs" onClick={() => toggleVenue(v)}>
                        {v} ✕
                      </Badge>
                    ))}
                  </div>
                );
              })()}
              <div className="flex flex-wrap gap-1.5">
                {pastVenues.map((v) => (
                  <Badge key={v} variant={selectedVenues.has(v) ? "default" : "outline"} className="cursor-pointer text-xs" onClick={() => toggleVenue(v)}>
                    {v}
                  </Badge>
                ))}
              </div>
              {selectedVenues.size > 0 && <p className="text-xs text-muted-foreground">{selectedVenues.size}件の百貨店を紐づけ</p>}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={handleSave} disabled={!form.name || saving}>{saving ? "保存中..." : editingId ? "更新する" : "登録する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ホテルを削除</DialogTitle></DialogHeader>
          <p className="text-sm">このホテルをマスターから削除しますか？催事に登録済みのホテル手配には影響しません。</p>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
