"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";

type EventApp = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  application_status: string | null;
  application_submitted_date: string | null;
  application_method: string | null;
  dm_status: string | null;
};

const DM_BADGE: Record<string, string> = {
  "印刷済み": "bg-green-50 text-green-700 border-green-200",
  "校正中": "bg-amber-50 text-amber-700 border-amber-200",
  "未着手": "bg-red-50 text-red-700 border-red-200",
};

export default function ApplicationsListPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [events, setEvents] = useState<EventApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unsubmitted">("all");
  const [savedId, setSavedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from("events").select("id, name, venue, store_name, start_date, end_date, status, application_status, application_submitted_date, application_method, dm_status").order("start_date");
    setEvents(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateField = (evtId: string, field: string, value: string | null) => {
    setEvents((prev) => prev.map((e) => e.id === evtId ? { ...e, [field]: value } : e));
    supabase.from("events").update({ [field]: value || null }).eq("id", evtId).then(() => {
      setSavedId(evtId);
      setTimeout(() => setSavedId((prev) => prev === evtId ? null : prev), 1500);
    });
  };

  // 提出方法を選んだら、自動で「提出済」＋提出日（空なら今日）に
  const submitWithMethod = async (evtId: string, method: string) => {
    const evt = events.find((e) => e.id === evtId);
    const updates: Record<string, string | null> = { application_method: method, application_status: "提出済" };
    if (evt && !evt.application_submitted_date) updates.application_submitted_date = new Date().toISOString().slice(0, 10);
    setEvents((prev) => prev.map((e) => (e.id === evtId ? { ...e, ...updates } : e)));
    await supabase.from("events").update(updates).eq("id", evtId);
    setSavedId(evtId);
    setTimeout(() => setSavedId((prev) => (prev === evtId ? null : prev)), 1500);
  };

  const setUnsubmitted = async (evtId: string) => {
    const updates = { application_status: "未提出", application_submitted_date: null };
    setEvents((prev) => prev.map((e) => (e.id === evtId ? { ...e, ...updates } : e)));
    await supabase.from("events").update(updates).eq("id", evtId);
  };

  // 未提出かつ会期開始が2週間以内（終了済を除く）＝要対応
  const todayStr = new Date().toISOString().slice(0, 10);
  const daysToStart = (s: string) => Math.ceil((new Date(s + "T00:00:00").getTime() - new Date(todayStr + "T00:00:00").getTime()) / 86400000);

  const filtered = filter === "unsubmitted"
    ? events.filter((e) => e.application_status !== "提出済" && e.status !== "終了")
    : events;

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const unsubmittedCount = events.filter((e) => e.application_status !== "提出済" && e.status !== "終了").length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">出店申込書一覧</h1>

      <div className="flex gap-2 print:hidden">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>すべて ({events.length})</Button>
        <Button variant={filter === "unsubmitted" ? "default" : "outline"} size="sm" onClick={() => setFilter("unsubmitted")}>未提出のみ ({unsubmittedCount})</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-auto max-h-[75vh]">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-background">
                <TableHead>催事</TableHead>
                <TableHead>催事名</TableHead>
                <TableHead className="hidden md:table-cell">会期</TableHead>
                <TableHead>申込書</TableHead>
                <TableHead className="hidden md:table-cell">提出日</TableHead>
                <TableHead className="hidden md:table-cell">提出方法</TableHead>
                <TableHead>DM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const isSubmitted = e.application_status === "提出済";
                const isPast = e.end_date < todayStr;
                const ds = daysToStart(e.start_date);
                const urgent = !isSubmitted && !isPast && e.status !== "終了" && ds >= 0 && ds <= 14;
                return (
                  <TableRow key={e.id} className={urgent ? (ds <= 7 ? "bg-red-50 hover:bg-red-100" : "bg-amber-50 hover:bg-amber-100") : ""}>
                    <TableCell>
                      <Link href={`/events/${e.id}`} className="text-primary hover:underline text-sm font-medium">
                        {e.venue}{e.store_name ? ` ${e.store_name}` : ""}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.name || "—"}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{e.start_date} 〜 {e.end_date}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn(
                          "text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap",
                          isSubmitted ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                        )}>
                          {isSubmitted ? "提出済" : "未提出"}
                        </span>
                        {urgent && (
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full border bg-red-600 text-white border-red-600 whitespace-nowrap">要対応</span>
                        )}
                        {canEdit && isSubmitted && (
                          <button type="button" onClick={() => setUnsubmitted(e.id)} className="text-[10px] text-muted-foreground hover:text-foreground underline">未提出に戻す</button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {canEdit ? (
                        <Input
                          type="date"
                          value={e.application_submitted_date || ""}
                          onChange={(ev) => updateField(e.id, "application_submitted_date", ev.target.value)}
                          className="h-8 text-sm w-36"
                        />
                      ) : (
                        <span className="text-sm">{e.application_submitted_date || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {canEdit ? (
                        <div className="flex gap-1">
                          {["郵送", "FAX", "メール"].map((m) => (
                            <button
                              key={m}
                              type="button"
                              title="選ぶと自動で「提出済」になります"
                              className={`px-2 py-1 text-xs rounded border transition-colors ${e.application_method === m ? "bg-green-700 text-white border-green-700 font-bold" : "bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700"}`}
                              onClick={() => submitWithMethod(e.id, m)}
                            >
                              {m}
                            </button>
                          ))}
                          {savedId === e.id && (
                            <span className="text-[10px] text-green-600 font-medium whitespace-nowrap">✓ 保存済み</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm">{e.application_method || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full border", DM_BADGE[e.dm_status || ""] || "bg-gray-100 text-gray-500 border-gray-200")}>
                          {e.dm_status || "なし"}
                        </span>
                        <Link href={`/dm/message?event=${e.id}`} className="text-[11px] text-primary hover:underline">文面へ</Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">該当する催事がありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
