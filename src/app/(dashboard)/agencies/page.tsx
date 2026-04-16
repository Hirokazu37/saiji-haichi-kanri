"use client";

import { useEffect, useState, useCallback } from "react";
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
import {
  Plus, Pencil, Trash2, Search, X, History,
} from "lucide-react";
import Link from "next/link";
import { areaMap, areaNames, allPrefectures, matchesArea } from "@/lib/areas";
import { usePermission } from "@/hooks/usePermission";

type Agency = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
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
  daily_rate: number | null;
};

type MannequinHistory = {
  id: string;
  event_id: string;
  events: { name: string; venue: string; store_name: string | null; start_date: string; end_date: string } | null;
  work_start_date: string | null;
  work_end_date: string | null;
};

const emptyPersonForm = {
  name: "", phone: "", mobile_phone: "", skills: "", notes: "",
  area: "", evaluation: "", daily_rate: "", agency_id: "" as string,
  new_agency_name: "", new_agency_phone: "", new_agency_contact: "",
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
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [people, setPeople] = useState<MannequinPerson[]>([]);
  const [loading, setLoading] = useState(true);

  // 検索
  const [searchName, setSearchName] = useState("");
  const [searchAgency, setSearchAgency] = useState("");
  const [searchArea, setSearchArea] = useState("");

  // Person dialog
  const [personDialogOpen, setPersonDialogOpen] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [personForm, setPersonForm] = useState(emptyPersonForm);
  const [agencyMode, setAgencyMode] = useState<"existing" | "new">("existing");

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // 履歴ダイアログ
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPerson, setHistoryPerson] = useState<MannequinPerson | null>(null);
  const [history, setHistory] = useState<MannequinHistory[]>([]);

  const fetchData = useCallback(async () => {
    const [agencyRes, peopleRes] = await Promise.all([
      supabase.from("mannequin_agencies").select("*").order("name"),
      supabase.from("mannequin_people").select("*").order("name"),
    ]);
    setAgencies(agencyRes.data || []);
    setPeople(peopleRes.data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getAgencyName = (agencyId: string | null) =>
    agencies.find((a) => a.id === agencyId)?.name || "—";

  // マネキン追加
  const openCreate = () => {
    setEditingPersonId(null);
    setPersonForm(emptyPersonForm);
    setAgencyMode("existing");
    setPersonDialogOpen(true);
  };

  // マネキン編集
  const openEdit = (p: MannequinPerson) => {
    setEditingPersonId(p.id);
    setPersonForm({
      name: p.name, phone: p.phone || "", mobile_phone: p.mobile_phone || "",
      skills: p.skills || "", notes: p.notes || "",
      area: p.area || "", evaluation: p.evaluation || "",
      daily_rate: p.daily_rate ? String(p.daily_rate) : "",
      agency_id: p.agency_id || "",
      new_agency_name: "", new_agency_phone: "", new_agency_contact: "",
    });
    setAgencyMode(p.agency_id ? "existing" : "new");
    setPersonDialogOpen(true);
  };

  // 保存
  const savePerson = async () => {
    if (!personForm.name.trim()) return;

    let agencyId: string | null = (personForm.agency_id && personForm.agency_id !== "none") ? personForm.agency_id : null;

    // 新規マネキン会社を作成
    if (agencyMode === "new" && personForm.new_agency_name.trim()) {
      const { data } = await supabase.from("mannequin_agencies").insert({
        name: personForm.new_agency_name.trim(),
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
      evaluation: personForm.evaluation.trim() || null,
      daily_rate: personForm.daily_rate ? parseInt(personForm.daily_rate) : null,
    };

    if (editingPersonId) {
      await supabase.from("mannequin_people").update(payload).eq("id", editingPersonId);
    } else {
      await supabase.from("mannequin_people").insert(payload);
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
    return true;
  });

  const hasSearch = searchName || searchAgency || searchArea;

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
          {hasSearch && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSearchName(""); setSearchAgency(""); setSearchArea(""); }}>
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
              <TableHead>氏名</TableHead>
              <TableHead>マネキン会社</TableHead>
              <TableHead className="hidden md:table-cell">エリア</TableHead>
              <TableHead className="hidden md:table-cell">日当目安</TableHead>
              <TableHead className="hidden lg:table-cell">評価</TableHead>
              {canEdit && <TableHead className="w-28">操作</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPeople.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {hasSearch ? "該当するマネキンさんが見つかりません。" : "マネキンさんが登録されていません。「マネキン追加」から登録してください。"}
                </TableCell>
              </TableRow>
            ) : (
              filteredPeople.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="font-medium">{person.name}</TableCell>
                  <TableCell>{getAgencyName(person.agency_id)}</TableCell>
                  <TableCell className="hidden md:table-cell">{person.area || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {person.daily_rate ? `¥${person.daily_rate.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {person.evaluation ? (
                      <span className="text-xs">{person.evaluation.substring(0, 20)}{person.evaluation.length > 20 ? "..." : ""}</span>
                    ) : "—"}
                  </TableCell>
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
              ))
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
            <div className="space-y-2 rounded-md border p-3">
              <Label className="font-semibold">マネキン会社</Label>
              <div className="flex gap-2">
                <Badge
                  variant={agencyMode === "existing" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setAgencyMode("existing")}
                >
                  既存の会社から選択
                </Badge>
                <Badge
                  variant={agencyMode === "new" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setAgencyMode("new")}
                >
                  新規登録
                </Badge>
              </div>

              {agencyMode === "existing" ? (
                <Select
                  value={personForm.agency_id}
                  onValueChange={(v) => v && setPersonForm({ ...personForm, agency_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="マネキン会社を選択（任意）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし（個人）</SelectItem>
                    {agencies.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={personForm.new_agency_name}
                    onChange={(e) => setPersonForm({ ...personForm, new_agency_name: e.target.value })}
                    placeholder="会社名"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={personForm.new_agency_phone}
                      onChange={(e) => setPersonForm({ ...personForm, new_agency_phone: e.target.value })}
                      placeholder="電話番号"
                    />
                    <Input
                      value={personForm.new_agency_contact}
                      onChange={(e) => setPersonForm({ ...personForm, new_agency_contact: e.target.value })}
                      placeholder="担当者名"
                    />
                  </div>
                </div>
              )}
            </div>

            <AreaPicker
              value={personForm.area}
              onChange={(v) => setPersonForm({ ...personForm, area: v })}
            />

            <div className="space-y-2">
              <Label>日当の目安（円）</Label>
              <Input
                type="number"
                value={personForm.daily_rate}
                onChange={(e) => setPersonForm({ ...personForm, daily_rate: e.target.value })}
                placeholder="15000"
              />
            </div>

            <div className="space-y-2">
              <Label>スキル・経験</Label>
              <Textarea value={personForm.skills} onChange={(e) => setPersonForm({ ...personForm, skills: e.target.value })} placeholder="食品販売経験あり、接客◎ など" />
            </div>

            <div className="space-y-2">
              <Label>評価・メモ</Label>
              <Textarea value={personForm.evaluation} onChange={(e) => setPersonForm({ ...personForm, evaluation: e.target.value })} placeholder="前回の評価や注意点など" />
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
    </div>
  );
}
