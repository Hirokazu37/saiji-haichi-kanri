"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import {
  Plus, Pencil, Trash2, Search, X, History, ChevronDown, ChevronRight, Star, Briefcase, Plane,
} from "lucide-react";
import Link from "next/link";
import { areaMap, areaNames, allPrefectures, matchesArea, getAreaForPrefecture, getRegionColor, regionColors } from "@/lib/areas";
import { usePermission } from "@/hooks/usePermission";

type Agency = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  url: string | null;
  notes: string | null;
};

type MannequinPerson = {
  id: string;
  agency_id: string | null;
  name: string;
  phone: string | null;
  mobile_phone: string | null;
  skills: string | null;
  notes: string | null;
  area: string | null;
  evaluation: string | null;
  rating: number | null;
  daily_rate: number | null;
  treat_as_employee: boolean;
  travel_available: boolean;
};

type MannequinHistory = {
  id: string;
  event_id: string;
  events: { name: string | null; venue: string; store_name: string | null; start_date: string; end_date: string } | null;
  work_start_date: string | null;
  work_end_date: string | null;
};

type AreaItem = { id: string; name: string; region: string | null; color: string | null };
type MannequinAreaLink = { mannequin_id: string; area_id: string };
type AgencyAreaLink = { agency_id: string; area_id: string };

// agency_value:
//   ""                = 未選択（個人）
//   "__individual__"  = 明示的に個人
//   <UUID>            = 既存のマネキン会社ID
//   <任意の文字列>    = 新規会社名（保存時に mannequin_agencies に作成）
const AGENCY_INDIVIDUAL = "__individual__";

const emptyPersonForm = {
  name: "", phone: "", mobile_phone: "", skills: "", notes: "",
  area: "", evaluation: "", rating: 0, daily_rate: "",
  agency_value: "" as string,
  new_agency_phone: "", new_agency_contact: "",
  treat_as_employee: false,
  travel_available: false,
};

function AreaPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  // 値は「東京都、神奈川県」のような都道府県 + 「新宿、渋谷」のような自由テキスト混在
  const items = value.split("、").filter(Boolean);
  const prefItems = items.filter((i) => allPrefectures.includes(i));
  const freeItems = items.filter((i) => !allPrefectures.includes(i));

  const togglePref = (pref: string) => {
    let nextPrefs: string[];
    if (prefItems.includes(pref)) {
      nextPrefs = prefItems.filter((x) => x !== pref);
    } else {
      nextPrefs = [...prefItems, pref];
    }
    onChange([...nextPrefs, ...freeItems].join("、"));
  };

  const [freeText, setFreeText] = useState(freeItems.join("、"));

  const handleFreeTextBlur = () => {
    const newFree = freeText.split(/[、,]/).map((s) => s.trim()).filter((s) => s && !allPrefectures.includes(s));
    onChange([...prefItems, ...newFree].join("、"));
  };

  return (
    <div className="space-y-2">
      <Label>対応エリア</Label>
      <div className="flex flex-wrap gap-1">
        {areaNames.map((areaName) => {
          const prefs = areaMap[areaName];
          const hasAny = prefs.some((p) => prefItems.includes(p));
          const isExpanded = expandedArea === areaName;
          return (
            <Badge
              key={areaName}
              variant={hasAny ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setExpandedArea(isExpanded ? null : areaName)}
            >
              {areaName}
              {hasAny && ` (${prefs.filter((p) => prefItems.includes(p)).length})`}
            </Badge>
          );
        })}
      </div>
      {expandedArea && (
        <div className="flex flex-wrap gap-1 p-2 rounded border bg-muted/30">
          <span className="text-xs text-muted-foreground w-full mb-1">{expandedArea}:</span>
          {areaMap[expandedArea].map((pref) => (
            <Badge
              key={pref}
              variant={prefItems.includes(pref) ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => togglePref(pref)}
            >
              {pref}
            </Badge>
          ))}
        </div>
      )}
      <Input
        placeholder="詳細エリア（例: 新宿、渋谷）"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        onBlur={handleFreeTextBlur}
      />
      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">登録エリア: {items.join("、")}</p>
      )}
    </div>
  );
}

