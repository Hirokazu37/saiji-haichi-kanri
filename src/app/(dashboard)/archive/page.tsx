"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Archive, Search, ChevronRight } from "lucide-react";
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
  person_in_charge: string | null;
  revenue: number | null;
  retrospective: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ArchivePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [search, setSearch] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const fetchData = useCallback(async () => {
    const t = todayStr();
    const { data } = await supabase
      .from("events")
      .select("id, name, venue, store_name, prefecture, start_date, end_date, status, person_in_charge, revenue, retrospective")
      .lt("end_date", t)
      .order("end_date", { ascending: false });
    setEvents((data || []) as Event[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (selectedYear !== "all" && !e.end_date.startsWith(selectedYear)) return false;
      if (!q) return true;
      const hay = `${e.venue} ${e.store_name || ""} ${e.name || ""} ${e.prefecture} ${e.person_in_charge || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, search, selectedYear]);

  const years = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.end_date.slice(0, 4)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [events]);

  const byYear = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of filtered) {
      const y = e.end_date.slice(0, 4);
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const totalRevenue = useMemo(() => filtered.reduce((sum, e) => sum + (e.revenue || 0), 0), [filtered]);

  if (loading) return <p className="text-muted-foreground p-4">読み込み中...</p>;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="h-6 w-6" />履歴（終了した催事）
          </h1>
          <p className="text-xs text-muted-foreground mt-1">開催期間が過去日になった催事を表示。行クリックで詳細（編集可）。</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>全 <span className="font-bold text-base text-foreground">{events.length}</span> 件</div>
          <div>絞り込み後 <span className="font-bold text-base text-foreground">{filtered.length}</span> 件</div>
          {totalRevenue > 0 && (
            <div>売上合計 <span className="font-bold text-base text-foreground">¥{totalRevenue.toLocaleString()}</span></div>
          )}
        </div>
      </div>

      {/* 検索・フィルタ */}
      <Card>
        <CardContent className="pt-4 pb-4 px-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="百貨店名・催事名・担当者・開催地で検索"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              variant={selectedYear === "all" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedYear("all")}
            >
              すべて
            </Button>
            {years.map((y) => (
              <Button
                key={y}
                variant={selectedYear === y ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedYear(y)}
              >
                {y}年
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 年別一覧 */}
      {byYear.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
            {events.length === 0 ? "まだ終了した催事はありません。" : "条件に合致する催事がありません。"}
          </CardContent>
        </Card>
      ) : (
        byYear.map(([year, yearEvents]) => {
          const yearRevenue = yearEvents.reduce((s, e) => s + (e.revenue || 0), 0);
          return (
            <Card key={year}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{year}年</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {yearEvents.length}件{yearRevenue > 0 ? ` ・ 売上 ¥${yearRevenue.toLocaleString()}` : ""}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-1.5">
                  {yearEvents.map((e) => {
                    const venueLabel = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
                    return (
                      <Link
                        key={e.id}
                        href={`/events/${e.id}`}
                        className="flex items-center gap-2 p-2 rounded border hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold">{venueLabel}</span>
                            <span className="text-[10px] text-muted-foreground">（{e.prefecture}）</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {e.start_date} 〜 {e.end_date}
                            {e.person_in_charge ? ` ・ ${e.person_in_charge}` : ""}
                            {e.name ? ` ・ ${e.name}` : ""}
                          </div>
                        </div>
                        {e.revenue != null && (
                          <Badge variant="outline" className="bg-green-50 border-green-300 text-green-800 text-xs shrink-0">
                            ¥{e.revenue.toLocaleString()}
                          </Badge>
                        )}
                        {e.retrospective && (
                          <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-800 text-[10px] shrink-0">
                            振り返りあり
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
