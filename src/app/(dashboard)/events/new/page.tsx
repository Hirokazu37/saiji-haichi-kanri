"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
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
import { getAreaForPrefecture } from "@/lib/areas";
import { X, Plus, Hotel, Train, UserCheck, Package, ArrowLeft, Building2, FileText, Save } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { PayerSourceSection } from "@/components/arrangements/PayerSourceSection";
import Link from "next/link";

type Employee = { id: string; name: string };
type StaffPersonType = "employee" | "mannequin";
type StaffEntry = { person_type: StaffPersonType; person_id: string; start_date: string; end_date: string; role: string };
type HotelEntry = { hotel_name: string; check_in_date: string; check_out_date: string; room_count: string; reservation_status: string; notes: string };
type TransportEntry = { transport_type: string; departure_from: string; arrival_to: string; outbound_datetime: string; reservation_status: string };
type MannequinEntry = { agency_name: string; staff_name: string; work_start_date: string; work_end_date: string; daily_rate: string; arrangement_status: string };
type ShipmentEntry = { recipient_name: string; direction: "send" | "return" };
type VenueOption = { label: string };
type VenueMaster = {
  id: string;
  venue_name: string;
  store_name: string | null;
  prefecture: string | null;
  area_id: string | null;
  reading: string | null;
  is_active: boolean;
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
  default_payer_id: string | null;
  direct_receive_rate: number | null;
  chouai_receive_rate: number | null;
};
type HotelMaster = { id: string; name: string; area_id: string | null };
type HotelVenueLink = { hotel_id: string; venue_name: string };
type AgencyMaster = { id: string; name: string };
type AgencyAreaLink = { agency_id: string; area_id: string };
type MannequinPerson = { id: string; name: string; agency_id: string | null; daily_rate: number | null; rating: number | null; treat_as_employee: boolean };
type MannequinHistoryRow = { staff_name: string | null; events: { venue: string; store_name: string | null } | null };
type VenueMannequinLink = { venue_id: string; mannequin_person_id: string | null; mannequin_agency_id: string | null };
type AreaMaster = { id: string; name: string };

const closingTimes = [
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00",
];

const transportTypes = ["新幹線", "飛行機", "レンタカー", "社用車", "その他"];

export default function NewEventPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-4">読み込み中...</p>}>
      <NewEventPageInner />
    </Suspense>
  );
}

