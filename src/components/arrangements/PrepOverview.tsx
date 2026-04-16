"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle, AlertTriangle, Clock, Users, Hotel, Train, UserCheck, Package, FileText } from "lucide-react";

type PrepStatus = {
  staff: { total: number };
  hotels: { total: number; statuses: Record<string, number> };
  transports: { total: number; statuses: Record<string, number> };
  mannequins: { total: number; statuses: Record<string, number> };
  shipments: { total: number; statuses: Record<string, number> };
  applicationStatus: string;
};

type LogEntry = {
  id: string;
  category: string;
  action: string;
  performed_by_name: string | null;
  created_at: string;
};

const categoryIcons: Record<string, React.ReactNode> = {
  "社員配置": <Users className="h-3 w-3" />,
  "ホテル": <Hotel className="h-3 w-3" />,
  "交通": <Train className="h-3 w-3" />,
  "マネキン": <UserCheck className="h-3 w-3" />,
  "備品転送": <Package className="h-3 w-3" />,
  "出店申込書": <FileText className="h-3 w-3" />,
};

function StatusIcon({ done }: { done: boolean }) {
  return done ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-orange-500" />;
}

export function PrepOverview({ eventId }: { eventId: string }) {
  const supabase = createClient();
  const [prep, setPrep] = useState<PrepStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const fetch = useCallback(async () => {
    const [staffRes, hotelRes, transRes, mannRes, shipRes, eventRes, logRes] = await Promise.all([
      supabase.from("event_staff").select("id").eq("event_id", eventId),
      supabase.from("hotels").select("id, reservation_status").eq("event_id", eventId),
      supabase.from("transportations").select("id, reservation_status").eq("event_id", eventId),
      supabase.from("mannequins").select("id, arrangement_status").eq("event_id", eventId),
      supabase.from("shipments").select("id, shipment_status").eq("event_id", eventId),
      supabase.from("events").select("application_status").eq("id", eventId).single(),
      supabase.from("arrangement_logs").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(20),
    ]);

    const countStatuses = (data: { id: string; [key: string]: string | null }[] | null, field: string) => {
      const items = data || [];
      const statuses: Record<string, number> = {};
      items.forEach((item) => {
        const s = (item as Record<string, string | null>)[field] || "不明";
        statuses[s] = (statuses[s] || 0) + 1;
      });
      return { total: items.length, statuses };
    };

    setPrep({
      staff: { total: (staffRes.data || []).length },
      hotels: countStatuses(hotelRes.data, "reservation_status"),
      transports: countStatuses(transRes.data, "reservation_status"),
      mannequins: countStatuses(mannRes.data, "arrangement_status"),
      shipments: countStatuses(shipRes.data, "shipment_status"),
      applicationStatus: eventRes.data?.application_status || "未提出",
    });
    setLogs(logRes.data as LogEntry[] || []);
  }, [supabase, eventId]);

  useEffect(() => { fetch(); }, [fetch]);

  if (!prep) return <p className="text-muted-foreground">読み込み中...</p>;

  const items = [
    {
      label: "出店申込書", icon: <FileText className="h-4 w-4" />,
      done: prep.applicationStatus === "提出済",
      detail: prep.applicationStatus,
    },
    {
      label: "社員配置", icon: <Users className="h-4 w-4" />,
      done: prep.staff.total > 0,
      detail: `${prep.staff.total}名配置`,
    },
    {
      label: "ホテル", icon: <Hotel className="h-4 w-4" />,
      done: prep.hotels.total > 0 && !prep.hotels.statuses["未予約"],
      detail: prep.hotels.total === 0 ? "未登録"
        : Object.entries(prep.hotels.statuses).map(([s, n]) => `${s}: ${n}`).join(", "),
    },
    {
      label: "交通", icon: <Train className="h-4 w-4" />,
      done: prep.transports.total > 0 && !prep.transports.statuses["未予約"],
      detail: prep.transports.total === 0 ? "未登録"
        : Object.entries(prep.transports.statuses).map(([s, n]) => `${s}: ${n}`).join(", "),
    },
    {
      label: "マネキン", icon: <UserCheck className="h-4 w-4" />,
      done: prep.mannequins.total > 0 && !prep.mannequins.statuses["未手配"],
      detail: prep.mannequins.total === 0 ? "未登録"
        : Object.entries(prep.mannequins.statuses).map(([s, n]) => `${s}: ${n}`).join(", "),
    },
    {
      label: "備品転送", icon: <Package className="h-4 w-4" />,
      done: prep.shipments.total > 0 && !prep.shipments.statuses["未発送"],
      detail: prep.shipments.total === 0 ? "未登録"
        : Object.entries(prep.shipments.statuses).map(([s, n]) => `${s}: ${n}`).join(", "),
    },
  ];

  const formatDate = (dt: string) => {
    const d = new Date(dt);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 準備状況 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">準備状況</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <StatusIcon done={item.done} />
                <div className="flex items-center gap-2 min-w-[80px]">
                  {item.icon}
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <span className="text-sm text-muted-foreground">{item.detail}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 手配履歴 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            手配履歴
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだ履歴がありません。</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-sm border-b pb-2 last:border-0">
                  <Badge variant="outline" className="text-xs shrink-0 flex items-center gap-1">
                    {categoryIcons[log.category]}
                    {log.category}
                  </Badge>
                  <div className="flex-1">
                    <p>{log.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.performed_by_name || "—"} · {formatDate(log.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