export default function AgenciesPage() {
  const { canEdit, canViewRatings } = usePermission();
  const supabase = createClient();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [people, setPeople] = useState<MannequinPerson[]>([]);
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [areaLinks, setAreaLinks] = useState<MannequinAreaLink[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // 検索
  const [searchName, setSearchName] = useState("");
  const [searchAgency, setSearchAgency] = useState("");
  const [searchArea, setSearchArea] = useState("");
  const [searchTreatAsEmployee, setSearchTreatAsEmployee] = useState(false);
  const [searchTravelAvailable, setSearchTravelAvailable] = useState(false);
  const [searchRating, setSearchRating] = useState(0);

  // 地方アコーディオン
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set());
  const toggleRegion = (region: string) => {
    setCollapsedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region); else next.add(region);
      return next;
    });
  };

  // Person dialog
  const [personDialogOpen, setPersonDialogOpen] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [personForm, setPersonForm] = useState(emptyPersonForm);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // 履歴ダイアログ
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPerson, setHistoryPerson] = useState<MannequinPerson | null>(null);
  const [history, setHistory] = useState<MannequinHistory[]>([]);

  // 会社編集
  const [agencyAreaLinks, setAgencyAreaLinks] = useState<AgencyAreaLink[]>([]);
  const [expandedAgencyIds, setExpandedAgencyIds] = useState<Set<string>>(new Set());
  const toggleAgencyExpand = (id: string) => {
    setExpandedAgencyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [selectedAgencyAreaIds, setSelectedAgencyAreaIds] = useState<Set<string>>(new Set());
  const [agencyDialogOpen, setAgencyDialogOpen] = useState(false);
  const [editingAgencyId, setEditingAgencyId] = useState<string | null>(null);
  const [agencyForm, setAgencyForm] = useState({ name: "", phone: "", email: "", contact_person: "", url: "", notes: "" });
  const [savingAgency, setSavingAgency] = useState(false);
  const [deleteAgencyDialogOpen, setDeleteAgencyDialogOpen] = useState(false);
  const [deletingAgency, setDeletingAgency] = useState<Agency | null>(null);

  const fetchData = useCallback(async () => {
    const [agencyRes, peopleRes, areaRes, areaLinkRes, agencyAreaRes] = await Promise.all([
      supabase.from("mannequin_agencies").select("*").order("name"),
      supabase.from("mannequin_people").select("*").order("name"),
      supabase.from("area_master").select("id, name, region, color").order("sort_order"),
      supabase.from("mannequin_area_links").select("mannequin_id, area_id"),
      supabase.from("agency_area_links").select("agency_id, area_id"),
    ]);
    setAgencies(agencyRes.data || []);
    setPeople(peopleRes.data || []);
    setAreas((areaRes.data || []) as AreaItem[]);
    setAreaLinks((areaLinkRes.data || []) as MannequinAreaLink[]);
    setAgencyAreaLinks((agencyAreaRes.data || []) as AgencyAreaLink[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getAgencyName = (agencyId: string | null) =>
    agencies.find((a) => a.id === agencyId)?.name || "—";

  const getAreaNamesForPerson = (personId: string) => {
    const ids = areaLinks.filter((l) => l.mannequin_id === personId).map((l) => l.area_id);
    return areas.filter((a) => ids.includes(a.id)).map((a) => a.name);
  };

  // --- 会社CRUD ---
  const openAgencyEdit = (a: Agency) => {
    setEditingAgencyId(a.id);
    setAgencyForm({ name: a.name, phone: a.phone || "", email: a.email || "", contact_person: a.contact_person || "", url: a.url || "", notes: a.notes || "" });
    setSelectedAgencyAreaIds(new Set(agencyAreaLinks.filter((l) => l.agency_id === a.id).map((l) => l.area_id)));
    setAgencyDialogOpen(true);
  };

  const openAgencyCreate = () => {
    setEditingAgencyId(null);
    setAgencyForm({ name: "", phone: "", email: "", contact_person: "", url: "", notes: "" });
    setSelectedAgencyAreaIds(new Set());
    setAgencyDialogOpen(true);
  };

  const handleAgencySave = async () => {
    if (!agencyForm.name.trim()) return;
    setSavingAgency(true);
    const row = {
      name: agencyForm.name.trim(),
      phone: agencyForm.phone.trim() || null,
      email: agencyForm.email.trim() || null,
      contact_person: agencyForm.contact_person.trim() || null,
      url: agencyForm.url.trim() || null,
      notes: agencyForm.notes.trim() || null,
    };
    let agencyId = editingAgencyId;
    if (editingAgencyId) {
      await supabase.from("mannequin_agencies").update(row).eq("id", editingAgencyId);
    } else {
      const { data } = await supabase.from("mannequin_agencies").insert(row).select("id").single();
      agencyId = data?.id || null;
    }

    // エリアリンク更新
    if (agencyId) {
      await supabase.from("agency_area_links").delete().eq("agency_id", agencyId);
      if (selectedAgencyAreaIds.size > 0) {
        await supabase.from("agency_area_links").insert(
          Array.from(selectedAgencyAreaIds).map((areaId) => ({ agency_id: agencyId, area_id: areaId }))
        );
      }
    }

    setSavingAgency(false);
    setAgencyDialogOpen(false);
    fetchData();
  };

  const handleAgencyDelete = async () => {
    if (!deletingAgency) return;
    // 所属マネキンのagency_idをnullに
    await supabase.from("mannequin_people").update({ agency_id: null }).eq("agency_id", deletingAgency.id);
    await supabase.from("mannequin_agencies").delete().eq("id", deletingAgency.id);
    setDeleteAgencyDialogOpen(false);
    setDeletingAgency(null);
    fetchData();
  };

  const getPeopleCountForAgency = (agencyId: string) =>
    people.filter((p) => p.agency_id === agencyId).length;

  const getAreaNamesForAgency = (agencyId: string) => {
    const ids = agencyAreaLinks.filter((l) => l.agency_id === agencyId).map((l) => l.area_id);
    return areas.filter((a) => ids.includes(a.id)).map((a) => a.name);
  };

  // マネキン追加
  const openCreate = () => {
    setEditingPersonId(null);
    setPersonForm(emptyPersonForm);
    setSelectedAreaIds(new Set());
    setPersonDialogOpen(true);
  };

  // マネキン編集
  const openEdit = (p: MannequinPerson) => {
    setEditingPersonId(p.id);
    setPersonForm({
      name: p.name, phone: p.phone || "", mobile_phone: p.mobile_phone || "",
      skills: p.skills || "", notes: p.notes || "",
      area: p.area || "", evaluation: "",
      rating: p.rating ?? 0,
      daily_rate: p.daily_rate ? String(p.daily_rate) : "",
      agency_value: p.agency_id || "",
      new_agency_phone: "", new_agency_contact: "",
      treat_as_employee: p.treat_as_employee ?? false,
      travel_available: p.travel_available ?? false,
    });
    const linkedAreaIds = new Set(areaLinks.filter((l) => l.mannequin_id === p.id).map((l) => l.area_id));
    setSelectedAreaIds(linkedAreaIds);
    setPersonDialogOpen(true);
  };

  // 保存
  const savePerson = async () => {
    if (!personForm.name.trim()) return;

    const v = personForm.agency_value.trim();
    let agencyId: string | null = null;
    if (!v || v === AGENCY_INDIVIDUAL) {
      agencyId = null;
    } else if (agencies.some((a) => a.id === v)) {
      // 既存会社のIDをそのまま使用
      agencyId = v;
    } else {
      // 新規会社を作成
      const { data } = await supabase.from("mannequin_agencies").insert({
        name: v,
        phone: personForm.new_agency_phone.trim() || null,
        contact_person: personForm.new_agency_contact.trim() || null,
      }).select("id").single();
      if (data) agencyId = data.id;
    }

    const payload = {
      agency_id: agencyId,
      name: personForm.name.trim(),
      phone: personForm.phone.trim() || null,
      mobile_phone: personForm.mobile_phone.trim() || null,
      skills: personForm.skills.trim() || null,
      notes: personForm.notes.trim() || null,
      area: personForm.area.trim() || null,
      rating: personForm.rating > 0 ? personForm.rating : null,
      daily_rate: personForm.daily_rate ? parseInt(personForm.daily_rate) : null,
      treat_as_employee: personForm.treat_as_employee,
      travel_available: personForm.travel_available,
    };

    let personId = editingPersonId;
    if (editingPersonId) {
      await supabase.from("mannequin_people").update(payload).eq("id", editingPersonId);
    } else {
      const { data } = await supabase.from("mannequin_people").insert(payload).select("id").single();
      personId = data?.id || null;
    }

    // エリアリンク更新
    if (personId) {
      await supabase.from("mannequin_area_links").delete().eq("mannequin_id", personId);
      if (selectedAreaIds.size > 0) {
        await supabase.from("mannequin_area_links").insert(
          Array.from(selectedAreaIds).map((areaId) => ({ mannequin_id: personId, area_id: areaId }))
        );
      }
    }

    setPersonDialogOpen(false);
    fetchData();
  };

  // 削除
  const openDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("mannequin_people").delete().eq("id", deleteTarget.id);
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    fetchData();
  };

  // 履歴表示
  const openHistory = async (person: MannequinPerson) => {
    setHistoryPerson(person);
    const { data } = await supabase
      .from("mannequins")
      .select("id, event_id, work_start_date, work_end_date, events(name, venue, store_name, start_date, end_date)")
      .eq("mannequin_person_id", person.id)
      .order("work_start_date", { ascending: false });
    setHistory((data as unknown as MannequinHistory[]) || []);
    setHistoryOpen(true);
  };

  // 検索フィルタ
  const filteredPeople = people.filter((p) => {
    if (searchName && !p.name.includes(searchName)) return false;
    if (searchAgency) {
      const agName = getAgencyName(p.agency_id);
      if (!agName.includes(searchAgency)) return false;
    }
    if (searchArea) {
      if (!p.area) return false;
      const personPrefs = p.area.split("、").filter(Boolean);
      // エリア名で検索 or 都道府県名で検索
      const isAreaMatch = matchesArea(personPrefs, searchArea);
      const isPrefMatch = personPrefs.some((pref) => pref.includes(searchArea));
      if (!isAreaMatch && !isPrefMatch) return false;
    }
    if (searchTreatAsEmployee && !p.treat_as_employee) return false;
    if (searchTravelAvailable && !p.travel_available) return false;
    if (searchRating > 0 && (p.rating === null || p.rating < searchRating)) return false;
    return true;
  });

  const hasSearch = searchName || searchAgency || searchArea || searchTreatAsEmployee || searchTravelAvailable || searchRating > 0;

  // マネキンさんの地方・色（最初に紐づくエリアを代表とする）
  const getPersonPrimaryArea = (personId: string): AreaItem | null => {
    const link = areaLinks.find((l) => l.mannequin_id === personId);
    return link ? (areas.find((a) => a.id === link.area_id) || null) : null;
  };
  const getPersonRegion = (personId: string, fallbackArea: string | null): string => {
    const area = getPersonPrimaryArea(personId);
    if (area?.region) return area.region;
    // area テキスト欄の最初の都道府県から推測
    if (fallbackArea) {
      const first = fallbackArea.split("、").filter(Boolean)[0];
      if (first) return getAreaForPrefecture(first) || "未分類";
    }
    return "未分類";
  };
  const getPersonColor = (personId: string, fallbackArea: string | null): string => {
    const area = getPersonPrimaryArea(personId);
    if (area?.color) return area.color;
    if (fallbackArea) {
      const first = fallbackArea.split("、").filter(Boolean)[0];
      if (first) return getRegionColor(first);
    }
    return "#CBD5E1";
  };

  // 地方別グループ
  const groupedPeople = (() => {
    const regionOrder = ["北海道", "東北", "関東", "北陸", "中部", "関西", "中国", "四国", "九州", "沖縄", "未分類"];
    const sorted = [...filteredPeople].sort((a, b) => a.name.localeCompare(b.name, "ja"));
    const groups = new Map<string, MannequinPerson[]>();
    regionOrder.forEach((r) => {
      const items = sorted.filter((p) => getPersonRegion(p.id, p.area) === r);
      if (items.length > 0) groups.set(r, items);
    });
    return groups;
  })();

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">マネキン</h1>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            マネキン追加
          </Button>
        )}
      </div>

      {/* マネキン会社一覧 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">マネキン会社（{agencies.length}社）</CardTitle>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={openAgencyCreate}>
                <Plus className="h-3 w-3 mr-1" />会社追加
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {agencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">会社が登録されていません</p>
          ) : (
            <div className="space-y-1">
              {agencies.map((a) => {
                const count = getPeopleCountForAgency(a.id);
                const isExpanded = expandedAgencyIds.has(a.id);
                const members = people.filter((p) => p.agency_id === a.id);
                return (
                  <div key={a.id}>
                    <div className="flex items-start justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50 text-sm cursor-pointer" onClick={() => toggleAgencyExpand(a.id)}>
                      <div className="flex-1 min-w-0 space-y-1">
                        {/* 1行目: 名前 + 連絡先 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          <span className="font-medium">{a.name}</span>
                          <Badge variant="outline" className="text-[10px]">{count}名</Badge>
                          {a.contact_person && <span className="text-muted-foreground text-xs">担当: {a.contact_person}</span>}
                          {a.phone && <a href={`tel:${a.phone.replace(/[^0-9+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline text-xs">📞 {a.phone}</a>}
                          {a.email && <a href={`mailto:${a.email}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline text-xs">✉️ {a.email}</a>}
                          {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs" onClick={(e) => e.stopPropagation()}>HP</a>}
                        </div>
                        {/* 2行目: エリアバッジ（多くなっても改行で見やすく） */}
                        {getAreaNamesForAgency(a.id).length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap pl-5">
                            {getAreaNamesForAgency(a.id).map((n) => <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>)}
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openAgencyEdit(a); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDeletingAgency(a); setDeleteAgencyDialogOpen(true); }}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="ml-8 mb-2 border-l-2 border-muted pl-3 space-y-0.5">
                        {members.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">所属マネキンなし</p>
                        ) : (
                          members.map((m) => (
                            <div key={m.id} className="flex items-center gap-3 py-1 text-xs">
                              <span className="font-medium">{m.name}</span>
                              {(m.mobile_phone || m.phone) && (
                                <a
                                  href={`tel:${(m.mobile_phone || m.phone || "").replace(/[^0-9+]/g, "")}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-primary hover:underline"
                                >
                                  📞 {m.mobile_phone || m.phone}
                                </a>
                              )}
                              {getAreaNamesForPerson(m.id).length > 0 && (
                                <div className="flex gap-0.5">
                                  {getAreaNamesForPerson(m.id).map((n) => <Badge key={n} variant="outline" className="text-[9px] py-0">{n}</Badge>)}
                                </div>
                              )}
                              {canEdit && (
                                <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={() => openEdit(m)}>
                                  <Pencil className="h-2.5 w-2.5" />
                                </Button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 検索 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            検索
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">氏名</Label>
              <Input placeholder="名前で検索" value={searchName} onChange={(e) => setSearchName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">マネキン会社</Label>
              <Input placeholder="会社名で検索" value={searchAgency} onChange={(e) => setSearchAgency(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">エリア / 都道府県</Label>
              <div className="flex flex-wrap gap-1">
                {areaNames.map((a) => (
                  <Badge
                    key={a}
                    variant={searchArea === a ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setSearchArea(searchArea === a ? "" : a)}
                  >
                    {a}
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="都道府県名でも検索可（例: 大阪府）"
                value={areaNames.includes(searchArea) ? "" : searchArea}
                onChange={(e) => setSearchArea(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge
              variant={searchTreatAsEmployee ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setSearchTreatAsEmployee((v) => !v)}
            >
              <Briefcase className="h-3 w-3 mr-1" />社員扱いのみ
            </Badge>
            <Badge
              variant={searchTravelAvailable ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setSearchTravelAvailable((v) => !v)}
            >
              <Plane className="h-3 w-3 mr-1" />出張可のみ
            </Badge>
            {canViewRatings && [1, 2, 3, 4, 5].map((n) => (
              <Badge
                key={n}
                variant={searchRating === n ? "default" : "outline"}
                className="cursor-pointer text-xs gap-0.5"
                onClick={() => setSearchRating(searchRating === n ? 0 : n)}
              >
                <Star className={`h-3 w-3 ${searchRating === n ? "fill-white text-white" : "fill-yellow-400 text-yellow-400"}`} />
                {n === 5 ? "5のみ" : `${n}以上`}
              </Badge>
            ))}
          </div>
          {hasSearch && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSearchName(""); setSearchAgency(""); setSearchArea(""); setSearchTreatAsEmployee(false); setSearchTravelAvailable(false); setSearchRating(0); }}>
              <X className="h-3 w-3 mr-1" />
              検索クリア
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 一覧 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1" />
              <TableHead className="w-20">地方</TableHead>
              <TableHead>氏名</TableHead>
              <TableHead>マネキン会社</TableHead>
              <TableHead className="hidden md:table-cell">電話番号</TableHead>
              <TableHead className="hidden md:table-cell max-w-[200px]">エリア</TableHead>
              {canViewRatings && <TableHead className="hidden lg:table-cell">評価</TableHead>}
              {canEdit && <TableHead className="w-28">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPeople.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6 + (canViewRatings ? 1 : 0) + (canEdit ? 1 : 0)} className="text-center text-muted-foreground">
                  {hasSearch ? "該当するマネキンさんが見つかりません。" : "マネキンさんが登録されていません。「マネキン追加」から登録してください。"}
                </TableCell>
              </TableRow>
            ) : (
              Array.from(groupedPeople.entries()).map(([regionName, personList]) => {
                const regionColor = regionColors[regionName] || "#CBD5E1";
                const isCollapsed = collapsedRegions.has(regionName);
                return (
                  <Fragment key={regionName}>
                    <TableRow
                      className="hover:bg-muted/60 cursor-pointer"
                      style={{ backgroundColor: `${regionColor}22` }}
                      onClick={() => toggleRegion(regionName)}
                    >
                      <TableCell className="p-0" style={{ backgroundColor: regionColor, width: 6 }} />
                      <TableCell colSpan={5 + (canViewRatings ? 1 : 0) + (canEdit ? 1 : 0)} className="py-1.5 font-semibold text-xs">
                        <span className="inline-flex items-center gap-2">
                          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: regionColor }} />
                          {regionName}（{personList.length}名）
                        </span>
                      </TableCell>
                    </TableRow>
                    {!isCollapsed && personList.map((person) => {
                      const personColor = getPersonColor(person.id, person.area);
                      const areaNames2 = getAreaNamesForPerson(person.id);
                      return (
                        <TableRow key={person.id}>
                          <TableCell className="p-0" style={{ backgroundColor: personColor, width: 6 }} />
                          <TableCell className="text-xs text-muted-foreground">{regionName}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span>{person.name}</span>
                              {person.treat_as_employee && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-blue-100 text-blue-800 border-blue-200" title="社員扱い（社員配置UIで選択可・社員スケジュール表に表示）">
                                  <Briefcase className="h-2.5 w-2.5 mr-0.5" />社員扱
                                </Badge>
                              )}
                              {person.travel_available && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-100 text-amber-800 border-amber-200" title="出張可">
                                  <Plane className="h-2.5 w-2.5 mr-0.5" />出張可
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getAgencyName(person.agency_id)}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            {(person.mobile_phone || person.phone) ? (
                              <a href={`tel:${(person.mobile_phone || person.phone || "").replace(/[^0-9+]/g, "")}`} className="text-primary hover:underline">
                                {person.mobile_phone || person.phone}
                              </a>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell max-w-[200px]">
                            {areaNames2.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {areaNames2.map((n) => <Badge key={n} variant="outline" className="text-xs">{n}</Badge>)}
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          {canViewRatings && (
                            <TableCell className="hidden lg:table-cell">
                              {person.rating && person.rating > 0 ? (
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <Star
                                      key={n}
                                      className={`h-3.5 w-3.5 ${n <= (person.rating ?? 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
                                    />
                                  ))}
                                </div>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {canEdit && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openHistory(person)} title="催事履歴">
                                  <History className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => openEdit(person)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => openDelete(person.id, person.name)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{filteredPeople.length}名 表示中</p>

      {/* マネキン 追加/編集ダイアログ */}
      <Dialog open={personDialogOpen} onOpenChange={setPersonDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPersonId ? "マネキン情報を編集" : "マネキンを追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>氏名 *</Label>
              <Input value={personForm.name} onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>電話番号</Label>
                <Input value={personForm.phone} onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>携帯番号</Label>
                <Input value={personForm.mobile_phone} onChange={(e) => setPersonForm({ ...personForm, mobile_phone: e.target.value })} placeholder="090-xxxx-xxxx" />
              </div>
            </div>

            {/* マネキン会社 */}
            {(() => {
              const agencyItems: ComboboxItem[] = [
                { value: AGENCY_INDIVIDUAL, label: "なし（個人）" },
                ...agencies.map((a) => ({
                  value: a.id,
                  label: a.name,
                  reading: a.name.toLowerCase(),
                  sublabel: a.phone || undefined,
                })),
              ];
              const v = personForm.agency_value;
              const isExistingId = agencies.some((a) => a.id === v);
              const isNewAgency = !!v && v !== AGENCY_INDIVIDUAL && !isExistingId;
              return (
                <div className="space-y-2 rounded-md border p-3">
                  <Label className="font-semibold">マネキン会社</Label>
                  <Combobox
                    items={agencyItems}
                    value={v}
                    onChange={(nv) => setPersonForm({ ...personForm, agency_value: nv })}
                    placeholder="会社名を選択または新規入力"
                    searchPlaceholder="会社名で検索..."
                    allowCustom={true}
                  />
                  {isNewAgency && (
                    <div className="space-y-2 pl-3 border-l-2 border-primary/30">
                      <p className="text-[11px] text-muted-foreground">新規会社として「{v}」を登録します</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={personForm.new_agency_phone}
                          onChange={(e) => setPersonForm({ ...personForm, new_agency_phone: e.target.value })}
                          placeholder="電話番号（任意）"
                        />
                        <Input
                          value={personForm.new_agency_contact}
                          onChange={(e) => setPersonForm({ ...personForm, new_agency_contact: e.target.value })}
                          placeholder="担当者名（任意）"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label>対応エリア</Label>
              {areas.length === 0 ? (
                <p className="text-xs text-muted-foreground">エリアマスターに登録がありません</p>
              ) : (
                <>
                  {(() => {
                    const grouped = new Map<string, AreaItem[]>();
                    areas.forEach((a) => { const key = a.region || "未分類"; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key)!.push(a); });
                    return Array.from(grouped.entries()).map(([region, items]) => (
                      <div key={region} className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium">{region}</p>
                        <div className="flex flex-wrap gap-1">
                          {items.map((a) => (
                            <Badge
                              key={a.id}
                              variant={selectedAreaIds.has(a.id) ? "default" : "outline"}
                              className="cursor-pointer text-xs"
                              onClick={() => setSelectedAreaIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                                return next;
                              })}
                            >
                              {a.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                  {selectedAreaIds.size > 0 && (
                    <p className="text-xs text-green-600">{selectedAreaIds.size}エリア選択中</p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>日当の目安（円）</Label>
              <Input
                type="number"
                value={personForm.daily_rate}
                onChange={(e) => setPersonForm({ ...personForm, daily_rate: e.target.value })}
                placeholder="15000"
              />
            </div>

            {/* 区分フラグ */}
            <div className="space-y-2 rounded-md border p-3 bg-muted/30">
              <Label className="font-semibold text-xs">区分・属性</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={personForm.treat_as_employee}
                    onChange={(e) => setPersonForm({ ...personForm, treat_as_employee: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <Briefcase className="h-3.5 w-3.5 text-blue-700" />
                      社員のように扱う
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ONにすると社員配置画面で選択可能になり、社員スケジュール表に表示されます。催事のマネキンタブからは選べなくなります。
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={personForm.travel_available}
                    onChange={(e) => setPersonForm({ ...personForm, travel_available: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <Plane className="h-3.5 w-3.5 text-amber-700" />
                      出張可能
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      対応エリア外の遠方催事でも手配できる人。検索で絞り込み可能。
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>スキル・経験</Label>
              <Textarea value={personForm.skills} onChange={(e) => setPersonForm({ ...personForm, skills: e.target.value })} placeholder="食品販売経験あり、接客◎ など" />
            </div>

            <div className="space-y-2">
              <Label>評価</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPersonForm({ ...personForm, rating: personForm.rating === n ? 0 : n })}
                      className="transition-transform hover:scale-110"
                      aria-label={`${n}つ星`}
                    >
                      <Star
                        className={`h-6 w-6 ${n <= personForm.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
                      />
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {personForm.rating > 0 ? `${personForm.rating} / 5` : "未評価"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">同じ星を再クリックで「未評価」に戻ります。過去の評価テキストは下の備考欄に移行されています。</p>
            </div>

            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea value={personForm.notes} onChange={(e) => setPersonForm({ ...personForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={savePerson} disabled={!personForm.name.trim()}>
              {editingPersonId ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>マネキンさんを削除しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            「{deleteTarget?.name}」を削除します。催事との紐づけも解除されます。
          </p>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 催事履歴ダイアログ */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{historyPerson?.name} さんの催事履歴</DialogTitle>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">まだ催事での利用実績がありません。</p>
          ) : (
            <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
              {history.map((h) => (
                <Link
                  key={h.id}
                  href={`/events/${h.event_id}`}
                  className="block rounded-md border p-3 hover:bg-muted transition-colors"
                >
                  <p className="font-medium text-sm">{h.events?.name || "不明な催事"}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.events?.venue}{h.events?.store_name ? ` ${h.events.store_name}` : ""} |{" "}
                    {h.work_start_date || h.events?.start_date} 〜 {h.work_end_date || h.events?.end_date}
                  </p>
                </Link>
              ))}
            </div>
          )}
          <DialogFooter>
            <DialogClose><Button variant="outline">閉じる</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 会社編集ダイアログ */}
      <Dialog open={agencyDialogOpen} onOpenChange={setAgencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAgencyId ? "マネキン会社を編集" : "マネキン会社を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">会社名 *</Label>
              <Input value={agencyForm.name} onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })} placeholder="会社名" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">電話番号</Label>
                <Input value={agencyForm.phone} onChange={(e) => setAgencyForm({ ...agencyForm, phone: e.target.value })} placeholder="03-1234-5678" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">担当者名</Label>
                <Input value={agencyForm.contact_person} onChange={(e) => setAgencyForm({ ...agencyForm, contact_person: e.target.value })} placeholder="担当者名" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">メールアドレス</Label>
              <Input value={agencyForm.email} onChange={(e) => setAgencyForm({ ...agencyForm, email: e.target.value })} placeholder="info@example.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL</Label>
              <Input value={agencyForm.url} onChange={(e) => setAgencyForm({ ...agencyForm, url: e.target.value })} placeholder="https://example.com" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">対応エリア</Label>
              {areas.length === 0 ? (
                <p className="text-xs text-muted-foreground">エリアマスターに登録がありません</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const grouped = new Map<string, AreaItem[]>();
                    areas.forEach((a) => {
                      const key = a.region || "未分類";
                      if (!grouped.has(key)) grouped.set(key, []);
                      grouped.get(key)!.push(a);
                    });
                    return Array.from(grouped.entries()).map(([region, items]) => (
                      <div key={region} className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium">{region}</p>
                        <div className="flex flex-wrap gap-1">
                          {items.map((a) => (
                            <Badge
                              key={a.id}
                              variant={selectedAgencyAreaIds.has(a.id) ? "default" : "outline"}
                              className="cursor-pointer text-xs"
                              onClick={() => setSelectedAgencyAreaIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                                return next;
                              })}
                            >
                              {a.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">備考</Label>
              <Textarea value={agencyForm.notes} onChange={(e) => setAgencyForm({ ...agencyForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button onClick={handleAgencySave} disabled={!agencyForm.name.trim() || savingAgency}>
              {savingAgency ? "保存中..." : editingAgencyId ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 会社削除確認ダイアログ */}
      <Dialog open={deleteAgencyDialogOpen} onOpenChange={setDeleteAgencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>マネキン会社を削除しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            「{deletingAgency?.name}」を削除します。所属マネキンは「個人」に変更されます。
          </p>
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
            <Button variant="destructive" onClick={handleAgencyDelete}>削除する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
