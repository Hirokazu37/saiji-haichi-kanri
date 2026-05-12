"use client";

import { useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { FileText, Hotel, Train, Mail, UserCheck, Package, Trash2, User, Building2, UserPlus, Search } from "lucide-react";

export type ArrangementEditorHandle = {
  save: () => Promise<void>;
  isDirty: () => boolean;
};

type StaffRow = {
  id: string;
  person_type: "employee" | "mannequin" | null;
  employee_id: string | null;
  mannequin_person_id: string | null;
  start_date: string;
  end_date: string;
  role: string | null;
  hotel_name: string | null;
  hotel_status: string | null;
  transport_outbound_status: string | null;
  transport_return_status: string | null;
  employees: { name: string } | null;
  mannequin_people: { name: string } | null;
};

type ShipmentRow = {
  id: string;
  item_name: string;
  recipient_name: string;
};

type MannequinRow = {
  id: string;
  agency_name: string | null;
  staff_name: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  daily_rate: number | null;
  arrangement_status: string | null;
  mannequin_person_id: string | null;
  mannequin_agency_id: string | null;
  headcount: number;
};

type MannequinPersonMaster = { id: string; name: string; agency_id: string | null; daily_rate: number | null };
type MannequinAgencyMaster = { id: string; name: string };
type VenueMannequinLink = { venue_id: string; mannequin_person_id: string | null; mannequin_agency_id: string | null };
type AgencyAreaLink = { agency_id: string; area_id: string };

type EventRow = { venue: string; store_name: string | null; start_date: string; end_date: string };

export const ArrangementEditor = forwardRef<ArrangementEditorHandle, { eventId: string; venue: string; storeName: string | null; startDate: string; endDate: string }>(
function ArrangementEditor({ eventId, venue, storeName, startDate, endDate }, ref) {
  const supabase = createClient();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [mannequins, setMannequins] = useState<MannequinRow[]>([]);
  const [allEvents, setAllEvents] = useState<EventRow[]>([]);
  const [selectedDests, setSelectedDests] = useState<Map<string, "send" | "return">>(new Map());
  const [equipmentFrom, setEquipmentFrom] = useState<string | null>(null);
  const [equipmentTo, setEquipmentTo] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<string>("未提出");
  const [appSubmittedDate, setAppSubmittedDate] = useState<string>("");
  const [appMethod, setAppMethod] = useState<string>("");
  const [dmStatus, setDmStatus] = useState<string | null>(null);
  const [dmCount, setDmCount] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [hotelMasters, setHotelMasters] = useState<{ id: string; name: string; area_id: string | null }[]>([]);
  const [hotelVenueLinks, setHotelVenueLinks] = useState<{ hotel_id: string; venue_name: string }[]>([]);
  const [venueAreaId, setVenueAreaId] = useState<string | null>(null);
  const [venueMasterId, setVenueMasterId] = useState<string | null>(null);
  const [mannequinPeople, setMannequinPeople] = useState<MannequinPersonMaster[]>([]);
  const [mannequinAgencies, setMannequinAgencies] = useState<MannequinAgencyMaster[]>([]);
  const [venueMannequinLinks, setVenueMannequinLinks] = useState<VenueMannequinLink[]>([]);
  const [agencyAreaLinks, setAgencyAreaLinks] = useState<AgencyAreaLink[]>([]);
  // マネキン追加・個人化ダイアログ用
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [agencyPickerOpen, setAgencyPickerOpen] = useState(false);
  const [individualizeRowId, setIndividualizeRowId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [agencyHeadcount, setAgencyHeadcount] = useState<string>("2");
  const [showOtherAreas, setShowOtherAreas] = useState(false);

  const fetchData = useCallback(async () => {
    const [staffRes, shipRes, evtRes, venueRes, hmRes, hvlRes, mannRes, vmRes, mpRes, maRes, vmlRes, aalRes] = await Promise.all([
      supabase.from("event_staff").select("id, person_type, employee_id, mannequin_person_id, start_date, end_date, role, hotel_name, hotel_status, transport_outbound_status, transport_return_status, employees(name), mannequin_people(name)").eq("event_id", eventId).order("start_date"),
      supabase.from("shipments").select("id, item_name, recipient_name").eq("event_id", eventId),
      supabase.from("events").select("application_status, application_submitted_date, application_method, dm_status, dm_count, equipment_from, equipment_to").eq("id", eventId).single(),
      supabase.from("events").select("venue, store_name, start_date, end_date").order("start_date").limit(200),
      supabase.from("hotel_master").select("id, name, area_id").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("hotel_id, venue_name"),
      supabase.from("mannequins").select("id, agency_name, staff_name, work_start_date, work_end_date, daily_rate, arrangement_status, mannequin_person_id, mannequin_agency_id, headcount").eq("event_id", eventId).order("work_start_date"),
      supabase.from("venue_master").select("id, venue_name, store_name, area_id").eq("venue_name", venue),
      supabase.from("mannequin_people").select("id, name, agency_id, daily_rate"),
      supabase.from("mannequin_agencies").select("id, name").order("name"),
      supabase.from("venue_mannequin_links").select("venue_id, mannequin_person_id, mannequin_agency_id"),
      supabase.from("agency_area_links").select("agency_id, area_id"),
    ]);
    setStaff((staffRes.data || []) as unknown as StaffRow[]);
    setShipments((shipRes.data || []) as ShipmentRow[]);
    setMannequins((mannRes.data || []) as MannequinRow[]);
    setAppStatus(evtRes.data?.application_status || "未提出");
    setAppSubmittedDate(evtRes.data?.application_submitted_date || "");
    setAppMethod(evtRes.data?.application_method || "");
    setDmStatus(evtRes.data?.dm_status || null);
    setDmCount(evtRes.data?.dm_count ? String(evtRes.data.dm_count) : "");
    setEquipmentFrom(evtRes.data?.equipment_from || null);
    setEquipmentTo(evtRes.data?.equipment_to || null);

    const existing = new Map<string, "send" | "return">();
    (shipRes.data || []).forEach((s: ShipmentRow) => {
      existing.set(s.recipient_name, s.item_name === "返送備品" ? "return" : "send");
    });
    setSelectedDests(existing);

    setAllEvents((venueRes.data || []) as EventRow[]);
    setHotelMasters((hmRes.data || []) as { id: string; name: string; area_id: string | null }[]);
    setHotelVenueLinks((hvlRes.data || []) as { hotel_id: string; venue_name: string }[]);
    // 当該百貨店(venue + store_name)のエリアと venue_master.id を確定
    const vmRows = (vmRes.data || []) as { id: string; venue_name: string; store_name: string | null; area_id: string | null }[];
    const matched = vmRows.find((r) => (r.store_name ?? "") === (storeName ?? ""));
    setVenueAreaId(matched?.area_id ?? null);
    setVenueMasterId(matched?.id ?? null);
    setMannequinPeople((mpRes.data || []) as MannequinPersonMaster[]);
    setMannequinAgencies((maRes.data || []) as MannequinAgencyMaster[]);
    setVenueMannequinLinks((vmlRes.data || []) as VenueMannequinLink[]);
    setAgencyAreaLinks((aalRes.data || []) as AgencyAreaLink[]);
  }, [supabase, eventId, venue, storeName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ブラウザタブを閉じる・リロード時の警告
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const markDirty = () => { setDirty(true); };

  // --- 備品の流れ: 3週間以内の催事のみを候補にする ---
  const SHIPMENT_WINDOW_DAYS = 21;
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
  const currentLabel = storeName ? `${venue} ${storeName}` : venue;

  // 過去会場のフラットな重複排除リスト（備品発送先選択用に残す）
  const pastVenues = useMemo(() => {
    const seen = new Set<string>();
    const arr: string[] = [];
    for (const e of allEvents) {
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (!seen.has(label)) { seen.add(label); arr.push(label); }
    }
    return arr;
  }, [allEvents]);

  // 搬入元候補: この催事の開始日より前、3週間以内に終わる催事
  const equipmentFromCandidates = useMemo(() => {
    const base = parseYmd(startDate);
    if (!base) return [];
    const list: Array<{ label: string; date: string; days: number }> = [];
    for (const e of allEvents) {
      const endD = parseYmd(e.end_date);
      if (!endD) continue;
      const diff = daysBetween(endD, base);
      if (diff < 0 || diff > SHIPMENT_WINDOW_DAYS) continue;
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (label === currentLabel) continue;
      const existing = list.find((x) => x.label === label);
      if (!existing) list.push({ label, date: e.end_date, days: diff });
      else if (diff < existing.days) { existing.date = e.end_date; existing.days = diff; }
    }
    return list.sort((a, b) => a.days - b.days);
  }, [allEvents, startDate, currentLabel]);

  // 搬出先候補: この催事の終了日より後、3週間以内に始まる催事
  const equipmentToCandidates = useMemo(() => {
    const base = parseYmd(endDate);
    if (!base) return [];
    const list: Array<{ label: string; date: string; days: number }> = [];
    for (const e of allEvents) {
      const startD = parseYmd(e.start_date);
      if (!startD) continue;
      const diff = daysBetween(base, startD);
      if (diff < 0 || diff > SHIPMENT_WINDOW_DAYS) continue;
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (label === currentLabel) continue;
      const existing = list.find((x) => x.label === label);
      if (!existing) list.push({ label, date: e.start_date, days: diff });
      else if (diff < existing.days) { existing.date = e.start_date; existing.days = diff; }
    }
    return list.sort((a, b) => a.days - b.days);
  }, [allEvents, endDate, currentLabel]);

  const hotelCandidates = useMemo(() => {
    const venueLabel = storeName ? `${venue} ${storeName}` : venue;
    const linkedIds = new Set(hotelVenueLinks.filter((l) => l.venue_name === venueLabel).map((l) => l.hotel_id));
    // 1. 該当百貨店に直接紐づくホテル
    // 2. 百貨店と同じエリアに属するホテル
    // どちらかに該当するホテルだけを候補に。両方該当なしなら空リスト(マスタ全件を出さない)
    return hotelMasters.filter((h) => {
      if (linkedIds.has(h.id)) return true;
      if (venueAreaId && h.area_id === venueAreaId) return true;
      return false;
    });
  }, [venue, storeName, hotelMasters, hotelVenueLinks, venueAreaId]);

  // 個人/会社を「この百貨店」「このエリア対応」「その他」にグルーピング
  // ピッカーダイアログで、エリアと関係ない候補が混ざって分かりづらくならないように。
  const groupedPersons = useMemo(() => {
    const venuePersonIds = new Set(
      venueMasterId
        ? venueMannequinLinks.filter((l) => l.venue_id === venueMasterId && l.mannequin_person_id).map((l) => l.mannequin_person_id!)
        : []
    );
    const venueAgencyIds = new Set(
      venueMasterId
        ? venueMannequinLinks.filter((l) => l.venue_id === venueMasterId && l.mannequin_agency_id).map((l) => l.mannequin_agency_id!)
        : []
    );
    const areaAgencyIds = new Set(
      venueAreaId
        ? agencyAreaLinks.filter((l) => l.area_id === venueAreaId).map((l) => l.agency_id)
        : []
    );
    const venueGroup: MannequinPersonMaster[] = [];
    const areaGroup: MannequinPersonMaster[] = [];
    const others: MannequinPersonMaster[] = [];
    for (const p of mannequinPeople) {
      if (venuePersonIds.has(p.id) || (p.agency_id && venueAgencyIds.has(p.agency_id))) {
        venueGroup.push(p);
      } else if (p.agency_id && areaAgencyIds.has(p.agency_id)) {
        areaGroup.push(p);
      } else {
        others.push(p);
      }
    }
    return { venueGroup, areaGroup, others };
  }, [mannequinPeople, venueMannequinLinks, agencyAreaLinks, venueMasterId, venueAreaId]);

  const groupedAgencies = useMemo(() => {
    const venueAgencyIds = new Set(
      venueMasterId
        ? venueMannequinLinks.filter((l) => l.venue_id === venueMasterId && l.mannequin_agency_id).map((l) => l.mannequin_agency_id!)
        : []
    );
    const areaAgencyIds = new Set(
      venueAreaId
        ? agencyAreaLinks.filter((l) => l.area_id === venueAreaId).map((l) => l.agency_id)
        : []
    );
    const venueGroup: MannequinAgencyMaster[] = [];
    const areaGroup: MannequinAgencyMaster[] = [];
    const others: MannequinAgencyMaster[] = [];
    for (const a of mannequinAgencies) {
      if (venueAgencyIds.has(a.id)) venueGroup.push(a);
      else if (areaAgencyIds.has(a.id)) areaGroup.push(a);
      else others.push(a);
    }
    return { venueGroup, areaGroup, others };
  }, [mannequinAgencies, venueMannequinLinks, agencyAreaLinks, venueMasterId, venueAreaId]);

  // この百貨店に紐付けられたマネキン候補（既に手配リストに居る人/会社は除外）
  const recommendedMannequins = useMemo(() => {
    if (!venueMasterId) return { persons: [] as MannequinPersonMaster[], agencies: [] as MannequinAgencyMaster[] };
    const personIds = new Set(
      venueMannequinLinks
        .filter((l) => l.venue_id === venueMasterId && l.mannequin_person_id)
        .map((l) => l.mannequin_person_id!)
    );
    const agencyIds = new Set(
      venueMannequinLinks
        .filter((l) => l.venue_id === venueMasterId && l.mannequin_agency_id)
        .map((l) => l.mannequin_agency_id!)
    );
    // 既に追加済みのマスター個人/会社を除外（FK ベースで判定）
    const existingPersonIds = new Set(mannequins.map((m) => m.mannequin_person_id).filter(Boolean) as string[]);
    const existingAgencyIds = new Set(mannequins.map((m) => m.mannequin_agency_id).filter(Boolean) as string[]);
    // 自由入力で氏名がマスターと一致するケースもダブり扱い
    const existingNames = new Set(
      mannequins.map((m) => (m.staff_name || "").trim()).filter(Boolean)
    );
    return {
      persons: mannequinPeople.filter(
        (p) => personIds.has(p.id) && !existingPersonIds.has(p.id) && !existingNames.has(p.name)
      ),
      agencies: mannequinAgencies.filter((a) => agencyIds.has(a.id) && !existingAgencyIds.has(a.id)),
    };
  }, [venueMasterId, venueMannequinLinks, mannequinPeople, mannequinAgencies, mannequins]);

  const updateStaffField = (i: number, field: string, value: string | null) => {
    const next = [...staff]; next[i] = { ...next[i], [field]: value }; setStaff(next);
    markDirty();
  };

  // 同じ人の event_staff 行が複数登録されているケース（担当者トグル + 社員配置の重複登録など）
  // ホテル/交通は「一人につき1部屋・1座席」なので人単位で集約して表示する。
  // 集約時はホテル名・状況など情報量の多い行を採用する。
  const dedupedStaff = useMemo(() => {
    const seen = new Map<string, StaffRow>();
    const score = (r: StaffRow) =>
      (r.hotel_name ? 8 : 0) +
      (r.hotel_status && r.hotel_status !== "未手配" ? 4 : 0) +
      (r.transport_outbound_status && r.transport_outbound_status !== "未手配" ? 2 : 0) +
      (r.transport_return_status && r.transport_return_status !== "未手配" ? 1 : 0);
    for (const s of staff) {
      const key = s.person_type === "mannequin"
        ? `m:${s.mannequin_person_id ?? ""}`
        : `e:${s.employee_id ?? ""}`;
      if (!key.endsWith(":")) {
        const existing = seen.get(key);
        if (!existing || score(s) > score(existing)) seen.set(key, s);
      } else {
        // person_id が無い行（不正データ）は id をキーにして単独表示
        seen.set(`x:${s.id}`, s);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [staff]);

  const updateMannequinField = (i: number, field: string, value: string | number | null) => {
    const next = [...mannequins]; next[i] = { ...next[i], [field]: value }; setMannequins(next);
    markDirty();
  };

  // 4種類の追加方法
  const addPersonRow = async (person: MannequinPersonMaster) => {
    const agency = mannequinAgencies.find((a) => a.id === person.agency_id);
    const { data } = await supabase.from("mannequins").insert({
      event_id: eventId,
      mannequin_person_id: person.id,
      mannequin_agency_id: person.agency_id,
      agency_name: agency?.name ?? null,
      staff_name: person.name,
      headcount: 1,
      work_start_date: startDate,
      work_end_date: endDate,
      daily_rate: person.daily_rate,
      arrangement_status: "未手配",
    }).select("*").single();
    if (data) setMannequins((prev) => [...prev, data as MannequinRow]);
  };

  const addAgencyRow = async (agency: MannequinAgencyMaster, count: number) => {
    const { data } = await supabase.from("mannequins").insert({
      event_id: eventId,
      mannequin_person_id: null,
      mannequin_agency_id: agency.id,
      agency_name: agency.name,
      staff_name: null,
      headcount: Math.max(1, count),
      work_start_date: startDate,
      work_end_date: endDate,
      arrangement_status: "未手配",
    }).select("*").single();
    if (data) setMannequins((prev) => [...prev, data as MannequinRow]);
  };

  const addFreeformRow = async () => {
    const { data } = await supabase.from("mannequins").insert({
      event_id: eventId,
      mannequin_person_id: null,
      mannequin_agency_id: null,
      agency_name: null,
      staff_name: null,
      headcount: 1,
      work_start_date: startDate,
      work_end_date: endDate,
      arrangement_status: "未手配",
    }).select("*").single();
    if (data) setMannequins((prev) => [...prev, data as MannequinRow]);
  };

  // 枠行(会社+人数) を個人化: 1人を選んで個人行に変換
  // - 枠の headcount=1 のときは その行を個人行に変換（行は1つのまま）
  // - 枠の headcount>1 のときは その行の headcount を 1 減らし、別途 個人行を追加
  const individualizeRow = async (rowId: string, person: MannequinPersonMaster) => {
    const row = mannequins.find((m) => m.id === rowId);
    if (!row) return;
    const personAgency = mannequinAgencies.find((a) => a.id === person.agency_id);
    if ((row.headcount || 1) <= 1) {
      // 行をそのまま個人化
      const { data } = await supabase.from("mannequins").update({
        mannequin_person_id: person.id,
        mannequin_agency_id: person.agency_id ?? row.mannequin_agency_id,
        agency_name: personAgency?.name ?? row.agency_name,
        staff_name: person.name,
        headcount: 1,
        daily_rate: person.daily_rate ?? row.daily_rate,
      }).eq("id", rowId).select("*").single();
      if (data) setMannequins((prev) => prev.map((m) => m.id === rowId ? (data as MannequinRow) : m));
    } else {
      // 枠を1減らして、新規個人行を追加
      const newCount = (row.headcount || 1) - 1;
      const updateRes = await supabase.from("mannequins").update({ headcount: newCount }).eq("id", rowId).select("*").single();
      const insertRes = await supabase.from("mannequins").insert({
        event_id: eventId,
        mannequin_person_id: person.id,
        mannequin_agency_id: person.agency_id ?? row.mannequin_agency_id,
        agency_name: personAgency?.name ?? row.agency_name,
        staff_name: person.name,
        headcount: 1,
        work_start_date: row.work_start_date,
        work_end_date: row.work_end_date,
        daily_rate: person.daily_rate ?? null,
        arrangement_status: row.arrangement_status,
      }).select("*").single();
      setMannequins((prev) => {
        let next = prev;
        if (updateRes.data) next = next.map((m) => m.id === rowId ? (updateRes.data as MannequinRow) : m);
        if (insertRes.data) next = [...next, insertRes.data as MannequinRow];
        return next;
      });
    }
  };

  const toggleDest = (label: string, type: "send" | "return") => {
    setSelectedDests((prev) => {
      const next = new Map(prev);
      if (next.has(label)) { next.delete(label); } else { next.set(label, type); }
      return next;
    });
    markDirty();
  };

  const handleSave = async () => {
    await supabase.from("events").update({ application_status: appStatus, application_submitted_date: appSubmittedDate || null, application_method: appMethod || null, dm_status: dmStatus, dm_count: dmCount ? parseInt(dmCount) : null, equipment_from: equipmentFrom, equipment_to: equipmentTo }).eq("id", eventId);

    for (const s of staff) {
      await supabase.from("event_staff").update({
        hotel_name: s.hotel_name || null,
        hotel_status: s.hotel_status || "未手配",
        transport_outbound_status: s.transport_outbound_status || "未手配",
        transport_return_status: s.transport_return_status || "未手配",
      }).eq("id", s.id);
    }

    for (const m of mannequins) {
      await supabase.from("mannequins").update({
        agency_name: m.agency_name || null,
        staff_name: m.staff_name || null,
        work_start_date: m.work_start_date || null,
        work_end_date: m.work_end_date || null,
        arrangement_status: m.arrangement_status || "未手配",
        mannequin_person_id: m.mannequin_person_id,
        mannequin_agency_id: m.mannequin_agency_id,
        headcount: m.headcount || 1,
      }).eq("id", m.id);
    }

    await supabase.from("shipments").delete().eq("event_id", eventId);
    if (selectedDests.size > 0) {
      await supabase.from("shipments").insert(
        Array.from(selectedDests.entries()).map(([name, type]) => ({
          event_id: eventId,
          item_name: type === "return" ? "返送備品" : "備品一式",
          recipient_name: name, recipient_address: "",
          ship_date: new Date().toISOString().slice(0, 10), shipment_status: "未発送",
        }))
      );
    }

    setDirty(false);
    fetchData();
  };

  useImperativeHandle(ref, () => ({
    save: handleSave,
    isDirty: () => dirty,
  }));

  const venueLabel = storeName ? `${venue} ${storeName}` : venue;
  const destinations = [
    { label: "本社（安岡蒲鉾）", type: "return" as const },
    { label: venueLabel, type: "send" as const },
    ...pastVenues.filter((v) => v !== venueLabel).map((v) => ({ label: v, type: "send" as const })),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 出店申込書 */}
      <Card className="border-l-4 border-l-green-500 bg-green-50/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-600" />
              <span className="text-sm font-bold text-green-800">出店申込書</span>
            </div>
            <button
              type="button"
              className={`relative inline-flex h-6 w-24 items-center rounded-full transition-colors ${appStatus === "提出済" ? "bg-green-700" : "bg-gray-300"}`}
              onClick={() => {
                const next = appStatus === "提出済" ? "未提出" : "提出済";
                setAppStatus(next);
                if (next === "提出済" && !appSubmittedDate) setAppSubmittedDate(new Date().toISOString().slice(0, 10));
                if (next === "未提出") setAppSubmittedDate("");
                markDirty();
              }}
            >
              <span className={`absolute text-[10px] font-medium ${appStatus === "提出済" ? "left-2 text-white" : "right-2 text-gray-600"}`}>
                {appStatus === "提出済" ? "提出済" : "未提出"}
              </span>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${appStatus === "提出済" ? "translate-x-[72px]" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">提出日</span>
              <Input type="date" value={appSubmittedDate} onChange={(e) => { setAppSubmittedDate(e.target.value); markDirty(); }} className="h-8 text-sm w-36 bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">提出方法</span>
              {["郵送", "FAX", "メール"].map((m) => (
                <button key={m} type="button"
                  className={`px-2 py-1 text-xs rounded border transition-colors ${appMethod === m ? "bg-green-700 text-white border-green-700 font-bold" : "bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700"}`}
                  onClick={() => { setAppMethod(appMethod === m ? "" : m); markDirty(); }}
                >{m}</button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ホテル */}
      <Card className="border-l-4 border-l-blue-500 bg-blue-50/50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Hotel className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-bold text-blue-800">ホテル</span>
          </div>
          {dedupedStaff.length > 0 ? (
            <div className="space-y-2">
              {dedupedStaff.map((s) => {
                const i = staff.findIndex((x) => x.id === s.id);
                return (
                <div key={s.id} className="bg-white rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{(s.person_type === "mannequin" ? s.mannequin_people?.name : s.employees?.name) || "不明"}</span>
                      {s.person_type === "mannequin" && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-pink-100 text-pink-800 font-medium">マネキン</span>
                      )}
                      <span className="text-xs text-muted-foreground">{s.start_date}〜{s.end_date} {s.role || ""}</span>
                    </div>
                    <div className="inline-flex rounded-md border bg-white shadow-sm shrink-0 overflow-hidden">
                      {(["未手配", "手配済", "不要"] as const).map((opt) => {
                        const active = (s.hotel_status || "未手配") === opt;
                        const activeBg = opt === "手配済" ? "bg-green-700 text-white" : opt === "不要" ? "bg-slate-600 text-white" : "bg-gray-200 text-gray-800";
                        return (
                          <button
                            key={opt}
                            type="button"
                            className={`px-2 h-6 text-[10px] font-medium transition-colors ${active ? activeBg : "text-gray-500 hover:bg-gray-50"}`}
                            onClick={() => updateStaffField(i, "hotel_status", opt)}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Input value={s.hotel_name || ""} onChange={(e) => updateStaffField(i, "hotel_name", e.target.value)} placeholder="ホテル名を入力（空欄のまま手配済にもできます）" className={`h-8 text-sm ${s.hotel_status === "不要" ? "opacity-50" : ""}`} disabled={s.hotel_status === "不要"} />
                    {hotelCandidates.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {hotelCandidates.map((h) => (
                          <Badge key={h.id} variant={s.hotel_name === h.name ? "default" : "outline"}
                            className="cursor-pointer text-[10px] hover:bg-primary/10"
                            onClick={() => { updateStaffField(i, "hotel_name", h.name); }}
                          >{h.name}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
              {dedupedStaff.length < staff.length && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  ⚠️ 同じ人の社員配置が複数登録されています（{staff.length - dedupedStaff.length}件分）。ここでは1人につき1行にまとめて表示しています。重複データを整理する場合は「社員配置」タブから不要な行を削除してください。
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">社員が配置されていません。「社員配置」タブで追加してください。</p>
          )}
        </CardContent>
      </Card>

      {/* 交通 */}
      <Card className="border-l-4 border-l-orange-500 bg-orange-50/50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Train className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-bold text-orange-800">交通</span>
          </div>
          {dedupedStaff.length > 0 ? (
            <div className="space-y-2">
              {dedupedStaff.map((s) => {
                const i = staff.findIndex((x) => x.id === s.id);
                return (
                <div key={s.id} className="bg-white rounded border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold">{(s.person_type === "mannequin" ? s.mannequin_people?.name : s.employees?.name) || "不明"}</span>
                    {s.person_type === "mannequin" && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-pink-100 text-pink-800 font-medium">マネキン</span>
                    )}
                    <span className="text-xs text-muted-foreground">{s.start_date}〜{s.end_date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">行き</span>
                    <button
                      type="button"
                      className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors ${s.transport_outbound_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                      onClick={() => updateStaffField(i, "transport_outbound_status", s.transport_outbound_status === "手配済" ? "未手配" : "手配済")}
                    >
                      <span className={`absolute text-[9px] font-medium ${s.transport_outbound_status === "手配済" ? "left-1.5 text-white" : "right-1.5 text-gray-600"}`}>
                        {s.transport_outbound_status === "手配済" ? "手配済" : "未手配"}
                      </span>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${s.transport_outbound_status === "手配済" ? "translate-x-[60px]" : "translate-x-0.5"}`} />
                    </button>
                    <span className="text-xs text-muted-foreground">帰り</span>
                    <button
                      type="button"
                      className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors ${s.transport_return_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                      onClick={() => updateStaffField(i, "transport_return_status", s.transport_return_status === "手配済" ? "未手配" : "手配済")}
                    >
                      <span className={`absolute text-[9px] font-medium ${s.transport_return_status === "手配済" ? "left-1.5 text-white" : "right-1.5 text-gray-600"}`}>
                        {s.transport_return_status === "手配済" ? "手配済" : "未手配"}
                      </span>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${s.transport_return_status === "手配済" ? "translate-x-[60px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">社員が配置されていません。「社員配置」タブで追加してください。</p>
          )}
        </CardContent>
      </Card>

      {/* DMハガキ */}
      <Card className="border-l-4 border-l-purple-500 bg-purple-50/50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-bold text-purple-800">DMハガキ</span>
            </div>
            <div className="flex gap-1">
              {["なし", "未着手", "校正中", "印刷済み"].map((s) => {
                const current = dmStatus || "なし";
                return (
                  <Badge key={s} variant={current === s ? "default" : "outline"} className={`cursor-pointer text-xs ${current !== s ? "bg-white" : ""}`}
                    onClick={() => { setDmStatus(s === "なし" ? null : s); markDirty(); }}>{s}</Badge>
                );
              })}
            </div>
          </div>
          {dmStatus && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">枚数</span>
              <Input type="number" value={dmCount} onChange={(e) => { setDmCount(e.target.value); markDirty(); }} placeholder="枚数を入力" className="h-8 text-sm w-32 bg-white" min="0" />
              <span className="text-xs text-muted-foreground">枚</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* マネキン */}
      <Card className="border-l-4 border-l-pink-500 bg-pink-50/50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-pink-600" />
              <span className="text-sm font-bold text-pink-800">マネキン</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setPickerSearch(""); setShowOtherAreas(false); setPersonPickerOpen(true); }}>
                <User className="h-3 w-3 mr-1" />個人を追加
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setPickerSearch(""); setShowOtherAreas(false); setAgencyHeadcount("2"); setAgencyPickerOpen(true); }}>
                <Building2 className="h-3 w-3 mr-1" />会社+人数
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addFreeformRow}>
                ＋ 自由入力
              </Button>
            </div>
          </div>
          {(recommendedMannequins.persons.length > 0 || recommendedMannequins.agencies.length > 0) && (
            <div className="space-y-1.5 pb-2 border-b border-pink-200">
              <div className="text-[11px] text-pink-700 font-medium">
                この百貨店のおすすめ（クリックで追加）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recommendedMannequins.persons.map((p) => {
                  const agency = mannequinAgencies.find((a) => a.id === p.agency_id);
                  return (
                    <Badge
                      key={`rec-p-${p.id}`}
                      variant="outline"
                      className="cursor-pointer text-xs border-pink-400 text-pink-700 bg-white hover:bg-pink-100"
                      onClick={() => addPersonRow(p)}
                      title={agency?.name ? `${agency.name} 所属` : ""}
                    >
                      ＋ {p.name}{agency?.name ? `（${agency.name}）` : ""}
                    </Badge>
                  );
                })}
                {recommendedMannequins.agencies.map((a) => (
                  <Badge
                    key={`rec-a-${a.id}`}
                    variant="outline"
                    className="cursor-pointer text-xs border-pink-300 text-pink-700 bg-white hover:bg-pink-100"
                    onClick={() => addAgencyRow(a, 2)}
                  >
                    ＋ {a.name}（会社）
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {mannequins.length > 0 ? (
            <div className="space-y-2">
              {mannequins.map((m, i) => {
                const isPersonRow = !!m.mannequin_person_id;
                const isAgencyOnlyRow = !!m.mannequin_agency_id && !m.mannequin_person_id;
                const linkedPerson = isPersonRow ? mannequinPeople.find((p) => p.id === m.mannequin_person_id) : null;
                const linkedAgency = m.mannequin_agency_id ? mannequinAgencies.find((a) => a.id === m.mannequin_agency_id) : null;
                return (
                <div key={m.id} className="bg-white rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isPersonRow ? (
                        <>
                          <User className="h-3.5 w-3.5 text-pink-600 shrink-0" />
                          <span className="text-sm font-bold">{linkedPerson?.name || m.staff_name || "（削除されたマネキン）"}</span>
                          {(linkedAgency?.name || m.agency_name) && (
                            <span className="text-xs text-muted-foreground">/ {linkedAgency?.name || m.agency_name}</span>
                          )}
                          <span className="text-[10px] px-1 py-0.5 rounded bg-pink-100 text-pink-800">マスター</span>
                        </>
                      ) : isAgencyOnlyRow ? (
                        <>
                          <Building2 className="h-3.5 w-3.5 text-pink-600 shrink-0" />
                          <span className="text-sm font-bold">{linkedAgency?.name || m.agency_name || "（削除された会社）"}</span>
                          <span className="text-xs text-muted-foreground">×</span>
                          <Input type="number" value={String(m.headcount || 1)} onChange={(e) => updateMannequinField(i, "headcount", parseInt(e.target.value) || 1)} className="h-7 text-xs w-14" min={1} />
                          <span className="text-xs text-muted-foreground">名</span>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-pink-100 text-pink-800">枠</span>
                          <Button variant="outline" size="sm" className="h-6 text-[10px] ml-1" onClick={() => { setPickerSearch(""); setIndividualizeRowId(m.id); }}>
                            <UserPlus className="h-3 w-3 mr-0.5" />個人化
                          </Button>
                        </>
                      ) : (
                        <>
                          <Input value={m.agency_name || ""} onChange={(e) => updateMannequinField(i, "agency_name", e.target.value)} placeholder="派遣会社名" className="h-8 text-sm w-36" />
                          <Input value={m.staff_name || ""} onChange={(e) => updateMannequinField(i, "staff_name", e.target.value)} placeholder="氏名（空欄=枠）" className="h-8 text-sm w-32" />
                          <span className="text-xs text-muted-foreground">×</span>
                          <Input type="number" value={String(m.headcount || 1)} onChange={(e) => updateMannequinField(i, "headcount", parseInt(e.target.value) || 1)} className="h-8 text-sm w-14" min={1} />
                          <span className="text-xs text-muted-foreground">名</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors ${m.arrangement_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                        onClick={() => updateMannequinField(i, "arrangement_status", m.arrangement_status === "手配済" ? "未手配" : "手配済")}
                      >
                        <span className={`absolute text-[9px] font-medium ${m.arrangement_status === "手配済" ? "left-1.5 text-white" : "right-1.5 text-gray-600"}`}>
                          {m.arrangement_status === "手配済" ? "手配済" : "未手配"}
                        </span>
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${m.arrangement_status === "手配済" ? "translate-x-[60px]" : "translate-x-0.5"}`} />
                      </button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={async () => {
                          await supabase.from("mannequins").delete().eq("id", m.id);
                          setMannequins((prev) => prev.filter((x) => x.id !== m.id));
                        }}
                      ><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">勤務期間</span>
                    <Input type="date" value={m.work_start_date || ""} onChange={(e) => updateMannequinField(i, "work_start_date", e.target.value)} className="h-7 text-xs w-32" />
                    <span className="text-xs text-muted-foreground">〜</span>
                    <Input type="date" value={m.work_end_date || ""} onChange={(e) => updateMannequinField(i, "work_end_date", e.target.value)} className="h-7 text-xs w-32" />
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">マネキン手配がありません。上のボタンから追加してください。</p>
          )}
        </CardContent>
      </Card>

      {/* 個人を追加 ダイアログ */}
      <Dialog open={personPickerOpen} onOpenChange={setPersonPickerOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>マスターから個人を追加</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="氏名・会社名で検索" className="pl-8 h-9" autoFocus />
            </div>
            {(() => {
              const filterFn = (p: MannequinPersonMaster) => {
                if (!pickerSearch.trim()) return true;
                const ag = mannequinAgencies.find((a) => a.id === p.agency_id);
                const hay = `${p.name} ${ag?.name || ""}`.toLowerCase();
                return hay.includes(pickerSearch.trim().toLowerCase());
              };
              const renderPerson = (p: MannequinPersonMaster) => {
                const ag = mannequinAgencies.find((a) => a.id === p.agency_id);
                const alreadyAdded = mannequins.some((m) => m.mannequin_person_id === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={alreadyAdded}
                    onClick={async () => { await addPersonRow(p); setPersonPickerOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded border text-sm flex items-center justify-between ${alreadyAdded ? "bg-gray-50 text-muted-foreground" : "hover:bg-pink-50 hover:border-pink-300"}`}
                  >
                    <span>
                      <span className="font-medium">{p.name}</span>
                      {ag && <span className="text-xs text-muted-foreground ml-2">/ {ag.name}</span>}
                      {p.daily_rate && <span className="text-xs text-muted-foreground ml-2">¥{p.daily_rate.toLocaleString()}/日</span>}
                    </span>
                    {alreadyAdded && <span className="text-[10px] text-muted-foreground">追加済み</span>}
                  </button>
                );
              };
              const venueFiltered = groupedPersons.venueGroup.filter(filterFn);
              const areaFiltered = groupedPersons.areaGroup.filter(filterFn);
              const otherFiltered = groupedPersons.others.filter(filterFn);
              const isSearching = !!pickerSearch.trim();
              const showOthers = isSearching || showOtherAreas;
              return (
                <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                  {venueFiltered.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-pink-700 px-1">この百貨店の常連 ({venueFiltered.length})</div>
                      {venueFiltered.map(renderPerson)}
                    </div>
                  )}
                  {areaFiltered.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-blue-700 px-1">同じエリア対応 ({areaFiltered.length})</div>
                      {areaFiltered.map(renderPerson)}
                    </div>
                  )}
                  {showOthers && otherFiltered.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-muted-foreground px-1">その他のエリア ({otherFiltered.length})</div>
                      {otherFiltered.map(renderPerson)}
                    </div>
                  )}
                  {!showOthers && otherFiltered.length > 0 && (
                    <button
                      type="button"
                      className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 border-t"
                      onClick={() => setShowOtherAreas(true)}
                    >
                      他のエリアも表示（{otherFiltered.length}件） ▼
                    </button>
                  )}
                  {venueFiltered.length === 0 && areaFiltered.length === 0 && (showOthers ? otherFiltered.length === 0 : false) && (
                    <p className="text-sm text-muted-foreground py-4 text-center">該当するマネキンが見つかりません</p>
                  )}
                  {mannequinPeople.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">マネキンマスターが空です</p>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">閉じる</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 会社+人数 ダイアログ */}
      <Dialog open={agencyPickerOpen} onOpenChange={setAgencyPickerOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>会社+人数枠を追加</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">人数:</span>
              <Input type="number" value={agencyHeadcount} onChange={(e) => setAgencyHeadcount(e.target.value)} className="h-9 w-20" min={1} />
              <span className="text-sm">名</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="会社名で検索" className="pl-8 h-9" />
            </div>
            {(() => {
              const filterFn = (a: MannequinAgencyMaster) =>
                !pickerSearch.trim() || a.name.toLowerCase().includes(pickerSearch.trim().toLowerCase());
              const renderAgency = (a: MannequinAgencyMaster) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={async () => {
                    await addAgencyRow(a, parseInt(agencyHeadcount) || 1);
                    setAgencyPickerOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded border text-sm hover:bg-pink-50 hover:border-pink-300"
                >
                  <span className="font-medium">{a.name}</span>
                </button>
              );
              const venueFiltered = groupedAgencies.venueGroup.filter(filterFn);
              const areaFiltered = groupedAgencies.areaGroup.filter(filterFn);
              const otherFiltered = groupedAgencies.others.filter(filterFn);
              const isSearching = !!pickerSearch.trim();
              const showOthers = isSearching || showOtherAreas;
              return (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  {venueFiltered.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-pink-700 px-1">この百貨店の常連 ({venueFiltered.length})</div>
                      {venueFiltered.map(renderAgency)}
                    </div>
                  )}
                  {areaFiltered.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-blue-700 px-1">同じエリア対応 ({areaFiltered.length})</div>
                      {areaFiltered.map(renderAgency)}
                    </div>
                  )}
                  {showOthers && otherFiltered.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-muted-foreground px-1">その他のエリア ({otherFiltered.length})</div>
                      {otherFiltered.map(renderAgency)}
                    </div>
                  )}
                  {!showOthers && otherFiltered.length > 0 && (
                    <button
                      type="button"
                      className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 border-t"
                      onClick={() => setShowOtherAreas(true)}
                    >
                      他のエリアも表示（{otherFiltered.length}件） ▼
                    </button>
                  )}
                  {venueFiltered.length === 0 && areaFiltered.length === 0 && (showOthers ? otherFiltered.length === 0 : false) && (
                    <p className="text-sm text-muted-foreground py-4 text-center">該当する派遣会社が見つかりません</p>
                  )}
                  {mannequinAgencies.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">マネキン派遣会社マスターが空です</p>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">閉じる</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 個人化 ダイアログ（枠行→個人行） */}
      <Dialog open={!!individualizeRowId} onOpenChange={(open) => { if (!open) setIndividualizeRowId(null); }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>枠を個人化</DialogTitle></DialogHeader>
          {(() => {
            const row = mannequins.find((m) => m.id === individualizeRowId);
            const targetAgencyId = row?.mannequin_agency_id;
            const candidates = mannequinPeople.filter((p) => !targetAgencyId || p.agency_id === targetAgencyId);
            return (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {row?.headcount && row.headcount > 1
                    ? `この枠 (${row.agency_name || ""} × ${row.headcount}名) から1人を個人化します。残り ${row.headcount - 1}名の枠は維持されます。`
                    : `この枠 (${row?.agency_name || ""}) を個人行に変換します。`}
                </p>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="氏名で検索" className="pl-8 h-9" autoFocus />
                </div>
                <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                  {candidates
                    .filter((p) => !pickerSearch.trim() || p.name.toLowerCase().includes(pickerSearch.trim().toLowerCase()))
                    .map((p) => {
                      const ag = mannequinAgencies.find((a) => a.id === p.agency_id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={async () => {
                            if (individualizeRowId) await individualizeRow(individualizeRowId, p);
                            setIndividualizeRowId(null);
                          }}
                          className="w-full text-left px-3 py-2 rounded border text-sm hover:bg-pink-50 hover:border-pink-300"
                        >
                          <span className="font-medium">{p.name}</span>
                          {ag && <span className="text-xs text-muted-foreground ml-2">/ {ag.name}</span>}
                        </button>
                      );
                    })}
                  {candidates.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {targetAgencyId ? "この会社所属のマネキンがマスターに登録されていません" : "マネキンマスターが空です"}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <DialogClose><Button variant="outline">キャンセル</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 備品の流れ */}
      <Card className="border-l-4 border-l-amber-500 bg-amber-50/50">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-800">備品の流れ</span>
            <span className="text-[10px] text-amber-700/70">（3週間以内の催事のみ）</span>
          </div>

          {/* 搬入元 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-amber-700 font-medium">搬入元</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-sm font-medium">{venueLabel}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline"
                className={`cursor-pointer text-xs transition-colors ${equipmentFrom === "本社（安岡蒲鉾）" ? "bg-black border-black text-white font-bold" : "border-gray-300 text-gray-500 bg-white hover:bg-gray-100 hover:text-black hover:border-gray-500"}`}
                onClick={() => { setEquipmentFrom(equipmentFrom === "本社（安岡蒲鉾）" ? null : "本社（安岡蒲鉾）"); markDirty(); }}
              >本社（安岡蒲鉾）</Badge>
              {equipmentFromCandidates.length === 0 ? (
                <span className="text-[11px] text-muted-foreground self-center">3週間以内に終わる催事はありません</span>
              ) : (
                equipmentFromCandidates.map((v) => {
                  const sel = equipmentFrom === v.label;
                  return (
                    <Badge key={v.label} variant="outline"
                      className={`cursor-pointer text-xs transition-colors ${sel ? "bg-amber-500 border-amber-500 text-white font-bold" : "border-amber-400 text-foreground bg-white hover:bg-amber-50 hover:border-amber-500"}`}
                      onClick={() => { setEquipmentFrom(sel ? null : v.label); markDirty(); }}
                      title={`${v.label} は ${v.date} 終了（${v.days}日前）`}
                    >
                      {v.label}
                      <span className="ml-1 text-[10px] opacity-70">{fmtMd(v.date)}終了{v.days === 0 ? "（当日）" : `（${v.days}日前）`}</span>
                    </Badge>
                  );
                })
              )}
              {/* 3週間窓の外の既存値を「その他」として表示（上書き誤操作防止） */}
              {equipmentFrom &&
                equipmentFrom !== "本社（安岡蒲鉾）" &&
                !equipmentFromCandidates.some((c) => c.label === equipmentFrom) && (
                <Badge variant="outline"
                  className="cursor-pointer text-xs bg-amber-500 border-amber-500 text-white font-bold"
                  onClick={() => { setEquipmentFrom(null); markDirty(); }}
                  title="解除するにはクリック"
                >
                  {equipmentFrom}<span className="ml-1 text-[10px] opacity-70">（その他）</span>
                </Badge>
              )}
            </div>
          </div>

          {/* 搬出先 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-sm font-medium">{venueLabel}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-amber-700 font-medium">搬出先</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline"
                className={`cursor-pointer text-xs transition-colors ${equipmentTo === "本社（安岡蒲鉾）" ? "bg-black border-black text-white font-bold" : "border-gray-300 text-gray-500 bg-white hover:bg-gray-100 hover:text-black hover:border-gray-500"}`}
                onClick={() => { setEquipmentTo(equipmentTo === "本社（安岡蒲鉾）" ? null : "本社（安岡蒲鉾）"); markDirty(); }}
              >本社（安岡蒲鉾）</Badge>
              {equipmentToCandidates.length === 0 ? (
                <span className="text-[11px] text-muted-foreground self-center">3週間以内に始まる催事はありません</span>
              ) : (
                equipmentToCandidates.map((v) => {
                  const sel = equipmentTo === v.label;
                  return (
                    <Badge key={v.label} variant="outline"
                      className={`cursor-pointer text-xs transition-colors ${sel ? "bg-amber-500 border-amber-500 text-white font-bold" : "border-amber-400 text-foreground bg-white hover:bg-amber-50 hover:border-amber-500"}`}
                      onClick={() => { setEquipmentTo(sel ? null : v.label); markDirty(); }}
                      title={`${v.label} は ${v.date} 開始（${v.days}日後）`}
                    >
                      {v.label}
                      <span className="ml-1 text-[10px] opacity-70">{fmtMd(v.date)}開始{v.days === 0 ? "（当日）" : `（${v.days}日後）`}</span>
                    </Badge>
                  );
                })
              )}
              {equipmentTo &&
                equipmentTo !== "本社（安岡蒲鉾）" &&
                !equipmentToCandidates.some((c) => c.label === equipmentTo) && (
                <Badge variant="outline"
                  className="cursor-pointer text-xs bg-amber-500 border-amber-500 text-white font-bold"
                  onClick={() => { setEquipmentTo(null); markDirty(); }}
                  title="解除するにはクリック"
                >
                  {equipmentTo}<span className="ml-1 text-[10px] opacity-70">（その他）</span>
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
});
