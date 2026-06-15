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

import { useEffect, useState, useCallback, Fragment } from "react";
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

// 手配不要 は「社員だけで行く催事」用のオプトアウト状態。
// 完了と同様、未完了リストからは除外する。
const STATUS_OPTIONS = ["未手配", "確定", "完了", "手配不要"] as const;
/** 未完了として扱わない (TODOリストから外す) ステータス */
const DONE_STATUSES = new Set<string>(["完了", "手配不要"]);

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
    // マネキン割当を 2 つのテーブルから合算する:
    //   - event_staff: 個人マネキン (person_type='mannequin' で 1 行 = 1 名)
    //   - mannequins:  会社+人数枠の手配 (headcount に人数が入る)
    //                  ※ こちらが旧来からの手配データの本流
    const [evtRes, staffRes, mannRes] = await Promise.all([
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
      supabase.from("mannequins").select("event_id, headcount"),
    ]);

    const countByEvent = new Map<string, number>();
    // event_staff: 1 行 = 1 名
    (staffRes.data ?? []).forEach((row: { event_id: string }) => {
      countByEvent.set(row.event_id, (countByEvent.get(row.event_id) ?? 0) + 1);
    });
    // mannequins: headcount を加算 (会社+人数枠を含む)
    (mannRes.data ?? []).forEach(
      (row: { event_id: string; headcount: number | null }) => {
        const n = row.headcount ?? 1;
        countByEvent.set(row.event_id, (countByEvent.get(row.event_id) ?? 0) + n);
      }
    );

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
  //   - 今日以降の会期 (end_date >= today) の催事は ステータス未設定 / マネキン未割当 でも表示
  //     (=「これから手配が必要な催事」のチェックリストとして使えるように)
  //   - includePast=true なら過去会期も含める
  const isUpcoming = (e: EventMannequin) => e.end_date >= today;
  const inScope = (e: EventMannequin) => includePast || isUpcoming(e);

  const isPending = (e: EventMannequin) =>
    !DONE_STATUSES.has(e.mannequin_arrangement_status ?? "") && e.status !== "終了";

  const tracked = events.filter(inScope);
  const notDoneCount = events.filter((e) => inScope(e) && isPending(e)).length;
  const filtered =
    filter === "notDone"
      ? events.filter((e) => inScope(e) && isPending(e))
      : tracked;

  if (loading)
    return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">マネキンの手配 一覧</h1>
      <p className="text-sm text-muted-foreground">
        <strong>今日以降に会期がある催事をすべて一覧表示</strong>します。
        マネキン手配の抜け漏れチェックリストとして使ってください。
        ステータスを「未手配 → 確定 → 完了」の順で切り替えて進捗を管理します。
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
        <CardContent className="p-0 overflow-x-auto">
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
                        <div className="flex gap-1 items-center">
                          {STATUS_OPTIONS.map((s, i) => {
                            const isSelected = e.mannequin_arrangement_status === s;
                            const isOptOut = s === "手配不要";
                            // 進捗フロー (未手配/確定/完了) は緑、オプトアウト (手配不要) はグレー
                            const activeClass = isOptOut
                              ? "bg-gray-500 text-white border-gray-500 font-bold"
                              : "bg-green-700 text-white border-green-700 font-bold";
                            const inactiveClass = isOptOut
                              ? "bg-white text-gray-400 border-gray-300 hover:bg-gray-100 hover:text-gray-700"
                              : "bg-white text-gray-500 border-gray-300 hover:bg-green-50 hover:text-green-700";
                            // 進捗3ボタンとオプトアウト (手配不要) の間に縦線で区切り
                            const showDivider = i === STATUS_OPTIONS.length - 1;
                            return (
                              <Fragment key={s}>
                                {showDivider && (
                                  <span className="mx-1 text-gray-300">|</span>
                                )}
                                <button
                                  type="button"
                                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                                    isSelected ? activeClass : inactiveClass
                                  }`}
                                  onClick={() =>
                                    updateStatus(
                                      e.id,
                                      isSelected ? null : s
                                    )
                                  }
                                  title={
                                    isOptOut
                                      ? "社員のみで対応する催事 (マネキン不要)"
                                      : undefined
                                  }
                                >
                                  {s}
                                </button>
                              </Fragment>
                            );
                          })}
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
                        ? "催事が登録されていません。"
                        : "今日以降に会期が残っている催事がありません。過去も含めて見たい場合は「過去も見る」を ON にしてください。"
                      : "未完了の催事はありません"}
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
