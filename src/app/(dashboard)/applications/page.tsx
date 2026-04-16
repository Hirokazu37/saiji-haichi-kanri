"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";

type EventApp = {
  id: string;
  name: string;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  application_status: string | null;
  application_submitted_date: string | null;
  application_method: string | null;
};

export default function ApplicationsListPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<EventApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unsubmitted">("all");
  const [savedId, setSavedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from("events").select("id, name, venue, store_name, start_date, end_date, status, application_status, application_submitted_date, application_method").order("start_date");
    setEvents(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleApplication = async (evtId: string, current: string | null) => {
    const next = current === "提出済" ? "未提出" : "提出済";
    // 提出済にした時、提出日が未設定なら今日を自動セット
    const updates: Record<string, string | null> = { application_status: next };
    if (next === "提出済") {
      const evt = events.find((e) => e.id === evtId);
      if (evt && !evt.application_submitted_date) {
        updates.application_submitted_date = new Date().toISOString().slice(0, 10);
      }
    } else {
      updates.application_submitted_date = null;
    }
    setEvents((prev) => prev.map((e) => e.id === evtId ? { ...e, ...updates } : e));
    await supabase.from("events").update(updates).eq("id", evtId);
    setSavedId(evtId);
    setTimeout(() => setSavedId((prev) => prev === evtId ? null : prev), 1500);
  };

  const updateField = (evtId: string, field: string, value: string | null) => {
    setEvents((prev) => prev.map((e) => e.id === evtId ? { ...e, [field]: value } : e));
    supabase.from("events").update({ [field]: value || null }).eq("id", evtId).then(() => {
      setSavedId(evtId);
      setTimeout(() => setSavedId((prev) => prev === evtId ? null : prev), 1500);
    });
  };

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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>催事</TableHead>
                <TableHead>催事名</TableHead>
                <TableHead className="hidden md:table-cell">会期</TableHead>
                <TableHead>申込書</TableHead>
                <TableHead className="hidden md:table-cell">提出日</TableHead>
                <TableHead className="hidden md:table-cell">提出方法</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const isSubmitted = e.application_status === "提出済";
                return (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link href={`/events/${e.id}`} className="text-primary hover:underline text-sm font-medium">
                        {e.venue}{e.store_name ? ` ${e.store_name}` : ""}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{e.name}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{e.start_date} 〜 {e.end_date}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className={`relative inline-flex h-6 w-24 items-center rounded-full transition-colors ${isSubmitted ? "bg-green-700" : "bg-gray-300"}`}
                        onClick={() => toggleApplication(e.id, e.application_status)}
                      >
                        <span className={`absolute text-[10px] font-medium ${isSubmitted ? "left-2 text-white" : "right-2 text-gray-600"}`}>
                          {isSubmitted ? "提出済" : "未提出"}
                        </span>
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${isSubmitted ? "translate-x-[72px]" : "translate-x-0.5"}`} />
                      </button>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Input
                        type="date"
                        value={e.application_submitted_date || ""}
                        onChange={(ev) => updateField(e.id, "application_submitted_date", ev.target.value)}
                        className="h-8 text-sm w-36"
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex gap-1">
                        {["郵送", "FAX", "メール"].map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`px-2 py-1 text-xs rounded border transition-colors ${e.application_method === m ? "bg-green-700 text-white border-green-700 font-bold" : "bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700"}`}
                            onClick={() => updateField(e.id, "application_method", e.application_method === m ? null : m)}
                          >
                            {m}
                          </button>
                        ))}
                        {savedId === e.id && (
                          <span className="text-[10px] text-green-600 font-medium whitespace-nowrap">✓ 保存済み</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">該当する催事がありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
