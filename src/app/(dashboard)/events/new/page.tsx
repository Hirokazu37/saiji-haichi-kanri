"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { prefectures, eventStatuses } from "@/lib/prefectures";
import { X, Plus, Hotel, Train, UserCheck, Package, ArrowLeft } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import Link from "next/link";

type Employee = { id: string; name: string };
type StaffEntry = { employee_id: string; start_date: string; end_date: string; role: string };
type HotelEntry = { hotel_name: string; check_in_date: string; check_out_date: string; room_count: string; reservation_status: string; notes: string };
type TransportEntry = { transport_type: string; departure_from: string; arrival_to: string; outbound_datetime: string; reservation_status: string };
type MannequinEntry = { agency_name: string; staff_name: string; work_start_date: string; work_end_date: string; daily_rate: string; arrangement_status: string };
type ShipmentEntry = { recipient_name: string; direction: "send" | "return" };
type VenueOption = { label: string };
type VenueMaster = { id: string; venue_name: string; store_name: string | null; prefecture: string | null; area_id: string | null; reading: string | null; is_active: boolean };
type HotelMaster = { id: string; name: string; area_id: string | null };
type HotelVenueLink = { hotel_id: string; venue_name: string };
type AgencyMaster = { id: string; name: string };
type AgencyAreaLink = { agency_id: string; area_id: string };
type AreaMaster = { id: string; name: string };

const closingTimes = [
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00",
];

const transportTypes = ["新幹線", "飛行機", "レンタカー", "社用車", "その他"];

