"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";

type Event = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  prefecture: string;
  start_date: string;
  end_date: string;
  status: string;
  application_status: string | null;
  person_in_charge: string | null;
  dm_status: string | null;
  equipment_from: string | null;
  equipment_to: string | null;
};

type EventAlert = {
  event: Event;
  label: string;
  hotel: "ok" | "ng" | "na";
  transport: "ok" | "ng" | "na";
  shipment: "ok" | "ng" | "na";
  application: "ok" | "ng";
  staff: "ok" | "ng";
  dm: "ok" | "ng" | "na";
};

const statusColor: Record<string, string> = {
  "準備中": "bg-gray-100 text-gray-800",
  "手配中": "bg-yellow-100 text-yellow-800",
  "手配完了": "bg-blue-100 text-blue-800",
  "開催中": "bg-green-100 text-green-800",
  "終了": "bg-gray-200 text-gray-500",
};

export default function DashboardPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [activeEvents, setActiveEvents] = useState<Event[]>([]);
  const [eventAlerts, setEventAlerts] = useState<EventAlert[]>([]);
  const [counts, setCounts] = useState({ thisMonth: 0, preparing: 0, completed: 0 });

  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const twoWeeksLater = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthEnd = new Date(new Date(today).getFullYear(), new Date(today).getMonth() + 1, 0).toISOString().split("T")[0];

    const [upcomingRes, activeRes, monthRes] = await Promise.all([
      supabase.from("events").select("*").gte("start_date", today).lte("start_date", twoWeeksLater).order("start_date"),
      supabase.from("events").select("*").lte("start_date", today).gte("end_date", today).order("start_date"),
      supabase.from("events").select("id, status").gte("start_date", monthStart).lte("start_date", monthEnd),
    ]);

    const upcoming = (upcomingRes.data || []) as Event[];
    const active = (activeRes.data || []) as Event[];
    setUpcomingEvents(upcoming);
    setActiveEvents(active);

    const me = monthRes.data || [];
    setCounts({
      thisMonth: me.length,
      preparing: me.filter((e) => e.status === "準備中" || e.status === "手配中").length,
      completed: me.filter((e) => e.status === "手配完了" || e.status === "開催中" || e.status === "終了").length,
    });

    // 催事ごとの手配状況を集計
    const targetEvents = Array.from(new Map([...upcoming, ...active].map((e) => [e.id, e])).values());
    const eventIds = targetEvents.map((e) => e.id);

    const [hotelRes, transportRes, staffRes] = await Promise.all([
      supabase.from("hotels").select("event_id, reservation_status").in("event_id", eventIds),
      supabase.from("transportations").select("event_id, reservation_status").in("event_id", eventIds),
      supabase.from("event_staff").select("event_id").in("event_id", eventIds),
    ]);

    const hotels = hotelRes.data || [];
    const transports = transportRes.data || [];
    const staffList = staffRes.data || [];

    const alerts: EventAlert[] = [];
    for (const evt of targetEvents) {
      const label = `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}`;
      const evtHotels = hotels.filter((h) => h.event_id === evt.id);
      const evtTransports = transports.filter((t) => t.event_id === evt.id);
      const evtStaff = staffList.filter((s) => s.event_id === evt.id);

      const hotelStatus = evtHotels.length === 0 ? "na" : evtHotels.every((h) => h.reservation_status === "予約済") ? "ok" : "ng";
      const transportStatus = evtTransports.length === 0 ? "na" : evtTransports.every((t) => t.reservation_status === "予約済") ? "ok" : "ng";
      const shipmentStatus = (evt.equipment_from && evt.equipment_to) ? "ok" : (!evt.equipment_from && !evt.equipment_to) ? "na" : "ng";
      const appStatus = evt.application_status === "提出済" ? "ok" : "ng";
      const staffStatus = evtStaff.length > 0 ? "ok" : "ng";
      const dmStatus = evt.dm_status === null ? "na" : evt.dm_status === "印刷済み" ? "ok" : "ng";

      const hasIssue = hotelStatus !== "ok" || transportStatus !== "ok" || shipmentStatus !== "ok" || appStatus !== "ok" || staffStatus !== "ok" || (dmStatus === "ng");
      if (hasIssue) {
        alerts.push({ event: evt, label, hotel: hotelStatus as "ok"|"ng"|"na", transport: transportStatus as "ok"|"ng"|"na", shipment: shipmentStatus as "ok"|"ng"|"na", application: appStatus as "ok"|"ng", staff: staffStatus as "ok"|"ng", dm: dmStatus as "ok"|"ng"|"na" });
      }
    }
    setEventAlerts(alerts);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <p className="text-muted-foreground p-4">読み込み中...</p>;

  const StatusIcon = ({ status }: { status: "ok" | "ng" | "na" }) => (
    <span className={`w-6 text-center inline-block text-[10px] rounded ${status === "ok" ? "bg-green-100 text-green-700" : status === "ng" ? "bg-red-100 text-red-700" : "text-gray-400"}`}>
      {status === "ok" ? "✓" : status === "ng" ? "✗" : "—"}
    </span>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* サマリーカード */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">今月の催事</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.thisMonth} 件</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">準備中・手配中</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.preparing} 件</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">手配完了以降</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{counts.completed} 件</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 未手配アラート — 百貨店名ごと */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              未手配アラート
            </CardTitle>
          </CardHeader>
          <CardContent>
            {eventAlerts.length === 0 ? (
              <p className="text-sm text-green-600">全ての手配が完了しています。</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {/* ヘッダー */}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground pb-1 border-b px-2">
                  <span className="flex-1">催事</span>
                  <span className="w-6 text-center">申</span>
                  <span className="w-6 text-center">H</span>
                  <span className="w-6 text-center">交</span>
                  <span className="w-6 text-center">備</span>
                  <span className="w-6 text-center">員</span>
                  <span className="w-6 text-center">DM</span>
                </div>
                {eventAlerts.map((a) => (
                  <Link
                    key={a.event.id}
                    href={`/events/${a.event.id}`}
                    className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs truncate">{a.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{a.event.name || `${a.event.venue}${a.event.store_name ? ` ${a.event.store_name}` : ""}`}（{a.event.start_date}〜）</div>
                    </div>
                    <StatusIcon status={a.application} />
                    <StatusIcon status={a.hotel} />
                    <StatusIcon status={a.transport} />
                    <StatusIcon status={a.shipment} />
                    <StatusIcon status={a.staff} />
                    <StatusIcon status={a.dm} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 開催中の催事 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              開催中
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">現在開催中の催事はありません。</p>
            ) : (
              <div className="space-y-2">
                {activeEvents.map((event) => (
                  <Link key={event.id} href={`/events/${event.id}`} className="block p-2 rounded hover:bg-muted transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{event.venue}{event.store_name ? ` ${event.store_name}` : ""}</span>
                      <Badge variant="outline" className={statusColor[event.status] || ""}>{event.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{event.name ? `${event.name} | ` : ""}{event.start_date} 〜 {event.end_date}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 直近の催事 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            直近2週間の催事
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">直近2週間に開始予定の催事はありません。</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block p-2 rounded hover:bg-muted transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{event.venue}{event.store_name ? ` ${event.store_name}` : ""}</span>
                    <div className="flex gap-1">
                      <Badge variant="outline" className={statusColor[event.status] || ""}>{event.status}</Badge>
                      <Badge variant="outline" className={event.application_status === "提出済" ? "bg-green-100 text-green-800 text-xs" : "bg-red-100 text-red-800 text-xs"}>
                        申込書: {event.application_status || "未提出"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {event.name ? `${event.name}（${event.prefecture}）| ` : `${event.prefecture} | `}{event.start_date} 〜 {event.end_date}
                    {event.person_in_charge ? ` | 担当: ${event.person_in_charge}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
