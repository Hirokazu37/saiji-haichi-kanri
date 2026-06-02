"use client";

/**
 * マネキンの手配 一覧 (進捗管理ページ)
 *
 * DMハガキ・備品の流れ・出店申込書 と同じスタイルで、
 * 催事ごとに 1 行で マネキン手配ステータスを管理する。
 *
 * ステータス: NULL / 未手配 / 確定 / 完了
 *  - NULL          → トラッキング対象外 (デフォルト)
 *  - 未手配/確定   → 未完了扱い
 *  - 完了          → 完了扱い
 *
 * 割当済みマネキン数は event_staff (person_type='mannequin') の件数で表示。
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

export default function MannequinArrangementsPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [events, setEvents] = useState<EventMannequin[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "notDone">("all");
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

  const toggleDone = (evtId: string, current: string | null) => {
    const next = current === "完了" ? "未手配" : "完了";
    setEvents((prev) =>
      prev.map((e) =>
        e.id === evtId ? { ...e, mannequin_arrangement_status: next } : e
      )
    );
    supabase
      .from("events")
      .update({ mannequin_arrangement_status: next })
      .eq("id", evtId)
      .then(() => {
        setSavedId(evtId);
        setTimeout(
          () => setSavedId((prev) => (prev === evtId ? null : prev)),
          1500
        );
      });
  };

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

  // 一覧に表示するのは「トラッキング対象（status が non-null）」のみ。
  // DMハガキ画面と同じ流儀: null = まだ追跡対象になっていない。
  const tracked = events.filter((e) => e.mannequin_arrangement_status !== null);
  const notDoneCount = events.filter(
    (e) =>
      e.mannequin_arrangement_status !== "完了" &&
      e.mannequin_arrangement_status !== null &&
      e.status !== "終了"
  ).length;
  const filtered =
    filter === "notDone"
      ? events.filter(
          (e) =>
            e.mannequin_arrangement_status !== "完了" &&
            e.mannequin_arrangement_status !== null &&
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
        催事詳細でステータスを設定するとここに表示されます。
        「未手配 → 確定 → 完了」の順で進捗を切り替えてください。
      </p>

      <div className="flex gap-2 flex-wrap print:hidden">
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
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>催事</TableHead>
                <TableHead>催事名</TableHead>
                <TableHead className="hidden md:table-cell">会期</TableHead>
                <TableHead>完了</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="whitespace-nowrap">割当マネキン</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const isDone = e.mannequin_arrangement_status === "完了";
                return (
                  <TableRow key={e.id}>
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
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                        <button
                          type="button"
                          className={`relative inline-flex h-6 w-24 items-center rounded-full transition-colors ${
                            isDone ? "bg-green-700" : "bg-gray-300"
                          }`}
                          onClick={() =>
                            toggleDone(e.id, e.mannequin_arrangement_status)
                          }
                        >
                          <span
                            className={`absolute text-[10px] font-medium ${
                              isDone
                                ? "left-2 text-white"
                                : "right-2 text-gray-600"
                            }`}
                          >
                            {isDone ? "完了" : "未完了"}
                          </span>
                          <span
                            className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                              isDone ? "translate-x-[72px]" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      ) : (
                        <span
                          className={`text-xs font-medium ${
                            isDone ? "text-green-700" : "text-gray-500"
                          }`}
                        >
                          {isDone ? "完了" : "未完了"}
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
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    {filter === "all"
                      ? "マネキン手配ステータスが登録された催事がありません。催事詳細でステータスを設定してください。"
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
