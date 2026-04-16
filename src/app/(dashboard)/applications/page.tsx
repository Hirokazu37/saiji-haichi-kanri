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

type EventApp = {
  id: string;
  name: string;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  application_status: string | null;
};

export default function ApplicationsListPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<EventApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unsubmitted">("all");

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from("events").select("id, name, venue, store_name, start_date, end_date, status, application_status").order("start_date");
    setEvents(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = filter === "unsubmitted"
    ? events.filter((e) => e.application_status !== "提出済" && e.status !== "終了")
    : events;

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  const unsubmittedCount = events.filter((e) => e.application_status !== "提出済" && e.status !== "終了").length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">出店申込書一覧</h1>

      <div className="flex gap-2">
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
                <TableHead className="hidden md:table-cell">開始日</TableHead>
                <TableHead className="hidden md:table-cell">催事ステータス</TableHead>
                <TableHead>申込書</TableHead>
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
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="text-xs">{e.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={e.application_status === "提出済" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {e.application_status || "未提出"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">該当する催事がありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