function NewEventPageInner() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const duplicateFromId = searchParams?.get("from") || null;
  const [saving, setSaving] = useState(false);
  // React の setState は非同期のため、ボタン disabled が効く前に連打されると
  // 二重 INSERT されうる。useRef で同期的にガードして再発防止する。
  const savingRef = useRef(false);
  const [duplicatedFrom, setDuplicatedFrom] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [staffEntries, setStaffEntries] = useState<StaffEntry[]>([]);
  const [hotelEntries, setHotelEntries] = useState<HotelEntry[]>([]);
  const [transportEntries, setTransportEntries] = useState<TransportEntry[]>([]);
  const [mannequinEntries, setMannequinEntries] = useState<MannequinEntry[]>([]);
  const [shipmentEntries, setShipmentEntries] = useState<ShipmentEntry[]>([]);
  const [pastVenues, setPastVenues] = useState<VenueOption[]>([]);
  // 備品の流れの候補算出に使う：催事の開催期間を全部保持
  const [allEvents, setAllEvents] = useState<Array<{ venue: string; store_name: string | null; start_date: string; end_date: string }>>([]);
  const [venueMasters, setVenueMasters] = useState<VenueMaster[]>([]);
  // 直近12ヶ月の使用頻度マップ（label -> 回数）
  const [venueUsageMap, setVenueUsageMap] = useState<Map<string, number>>(new Map());
  const [hotelMasters, setHotelMasters] = useState<HotelMaster[]>([]);
  const [hotelVenueLinks, setHotelVenueLinks] = useState<HotelVenueLink[]>([]);
  const [agencyMasters, setAgencyMasters] = useState<AgencyMaster[]>([]);
  const [agencyAreaLinks, setAgencyAreaLinks] = useState<AgencyAreaLink[]>([]);
  const [areaMasters, setAreaMasters] = useState<AreaMaster[]>([]);
  const [mannequinPeople, setMannequinPeople] = useState<MannequinPerson[]>([]);
  const [mannequinHistory, setMannequinHistory] = useState<MannequinHistoryRow[]>([]);
  const [venueMannequinLinks, setVenueMannequinLinks] = useState<VenueMannequinLink[]>([]);

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
    // 入金設定（"venue" = 百貨店デフォルト, "direct" = 直取引強制, "payer:<uuid>" = 特定帳合先）
    payer_source: "venue" as string,
  });

  const fetchData = useCallback(async () => {
    // 直近12ヶ月の催事から使用頻度を集計
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);
    const [empRes, evtRes, vmRes, hmRes, hvlRes, amRes, aalRes, arRes, mpRes, mhRes, vmlRes] = await Promise.all([
      supabase.from("employees").select("id, name").order("sort_order").order("name"),
      supabase.from("events").select("venue, store_name, start_date, end_date").gte("start_date", oneYearAgoStr).order("start_date", { ascending: false }),
      supabase.from("venue_master").select("id, venue_name, store_name, prefecture, area_id, reading, is_active, closing_day, pay_month_offset, pay_day, default_payer_id, direct_receive_rate, chouai_receive_rate").eq("is_active", true),
      supabase.from("hotel_master").select("id, name, area_id").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("hotel_id, venue_name"),
      supabase.from("mannequin_agencies").select("id, name").order("name"),
      supabase.from("agency_area_links").select("agency_id, area_id"),
      supabase.from("area_master").select("id, name"),
      supabase.from("mannequin_people").select("id, name, agency_id, daily_rate, rating, treat_as_employee").order("name"),
      supabase.from("mannequins").select("staff_name, events:event_id(venue, store_name)"),
      supabase.from("venue_mannequin_links").select("venue_id, mannequin_person_id, mannequin_agency_id"),
    ]);
    setEmployees(empRes.data || []);
    // 過去の催事会場を重複排除してリスト化＋使用頻度もカウント
    const seen = new Set<string>();
    const venues: VenueOption[] = [];
    const usage = new Map<string, number>();
    const eventRows: Array<{ venue: string; store_name: string | null; start_date: string; end_date: string }> = [];
    (evtRes.data || []).forEach((e: { venue: string; store_name: string | null; start_date: string; end_date: string }) => {
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (!seen.has(label)) { seen.add(label); venues.push({ label }); }
      usage.set(label, (usage.get(label) || 0) + 1);
      eventRows.push(e);
    });
    setPastVenues(venues);
    setVenueUsageMap(usage);
    setAllEvents(eventRows);
    setVenueMasters((vmRes.data || []) as VenueMaster[]);
    setHotelMasters((hmRes.data || []) as HotelMaster[]);
    setHotelVenueLinks((hvlRes.data || []) as HotelVenueLink[]);
    setAgencyMasters((amRes.data || []) as AgencyMaster[]);
    setAgencyAreaLinks((aalRes.data || []) as AgencyAreaLink[]);
    setAreaMasters((arRes.data || []) as AreaMaster[]);
    setMannequinPeople((mpRes.data || []) as MannequinPerson[]);
    setMannequinHistory(((mhRes.data || []) as unknown) as MannequinHistoryRow[]);
    setVenueMannequinLinks((vmlRes.data || []) as VenueMannequinLink[]);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 複製: ?from=<id> が指定されたら元の催事データで初期化
  useEffect(() => {
    if (!duplicateFromId) return;
    let cancelled = false;
    (async () => {
      const [evtRes, hotelsRes, transportsRes, mannsRes, shipsRes] = await Promise.all([
        supabase.from("events").select("*").eq("id", duplicateFromId).single(),
        supabase.from("hotels").select("*").eq("event_id", duplicateFromId),
        supabase.from("transportations").select("*").eq("event_id", duplicateFromId),
        supabase.from("mannequins").select("*").eq("event_id", duplicateFromId),
        supabase.from("shipments").select("*").eq("event_id", duplicateFromId),
      ]);
      if (cancelled) return;
      const src = evtRes.data;
      if (!src) return;
      const srcLabel = src.store_name ? `${src.venue} ${src.store_name}` : src.venue;
      setDuplicatedFrom(srcLabel);
      setForm({
        name: src.name || "",
        venue: src.venue || "",
        store_name: src.store_name || "",
        prefecture: src.prefecture || "",
        start_date: "",
        end_date: "",
        closing_time: src.closing_time || "",
        person_in_charge: "",
        status: "準備中",
        application_status: "未提出",
        dm_status: src.dm_status && src.dm_status !== "印刷済み" ? src.dm_status : (src.dm_status === "印刷済み" ? "未着手" : ""),
        notes: src.notes || "",
        equipment_from: src.equipment_from || "",
        equipment_to: src.equipment_to || "",
      });
      setHotelEntries(((hotelsRes.data || []) as { hotel_name: string | null; notes: string | null; room_count: number | null }[]).map((h) => ({
        hotel_name: h.hotel_name || "",
        check_in_date: "",
        check_out_date: "",
        room_count: h.room_count ? String(h.room_count) : "1",
        reservation_status: "未予約",
        notes: h.notes || "",
      })));
      setTransportEntries(((transportsRes.data || []) as { transport_type: string | null; departure_from: string | null; arrival_to: string | null }[]).map((t) => ({
        transport_type: t.transport_type || "新幹線",
        departure_from: t.departure_from || "",
        arrival_to: t.arrival_to || "",
        outbound_datetime: "",
        reservation_status: "未予約",
      })));
      setMannequinEntries(((mannsRes.data || []) as { agency_name: string | null; staff_name: string | null; daily_rate: number | null }[]).map((m) => ({
        agency_name: m.agency_name || "",
        staff_name: m.staff_name || "",
        work_start_date: "",
        work_end_date: "",
        daily_rate: m.daily_rate ? String(m.daily_rate) : "",
        arrangement_status: "未手配",
      })));
      setShipmentEntries(((shipsRes.data || []) as { recipient_name: string; item_name: string }[]).map((s) => ({
        recipient_name: s.recipient_name,
        direction: s.item_name === "返送備品" ? "return" : "send",
      })));
    })();
    return () => { cancelled = true; };
  }, [duplicateFromId, supabase]);

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
  const addStaffEntry = (personType: StaffPersonType, personId: string) => {
    if (!staffEntries.some((e) => e.person_type === personType && e.person_id === personId)) {
      setStaffEntries((prev) => [...prev, {
        person_type: personType,
        person_id: personId,
        start_date: form.start_date,
        end_date: form.end_date,
        role: "",
      }]);
    }
  };
  const removeStaffEntry = (index: number) => setStaffEntries((prev) => prev.filter((_, i) => i !== index));
  const updateStaffEntry = (index: number, field: "start_date" | "end_date" | "role", value: string) => {
    setStaffEntries((prev) => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };
  const duplicateStaffEntry = (personType: StaffPersonType, personId: string) => {
    setStaffEntries((prev) => [...prev, { person_type: personType, person_id: personId, start_date: form.start_date, end_date: form.end_date, role: "" }]);
  };

  // 担当者の名前解決
  const getStaffName = (e: StaffEntry): string => {
    if (e.person_type === "employee") return employees.find((emp) => emp.id === e.person_id)?.name || "";
    return mannequinPeople.find((p) => p.id === e.person_id)?.name || "";
  };

  // 担当者×マネキン手配の重複チェック（同じ人を二重登録すると現場が混乱するので警告）
  const conflictNames = useMemo(() => {
    const staffNames = new Set(staffEntries.map(getStaffName).filter(Boolean));
    const conflicts = new Set<string>();
    mannequinEntries.forEach((m) => {
      const name = m.staff_name.trim();
      if (name && staffNames.has(name)) conflicts.add(name);
    });
    return conflicts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffEntries, mannequinEntries, employees, mannequinPeople]);

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
  //   地方（region）→エリア(area_id)順→50音 でソートし、地方ごとにグループ表示
  const venueItems: ComboboxItem[] = useMemo(() => {
    const regionOrder = ["北海道", "東北", "関東", "北陸", "中部", "関西", "中国", "四国", "九州", "沖縄"];
    const areaIdOrder = new Map(areaMasters.map((a, i) => [a.id, i] as const));
    const getRegion = (v: VenueMaster): string => {
      // area_master は id/name のみ取得中。prefecture → region で判定
      return getAreaForPrefecture(v.prefecture || "") || "その他";
    };
    const labelOf = (v: VenueMaster) =>
      v.store_name ? `${v.venue_name} ${v.store_name}` : v.venue_name;
    const sorted = [...venueMasters].sort((a, b) => {
      // 地方順
      const ra = getRegion(a);
      const rb = getRegion(b);
      const ri = regionOrder.indexOf(ra);
      const rj = regionOrder.indexOf(rb);
      const riSafe = ri < 0 ? 999 : ri;
      const rjSafe = rj < 0 ? 999 : rj;
      if (riSafe !== rjSafe) return riSafe - rjSafe;
      // 使用頻度順（直近12ヶ月の回数が多い会場を上位に）
      const ua = venueUsageMap.get(labelOf(a)) || 0;
      const ub = venueUsageMap.get(labelOf(b)) || 0;
      if (ua !== ub) return ub - ua;
      // エリア順（area_master の sort_order）
      const ai = a.area_id ? (areaIdOrder.get(a.area_id) ?? 9999) : 9999;
      const bi = b.area_id ? (areaIdOrder.get(b.area_id) ?? 9999) : 9999;
      if (ai !== bi) return ai - bi;
      // 50音順
      const read_a = a.reading || a.venue_name;
      const read_b = b.reading || b.venue_name;
      return read_a.localeCompare(read_b, "ja");
    });
    return sorted.map((v) => {
      const label = labelOf(v);
      const count = venueUsageMap.get(label) || 0;
      const parts = [v.prefecture, count > 0 ? `1年${count}回` : null].filter(Boolean);
      return {
        value: `${v.id}`,
        label,
        reading: v.reading ?? "",
        sublabel: parts.join(" · "),
        group: getRegion(v),
      } as ComboboxItem;
    });
  }, [venueMasters, areaMasters, venueUsageMap]);

  // 百貨店選択時のハンドラ（Combobox value=id形式。id→マスター情報で自動入力）
  const handleVenueSelect = (id: string) => {
    if (!id) {
      setForm((f) => ({ ...f, venue: "", store_name: "", prefecture: "" }));
      return;
    }
    const v = venueMasters.find((x) => x.id === id);
    if (!v) {
      // カスタム値（マスターに無い文字列）: venue に入れ、store_name はクリア
      setForm((f) => ({ ...f, venue: id, store_name: "" }));
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

  // 現在の百貨店に紐づくマネキン会社/個人 (マスター設定)
  const currentVenueMasterId = useMemo(() => {
    const m = venueMasters.find((v) => v.venue_name === form.venue && (v.store_name ?? "") === form.store_name);
    return m?.id ?? null;
  }, [venueMasters, form.venue, form.store_name]);
  const venueLinkedAgencyIds = useMemo(() => {
    if (!currentVenueMasterId) return new Set<string>();
    return new Set(
      venueMannequinLinks
        .filter((l) => l.venue_id === currentVenueMasterId && l.mannequin_agency_id)
        .map((l) => l.mannequin_agency_id!)
    );
  }, [venueMannequinLinks, currentVenueMasterId]);
  const venueLinkedPersonIds = useMemo(() => {
    if (!currentVenueMasterId) return new Set<string>();
    return new Set(
      venueMannequinLinks
        .filter((l) => l.venue_id === currentVenueMasterId && l.mannequin_person_id)
        .map((l) => l.mannequin_person_id!)
    );
  }, [venueMannequinLinks, currentVenueMasterId]);

  // --- マネキン会社Combobox項目 ---
  const agencyItems: ComboboxItem[] = useMemo(() => {
    const areaId = currentVenueAreaId;
    const areaLinkedAgencyIds = new Set(
      areaId ? agencyAreaLinks.filter((l) => l.area_id === areaId).map((l) => l.agency_id) : []
    );
    return agencyMasters.map((a) => ({
      value: a.name,
      label: a.name,
      reading: a.name,
      group: venueLinkedAgencyIds.has(a.id)
        ? "この百貨店の常連"
        : areaLinkedAgencyIds.has(a.id)
          ? "このエリア対応"
          : "その他",
    })) as ComboboxItem[];
  }, [agencyMasters, agencyAreaLinks, currentVenueAreaId, venueLinkedAgencyIds]);

  // --- マネキンスタッフCombobox項目 ---
  // 派遣会社名が選ばれている場合はその会社の所属スタッフのみに絞り込む。
  // 未選択または自由入力（マスタに無い会社名）のときは全員を出す。
  // カテゴリ: この百貨店の実績あり > 催事エリア対応の派遣会社所属 > その他
  const getStaffItems = useCallback((agencyFilter: string): ComboboxItem[] => {
    // この百貨店(venueラベル)に過去入ったことのあるスタッフ名集合
    const pastStaffSet = new Set<string>();
    mannequinHistory.forEach((h) => {
      if (!h.staff_name || !h.events) return;
      const label = h.events.store_name ? `${h.events.venue} ${h.events.store_name}` : h.events.venue;
      if (label === currentVenueLabel) pastStaffSet.add(h.staff_name);
    });

    const areaId = currentVenueAreaId;
    const areaLinkedAgencyIds = new Set(
      areaId ? agencyAreaLinks.filter((l) => l.area_id === areaId).map((l) => l.agency_id) : []
    );

    // 派遣会社名に一致するマスタ会社のID（マッチしなければ null = フィルタしない）
    const filterAgencyId = agencyFilter
      ? agencyMasters.find((a) => a.name === agencyFilter)?.id ?? null
      : null;

    // 社員扱いマネキンも催事によっては「普通のマネキン」として動くことがあるため
    // マネキン手配の候補からは除外しない（同じ催事で担当者と二重にしないのは運用で担保）
    const filtered = filterAgencyId
      ? mannequinPeople.filter((p) => p.agency_id === filterAgencyId)
      : mannequinPeople;

    return filtered.map((p) => {
      const agency = agencyMasters.find((a) => a.id === p.agency_id);
      const ratingStr = p.rating ? "★".repeat(p.rating) : "";
      const rateStr = p.daily_rate ? `${p.daily_rate.toLocaleString()}円` : "";
      const sublabel = [agency?.name, ratingStr, rateStr].filter(Boolean).join(" / ");
      const group = pastStaffSet.has(p.name)
        ? "この百貨店の実績あり"
        : venueLinkedPersonIds.has(p.id)
          ? "この百貨店のおすすめ"
          : p.agency_id && venueLinkedAgencyIds.has(p.agency_id)
            ? "この百貨店の常連会社所属"
            : p.agency_id && areaLinkedAgencyIds.has(p.agency_id)
              ? "このエリア対応会社所属"
              : "その他";
      return {
        value: p.name,
        label: p.name,
        reading: p.name,
        sublabel,
        group,
      };
    }) as ComboboxItem[];
  }, [mannequinPeople, mannequinHistory, agencyMasters, agencyAreaLinks, currentVenueLabel, currentVenueAreaId, venueLinkedAgencyIds, venueLinkedPersonIds]);

  // スタッフ名変更時のハンドラ（マスター選択なら会社・日当を自動補完）
  const handleStaffChange = (i: number, v: string) => {
    const person = mannequinPeople.find((p) => p.name === v);
    if (person) {
      const agency = agencyMasters.find((a) => a.id === person.agency_id);
      setMannequinEntries((prev) =>
        prev.map((x, idx) =>
          idx === i
            ? {
                ...x,
                staff_name: v,
                // 既に会社名が入っていなければ自動補完
                agency_name: x.agency_name || agency?.name || "",
                // 既に日当が入っていなければ自動補完
                daily_rate: x.daily_rate || (person.daily_rate ? String(person.daily_rate) : ""),
              }
            : x
        )
      );
    } else {
      updateMannequin(i, "staff_name", v);
    }
  };
  const shipmentDestinations = [
    { label: "本社（安岡蒲鉾）", type: "return" as const },
    ...(currentVenueLabel ? [{ label: currentVenueLabel, type: "send" as const }] : []),
    ...pastVenues
      .filter((v) => v.label !== currentVenueLabel)
      .map((v) => ({ label: v.label, type: "send" as const })),
  ];

  // ----- 備品の流れ候補（3週間窓で絞り込み） -----
  const SHIPMENT_WINDOW_DAYS = 21;

  // 日付文字列 "YYYY-MM-DD" からローカル Date を作る（TZ ズレ防止）
  const parseYmd = (s: string): Date | null => {
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };
  const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
  const fmtMd = (s: string) => {
    const d = parseYmd(s);
    return d ? `${d.getMonth() + 1}/${d.getDate()}` : s;
  };

  // 搬入元候補: 新催事の start_date より前 3週間以内に終わる催事
  const equipmentFromCandidates = useMemo(() => {
    const startDate = parseYmd(form.start_date);
    if (!startDate) return [];
    const list: Array<{ label: string; date: string; days: number }> = [];
    const seen = new Set<string>();
    for (const e of allEvents) {
      const endDate = parseYmd(e.end_date);
      if (!endDate) continue;
      const diff = daysBetween(endDate, startDate); // 正 = 先方が過去
      if (diff < 0 || diff > SHIPMENT_WINDOW_DAYS) continue;
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (label === currentVenueLabel) continue;
      // 同ラベルは「日付が新催事に一番近いもの」を残す
      const key = label;
      const existing = list.find((x) => x.label === key);
      if (!existing) {
        list.push({ label, date: e.end_date, days: diff });
        seen.add(key);
      } else if (diff < existing.days) {
        existing.date = e.end_date;
        existing.days = diff;
      }
    }
    // 近い順（0日前 → 21日前）
    return list.sort((a, b) => a.days - b.days);
  }, [allEvents, form.start_date, currentVenueLabel]);

  // 搬出先候補: 新催事の end_date より後 3週間以内に始まる催事
  const equipmentToCandidates = useMemo(() => {
    const endDate = parseYmd(form.end_date);
    if (!endDate) return [];
    const list: Array<{ label: string; date: string; days: number }> = [];
    for (const e of allEvents) {
      const nextStart = parseYmd(e.start_date);
      if (!nextStart) continue;
      const diff = daysBetween(endDate, nextStart); // 正 = 先方が未来
      if (diff < 0 || diff > SHIPMENT_WINDOW_DAYS) continue;
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (label === currentVenueLabel) continue;
      const existing = list.find((x) => x.label === label);
      if (!existing) {
        list.push({ label, date: e.start_date, days: diff });
      } else if (diff < existing.days) {
        existing.date = e.start_date;
        existing.days = diff;
      }
    }
    return list.sort((a, b) => a.days - b.days);
  }, [allEvents, form.end_date, currentVenueLabel]);

  const addShipmentTo = (dest: { label: string; type: "send" | "return" }) => {
    setShipmentEntries((prev) => [...prev, { recipient_name: dest.label, direction: dest.type }]);
  };
  const removeShipment = (i: number) => setShipmentEntries((prev) => prev.filter((_, idx) => idx !== i));

  // --- 保存 ---
  const handleSave = async () => {
    // 同期ガード: 既に保存処理が走っていたら何もしない（連打による二重 INSERT 防止）
    if (savingRef.current) return;
    if (!form.venue || !form.prefecture || !form.start_date || !form.end_date) return;
    savingRef.current = true;
    setSaving(true);

    try {
      const staffNames = [...new Set(staffEntries.map(getStaffName))].filter(Boolean);
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
        payer_master_id: form.payer_source.startsWith("payer:") ? form.payer_source.slice(6) : null,
        force_direct: form.payer_source === "direct",
      }).select("id").single();

      if (error || !data) {
        console.error("[events insert] error:", error);
        alert(`催事の保存に失敗しました。\n${error?.message ?? "不明なエラー"}`);
        return;
      }

      const eventId = data.id;

      // 並列INSERT
      const inserts: PromiseLike<unknown>[] = [];

      if (staffEntries.length > 0) {
        inserts.push(supabase.from("event_staff").insert(
          staffEntries.map((e) => ({
            event_id: eventId,
            person_type: e.person_type,
            employee_id: e.person_type === "employee" ? e.person_id : null,
            mannequin_person_id: e.person_type === "mannequin" ? e.person_id : null,
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

      // 入金レコードを自動生成（催事の会場マスター・帳合先・催事単位のオーバーライドを反映）
      // 失敗してもメイン処理は続行
      try {
        const venueLabel = form.venue.trim();
        const storeLabel = form.store_name.trim();
        const vm = venueMasters.find((v) =>
          v.venue_name === venueLabel && (v.store_name ?? "") === storeLabel,
        );
        if (vm) {
          const { resolvePaymentSource, computePlannedPaymentDate } = await import("@/lib/payment-cycle");
          const { data: pyData } = await supabase
            .from("payer_master")
            .select("id, name, closing_day, pay_month_offset, pay_day")
            .eq("is_active", true);
          const eventLike = {
            payer_master_id: form.payer_source.startsWith("payer:") ? form.payer_source.slice(6) : null,
            force_direct: form.payer_source === "direct",
          };
          const resolved = resolvePaymentSource(eventLike, vm, (pyData ?? []) as unknown as { id: string; name: string; closing_day: number | null; pay_month_offset: number | null; pay_day: number | null; }[]);
          const plannedDate = (resolved.cycle.closing_day != null && resolved.cycle.pay_month_offset != null && resolved.cycle.pay_day != null)
            ? computePlannedPaymentDate(form.end_date, resolved.cycle)
            : null;
          await supabase.from("event_payments").insert({
            event_id: eventId,
            venue_master_id: resolved.venueMasterId,
            payer_master_id: resolved.payerMasterId,
            planned_date: plannedDate,
            planned_amount: null,
            planned_tax_type: "excluded",
            status: "予定",
            method: "transfer",
            applied_rate: resolved.appliedRate,
          });
        }
      } catch (err) {
        console.error("[event_payments auto-create] error:", err);
      }

      // 通知を作成（adminユーザーへのベル通知用）
      // 失敗してもメイン処理は続行
      try {
        const venueLabel = form.store_name.trim()
          ? `${form.venue.trim()} ${form.store_name.trim()}`
          : form.venue.trim();
        const dateLabel = form.start_date === form.end_date
          ? form.start_date
          : `${form.start_date}〜${form.end_date}`;
        const eventName = form.name.trim();
        const charge = allNames.length > 0 ? `／担当: ${allNames.join("、")}` : "";
        const { data: { user: authUser } } = await supabase.auth.getUser();
        await supabase.from("notifications").insert({
          type: "event_created",
          title: `新規催事: ${venueLabel}${eventName ? `「${eventName}」` : ""}`,
          body: `${dateLabel}${charge}`,
          link_url: `/events/${eventId}`,
          related_event_id: eventId,
          created_by: authUser?.id ?? null,
        });
      } catch (err) {
        console.error("[notifications create] error:", err);
      }

      router.push("/events");
    } finally {
      // 成功時は画面遷移するので setSaving(false) は見た目上不要だが
      // ルーター遷移失敗時や同画面戻りに備えて確実に解放する
      savingRef.current = false;
      setSaving(false);
    }
  };

  const buildPersonInCharge = () => {
    const staffNames = [...new Set(staffEntries.map(getStaffName))].filter(Boolean);
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

  const SaveButton = ({ className = "", size = "lg" }: { className?: string; size?: "lg" | "default" }) => (
    <Button
      onClick={handleSave}
      disabled={!isValid || saving}
      size={size}
      className={`min-w-[160px] font-bold shadow-md text-white bg-red-600 hover:bg-red-700 ${className}`}
    >
      {saving ? <>保存中...</> : <><Save className="h-4 w-4 mr-1" />催事を作成する</>}
    </Button>
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="space-y-1">
          <Link
            href="/events"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            催事一覧に戻る
          </Link>
          <h1 className="text-2xl font-bold">催事 新規作成</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => router.push("/events")}>キャンセル</Button>
          <SaveButton />
        </div>
      </div>

      {duplicatedFrom && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-bold text-amber-800">複製元:</span>{" "}
          <span className="text-amber-900">{duplicatedFrom}</span>
          <p className="text-[11px] text-amber-700 mt-0.5">基本情報・ホテル・交通・マネキン・備品を引き継ぎました。開催期間と担当者は新たに入力してください。予約/手配状態は未予約/未手配にリセットされています。</p>
        </div>
      )}

      {/* ===== 基本情報 ===== */}
      <Card className="border-l-4 border-l-slate-500 bg-slate-50/50">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-bold text-slate-800">基本情報</span>
          </div>

          <div className="space-y-2">
            <Label>百貨店 *</Label>
            <Combobox
              items={venueItems}
              value={currentVenueId}
              onChange={handleVenueSelect}
              placeholder="百貨店を選択（ふりがな検索可）"
              searchPlaceholder="例: いせたん、けいおう..."
              allowCustom
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
            <div className="space-y-2">
              <Label>開催期間 *</Label>
              <DateRangePicker
                startDate={form.start_date}
                endDate={form.end_date}
                onChange={(start, end) => setForm((prev) => ({ ...prev, start_date: start, end_date: end }))}
              />
            </div>
            <div className="space-y-2">
              <Label>最終日 閉場時間</Label>
              <Select value={form.closing_time} onValueChange={(v) => setForm({ ...form, closing_time: v ?? "" })}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>
                  {closingTimes.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 担当者 */}
          <div className="space-y-2">
            <Label>担当者</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              ここで選んだ社員は「社員配置」にも会期全日で自動登録されます（日別のシフトは下の「社員配置」で調整）。一覧・カードに「担当: ○○」と表示する短い見出しとしても使われます。
            </p>
            <Input value={buildPersonInCharge()} readOnly placeholder="下の名前をタップして追加" className="bg-white" />
            <div className="flex flex-wrap gap-2">
              {employees.map((emp) => {
                const hasEntry = staffEntries.some((e) => e.person_type === "employee" && e.person_id === emp.id);
                return (
                  <Badge key={emp.id} variant={hasEntry ? "default" : "outline"} className="cursor-pointer" onClick={() => addStaffEntry("employee", emp.id)}>
                    {emp.name}
                  </Badge>
                );
              })}
              {/* 社員扱いマネキン（区別しやすいよう別スタイル） */}
              {mannequinPeople.filter((p) => p.treat_as_employee).map((p) => {
                const hasEntry = staffEntries.some((e) => e.person_type === "mannequin" && e.person_id === p.id);
                return (
                  <Badge
                    key={`m:${p.id}`}
                    variant={hasEntry ? "default" : "outline"}
                    className={`cursor-pointer ${hasEntry ? "bg-pink-600 hover:bg-pink-700" : "border-pink-400 text-pink-700 hover:bg-pink-50"}`}
                    onClick={() => addStaffEntry("mannequin", p.id)}
                    title="社員扱いマネキン"
                  >
                    {p.name}
                  </Badge>
                );
              })}
            </div>

            {staffEntries.length > 0 && (
              <div className="space-y-2 rounded-md border bg-white p-3">
                <p className="text-xs text-muted-foreground font-medium">担当期間を設定（同じ人を複数期間で追加可能）</p>
                {staffEntries.map((entry, i) => {
                  const name = getStaffName(entry);
                  const isMannequin = entry.person_type === "mannequin";
                  const isConflict = name && conflictNames.has(name);
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="default" className={`shrink-0 ${isMannequin ? "bg-pink-600" : ""}`}>
                          {isMannequin ? `🧑‍💼 ${name}` : name}
                        </Badge>
                        <Input type="date" value={entry.start_date} onChange={(e) => updateStaffEntry(i, "start_date", e.target.value)} className="w-36 h-8 text-xs" />
                        <span className="text-xs">〜</span>
                        <Input type="date" value={entry.end_date} onChange={(e) => updateStaffEntry(i, "end_date", e.target.value)} className="w-36 h-8 text-xs" />
                        <Input value={entry.role} onChange={(e) => updateStaffEntry(i, "role", e.target.value)} placeholder="メモ" className="w-20 h-8 text-xs" />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateStaffEntry(entry.person_type, entry.person_id)} title="期間を追加">
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStaffEntry(i)}>
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                      {isConflict && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          ⚠️ {name} さんは下のマネキン手配にも登録されています。社員扱いとマネキン扱いのどちらかに統一してください。
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Input value={form.person_in_charge} onChange={(e) => setForm({ ...form, person_in_charge: e.target.value })} placeholder="その他（社員マスターにない人がいれば入力）" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <Label>備考</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="特記事項があれば" />
            </div>
          </div>
          {/* 入金設定（経理閲覧権限者のみ） */}
          <PayerSourceSection
            venueName={form.venue}
            storeName={form.store_name}
            payerSource={form.payer_source}
            onChange={(v) => setForm({ ...form, payer_source: v })}
          />
        </CardContent>
      </Card>

      {/* ===== 出店申込書 ===== */}
      <Card className="border-l-4 border-l-green-500 bg-green-50/50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-green-600" />
            <span className="text-sm font-bold text-green-800">出店申込書</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">提出状態</Label>
              <Select value={form.application_status} onValueChange={(v) => v && setForm({ ...form, application_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="未提出">未提出</SelectItem>
                  <SelectItem value="提出済">提出済</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">DMハガキ</Label>
              <Select value={form.dm_status} onValueChange={(v) => setForm({ ...form, dm_status: v ?? "" })}>
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
        </CardContent>
      </Card>

      {/* ===== ホテル手配 ===== */}
      <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
        <CardHeader className="flex-row items-center justify-between space-y-0 pt-4 pb-2 px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-blue-800">
            <Hotel className="h-4 w-4 text-blue-600" />ホテル手配
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addHotel} className="bg-white"><Plus className="h-3 w-3 mr-1" />追加</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {hotelEntries.length === 0 && <p className="text-sm text-muted-foreground">未登録（後から催事詳細ページで追加も可能です）</p>}
          {hotelEntries.map((h, i) => (
            <div key={i} className="space-y-2 rounded-md border bg-white p-3 relative">
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
                  <Select value={h.reservation_status} onValueChange={(v) => updateHotel(i, "reservation_status", v ?? "")}>
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
      <Card className="border-l-4 border-l-orange-500 bg-orange-50/50">
        <CardHeader className="flex-row items-center justify-between space-y-0 pt-4 pb-2 px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-orange-800">
            <Train className="h-4 w-4 text-orange-600" />交通手配
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addTransport} className="bg-white"><Plus className="h-3 w-3 mr-1" />追加</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {transportEntries.length === 0 && <p className="text-sm text-muted-foreground">未登録（後から催事詳細ページで追加も可能です）</p>}
          {transportEntries.map((t, i) => (
            <div key={i} className="space-y-2 rounded-md border bg-white p-3 relative">
              <Button variant="ghost" size="icon" className="h-6 w-6 absolute top-2 right-2" onClick={() => removeTransport(i)}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">種別</Label>
                  <Select value={t.transport_type} onValueChange={(v) => updateTransport(i, "transport_type", v ?? "")}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {transportTypes.map((tp) => (<SelectItem key={tp} value={tp}>{tp}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">予約状態</Label>
                  <Select value={t.reservation_status} onValueChange={(v) => updateTransport(i, "reservation_status", v ?? "")}>
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
      <Card className="border-l-4 border-l-pink-500 bg-pink-50/50">
        <CardHeader className="flex-row items-center justify-between space-y-0 pt-4 pb-2 px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-pink-800">
            <UserCheck className="h-4 w-4 text-pink-600" />マネキン手配
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addMannequin} className="bg-white"><Plus className="h-3 w-3 mr-1" />追加</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {mannequinEntries.length === 0 && <p className="text-sm text-muted-foreground">未登録（後から催事詳細ページで追加も可能です）</p>}
          {mannequinEntries.map((m, i) => {
            const isConflict = m.staff_name.trim() && conflictNames.has(m.staff_name.trim());
            return (
            <div key={i} className={`space-y-2 rounded-md border bg-white p-3 relative ${isConflict ? "border-amber-400 ring-1 ring-amber-200" : ""}`}>
              <Button variant="ghost" size="icon" className="h-6 w-6 absolute top-2 right-2" onClick={() => removeMannequin(i)}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
              {isConflict && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⚠️ {m.staff_name} さんは上の担当者にも登録されています。社員扱いとマネキン扱いのどちらかに統一してください。
                </p>
              )}
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
                  <Combobox
                    items={getStaffItems(m.agency_name)}
                    value={m.staff_name}
                    onChange={(v) => handleStaffChange(i, v)}
                    placeholder={m.agency_name ? `${m.agency_name} の所属者から選択` : "スタッフを選択"}
                    searchPlaceholder="スタッフ名で検索..."
                    allowCustom
                    inputClassName="h-8 text-xs"
                    className="h-8 text-xs"
                  />
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
                  <Select value={m.arrangement_status} onValueChange={(v) => updateMannequin(i, "arrangement_status", v ?? "")}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未手配">未手配</SelectItem>
                      <SelectItem value="手配済">手配済</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ===== 備品の流れ ===== */}
      <Card className="border-l-4 border-l-amber-500 bg-amber-50/50">
        <CardHeader className="pt-4 pb-2 px-6">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <Package className="h-4 w-4 text-amber-600" />備品の流れ
            <span className="text-[10px] font-normal text-amber-700/70">（3週間以内の催事のみ）</span>
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
              {!form.start_date ? (
                <span className="text-[11px] text-muted-foreground self-center">開催開始日を入力すると近い催事候補が表示されます</span>
              ) : equipmentFromCandidates.length === 0 ? (
                <span className="text-[11px] text-muted-foreground self-center">3週間以内に終わる催事はありません</span>
              ) : (
                equipmentFromCandidates.map((v) => (
                  <Badge
                    key={v.label}
                    variant={form.equipment_from === v.label ? "default" : "outline"}
                    className={`cursor-pointer text-xs ${form.equipment_from !== v.label ? "bg-white" : ""}`}
                    onClick={() => setForm({ ...form, equipment_from: form.equipment_from === v.label ? "" : v.label })}
                    title={`${v.label} は ${v.date} 終了（${v.days}日前）`}
                  >
                    {v.label}
                    <span className="ml-1 text-[10px] opacity-70">
                      {fmtMd(v.date)}終了{v.days === 0 ? "（当日）" : `（${v.days}日前）`}
                    </span>
                  </Badge>
                ))
              )}
              {/* 入力済みで候補外の値は「その他」として出す */}
              {form.equipment_from &&
                form.equipment_from !== "本社（安岡蒲鉾）" &&
                !equipmentFromCandidates.some((c) => c.label === form.equipment_from) && (
                <Badge
                  variant="default"
                  className="cursor-pointer text-xs"
                  onClick={() => setForm({ ...form, equipment_from: "" })}
                  title="解除するにはクリック"
                >
                  {form.equipment_from}
                  <span className="ml-1 text-[10px] opacity-70">（その他）</span>
                </Badge>
              )}
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
              {!form.end_date ? (
                <span className="text-[11px] text-muted-foreground self-center">開催終了日を入力すると近い催事候補が表示されます</span>
              ) : equipmentToCandidates.length === 0 ? (
                <span className="text-[11px] text-muted-foreground self-center">3週間以内に始まる催事はありません</span>
              ) : (
                equipmentToCandidates.map((v) => (
                  <Badge
                    key={v.label}
                    variant={form.equipment_to === v.label ? "default" : "outline"}
                    className={`cursor-pointer text-xs ${form.equipment_to !== v.label ? "bg-white" : ""}`}
                    onClick={() => setForm({ ...form, equipment_to: form.equipment_to === v.label ? "" : v.label })}
                    title={`${v.label} は ${v.date} 開始（${v.days}日後）`}
                  >
                    {v.label}
                    <span className="ml-1 text-[10px] opacity-70">
                      {fmtMd(v.date)}開始{v.days === 0 ? "（当日）" : `（${v.days}日後）`}
                    </span>
                  </Badge>
                ))
              )}
              {form.equipment_to &&
                form.equipment_to !== "本社（安岡蒲鉾）" &&
                !equipmentToCandidates.some((c) => c.label === form.equipment_to) && (
                <Badge
                  variant="default"
                  className="cursor-pointer text-xs"
                  onClick={() => setForm({ ...form, equipment_to: "" })}
                  title="解除するにはクリック"
                >
                  {form.equipment_to}
                  <span className="ml-1 text-[10px] opacity-70">（その他）</span>
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== ページ最下部の保存ボタン ===== */}
      <div className="flex justify-center pt-4 pb-8 border-t gap-3">
        <Button variant="outline" onClick={() => router.push("/events")}>キャンセル</Button>
        <SaveButton className="min-w-[240px] text-base" />
      </div>
    </div>
  );
}
