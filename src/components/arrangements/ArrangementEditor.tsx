"use client";

import { useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Hotel, Train, Mail, UserCheck, Package, Trash2 } from "lucide-react";

export type ArrangementEditorHandle = {
  save: () => Promise<void>;
  isDirty: () => boolean;
};

type StaffRow = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  role: string | null;
  hotel_name: string | null;
  hotel_status: string | null;
  transport_outbound_status: string | null;
  transport_return_status: string | null;
  employees: { name: string } | null;
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
};

type VenueOption = string;

export const ArrangementEditor = forwardRef<ArrangementEditorHandle, { eventId: string; venue: string; storeName: string | null; startDate: string; endDate: string }>(
function ArrangementEditor({ eventId, venue, storeName, startDate, endDate }, ref) {
  const supabase = createClient();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [mannequins, setMannequins] = useState<MannequinRow[]>([]);
  const [pastVenues, setPastVenues] = useState<VenueOption[]>([]);
  const [selectedDests, setSelectedDests] = useState<Map<string, "send" | "return">>(new Map());
  const [equipmentFrom, setEquipmentFrom] = useState<string | null>(null);
  const [equipmentTo, setEquipmentTo] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<string>("未提出");
  const [appSubmittedDate, setAppSubmittedDate] = useState<string>("");
  const [appMethod, setAppMethod] = useState<string>("");
  const [dmStatus, setDmStatus] = useState<string | null>(null);
  const [dmCount, setDmCount] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [hotelMasters, setHotelMasters] = useState<{ id: string; name: string }[]>([]);
  const [hotelVenueLinks, setHotelVenueLinks] = useState<{ hotel_id: string; venue_name: string }[]>([]);

  const fetchData = useCallback(async () => {
    const [staffRes, shipRes, evtRes, venueRes, hmRes, hvlRes, mannRes] = await Promise.all([
      supabase.from("event_staff").select("id, employee_id, start_date, end_date, role, hotel_name, hotel_status, transport_outbound_status, transport_return_status, employees(name)").eq("event_id", eventId).order("start_date"),
      supabase.from("shipments").select("id, item_name, recipient_name").eq("event_id", eventId),
      supabase.from("events").select("application_status, application_submitted_date, application_method, dm_status, dm_count, equipment_from, equipment_to").eq("id", eventId).single(),
      supabase.from("events").select("venue, store_name, start_date").order("start_date").limit(100),
      supabase.from("hotel_master").select("id, name").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("hotel_id, venue_name"),
      supabase.from("mannequins").select("id, agency_name, staff_name, work_start_date, work_end_date, daily_rate, arrangement_status").eq("event_id", eventId).order("work_start_date"),
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

    const seen = new Set<string>();
    const venues: string[] = [];
    (venueRes.data || []).forEach((e: { venue: string; store_name: string | null; start_date: string }) => {
      const label = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
      if (!seen.has(label)) { seen.add(label); venues.push(label); }
    });
    setPastVenues(venues);
    setHotelMasters((hmRes.data || []) as { id: string; name: string }[]);
    setHotelVenueLinks((hvlRes.data || []) as { hotel_id: string; venue_name: string }[]);
  }, [supabase, eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ブラウザタブを閉じる・リロード時の警告
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const markDirty = () => { setDirty(true); };

  const hotelCandidates = useMemo(() => {
    const venueLabel = storeName ? `${venue} ${storeName}` : venue;
    const linkedIds = new Set(hotelVenueLinks.filter((l) => l.venue_name === venueLabel).map((l) => l.hotel_id));
    return linkedIds.size > 0 ? hotelMasters.filter((h) => linkedIds.has(h.id)) : hotelMasters;
  }, [venue, storeName, hotelMasters, hotelVenueLinks]);

  const updateStaffField = (i: number, field: string, value: string | null) => {
    const next = [...staff]; next[i] = { ...next[i], [field]: value }; setStaff(next);
    markDirty();
  };

  const updateMannequinField = (i: number, field: string, value: string | number | null) => {
    const next = [...mannequins]; next[i] = { ...next[i], [field]: value }; setMannequins(next);
    markDirty();
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
          {staff.length > 0 ? (
            <div className="space-y-2">
              {staff.map((s, i) => (
                <div key={s.id} className="bg-white rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{s.employees?.name || "不明"}</span>
                      <span className="text-xs text-muted-foreground">{s.start_date}〜{s.end_date} {s.role || ""}</span>
                    </div>
                    <button
                      type="button"
                      className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors shrink-0 ${s.hotel_status === "手配済" ? "bg-green-700" : "bg-gray-300"}`}
                      onClick={() => updateStaffField(i, "hotel_status", s.hotel_status === "手配済" ? "未手配" : "手配済")}
                    >
                      <span className={`absolute text-[9px] font-medium ${s.hotel_status === "手配済" ? "left-1.5 text-white" : "right-1.5 text-gray-600"}`}>
                        {s.hotel_status === "手配済" ? "手配済" : "未手配"}
                      </span>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${s.hotel_status === "手配済" ? "translate-x-[60px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <Input value={s.hotel_name || ""} onChange={(e) => updateStaffField(i, "hotel_name", e.target.value)} placeholder="ホテル名を入力（空欄のまま手配済にもできます）" className="h-8 text-sm" />
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
              ))}
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
          {staff.length > 0 ? (
            <div className="space-y-2">
              {staff.map((s, i) => (
                <div key={s.id} className="bg-white rounded border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold">{s.employees?.name || "不明"}</span>
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
              ))}
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-pink-600" />
              <span className="text-sm font-bold text-pink-800">マネキン</span>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs"
              onClick={async () => {
                const { data } = await supabase.from("mannequins").insert({
                  event_id: eventId, agency_name: null, staff_name: null,
                  work_start_date: startDate, work_end_date: endDate,
                  daily_rate: null, arrangement_status: "未手配",
                }).select("*").single();
                if (data) setMannequins((prev) => [...prev, data as MannequinRow]);
              }}
            >＋ 追加</Button>
          </div>
          {mannequins.length > 0 ? (
            <div className="space-y-2">
              {mannequins.map((m, i) => (
                <div key={m.id} className="bg-white rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Input value={m.agency_name || ""} onChange={(e) => updateMannequinField(i, "agency_name", e.target.value)} placeholder="派遣会社名" className="h-8 text-sm w-40" />
                      <Input value={m.staff_name || ""} onChange={(e) => updateMannequinField(i, "staff_name", e.target.value)} placeholder="人数（例: 2名）" className="h-8 text-sm w-24" />
                    </div>
                    <div className="flex items-center gap-2">
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
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">マネキン手配がありません。「＋ 追加」から登録してください。</p>
          )}
        </CardContent>
      </Card>

      {/* 備品の流れ */}
      <Card className="border-l-4 border-l-amber-500 bg-amber-50/50">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-800">備品の流れ</span>
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
              {pastVenues.filter((v) => v !== venueLabel).map((v) => {
                const sel = equipmentFrom === v;
                return (
                  <Badge key={v} variant="outline"
                    className={`cursor-pointer text-xs transition-colors ${sel ? "bg-amber-500 border-amber-500 text-white font-bold" : "border-amber-300 text-amber-400 bg-white hover:bg-amber-50 hover:text-amber-700 hover:border-amber-500"}`}
                    onClick={() => { setEquipmentFrom(sel ? null : v); markDirty(); }}
                  >{v}</Badge>
                );
              })}
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
              {pastVenues.filter((v) => v !== venueLabel).map((v) => {
                const sel = equipmentTo === v;
                return (
                  <Badge key={v} variant="outline"
                    className={`cursor-pointer text-xs transition-colors ${sel ? "bg-amber-500 border-amber-500 text-white font-bold" : "border-amber-300 text-amber-400 bg-white hover:bg-amber-50 hover:text-amber-700 hover:border-amber-500"}`}
                    onClick={() => { setEquipmentTo(sel ? null : v); markDirty(); }}
                  >{v}</Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
});
