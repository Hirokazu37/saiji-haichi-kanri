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

type EventDM = {
  id: string;
  name: string;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  dm_status: string | null;
  dm_count: number | null;
};

export default function DMListPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<EventDM[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "notDone">("all");
  const [savedId, setSavedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("events")
      .select("id, name, venue, store_name, start_date, end_date, status, dm_status, dm_count")
      .order("start_date");
    setEvents(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleDmStatus = (evtId: string, current: string | null) => {
    const next = current === "印刷済み" ? "未着手" : "印刷済み";
    setEvents((prev) => prev.map((e) => e.id === evtId ? { ...e, dm_status: next } : e));
    supabase.from("events").update({ dm_status: next }).eq("id", evtId).then(() => {
      setSavedId(evtId);
      setTimeout(() => setSavedId((prev) => prev === evtId ? null : prev), 1500);
    });
  };

  const updateField = (evtId: string, field: string, value: string | number | null) => {
    setEvents((prev) => prev.map((e) => e.id === evtId ? { ...e, [field]: value } : e));
    supabase.from("events").update({ [field]: value }).eq("id", evtId).then(() => {
      setSavedId(evtId);
      setTimeout(() => setSavedId((prev) => prev === evtId ? null : prev), 1500);
    });
  };

  const filtered = filter === "notDone"
    ? events.filter((e) => e.dm_status !== "印刷済み" && e.dm_status !== null && e.status !== "終了")
    : events.filter((e) => e.dm_status !== null);

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const allDmEvents = events.filter((e) => e.dm_status !== null);
  const notDoneCount = events.filter((e) => e.dm_status !== "印刷済み" && e.dm_status !== null && e.status !== "終了").length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">DMハガキ一覧</h1>

      <div className="flex gap-2 flex-wrap print:hidden">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>すべて ({allDmEvents.length})</Button>
        <Button variant={filter === "notDone" ? "default" : "outline"} size="sm" onClick={() => setFilter("notDone")}>未完了のみ ({notDoneCount})</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>催事</TableHead>
                <TableHead>催事名</TableHead>
                <TableHead className="hidden md:table-cell">会期</TableHead>
                <TableHead>印刷済み</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>枚数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const isDone = e.dm_status === "印刷済み";
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
                        className={`relative inline-flex h-6 w-24 items-center rounded-full transition-colors ${isDone ? "bg-green-700" : "bg-gray-300"}`}
                        onClick={() => toggleDmStatus(e.id, e.dm_status)}
                      >
                        <span className={`absolute text-[10px] font-medium ${isDone ? "left-2 text-white" : "right-2 text-gray-600"}`}>
                          {isDone ? "印刷済み" : "未完了"}
                        </span>
                        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${isDone ? "translate-x-[72px]" : "translate-x-0.5"}`} />
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {["未着手", "校正中", "印刷済み"].map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`px-2 py-1 text-xs rounded border transition-colors ${e.dm_status === s ? "bg-green-700 text-white border-green-700 font-bold" : "bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700"}`}
                            onClick={() => updateField(e.id, "dm_status", e.dm_status === s ? null : s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={e.dm_count ?? ""}
                          onChange={(ev) => updateField(e.id, "dm_count", ev.target.value ? parseInt(ev.target.value) : null)}
                          placeholder="枚数"
                          className="h-8 text-sm w-20 bg-white"
                          min="0"
                        />
                        {savedId === e.id && (
                          <span className="text-[10px] text-green-600 font-medium whitespace-nowrap animate-in fade-in">✓ 保存済み</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {filter === "all" ? "DMハガキが登録された催事がありません" : "該当する催事がありません"}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
