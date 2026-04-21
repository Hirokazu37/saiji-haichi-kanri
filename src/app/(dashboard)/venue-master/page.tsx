"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
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
import { Plus, Pencil, Trash2, Search, X, Store, PlusCircle, ChevronRight, ChevronDown, GripVertical, Download, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
import { prefectures } from "@/lib/prefectures";
import { getAreaForPrefecture, getRegionColor, regionColors } from "@/lib/areas";
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
  reading: string | null;
  is_active: boolean;
  area_id: string | null;
  sort_order: number;
  // 振込サイクル（Vol28 入金管理）
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
  default_payer_id: string | null;
  direct_receive_rate: number | null;
  chouai_receive_rate: number | null;
};

type PayerMasterItem = { id: string; name: string; is_active: boolean };

type AreaItem = { id: string; name: string; region: string | null; prefecture: string | null; color: string | null };
type HotelMasterItem = { id: string; name: string; area_id: string | null };
type HotelVenueLink = { id: string; hotel_id: string; venue_name: string };
type MannequinPerson = { id: string; name: string; agency_name: string | null };
type MannequinAgency = { id: string; name: string };
type VenueMannequinLink = { id: string; venue_id: string; mannequin_person_id: string | null; mannequin_agency_id: string | null };

const emptyForm = {
  venue_name: "", store_name: "", prefecture: "", area_id: "", reading: "",
  sanchoku_code_1: "", sanchoku_memo_1: "",
  sanchoku_code_2: "", sanchoku_memo_2: "",
  sanchoku_code_3: "", sanchoku_memo_3: "",
  notes: "",
  // 振込サイクル（空文字 = 未設定）
  closing_day: "",
  pay_month_offset: "",
  pay_day: "",
  default_payer_id: "",
  // 入金率（%、空文字 = 未設定）
  direct_receive_rate: "",
  chouai_receive_rate: "",
};