export default function NewEventPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [staffEntries, setStaffEntries] = useState<StaffEntry[]>([]);
  const [hotelEntries, setHotelEntries] = useState<HotelEntry[]>([]);
  const [transportEntries, setTransportEntries] = useState<TransportEntry[]>([]);
  const [mannequinEntries, setMannequinEntries] = useState<MannequinEntry[]>([]);
  const [shipmentEntries, setShipmentEntries] = useState<ShipmentEntry[]>([]);
  const [pastVenues, setPastVenues] = useState<VenueOption[]>([]);
  const [venueMasters, setVenueMasters] = useState<VenueMaster[]>([]);
  const [hotelMasters, setHotelMasters] = useState<HotelMaster[]>([]);
  const [hotelVenueLinks, setHotelVenueLinks] = useState<HotelVenueLink[]>([]);
  const [agencyMasters, setAgencyMasters] = useState<AgencyMaster[]>([]);
  const [agencyAreaLinks, setAgencyAreaLinks] = useState<AgencyAreaLink[]>([]);
  const [areaMasters, setAreaMasters] = useState<AreaMaster[]>([]);

  const [form, setForm] = useState({
    name: "",
    venue: "",
    store_name: "",
    prefecture: "",
    start_date: "",
    end_date: "",
    closing_time: "",
    person_in_charge: "",
    status: "準備中",
    application_status: "未提出",
    dm_status: "",
    notes: "",
    equipment_from: "",
    equipment_to: "",
  });

  const fetchData = useCallback(async () => {
    const [empRes, evtRes, vmRes, hmRes, hvlRes, amRes, aalRes, arRes] = await Promise.all([
      supabase.from("employees").select("id, name").order("sort_order").order("name"),
      supabase.from("events").select("venue, store_name").order("created_at", { ascending: false }).limit(100),
      supabase.from("venue_master").select("id, venue_name, store_name, prefecture, area_id, reading, is_active").eq("is_active", true),
      supabase.from("hotel_master").select("id, name, area_id").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("hotel_id, venue_name"),
      supabase.from("mannequin_agencies").select("id, name").order("name"),
      supabase.from("agency_area_links").select("agency_id, area_id"),
      supabase.from("area_master").select("id, name"),
    ]);
    setEmployees(empRes.data || []);
    // 過去の催事会場を重複排除してリスト化
    const seen = new Set<string>();
    const venues: VenueOption[] = [];
    (evtRes.data || []).forEach((e: { venue: string; store_name: string | null }) => {
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (!seen.has(label)) { seen.add(label); venues.push({ label }); }
    });
    setPastVenues(venues);
    setVenueMasters((vmRes.data || []) as VenueMaster[]);
    setHotelMasters((hmRes.data || []) as HotelMaster[]);
    setHotelVenueLinks((hvlRes.data || []) as HotelVenueLink[]);
    setAgencyMasters((amRes.data || []) as AgencyMaster[]);
    setAgencyAreaLinks((aalRes.data || []) as AgencyAreaLink[]);
    setAreaMasters((arRes.data || []) as AreaMaster[]);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- 日付ヘルパー ---
  const prevDay = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const nextDay = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  // --- 社員配置 ---
  const addStaffEntry = (empId: string) => {
    if (!staffEntries.some((e) => e.employee_id === empId)) {
      setStaffEntries((prev) => [...prev, {
        employee_id: empId,
        start_date: form.start_date,
        end_date: form.end_date,
        role: "",
      }]);
    }
  };
  const removeStaffEntry = (index: number) => setStaffEntries((prev) => prev.filter((_, i) => i !== index));
  const updateStaffEntry = (index: number, field: keyof StaffEntry, value: string) => {
    setStaffEntries((prev) => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };
  const duplicateStaffEntry = (empId: string) => {
    setStaffEntries((prev) => [...prev, { employee_id: empId, start_date: form.start_date, end_date: form.end_date, role: "" }]);
  };

  // --- ホテル ---
  const addHotel = () => setHotelEntries((prev) => [...prev, {
    hotel_name: "", check_in_date: prevDay(form.start_date), check_out_date: nextDay(form.end_date),
    room_count: "1", reservation_status: "未予約", notes: "",
  }]);
  const removeHotel = (i: number) => setHotelEntries((prev) => prev.filter((_, idx) => idx !== i));
  const updateHotel = (i: number, field: keyof HotelEntry, v: string) => {
    setHotelEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: v } : e));
  };

  // --- 交通 ---
  const addTransport = () => setTransportEntries((prev) => [...prev, {
    transport_type: "新幹線", departure_from: "", arrival_to: "",
    outbound_datetime: "", reservation_status: "未予約",
  }]);
  const removeTransport = (i: number) => setTransportEntries((prev) => prev.filter((_, idx) => idx !== i));
  const updateTransport = (i: number, field: keyof TransportEntry, v: string) => {
    setTransportEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: v } : e));
  };

  // --- マネキン ---
  const addMannequin = () => setMannequinEntries((prev) => [...prev, {
    agency_name: "", staff_name: "",
    work_start_date: form.start_date, work_end_date: form.end_date,
    daily_rate: "", arrangement_status: "未手配",
  }]);
  const removeMannequin = (i: number) => setMannequinEntries((prev) => prev.filter((_, idx) => idx !== i));
  const updateMannequin = (i: number, field: keyof MannequinEntry, v: string) => {
    setMannequinEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, [field]: v } : e));
  };

  // --- 備品転送 ---
  const currentVenueLabel = form.venue ? (form.store_name ? `${form.venue} ${form.store_name}` : form.venue) : "";

  // --- 百貨店Combobox項目 ---
  const venueItems: ComboboxItem[] = useMemo(() => {
    const items = venueMasters.map((v) => {
      const label = v.store_name ? `${v.venue_name} ${v.store_name}` : v.venue_name;
      return {
        value: `${v.id}`,
        label,
        reading: v.reading ?? "",
        sublabel: v.prefecture ?? "",
      } as ComboboxItem;
    });
    // 50音（ふりがな）でソート
    items.sort((a, b) => {
      const ra = a.reading || a.label;
      const rb = b.reading || b.label;
      return ra.localeCompare(rb, "ja");
    });
    return items;
  }, [venueMasters]);

  // 百貨店選択時のハンドラ（Combobox value=id形式。id→マスター情報で自動入力）
  const handleVenueSelect = (id: string) => {
    if (!id) {
      setForm((f) => ({ ...f, venue: "", store_name: "", prefecture: "" }));
      return;
    }
    const v = venueMasters.find((x) => x.id === id);
    if (!v) {
      // カスタム値（マスターに無い文字列）: そのまま venue に入れる
      setForm((f) => ({ ...f, venue: id }));
      return;
    }
    setForm((f) => ({
      ...f,
      venue: v.venue_name,
      store_name: v.store_name ?? "",
      prefecture: v.prefecture ?? f.prefecture,
    }));
  };
  // 表示用: 現在のform.venueから対応するマスターidを逆引き
  const currentVenueId = (() => {
    const m = venueMasters.find((v) => v.venue_name === form.venue && (v.store_name ?? "") === form.store_name);
    return m?.id ?? form.venue; // マスター無しなら生文字列（Comboboxが自由入力モードに）
  })();

  // --- ホテルCombobox項目 ---
  const currentVenueAreaId = (() => {
    const m = venueMasters.find((v) => v.venue_name === form.venue && (v.store_name ?? "") === form.store_name);
    return m?.area_id ?? null;
  })();
  const hotelItems: ComboboxItem[] = useMemo(() => {
    const linkedIds = new Set(
      hotelVenueLinks.filter((l) => l.venue_name === currentVenueLabel).map((l) => l.hotel_id)
    );
    const sameArea = (h: HotelMaster) => currentVenueAreaId && h.area_id === currentVenueAreaId;
    return hotelMasters.map((h) => ({
      value: h.name,
      label: h.name,
      reading: h.name,
      group: linkedIds.has(h.id)
        ? "この百貨店に紐づくホテル"
        : sameArea(h)
          ? "同じエリアのホテル"
          : "その他のホテル",
    })) as ComboboxItem[];
  }, [hotelMasters, hotelVenueLinks, currentVenueLabel, currentVenueAreaId]);

  // --- マネキン会社Combobox項目 ---
  const agencyItems: ComboboxItem[] = useMemo(() => {
    const areaId = currentVenueAreaId;
    const linkedAgencyIds = new Set(
      areaId ? agencyAreaLinks.filter((l) => l.area_id === areaId).map((l) => l.agency_id) : []
    );
    return agencyMasters.map((a) => ({
      value: a.name,
      label: a.name,
      reading: a.name,
      group: linkedAgencyIds.has(a.id) ? "このエリア対応" : "その他",
    })) as ComboboxItem[];
  }, [agencyMasters, agencyAreaLinks, currentVenueAreaId]);
  const shipmentDestinations = [
    { label: "本社（安岡蒲鉾）", type: "return" as const },
    ...(currentVenueLabel ? [{ label: currentVenueLabel, type: "send" as const }] : []),
    ...pastVenues
      .filter((v) => v.label !== currentVenueLabel)
      .map((v) => ({ label: v.label, type: "send" as const })),
  ];

  const addShipmentTo = (dest: { label: string; type: "send" | "return" }) => {
    setShipmentEntries((prev) => [...prev, { recipient_name: dest.label, direction: dest.type }]);
  };
  const removeShipment = (i: number) => setShipmentEntries((prev) => prev.filter((_, idx) => idx !== i));

  // --- 保存 ---
  const handleSave = async () => {
    if (!form.venue || !form.prefecture || !form.start_date || !form.end_date) return;
    setSaving(true);

    const staffNames = [...new Set(staffEntries.map((e) => employees.find((emp) => emp.id === e.employee_id)?.name || ""))].filter(Boolean);
    const extraText = form.person_in_charge.trim();
    const allNames = [...staffNames, ...(extraText ? [extraText] : [])];

    const { data, error } = await supabase.from("events").insert({
      name: form.name.trim() || null,
      venue: form.venue.trim(),
      store_name: form.store_name.trim() || null,
      prefecture: form.prefecture,
      start_date: form.start_date,
      end_date: form.end_date,
      closing_time: form.closing_time || null,
      person_in_charge: allNames.length > 0 ? allNames.join("、") : null,
      status: form.status,
      application_status: form.application_status,
      dm_status: form.dm_status && form.dm_status !== "none" ? form.dm_status : null,
      notes: form.notes.trim() || null,
      equipment_from: form.equipment_from || null,
      equipment_to: form.equipment_to || null,
    }).select("id").single();

    if (!error && data) {
      const eventId = data.id;

      // 並列INSERT
      const inserts: Promise<unknown>[] = [];

      if (staffEntries.length > 0) {
        inserts.push(supabase.from("event_staff").insert(
          staffEntries.map((e) => ({
            event_id: eventId, employee_id: e.employee_id,
            start_date: e.start_date || form.start_date,
            end_date: e.end_date || form.end_date,
            role: e.role || "担当者",
          }))
        ));
      }

      if (hotelEntries.length > 0) {
        inserts.push(supabase.from("hotels").insert(
          hotelEntries.map((e) => ({
            event_id: eventId,
            hotel_name: e.hotel_name || null,
            check_in_date: e.check_in_date || null,
            check_out_date: e.check_out_date || null,
            room_count: e.room_count ? parseInt(e.room_count) : null,
            reservation_status: e.reservation_status,
            notes: e.notes || null,
          }))
        ));
      }

      if (transportEntries.length > 0) {
        inserts.push(supabase.from("transportations").insert(
          transportEntries.map((e) => ({
            event_id: eventId,
            transport_type: e.transport_type,
            departure_from: e.departure_from || null,
            arrival_to: e.arrival_to || null,
            outbound_datetime: e.outbound_datetime || null,
            reservation_status: e.reservation_status,
          }))
        ));
      }

      if (mannequinEntries.length > 0) {
        inserts.push(supabase.from("mannequins").insert(
          mannequinEntries.map((e) => ({
            event_id: eventId,
            agency_name: e.agency_name || null,
            staff_name: e.staff_name || null,
            work_start_date: e.work_start_date || null,
            work_end_date: e.work_end_date || null,
            daily_rate: e.daily_rate ? parseInt(e.daily_rate) : null,
            arrangement_status: e.arrangement_status,
          }))
        ));
      }

      if (shipmentEntries.length > 0) {
        inserts.push(supabase.from("shipments").insert(
          shipmentEntries.map((e) => ({
            event_id: eventId,
            item_name: e.direction === "return" ? "返送備品" : "備品一式",
            recipient_name: e.recipient_name,
            recipient_address: "",
            ship_date: form.start_date,
            shipment_status: "未発送",
          }))
        ));
      }

      await Promise.all(inserts);
      router.push(`/events/${eventId}`);
    }
    setSaving(false);
  };

  const buildPersonInCharge = () => {
    const staffNames = [...new Set(staffEntries.map((e) => employees.find((emp) => emp.id === e.employee_id)?.name || ""))].filter(Boolean);
    const extra = form.person_in_charge.trim();
    return [...staffNames, ...(extra ? [extra] : [])].join("、");
  };

  const isValid = form.venue && form.prefecture && form.start_date && form.end_date;

  if (!canEdit) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 py-12 text-center">
        <p className="text-lg text-muted-foreground">閲覧権限のみのため、催事の新規作成はできません</p>
        <Link href="/events" className="inline-flex items-center gap-1 text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />催事一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">催事 新規作成</h1>

      {/* ===== 基本情報 ===== */}
      <Card>
        <CardHeader><CardTitle>基本情報</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>百貨店名 *</Label>
              <Combobox
                items={venueItems}
                value={currentVenueId}
                onChange={handleVenueSelect}
                placeholder="百貨店を選択（ふりがな検索可）"
                searchPlaceholder="例: いせたん、けいおう..."
                allowCustom
              />
            </div>
            <div className="space-y-2">
              <Label>店舗名</Label>
              <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} placeholder="新宿（百貨店選択時は自動入力）" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>催事名</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="元祖有名駅弁と全国うまいもの大会" />
          </div>

          <div className="space-y-2">
            <Label>開催地 *</Label>
            <Select value={form.prefecture} onValueChange={(v) => v && setForm({ ...form, prefecture: v })}>
              <SelectTrigger><SelectValue placeholder="都道府県を選択" /></SelectTrigger>
              <SelectContent>
                {prefectures.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>開催期間 *</Label>
            <DateRangePicker
              startDate={form.start_date}
              endDate={form.end_date}
              onChangeStart={(d) => setForm({ ...form, start_date: d })}
              onChangeEnd={(d) => setForm({ ...form, end_date: d })}
            />
          </div>

          <div className="space-y-2">
            <Label>最終日 閉場時間</Label>
            <Select value={form.closing_time} onValueChange={(v) => setForm({ ...form, closing_time: v })}>
              <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
              <SelectContent>
                {closingTimes.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {/* 担当者 */}
          <div className="space-y-3">
            <Label>担当者</Label>
            <Input value={buildPersonInCharge()} readOnly placeholder="下の社員名をタップして追加" className="bg-muted/50" />
            <div className="flex flex-wrap gap-2">
              {employees.map((emp) => {
                const hasEntry = staffEntries.some((e) => e.employee_id === emp.id);
                return (
                  <Badge key={emp.id} variant={hasEntry ? "default" : "outline"} className="cursor-pointer" onClick={() => addStaffEntry(emp.id)}>
                    {emp.name}
                  </Badge>
                );
              })}
            </div>

            {staffEntries.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs text-muted-foreground font-medium">担当期間を設定（同じ人を複数期間で追加可能）</p>
                {staffEntries.map((entry, i) => {
                  const emp = employees.find((e) => e.id === entry.employee_id);
                  return (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="shrink-0">{emp?.name}</Badge>
                      <Input type="date" value={entry.start_date} onChange={(e) => updateStaffEntry(i, "start_date", e.target.value)} className="w-36 h-8 text-xs" />
                      <span className="text-xs">〜</span>
                      <Input type="date" value={entry.end_date} onChange={(e) => updateStaffEntry(i, "end_date", e.target.value)} className="w-36 h-8 text-xs" />
                      <Input value={entry.role} onChange={(e) => updateStaffEntry(i, "role", e.target.value)} placeholder="メモ" className="w-20 h-8 text-xs" />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateStaffEntry(entry.employee_id)} title="期間を追加">
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStaffEntry(i)}>
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <Input value={form.person_in_charge} onChange={(e) => setForm({ ...form, person_in_charge: e.target.value })} placeholder="その他（社員マスターにない人がいれば入力）" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>ステータス</Label>
              <Select value={form.status} onValueChange={(v) => v && setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {eventStatuses.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>出店申込書</Label>
              <Select value={form.application_status} onValueChange={(v) => v && setForm({ ...form, application_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="未提出">未提出</SelectItem>
                  <SelectItem value="提出済">提出済</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>DMハガキ</Label>
              <Select value={form.dm_status} onValueChange={(v) => setForm({ ...form, dm_status: v })}>
                <SelectTrigger><SelectValue placeholder="なし" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  <SelectItem value="未着手">未着手</SelectItem>
                  <SelectItem value="校正中">校正中</SelectItem>
                  <SelectItem value="印刷済み">印刷済み</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>備考</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="特記事項があれば" />
          </div>
        </CardContent>
      </Card>

      {/* ===== ホテル手配 ===== */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hotel className="h-4 w-4" />ホテル手配
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addHotel}><Plus className="h-3 w-3 mr-1" />追加</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {hotelEntries.length === 0 && <p className="text-sm text-muted-foreground">未登録（後から催事詳細ページで追加も可能です）</p>}
          {hotelEntries.map((h, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3 relative">
              <Button variant="ghost" size="icon" className="h-6 w-6 absolute top-2 right-2" onClick={() => removeHotel(i)}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Combobox
                    items={hotelItems}
                    value={h.hotel_name}
                    onChange={(v) => updateHotel(i, "hotel_name", v)}
                    placeholder="ホテルを選択"
                    searchPlaceholder="ホテル名で検索..."
                    allowCustom
                    inputClassName="h-8 text-sm"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">チェックイン</Label>
                  <Input type="date" value={h.check_in_date} onChange={(e) => updateHotel(i, "check_in_date", e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">チェックアウト</Label>
                  <Input type="date" value={h.check_out_date} onChange={(e) => updateHotel(i, "check_out_date", e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">部屋数</Label>
                  <Input type="number" value={h.room_count} onChange={(e) => updateHotel(i, "room_count", e.target.value)} className="h-8 text-xs" min="1" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">予約状態</Label>
                  <Select value={h.reservation_status} onValueChange={(v) => updateHotel(i, "reservation_status", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未予約">未予約</SelectItem>
                      <SelectItem value="予約済">予約済</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Input value={h.notes} onChange={(e) => updateHotel(i, "notes", e.target.value)} placeholder="メモ" className="h-8 text-xs" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ===== 交通手配 ===== */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Train className="h-4 w-4" />交通手配
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addTransport}><Plus className="h-3 w-3 mr-1" />追加</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {transportEntries.length === 0 && <p className="text-sm text-muted-foreground">未登録（後から催事詳細ページで追加も可能です）</p>}
          {transportEntries.map((t, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3 relative">
              <Button variant="ghost" size="icon" className="h-6 w-6 absolute top-2 right-2" onClick={() => removeTransport(i)}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">種別</Label>
                  <Select value={t.transport_type} onValueChange={(v) => updateTransport(i, "transport_type", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {transportTypes.map((tp) => (<SelectItem key={tp} value={tp}>{tp}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">予約状態</Label>
                  <Select value={t.reservation_status} onValueChange={(v) => updateTransport(i, "reservation_status", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未予約">未予約</SelectItem>
                      <SelectItem value="予約済">予約済</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">出発地</Label>
                  <Input value={t.departure_from} onChange={(e) => updateTransport(i, "departure_from", e.target.value)} placeholder="宇和島" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">到着地</Label>
                  <Input value={t.arrival_to} onChange={(e) => updateTransport(i, "arrival_to", e.target.value)} placeholder="東京" className="h-8 text-xs" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">行き日時</Label>
                  <Input type="datetime-local" value={t.outbound_datetime} onChange={(e) => updateTransport(i, "outbound_datetime", e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ===== マネキン手配 ===== */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4" />マネキン手配
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addMannequin}><Plus className="h-3 w-3 mr-1" />追加</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {mannequinEntries.length === 0 && <p className="text-sm text-muted-foreground">未登録（後から催事詳細ページで追加も可能です）</p>}
          {mannequinEntries.map((m, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3 relative">
              <Button variant="ghost" size="icon" className="h-6 w-6 absolute top-2 right-2" onClick={() => removeMannequin(i)}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">派遣会社名</Label>
                  <Combobox
                    items={agencyItems}
                    value={m.agency_name}
                    onChange={(v) => updateMannequin(i, "agency_name", v)}
                    placeholder="会社を選択"
                    searchPlaceholder="会社名で検索..."
                    allowCustom
                    inputClassName="h-8 text-xs"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">スタッフ名</Label>
                  <Input value={m.staff_name} onChange={(e) => updateMannequin(i, "staff_name", e.target.value)} placeholder="山田花子" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">勤務開始</Label>
                  <Input type="date" value={m.work_start_date} onChange={(e) => updateMannequin(i, "work_start_date", e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">勤務終了</Label>
                  <Input type="date" value={m.work_end_date} onChange={(e) => updateMannequin(i, "work_end_date", e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">日当</Label>
                  <Input type="number" value={m.daily_rate} onChange={(e) => updateMannequin(i, "daily_rate", e.target.value)} placeholder="12000" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">手配状態</Label>
                  <Select value={m.arrangement_status} onValueChange={(v) => updateMannequin(i, "arrangement_status", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未手配">未手配</SelectItem>
                      <SelectItem value="手配済">手配済</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ===== 備品の流れ ===== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />備品の流れ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 搬入元 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-amber-700">搬入元</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-sm">{currentVenueLabel || "（百貨店名を入力してください）"}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={form.equipment_from === "本社（安岡蒲鉾）" ? "default" : "outline"}
                className={`cursor-pointer text-xs ${form.equipment_from !== "本社（安岡蒲鉾）" ? "bg-white" : ""}`}
                onClick={() => setForm({ ...form, equipment_from: form.equipment_from === "本社（安岡蒲鉾）" ? "" : "本社（安岡蒲鉾）" })}
              >
                本社（安岡蒲鉾）
              </Badge>
              {pastVenues.filter((v) => v.label !== currentVenueLabel).map((v) => (
                <Badge
                  key={v.label}
                  variant={form.equipment_from === v.label ? "default" : "outline"}
                  className={`cursor-pointer text-xs ${form.equipment_from !== v.label ? "bg-white" : ""}`}
                  onClick={() => setForm({ ...form, equipment_from: form.equipment_from === v.label ? "" : v.label })}
                >
                  {v.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* 搬出先 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-sm">{currentVenueLabel || "（百貨店名を入力してください）"}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium text-amber-700">搬出先</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={form.equipment_to === "本社（安岡蒲鉾）" ? "default" : "outline"}
                className={`cursor-pointer text-xs ${form.equipment_to !== "本社（安岡蒲鉾）" ? "bg-white" : ""}`}
                onClick={() => setForm({ ...form, equipment_to: form.equipment_to === "本社（安岡蒲鉾）" ? "" : "本社（安岡蒲鉾）" })}
              >
                本社（安岡蒲鉾）
              </Badge>
              {pastVenues.filter((v) => v.label !== currentVenueLabel).map((v) => (
                <Badge
                  key={v.label}
                  variant={form.equipment_to === v.label ? "default" : "outline"}
                  className={`cursor-pointer text-xs ${form.equipment_to !== v.label ? "bg-white" : ""}`}
                  onClick={() => setForm({ ...form, equipment_to: form.equipment_to === v.label ? "" : v.label })}
                >
                  {v.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== アクション ===== */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.push("/events")}>キャンセル</Button>
        <Button onClick={handleSave} disabled={!isValid || saving}>
          {saving ? "保存中..." : "作成する"}
        </Button>
      </div>
    </div>
  );
}
