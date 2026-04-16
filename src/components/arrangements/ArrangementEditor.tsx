"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Save, FileText, Hotel, Train, Mail, UserCheck, Package } from "lucide-react";

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

export function ArrangementEditor({ eventId, venue, storeName, startDate, endDate }: { eventId: string; venue: string; storeName: string | null; startDate: string; endDate: string }) {
  const supabase = createClient();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [mannequins, setMannequins] = useState<MannequinRow[]>([]);
  const [pastVenues, setPastVenues] = useState<VenueOption[]>([]);
  const [selectedDests, setSelectedDests] = useState<Map<string, "send" | "return">>(new Map());
  const [appStatus, setAppStatus] = useState<string>("未提出");
  const [dmStatus, setDmStatus] = useState<string | null>(null);
  const [dmCount, setDmCount] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const [hotelMasters, setHotelMasters] = useState<{ id: string; name: string }[]>([]);
  const [hotelVenueLinks, setHotelVenueLinks] = useState<{ hotel_id: string; venue_name: string }[]>([]);

  const fetchData = useCallback(async () => {
    const [staffRes, shipRes, evtRes, venueRes, hmRes, hvlRes, mannRes] = await Promise.all([
      supabase.from("event_staff").select("id, employee_id, start_date, end_date, role, hotel_name, hotel_status, transport_outbound_status, transport_return_status, employees(name)").eq("event_id", eventId).order("start_date"),
      supabase.from("shipments").select("id, item_name, recipient_name").eq("event_id", eventId),
      supabase.from("events").select("application_status, dm_status, dm_count").eq("id", eventId).single(),
      supabase.from("events").select("venue, store_name").order("created_at", { ascending: false }).limit(100),
      supabase.from("hotel_master").select("id, name").eq("is_active", true).order("name"),
      supabase.from("hotel_venue_links").select("hotel_id, venue_name"),
      supabase.from("mannequins").select("id, agency_name, staff_name, work_start_date, work_end_date, daily_rate, arrangement_status").eq("event_id", eventId).order("work_start_date"),
    ]);
    setStaff((staffRes.data || []) as unknown as StaffRow[]);
    setShipments((shipRes.data || []) as ShipmentRow[]);
    setMannequins((mannRes.data || []) as MannequinRow[]);
    setAppStatus(evtRes.data?.application_status || "未提出");
    setDmStatus(evtRes.data?.dm_status || null);
    setDmCount(evtRes.data?.dm_count ? String(evtRes.data.dm_count) : "");

    const existing = new Map<string, "send" | "return">();
    (shipRes.data || []).forEach((s: ShipmentRow) => {
      existing.set(s.recipient_name, s.item_name === "返送備品" ? "return" : "send");
    });
    setSelectedDests(existing);

    const seen = new Set<string>();
    const venues: string[] = [];
    (venueRes.data || []).forEach((e: { venue: string; store_name: string | null }) => {
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

  const markDirty = () => { setDirty(true); setSaved(false); };

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
    setSaving(true);

    await supabase.from("events").update({ application_status: appStatus, dm_status: dmStatus, dm_count: dmCount ? parseInt(dmCount) : null }).eq("id", eventId);

    for (const s of staff) {
      await supabase.from("event_staff").update({
        hotel_name: s.hotel_name || null,
        transport_outbound_status: s.transport_outbound_status || "未手配",
        transport_return_status: s.transport_return_status || "未手配",
      }).eq("id", s.id);
    }

    for (const m of mannequins) {
      await supabase.from("mannequins").update({
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

    setSaving(false);
    setSaved(true);
    setDirty(false);
    fetchData();
  };

  const venueLabel = storeName ? `${venue} ${storeName}` : venue;
  const destinations = [
    { label: "本社（安岡蒲鉾）", type: "return" as const },
    { label: venueLabel, type: "send" as const },
    ...pastVenues.filter((v) => v !== venueLabel).map((v) => ({ label: v, type: "send" as const })),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 保存ボタン */}
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-orange-600 font-medium">未保存の変更があります</span>}
        <Button size="sm" onClick={handleSave} disabled={saving} variant={dirty ? "default" : "outline"}>
          <Save className="h-3 w-3 mr-1" />{saving ? "保存中..." : saved ? "保存済み ✓" : "保存する"}
        </Button>
      </div>

      {/* 出店申込書 */}
      <Card className="border-l-4 border-l-green-500 bg-green-50/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-600" />
              <span className="text-sm font-bold text-green-800">出店申込書</span>
            </div>
            <div className="flex gap-1">
              {["未提出", "提出済"].map((s) => (
                <Badge key={s} variant={appStatus === s ? "default" : "outline"} className="cursor-pointer text-xs"
                  onClick={() => { setAppStatus(s); markDirty(); }}>{s}</Badge>
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
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-xs">{s.employees?.name || "不明"}</Badge>
                    <span className="text-xs text-muted-foreground">{s.start_date}〜{s.end_date} {s.role || ""}</span>
                  </div>
                  <div className="space-y-1">
                    <Input value={s.hotel_name || ""} onChange={(e) => updateStaffField(i, "hotel_name", e.target.value)} placeholder="ホテル名を入力" className="h-8 text-sm" />
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
                    <Badge variant="default" className="text-xs">{s.employees?.name || "不明"}</Badge>
                    <span className="text-xs text-muted-foreground">{s.start_date}〜{s.end_date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">行き</span>
                    <button
                      type="button"
                      className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors ${s.transport_outbound_status === "手配済" ? "bg-green-500" : "bg-gray-300"}`}
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
                      className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors ${s.transport_return_status === "手配済" ? "bg-green-500" : "bg-gray-300"}`}
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
                  <Badge key={s} variant={current === s ? "default" : "outline"} className="cursor-pointer text-xs"
                    onClick={() => { setDmStatus(s === "なし" ? null : s); markDirty(); }}>{s}</Badge>
                );
              })}
            </div>
          </div>
          {dmStatus && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">枚数</span>
              <Input type="number" value={dmCount} onChange={(e) => { setDmCount(e.target.value); markDirty(); }} placeholder="枚数を入力" className="h-8 text-sm w-32" min="0" />
              <span className="text-xs text-muted-foreground">枚</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* マネキン */}
      <Card className="border-l-4 border-l-pink-500 bg-pink-50/50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-pink-600" />
            <span className="text-sm font-bold text-pink-800">マネキン</span>
          </div>
          {mannequins.length > 0 ? (
            <div className="space-y-2">
              {mannequins.map((m, i) => (
                <div key={m.id} className="bg-white rounded border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.agency_name || "未設定"}</span>
                      <span className="text-xs text-muted-foreground">{m.staff_name || ""}</span>
                      <span className="text-xs text-muted-foreground">{m.work_start_date}〜{m.work_end_date}</span>
                    </div>
                    <button
                      type="button"
                      className={`relative inline-flex h-5 w-20 items-center rounded-full transition-colors ${m.arrangement_status === "手配済" ? "bg-green-500" : "bg-gray-300"}`}
                      onClick={() => updateMannequinField(i, "arrangement_status", m.arrangement_status === "手配済" ? "未手配" : "手配済")}
                    >
                      <span className={`absolute text-[9px] font-medium ${m.arrangement_status === "手配済" ? "left-1.5 text-white" : "right-1.5 text-gray-600"}`}>
                        {m.arrangement_status === "手配済" ? "手配済" : "未手配"}
                      </span>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${m.arrangement_status === "手配済" ? "translate-x-[60px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">マネキン手配がありません。</p>
          )}
        </CardContent>
      </Card>

      {/* 備品転送 */}
      <Card className="border-l-4 border-l-amber-500 bg-amber-50/50">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-800">備品転送</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {destinations.map((dest) => (
              <Badge key={dest.label} variant={selectedDests.has(dest.label) ? "default" : "outline"} className="cursor-pointer text-xs"
                onClick={() => toggleDest(dest.label, dest.type)}>
                {dest.type === "return" ? "← " : "→ "}{dest.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 未保存確認ダイアログ */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存していない変更があります</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">保存しますか？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setConfirmOpen(false);
              setDirty(false);
              if (pendingAction.current) { pendingAction.current(); pendingAction.current = null; }
            }}>保存しない</Button>
            <Button onClick={async () => {
              await handleSave();
              setConfirmOpen(false);
              if (pendingAction.current) { pendingAction.current(); pendingAction.current = null; }
            }}>保存する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