export default function VenueMasterPage() {
  const { canEdit, canViewPayments } = usePermission();
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const supabase = createClient();
  const [venues, setVenues] = useState<VenueMaster[]>([]);
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [hotelMasters, setHotelMasters] = useState<HotelMasterItem[]>([]);
  const [hotelLinks, setHotelLinks] = useState<HotelVenueLink[]>([]);
  const [mannequinPeople, setMannequinPeople] = useState<MannequinPerson[]>([]);
  const [mannequinAgencies, setMannequinAgencies] = useState<MannequinAgency[]>([]);
  const [mannequinLinks, setMannequinLinks] = useState<VenueMannequinLink[]>([]);
  const [payers, setPayers] = useState<PayerMasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ダイアログ
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedHotelIds, setSelectedHotelIds] = useState<Set<string>>(new Set());
  const [selectedMannequinIds, setSelectedMannequinIds] = useState<Set<string>>(new Set());
  const [selectedMannequinAgencyIds, setSelectedMannequinAgencyIds] = useState<Set<string>>(new Set());
  const [hotelSearch, setHotelSearch] = useState("");
  const [mannequinSearch, setMannequinSearch] = useState("");
  const [agencySearch, setAgencySearch] = useState("");
  const [saving, setSaving] = useState(false);

  // エリア新規作成
  const [showNewArea, setShowNewArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [savingArea, setSavingArea] = useState(false);

  // ホテル新規作成
  const [showNewHotel, setShowNewHotel] = useState(false);
  const [newHotelName, setNewHotelName] = useState("");
  const [savingHotel, setSavingHotel] = useState(false);

  // マネキン新規作成
  const [showNewMannequin, setShowNewMannequin] = useState(false);
  const [newMannequinName, setNewMannequinName] = useState("");
  const [newMannequinAgency, setNewMannequinAgency] = useState("");
  const [savingMannequin, setSavingMannequin] = useState(false);

  // 削除
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // 地方アコーディオン（折りたたみ中の地方名）
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set());
  const toggleRegion = (region: string) => {
    setCollapsedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region); else next.add(region);
      return next;
    });
  };

  // D&D 並べ替え
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // active がどの地方グループに属するか特定
    let targetRegion: string | null = null;
    for (const [region, list] of grouped.entries()) {
      if (list.some((v) => v.id === activeId)) {
        targetRegion = region;
        break;
      }
    }
    if (!targetRegion) return;

    const regionVenues = grouped.get(targetRegion) || [];
    const oldIndex = regionVenues.findIndex((v) => v.id === activeId);
    const newIndex = regionVenues.findIndex((v) => v.id === overId);
    // 違う地方グループへのドロップは無視
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(regionVenues, oldIndex, newIndex);
    const originalOrders = regionVenues.map((v) => v.sort_order ?? 0);
    const updates = reordered.map((v, i) => ({ id: v.id, sort_order: originalOrders[i] }));

    // オプティミスティック更新
    setVenues((prev) => prev.map((v) => {
      const u = updates.find((x) => x.id === v.id);
      return u ? { ...v, sort_order: u.sort_order } : v;
    }));

    // DB 更新
    await Promise.all(
      updates.map((u) => supabase.from("venue_master").update({ sort_order: u.sort_order }).eq("id", u.id)),
    );
  };

  const fetchData = useCallback(async () => {
    const [venueRes, areaRes, hmRes, hlRes, mpRes, maRes, mlRes, pyrRes] = await Promise.all([
      supabase.from("venue_master").select("*").order("sort_order").order("venue_name"),
      supabase.from("area_master").select("id, name, region, prefecture, color").order("sort_order"),
      supabase.from("hotel_master").select("id, name, area_id").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("*"),
      supabase.from("mannequin_people").select("id, name, mannequin_agencies(name)").order("name"),
      supabase.from("mannequin_agencies").select("id, name").order("name"),
      supabase.from("venue_mannequin_links").select("*"),
      supabase.from("payer_master").select("id, name, is_active"),
    ]);
    setVenues(venueRes.data || []);
    setAreas((areaRes.data || []) as AreaItem[]);
    setHotelMasters((hmRes.data || []) as HotelMasterItem[]);
    setHotelLinks((hlRes.data || []) as HotelVenueLink[]);
    setMannequinPeople(
      ((mpRes.data || []) as unknown as { id: string; name: string; mannequin_agencies: { name: string } | null }[])
        .map((p) => ({ id: p.id, name: p.name, agency_name: p.mannequin_agencies?.name || null }))
    );
    setMannequinAgencies((maRes.data || []) as MannequinAgency[]);
    setMannequinLinks((mlRes.data || []) as VenueMannequinLink[]);
    setPayers((pyrRes.data || []) as PayerMasterItem[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getVenueLabel = (v: VenueMaster) => v.store_name ? `${v.venue_name} ${v.store_name}` : v.venue_name;

  // 百貨店の表示色: エリアマスタの色 > 都道府県→地方色
  const getVenueColor = (v: VenueMaster): string => {
    const area = areas.find((a) => a.id === v.area_id);
    if (area?.color) return area.color;
    return getRegionColor(v.prefecture);
  };

  const getHotelsForVenue = (v: VenueMaster) => {
    const label = getVenueLabel(v);
    const hids = hotelLinks.filter((l) => l.venue_name === label).map((l) => l.hotel_id);
    return hotelMasters.filter((h) => hids.includes(h.id));
  };

  const getMannequinsForVenue = (v: VenueMaster) => {
    const pids = mannequinLinks.filter((l) => l.venue_id === v.id).map((l) => l.mannequin_person_id).filter(Boolean) as string[];
    return mannequinPeople.filter((p) => pids.includes(p.id));
  };
  const getAgenciesForVenue = (v: VenueMaster) => {
    const aids = mannequinLinks.filter((l) => l.venue_id === v.id).map((l) => l.mannequin_agency_id).filter(Boolean) as string[];
    return mannequinAgencies.filter((a) => aids.includes(a.id));
  };

  // フィルタ（停止も常に表示）
  const filtered = venues.filter((v) => {
    if (search) {
      const s = search.toLowerCase();
      const label = getVenueLabel(v).toLowerCase();
      const reading = (v.reading || "").toLowerCase();
      return label.includes(s) || reading.includes(s);
    }
    return true;
  });

  // 百貨店の地方（region）を取得
  const getVenueRegion = (v: VenueMaster): string => {
    const area = areas.find((a) => a.id === v.area_id);
    if (area?.region) return area.region;
    return getAreaForPrefecture(v.prefecture || "") || "未分類";
  };

  // 地方別グループ（地方内は sort_order 昇順、停止は末尾グループ）
  const grouped = (() => {
    // sort_order 昇順でソート
    const sorted = [...filtered].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const activeVenues = sorted.filter((v) => v.is_active);
    const inactiveVenues = sorted.filter((v) => !v.is_active);
    // 地方の並び順（areaMapの定義順）
    const regionOrder = ["北海道", "東北", "関東", "北陸", "中部", "関西", "中国", "四国", "九州", "沖縄", "未分類"];
    const groups = new Map<string, VenueMaster[]>();
    regionOrder.forEach((r) => {
      const items = activeVenues.filter((v) => getVenueRegion(v) === r);
      if (items.length > 0) groups.set(r, items);
    });
    if (inactiveVenues.length > 0) groups.set("使用停止", inactiveVenues);
    return groups;
  })();

  // ダイアログ操作
  const resetAreaForm = () => {
    setShowNewArea(false);
    setNewAreaName("");
  };

  const resetHotelForm = () => {
    setShowNewHotel(false);
    setNewHotelName("");
  };

  const resetMannequinForm = () => {
    setShowNewMannequin(false);
    setNewMannequinName("");
    setNewMannequinAgency("");
  };

  const handleCreateHotel = async () => {
    if (!newHotelName.trim()) return;
    setSavingHotel(true);
    const { data } = await supabase.from("hotel_master").insert({
      name: newHotelName.trim(),
      area_id: form.area_id || null,
      is_active: true,
    }).select("id, name, area_id").single();
    if (data) {
      setHotelMasters((prev) => [...prev, data as HotelMasterItem]);
      setSelectedHotelIds((prev) => new Set(prev).add(data.id));
    }
    setSavingHotel(false);
    resetHotelForm();
  };

  const handleCreateMannequin = async () => {
    if (!newMannequinName.trim()) return;
    setSavingMannequin(true);
    // 会社名があれば既存のagencyを探すか新規作成
    let agencyId: string | null = null;
    let agencyName: string | null = null;
    if (newMannequinAgency.trim()) {
      agencyName = newMannequinAgency.trim();
      const { data: existing } = await supabase.from("mannequin_agencies").select("id").eq("name", agencyName).single();
      if (existing) {
        agencyId = existing.id;
      } else {
        const { data: newAgency } = await supabase.from("mannequin_agencies").insert({ name: agencyName }).select("id").single();
        agencyId = newAgency?.id || null;
      }
    }
    const { data } = await supabase.from("mannequin_people").insert({
      name: newMannequinName.trim(),
      agency_id: agencyId,
    }).select("id, name").single();
    if (data) {
      setMannequinPeople((prev) => [...prev, { id: data.id, name: data.name, agency_name: agencyName }]);
      setSelectedMannequinIds((prev) => new Set(prev).add(data.id));
    }
    setSavingMannequin(false);
    resetMannequinForm();
  };

  const handleCreateArea = async () => {
    if (!newAreaName.trim()) return;
    setSavingArea(true);

    // 百貨店の都道府県から地方・色を自動セット
    const pref = form.prefecture || null;
    const region = pref ? getAreaForPrefecture(pref) : null;
    const color = region ? regionColors[region] || null : null;

    // sort_orderは既存エリアの最大値+1
    const maxOrder = areas.length > 0 ? Math.max(...areas.map((a) => (a as unknown as { sort_order?: number }).sort_order ?? 0)) + 1 : 0;

    const { data } = await supabase.from("area_master").insert({
      name: newAreaName.trim(),
      region,
      prefecture: pref,
      color,
      sort_order: maxOrder,
    }).select("id, name, region, prefecture, color").single();

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
    setSelectedMannequinAgencyIds(new Set());
    setHotelSearch("");
    setMannequinSearch("");
    setAgencySearch("");
    resetAreaForm();
    resetHotelForm();
    resetMannequinForm();
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
      reading: v.reading || "",
      closing_day: v.closing_day != null ? String(v.closing_day) : "",
      pay_month_offset: v.pay_month_offset != null ? String(v.pay_month_offset) : "",
      pay_day: v.pay_day != null ? String(v.pay_day) : "",
      default_payer_id: v.default_payer_id || "",
      direct_receive_rate: v.direct_receive_rate != null ? String(v.direct_receive_rate) : "",
      chouai_receive_rate: v.chouai_receive_rate != null ? String(v.chouai_receive_rate) : "",
    });
    const label = getVenueLabel(v);
    const hids = new Set(hotelLinks.filter((l) => l.venue_name === label).map((l) => l.hotel_id));
    setSelectedHotelIds(hids);
    const pids = new Set(mannequinLinks.filter((l) => l.venue_id === v.id).map((l) => l.mannequin_person_id).filter(Boolean) as string[]);
    setSelectedMannequinIds(pids);
    const aids = new Set(mannequinLinks.filter((l) => l.venue_id === v.id).map((l) => l.mannequin_agency_id).filter(Boolean) as string[]);
    setSelectedMannequinAgencyIds(aids);
    setHotelSearch("");
    setMannequinSearch("");
    setAgencySearch("");
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
      reading: form.reading.trim() || null,
      closing_day: form.closing_day === "" ? null : parseInt(form.closing_day),
      pay_month_offset: form.pay_month_offset === "" ? null : parseInt(form.pay_month_offset),
      pay_day: form.pay_day === "" ? null : parseInt(form.pay_day),
      default_payer_id: form.default_payer_id || null,
      direct_receive_rate: form.direct_receive_rate === "" ? null : parseFloat(form.direct_receive_rate),
      chouai_receive_rate: form.chouai_receive_rate === "" ? null : parseFloat(form.chouai_receive_rate),
    };

    let venueId = editingId;
    if (editingId) {
      await supabase.from("venue_master").update(row).eq("id", editingId);
    } else {
      const maxOrder = venues.length > 0 ? Math.max(...venues.map((v) => v.sort_order ?? 0)) + 1 : 0;
      const { data } = await supabase.from("venue_master").insert({ ...row, sort_order: maxOrder }).select("id").single();
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

      // マネキン紐づけ更新（個人・会社の両方）
      await supabase.from("venue_mannequin_links").delete().eq("venue_id", venueId);
      const linkRows: { venue_id: string; mannequin_person_id?: string; mannequin_agency_id?: string }[] = [
        ...Array.from(selectedMannequinIds).map((pid) => ({ venue_id: venueId!, mannequin_person_id: pid })),
        ...Array.from(selectedMannequinAgencyIds).map((aid) => ({ venue_id: venueId!, mannequin_agency_id: aid })),
      ];
      if (linkRows.length > 0) {
        await supabase.from("venue_mannequin_links").insert(linkRows);
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
    setVenues((prev) => prev.map((x) => x.id === v.id ? { ...x, is_active: !x.is_active } : x));
    await supabase.from("venue_master").update({ is_active: !v.is_active }).eq("id", v.id);
  };

  // 検索付きコンボ: ホテル候補
  // 検索付きコンボ: マネキン候補
  const mannequinCandidates = mannequinSearch
    ? mannequinPeople.filter((p) => !selectedMannequinIds.has(p.id) && (p.name.toLowerCase().includes(mannequinSearch.toLowerCase()) || (p.agency_name || "").toLowerCase().includes(mannequinSearch.toLowerCase())))
    : [];
  // 検索付きコンボ: マネキン会社候補
  const agencyCandidates = agencySearch
    ? mannequinAgencies.filter((a) => !selectedMannequinAgencyIds.has(a.id) && a.name.toLowerCase().includes(agencySearch.toLowerCase()))
    : [];

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  // D&D 対応の百貨店行
  const SortableVenueRow = ({ v }: { v: VenueMaster }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: v.id });
    const hotels = getHotelsForVenue(v);
    const mannequins = getMannequinsForVenue(v);
    const agencies = getAgenciesForVenue(v);
    const venueColor = getVenueColor(v);
    const venueRegion = getVenueRegion(v);
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };
    return (
      <TableRow ref={setNodeRef} style={style} className={!v.is_active ? "opacity-50" : ""}>
        {canEdit && (
          <TableCell className="w-8 p-1">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
              aria-label="ドラッグで並べ替え"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </TableCell>
        )}
        <TableCell className="p-0" style={{ backgroundColor: venueColor, width: 6 }} />
        <TableCell className="text-xs text-muted-foreground">{venueRegion}</TableCell>
        <TableCell className="text-sm hidden md:table-cell">{v.prefecture || "—"}</TableCell>
        <TableCell>
          <div className="font-medium">{v.venue_name}{v.store_name ? <span className="text-muted-foreground font-normal ml-1">{v.store_name}</span> : null}</div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <div className="flex flex-wrap gap-1">
            {agencies.map((a) => <Badge key={`a-${a.id}`} variant="secondary" className="text-xs bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200">{a.name}</Badge>)}
            {mannequins.map((m) => <Badge key={`p-${m.id}`} variant="outline" className="text-xs">{m.name}</Badge>)}
            {agencies.length === 0 && mannequins.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <div className="flex flex-wrap gap-1">
            {hotels.length > 0 ? hotels.map((h) => <Badge key={h.id} variant="outline" className="text-xs">{h.name}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </TableCell>
        <TableCell className="text-sm hidden lg:table-cell">
          {v.sanchoku_code_1 ? <span>{v.sanchoku_code_1}{v.sanchoku_memo_1 ? <span className="text-muted-foreground text-xs ml-1">({v.sanchoku_memo_1})</span> : ""}</span> : "—"}
        </TableCell>
        <TableCell className="text-sm hidden lg:table-cell">
          {v.sanchoku_code_2 ? <span>{v.sanchoku_code_2}{v.sanchoku_memo_2 ? <span className="text-muted-foreground text-xs ml-1">({v.sanchoku_memo_2})</span> : ""}</span> : "—"}
        </TableCell>
        <TableCell className="text-sm hidden lg:table-cell">
          {v.sanchoku_code_3 ? <span>{v.sanchoku_code_3}{v.sanchoku_memo_3 ? <span className="text-muted-foreground text-xs ml-1">({v.sanchoku_memo_3})</span> : ""}</span> : "—"}
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
  };

  // CSVエクスポート：百貨店マスター＋入金サイクル
  const exportCsv = () => {
    const headers = [
      "venue_name", "store_name", "reading", "prefecture",
      "closing_day", "pay_month_offset", "pay_day",
      "default_payer_name", "direct_receive_rate", "chouai_receive_rate",
    ];
    const dayToLabel = (d: number | null | undefined) => d == null ? "" : d === 0 ? "月末" : `${d}`;
    const offToLabel = (o: number | null | undefined) => o == null ? "" : o === 0 ? "当月" : o === 1 ? "翌月" : o === 2 ? "翌々月" : String(o);
    const rows = venues.map((v) => {
      const defaultPayerName = v.default_payer_id
        ? payers.find((p) => p.id === v.default_payer_id)?.name ?? ""
        : "";
      return [
        v.venue_name,
        v.store_name ?? "",
        v.reading ?? "",
        v.prefecture ?? "",
        dayToLabel(v.closing_day),
        offToLabel(v.pay_month_offset),
        dayToLabel(v.pay_day),
        defaultPayerName,
        v.direct_receive_rate != null ? String(v.direct_receive_rate) : "",
        v.chouai_receive_rate != null ? String(v.chouai_receive_rate) : "",
      ];
    });
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `百貨店マスター_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // CSVパース（簡易）: ダブルクオート・エスケープ対応
  const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuote) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else { inQuote = false; }
        } else {
          cell += c;
        }
      } else {
        if (c === '"') inQuote = true;
        else if (c === ",") { row.push(cell); cell = ""; }
        else if (c === "\n" || c === "\r") {
          if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); row = []; cell = ""; }
          if (c === "\r" && text[i + 1] === "\n") i++;
        } else {
          cell += c;
        }
      }
    }
    if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
    return rows;
  };

  const parseDayField = (v: string): number | null => {
    const s = v.trim();
    if (!s) return null;
    if (s === "月末" || s.toLowerCase() === "end") return 0;
    const n = parseInt(s.replace(/日$/, ""));
    return isNaN(n) ? null : Math.max(0, Math.min(31, n));
  };
  const parseOffsetField = (v: string): number | null => {
    const s = v.trim();
    if (!s) return null;
    if (s === "当月") return 0;
    if (s === "翌月") return 1;
    if (s === "翌々月") return 2;
    const n = parseInt(s.replace(/ヶ月後$/, ""));
    return isNaN(n) ? null : Math.max(0, Math.min(6, n));
  };
  const parseRateField = (v: string): number | null => {
    const s = v.trim();
    if (!s) return null;
    const n = parseFloat(s.replace(/%$/, ""));
    return isNaN(n) ? null : Math.max(0, Math.min(100, n));
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      // BOM除去
      const clean = text.replace(/^\uFEFF/, "");
      const parsed = parseCsv(clean);
      if (parsed.length < 2) {
        alert("ヘッダー行と1行以上のデータ行が必要です。");
        return;
      }
      const header = parsed[0].map((h) => h.trim());
      const idx = (name: string) => header.findIndex((h) => h === name);
      const iVenue = idx("venue_name");
      const iStore = idx("store_name");
      const iClosing = idx("closing_day");
      const iOffset = idx("pay_month_offset");
      const iPay = idx("pay_day");
      const iPayer = idx("default_payer_name");
      const iDirectRate = idx("direct_receive_rate");
      const iChouaiRate = idx("chouai_receive_rate");
      if (iVenue < 0) {
        alert("ヘッダーに venue_name 列が必要です。");
        return;
      }

      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let r = 1; r < parsed.length; r++) {
        const row = parsed[r];
        if (row.every((c) => !c.trim())) continue; // 空行
        const venueName = row[iVenue]?.trim() ?? "";
        const storeName = iStore >= 0 ? (row[iStore]?.trim() ?? "") : "";
        if (!venueName) { skipped++; continue; }
        const target = venues.find((v) =>
          v.venue_name === venueName && (v.store_name ?? "") === storeName,
        );
        if (!target) {
          errors.push(`行${r + 1}: ${venueName}${storeName ? " " + storeName : ""} は百貨店マスターに未登録`);
          skipped++;
          continue;
        }
        const updates: Record<string, unknown> = {};
        if (iClosing >= 0) updates.closing_day = parseDayField(row[iClosing] ?? "");
        if (iOffset >= 0) updates.pay_month_offset = parseOffsetField(row[iOffset] ?? "");
        if (iPay >= 0) updates.pay_day = parseDayField(row[iPay] ?? "");
        if (iDirectRate >= 0) updates.direct_receive_rate = parseRateField(row[iDirectRate] ?? "");
        if (iChouaiRate >= 0) updates.chouai_receive_rate = parseRateField(row[iChouaiRate] ?? "");
        if (iPayer >= 0) {
          const pname = row[iPayer]?.trim() ?? "";
          if (!pname) {
            updates.default_payer_id = null;
          } else {
            const p = payers.find((x) => x.name === pname);
            if (!p) {
              errors.push(`行${r + 1}: 帳合先「${pname}」は帳合先マスターに未登録（この行はスキップ）`);
              skipped++;
              continue;
            }
            updates.default_payer_id = p.id;
          }
        }
        await supabase.from("venue_master").update(updates).eq("id", target.id);
        updated++;
      }

      const summary = `${updated}件を更新しました${skipped > 0 ? `（${skipped}件はスキップ）` : ""}`;
      alert(errors.length > 0 ? `${summary}\n\n${errors.slice(0, 10).join("\n")}` : summary);
      fetchData();
    } catch (err) {
      console.error("[import csv] error:", err);
      alert("CSV取込に失敗しました。ファイル形式を確認してください。");
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="h-6 w-6" />百貨店マスター
        </h1>
        <div className="flex gap-2 flex-wrap">
          {canViewPayments && (
            <>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1" />CSV出力
              </Button>
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" onClick={() => importFileRef.current?.click()} disabled={importing}>
                    <Upload className="h-4 w-4 mr-1" />{importing ? "取込中..." : "CSV取込"}
                  </Button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImport(f);
                    }}
                  />
                </>
              )}
            </>
          )}
          {canEdit && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新規登録</Button>}
        </div>
      </div>

      {/* 検索 */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="百貨店名・ふりがなで検索" className="pl-9" />
      </div>

      {/* 一覧テーブル */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit && <TableHead className="w-8" />}
                <TableHead className="w-1" />
                <TableHead className="w-20">地方</TableHead>
                <TableHead className="hidden md:table-cell">都道府県</TableHead>
                <TableHead>百貨店名</TableHead>
                <TableHead className="hidden md:table-cell">マネキン</TableHead>
                <TableHead className="hidden md:table-cell">ホテル</TableHead>
                <TableHead className="hidden lg:table-cell">産直くん①</TableHead>
                <TableHead className="hidden lg:table-cell">産直くん②</TableHead>
                <TableHead className="hidden lg:table-cell">産直くん③</TableHead>
                {canEdit && <TableHead>操作</TableHead>}
              </TableRow>
            </TableHeader>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <TableBody>
                {Array.from(grouped.entries()).map(([regionName, venueList]) => {
                  const regionColor = regionName === "使用停止" ? "#9CA3AF" : (regionColors[regionName] || "#CBD5E1");
                  const isCollapsed = collapsedRegions.has(regionName);
                  return (
                  <Fragment key={regionName}>
                    <TableRow
                      className="hover:bg-muted/60 cursor-pointer"
                      style={{ backgroundColor: `${regionColor}22` }}
                      onClick={() => toggleRegion(regionName)}
                    >
                      {canEdit && <TableCell className="p-0 w-8" />}
                      <TableCell className="p-0" style={{ backgroundColor: regionColor, width: 6 }} />
                      <TableCell colSpan={canEdit ? 9 : 8} className="py-1.5 font-semibold text-xs">
                        <span className="inline-flex items-center gap-2">
                          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: regionColor }} />
                          {regionName}（{venueList.length}件）
                        </span>
                      </TableCell>
                    </TableRow>
                    {!isCollapsed && (
                      <SortableContext items={venueList.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                        {venueList.map((v) => <SortableVenueRow key={v.id} v={v} />)}
                      </SortableContext>
                    )}
                  </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={canEdit ? 11 : 9} className="text-center text-muted-foreground py-8">百貨店が登録されていません</TableCell></TableRow>
                )}
              </TableBody>
            </DndContext>
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
                <Label className="text-xs">ふりがな（並び替え用）</Label>
                <Input value={form.reading} onChange={(e) => setForm({ ...form, reading: e.target.value })} placeholder="例: いせたん しんじゅくてん" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">都道府県</Label>
                <Select value={form.prefecture} onValueChange={(v) => setForm({ ...form, prefecture: v ?? "" })}>
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
                    <div className="flex gap-2">
                    <Select value={form.area_id} onValueChange={(v) => { setForm({ ...form, area_id: v ?? "" }); setSelectedHotelIds(new Set()); }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="エリア選択">{form.area_id ? (() => { const a = areas.find((x) => x.id === form.area_id); return a ? (a.prefecture ? `${a.prefecture} / ${a.name}` : a.name) : ""; })() : undefined}</SelectValue></SelectTrigger>
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
                    {form.area_id && (
                      <Button type="button" variant="outline" size="sm" className="h-9 px-2 shrink-0" onClick={() => { setForm({ ...form, area_id: "" }); setSelectedHotelIds(new Set()); }}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    </div>
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

            {/* ①b 入金サイクル（経理閲覧権限者向け） */}
            {(() => {
              // 選択値 → 表示ラベルへ変換
              const dayLabel = (v: string) => {
                if (v === "" || v === "none") return "未設定";
                if (v === "0") return "月末";
                return `${v}日`;
              };
              const monthOffsetLabel = (v: string) => {
                if (v === "" || v === "none") return "未設定";
                if (v === "0") return "当月";
                if (v === "1") return "翌月";
                if (v === "2") return "翌々月";
                return `${v}ヶ月後`;
              };
              const payerLabel = (v: string) => {
                if (v === "" || v === "none") return "なし（直取引）";
                return payers.find((p) => p.id === v)?.name ?? "（選択済み）";
              };
              return (
                <div className="rounded-lg border-2 border-emerald-300 dark:border-emerald-700 p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">入金サイクル（振込予定日の自動計算に使用）</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">締め日</Label>
                      <Select value={form.closing_day || "none"} onValueChange={(v) => setForm({ ...form, closing_day: v === "none" ? "" : v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue>{dayLabel(form.closing_day)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <SelectItem value="none">未設定</SelectItem>
                          <SelectItem value="0">月末</SelectItem>
                          {Array.from({ length: 31 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}日</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">支払月</Label>
                      <Select value={form.pay_month_offset || "none"} onValueChange={(v) => setForm({ ...form, pay_month_offset: v === "none" ? "" : v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue>{monthOffsetLabel(form.pay_month_offset)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">未設定</SelectItem>
                          <SelectItem value="0">当月</SelectItem>
                          <SelectItem value="1">翌月</SelectItem>
                          <SelectItem value="2">翌々月</SelectItem>
                          <SelectItem value="3">3ヶ月後</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">支払日</Label>
                      <Select value={form.pay_day || "none"} onValueChange={(v) => setForm({ ...form, pay_day: v === "none" ? "" : v })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue>{dayLabel(form.pay_day)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          <SelectItem value="none">未設定</SelectItem>
                          <SelectItem value="0">月末</SelectItem>
                          {Array.from({ length: 31 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}日</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* 現在のサイクルを人間可読で表示 */}
                  <p className="text-[11px] text-emerald-800/70 dark:text-emerald-400/70">
                    プレビュー: {dayLabel(form.closing_day)}締め {monthOffsetLabel(form.pay_month_offset)}{dayLabel(form.pay_day)}
                  </p>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">デフォルト帳合先（この百貨店の催事で通常経由する問屋）</Label>
                    <Select value={form.default_payer_id || "none"} onValueChange={(v) => setForm({ ...form, default_payer_id: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue>{payerLabel(form.default_payer_id)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">なし（直取引）</SelectItem>
                        {payers.filter((p) => p.is_active).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">催事作成時に自動で入金元として選ばれます。催事ごとに変更可。</p>
                  </div>
                  {/* 入金率（税抜売上に対する入金比率%） */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">直取引時の入金率（%）</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={form.direct_receive_rate}
                        onChange={(e) => setForm({ ...form, direct_receive_rate: e.target.value })}
                        placeholder="例: 80"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">帳合経由時の入金率（%）</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={form.chouai_receive_rate}
                        onChange={(e) => setForm({ ...form, chouai_receive_rate: e.target.value })}
                        placeholder="例: 78"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    入金率 = 税抜売上に対して入金される比率。例: 80% → 税抜売上100万円のとき入金予定額 80万円（税抜）
                  </p>
                </div>
              );
            })()}

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
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">よく使うホテル{form.area_id ? `（${areas.find((a) => a.id === form.area_id)?.name || ""}エリア）` : ""}</p>
                {!showNewHotel && (
                  <button type="button" onClick={() => setShowNewHotel(true)} className="text-[10px] text-green-600 hover:underline flex items-center gap-0.5">
                    <PlusCircle className="h-3 w-3" />新規ホテル
                  </button>
                )}
              </div>
              {showNewHotel && (
                <div className="rounded border border-green-300 bg-green-50 dark:bg-green-950/30 p-2">
                  <div className="flex gap-2">
                    <Input value={newHotelName} onChange={(e) => setNewHotelName(e.target.value)} placeholder="ホテル名" className="h-7 text-xs flex-1" />
                    <Button type="button" size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 shrink-0" onClick={handleCreateHotel} disabled={!newHotelName.trim() || savingHotel}>
                      {savingHotel ? "..." : "作成"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={resetHotelForm}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  {form.area_id && <p className="text-[10px] text-muted-foreground mt-1">{areas.find((a) => a.id === form.area_id)?.name}エリアに紐づけ</p>}
                </div>
              )}
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
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">よく使うマネキン</p>
                {!showNewMannequin && (
                  <button type="button" onClick={() => setShowNewMannequin(true)} className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5">
                    <PlusCircle className="h-3 w-3" />新規マネキン
                  </button>
                )}
              </div>
              {showNewMannequin && (
                <div className="rounded border border-purple-300 bg-purple-50 dark:bg-purple-950/30 p-2 space-y-1">
                  <div className="flex gap-2">
                    <Input value={newMannequinName} onChange={(e) => setNewMannequinName(e.target.value)} placeholder="マネキン名" className="h-7 text-xs flex-1" />
                    <Input value={newMannequinAgency} onChange={(e) => setNewMannequinAgency(e.target.value)} placeholder="会社名" className="h-7 text-xs flex-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700 flex-1" onClick={handleCreateMannequin} disabled={!newMannequinName.trim() || savingMannequin}>
                      {savingMannequin ? "..." : "作成"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={resetMannequinForm}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
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

            {/* ⑤ マネキン会社紐づけ */}
            <div className="rounded-lg border-2 border-fuchsia-300 dark:border-fuchsia-700 p-3 space-y-2">
              <p className="text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-400">よく使うマネキン会社</p>
              {selectedMannequinAgencyIds.size > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Array.from(selectedMannequinAgencyIds).map((aid) => {
                    const a = mannequinAgencies.find((x) => x.id === aid);
                    return a ? (
                      <Badge key={aid} variant="default" className="text-xs cursor-pointer bg-fuchsia-600 hover:bg-fuchsia-700" onClick={() => setSelectedMannequinAgencyIds((prev) => { const next = new Set(prev); next.delete(aid); return next; })}>
                        {a.name}<X className="h-3 w-3 ml-1" />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
              <Input value={agencySearch} onChange={(e) => setAgencySearch(e.target.value)} placeholder="会社名で検索して追加..." className="h-7 text-xs" />
              {agencyCandidates.length > 0 && (
                <div className="border rounded p-1 max-h-28 overflow-y-auto space-y-0.5">
                  {agencyCandidates.slice(0, 10).map((a) => (
                    <div key={a.id} className="px-2 py-1 text-sm hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900/30 rounded cursor-pointer" onClick={() => { setSelectedMannequinAgencyIds((prev) => new Set(prev).add(a.id)); setAgencySearch(""); }}>
                      {a.name}
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
