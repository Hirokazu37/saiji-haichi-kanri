"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  status: string;
  dm_status: string | null;
  dm_count: number | null;
};

const dmStatusColors: Record<string, string> = {
  "未着手": "bg-red-100 text-red-800",
  "校正中": "bg-yellow-100 text-yellow-800",
  "印刷済み": "bg-green-100 text-green-800",
};

export default function DMListPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<EventDM[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "notStarted" | "inProgress">("all");

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("events")
      .select("id, name, venue, store_name, start_date, status, dm_status, dm_count")
      .not("dm_status", "is", null)
      .order("start_date");
    setEvents(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = filter === "notStarted"
    ? events.filter((e) => e.dm_status === "未着手")
    : filter === "inProgress"
    ? events.filter((e) => e.dm_status === "校正中")
    : events;

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const notStartedCount = events.filter((e) => e.dm_status === "未着手").length;
  const inProgressCount = events.filter((e) => e.dm_status === "校正中").length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">DMハガキ一覧</h1>

      <div className="flex gap-2 flex-wrap">
        <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>すべて ({events.length})</Button>
        <Button variant={filter === "notStarted" ? "default" : "outline"} size="sm" onClick={() => setFilter("notStarted")}>未着手 ({notStartedCount})</Button>
        <Button variant={filter === "inProgress" ? "default" : "outline"} size="sm" onClick={() => setFilter("inProgress")}>校正中 ({inProgressCount})</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>催事</TableHead>
                <TableHead>催事名</TableHead>
                <TableHead className="hidden md:table-cell">開始日</TableHead>
                <TableHead>枚数</TableHead>
                <TableHead>DMステータス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/events/${e.id}`} className="text-primary hover:underline text-sm font-medium">
                      {e.venue}{e.store_name ? ` ${e.store_name}` : ""}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{e.name}</TableCell>
                  <TableCell className="text-sm hidden md:table-cell">{e.start_date}</TableCell>
                  <TableCell className="text-sm">{e.dm_count ? `${e.dm_count}枚` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={dmStatusColors[e.dm_status || ""] || ""}>
                      {e.dm_status || "—"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {filter === "all" ? "DMハガキが登録された催事がありません。催事新規作成時にDMステータスを設定してください。" : "該当する催事がありません"}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
