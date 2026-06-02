"use client";

/**
 * マネキンの手配 一覧 (進捗管理ページ)
 *
 * DMハガキ・備品の流れ・出店申込書 と同じスタイルで、
 * 催事ごとに 1 行で マネキン手配ステータスを管理する。
 *
 * ステータス: NULL / 未手配 / 確定 / 完了
 *  - NULL          → 未設定
 *  - 未手配/確定   → 未完了扱い
 *  - 完了          → 完了扱い
 *
 * 割当済みマネキン数は event_staff (person_type='mannequin') の件数で表示。
 *
 * 表示条件:
 *   - 会期終了済 (end_date < today) はデフォルト非表示。「過去も見る」で切替。
 *   - status が設定済 もしくは event_staff にマネキン1名以上 = 表示対象。
 */

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";

type EventMannequin = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  status: string;
  mannequin_arrangement_status: string | null;
  // event_staff から派生で詰める
  assignedCount: number;
};

const STATUS_OPTIONS = ["未手配", "確定", "完了"] as const;

/** YYYY-MM-DD の今日の文字列 (タイムゾーンはローカル) */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function MannequinArrangementsPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [events, setEvents] = useState<EventMannequin[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "notDone">("all");
  const [includePast, setIncludePast] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    // 催事 + event_staff(マネキン分のみ) を取得して件数を集計
    const [evtRes, staffRes] = await Promise.all([
      supabase
        .from("events")
        .select(
          "id, name, venue, store_name, start_date, end_date, status, mannequin_arrangement_status"
        )
        .order("start_date"),
      supabase
        .from("event_staff")
        .select("event_id")
        .eq("person_type", "mannequin"),
    ]);

    const countByEvent = new Map<string, number>();
    (staffRes.data ?? []).forEach((row: { event_id: string }) => {
      countByEvent.set(row.event_id, (countByEvent.get(row.event_id) ?? 0) + 1);
    });

    const rows: EventMannequin[] = (evtRes.data ?? []).map((e) => ({
      ...e,
      assignedCount: countByEvent.get(e.id) ?? 0,
    }));
    setEvents(rows);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = (evtId: string, value: string | null) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === evtId ? { ...e, mannequin_arrangement_status: value } : e
      )
    );
    supabase
      .from("events")
      .update({ mannequin_arrangement_status: value })
      .eq("id", evtId)
      .then(() => {
        setSavedId(evtId);
        setTimeout(
          () => setSavedId((prev) => (prev === evtId ? null : prev)),
          1500
        );
      });
  };

  const today = todayStr();

  // 表示対象の判定:
  //   - 「トラッキング対象」= status 設定済 もしくは マネキン割当て1名以上
  //   - 「未来 or 今日まで」= end_date が today 以降 (会期が今日以降に終わる)
  //   - includePast=true なら past も含める
  const isTracked = (e: EventMannequin) =>
    e.mannequin_arrangement_status !== null || e.assignedCount > 0;
  const isUpcoming = (e: EventMannequin) => e.end_date >= today;

  const tracked = events.filter((e) => isTracked(e) && (includePast || isUpcoming(e)));
  const notDoneCount = events.filter(
    (e) =>
      isTracked(e) &&
      (includePast || isUpcoming(e)) &&
      e.mannequin_arrangement_status !== "完了" &&
      e.status !== "終了"
  ).length;
  const filtered =
    filter === "notDone"
      ? events.filter(
          (e) =>
            isTracked(e) &&
            (includePast || isUpcoming(e)) &&
            e.mannequin_arrangement_status !== "完了" &&
            e.status !== "終了"
        )
      : tracked;

  if (loading)
    return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">マネキンの手配 一覧</h1>
      <p className="text-sm text-muted-foreground">
        催事ごとのマネキン手配状況を一覧で管理します。
        <strong>日程表でマネキンを割り当て済みの催事は自動的に表示</strong>されます。
        ステータスを「未手配 → 確定 → 完了」の順で切り替えて進捗を管理してください。
        <br />
        <span className="text-xs">
          ※ 会期終了済の催事はデフォルトで非表示。確認したいときは「過去も見る」を ON にしてください。
        </span>
      </p>

      <div className="flex gap-2 flex-wrap items-center print:hidden">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          すべて ({tracked.length})
        </Button>
        <Button
          variant={filter === "notDone" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("notDone")}
        >
          未完了のみ ({notDoneCount})
        </Button>
        <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includePast}
            onChange={(e) => setIncludePast(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          過去も見る（会期終了済）
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>催事</TableHead>
                <TableHead>催事名</TableHead>
                <TableHead className="hidden md:table-cell">会期</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="whitespace-nowrap">割当マネキン</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const isPast = e.end_date < today;
                return (
                  <TableRow
                    key={e.id}
                    className={isPast ? "opacity-60" : ""}
                  >
                    <TableCell>
                      <Link
                        href={`/events/${e.id}`}
                        className="text-primary hover:underline text-sm font-medium"
                      >
                        {e.venue}
                        {e.store_name ? ` ${e.store_name}` : ""}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      {e.start_date} 〜 {e.end_date}
                      {isPast && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          （終了）
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <div className="flex gap-1">
                          {STATUS_OPTIONS.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className={`px-2 py-1 text-xs rounded border transition-colors ${
                                e.mannequin_arrangement_status === s
                                  ? "bg-green-700 text-white border-green-700 font-bold"
                                  : "bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700"
                              }`}
                              onClick={() =>
                                updateStatus(
                                  e.id,
                                  e.mannequin_arrangement_status === s ? null : s
                                )
                              }
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm">
                          {e.mannequin_arrangement_status || "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono">
                          {e.assignedCount}
                          <span className="text-[10px] text-muted-foreground ml-0.5">
                            名
                          </span>
                        </span>
                        {savedId === e.id && (
                          <span className="text-[10px] text-green-600 font-medium whitespace-nowrap animate-in fade-in">
                            ✓ 保存済み
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    {filter === "all"
                      ? includePast
                        ? "対象の催事がありません。日程表でマネキンを割り当てるか、催事詳細でマネキン手配ステータスを設定すると、ここに表示されます。"
                        : "今日以降に会期が残っている催事がありません。過去も含めて見たい場合は「過去も見る」を ON にしてください。"
                      : "該当する催事がありません"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
