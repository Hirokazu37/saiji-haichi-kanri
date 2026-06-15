"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Play, Info } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { segKey, type Customer, type SegmentMaster } from "./types";

const ALL = "__all__";

type VisitRow = {
  customer_id: string;
  event_id: string;
  visited_on: string | null;
  events: { start_date: string; venue: string; store_name: string | null } | null;
};

type ResultRow = Customer & { lastVisit: string | null };

/** Supabaseの1000件制限を超えて全件取得する */
async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  onProgress?: (n: number) => void
): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await query(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data as T[]) || [];
    out.push(...rows);
    onProgress?.(out.length);
    if (rows.length < page) break;
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size));
  return r;
}

type Props = { segments: SegmentMaster[] };

export function ExtractTab({ segments }: Props) {
  const supabase = createClient() as SupabaseClient;
  const [segValue, setSegValue] = useState(ALL); // "kbn-code" or ALL
  // 判定方式: years=N年以上来場なし / recent=この店の直近N回の催事すべてに来場なし
  const [mode, setMode] = useState<"years" | "recent">("recent");
  const [years, setYears] = useState("3");
  const [recentN, setRecentN] = useState("3");
  const [scope, setScope] = useState<"all" | "venue">("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [resultNote, setResultNote] = useState("");

  const segItems: ComboboxItem[] = useMemo(
    () => [
      { value: ALL, label: "すべての顧客" },
      ...segments.map((s) => ({
        value: segKey(s.kbn_no, s.code),
        label: s.segment_name,
        group: `区分${s.kbn_no}`,
        sublabel: `${s.kbn_no}-${s.code}`,
      })),
    ],
    [segments]
  );

  const selectedSeg = useMemo(
    () => segments.find((s) => segKey(s.kbn_no, s.code) === segValue) || null,
    [segments, segValue]
  );

  /** 選択中の区分(店)に紐づく催事IDを返す（DMひも付け優先、無ければ会場名一致） */
  const fetchStoreEventIds = async (): Promise<Set<string> | null> => {
    if (!selectedSeg) return null;
    const { data: links } = await supabase
      .from("event_dm_segments")
      .select("event_id")
      .eq("kbn_no", selectedSeg.kbn_no)
      .eq("code", selectedSeg.code);
    const linkedIds = ((links as { event_id: string }[]) || []).map((l) => l.event_id);
    if (linkedIds.length > 0) return new Set(linkedIds);
    if (selectedSeg.venue_id) {
      const { data: venue } = await supabase
        .from("venue_master")
        .select("venue_name, store_name")
        .eq("id", selectedSeg.venue_id)
        .single();
      if (venue) {
        const { data } = await supabase
          .from("events")
          .select("id, venue, store_name")
          .eq("venue", venue.venue_name);
        const ids = ((data as { id: string; venue: string; store_name: string | null }[]) || [])
          .filter((e) => (e.store_name || "") === (venue.store_name || ""))
          .map((e) => e.id);
        return new Set(ids);
      }
    }
    return new Set();
  };

  const run = async () => {
    setRunning(true); setError(""); setResults(null); setResultNote("");
    try {
      const today = new Date().toISOString().slice(0, 10);

      // 1. 対象顧客（送付対象＝状態が「有効」の人のみ。宛先不明・削除候補は除外）
      let customers: Customer[] = [];
      if (selectedSeg) {
        setProgress("区分の顧客を取得中…");
        const segRows = await fetchAll<{ customer_id: string }>((from, to) =>
          supabase
            .from("customer_segments")
            .select("customer_id")
            .eq("kbn_no", selectedSeg.kbn_no)
            .eq("code", selectedSeg.code)
            .range(from, to)
        );
        const ids = segRows.map((r) => r.customer_id);
        for (const part of chunk(ids, 300)) {
          const { data, error: selErr } = await supabase
            .from("customers")
            .select("*")
            .in("id", part);
          if (selErr) throw new Error(selErr.message);
          customers.push(...((data as Customer[]) || []));
          setProgress(`区分の顧客を取得中… ${customers.length.toLocaleString()}人`);
        }
      } else {
        if (mode === "recent") {
          setError("「直近◯回」での抽出は、対象のDM区分（百貨店）を選んでください。");
          setRunning(false); setProgress("");
          return;
        }
        customers = await fetchAll<Customer>(
          (from, to) => supabase.from("customers").select("*").order("customer_no").range(from, to),
          (cnt) => setProgress(`顧客を取得中… ${cnt.toLocaleString()}人`)
        );
      }
      customers = customers.filter((c) => c.status === "有効");

      // 2. 来場記録
      setProgress("来場記録を取得中…");
      const visits = await fetchAll<VisitRow>((from, to) =>
        supabase
          .from("event_visits")
          .select("customer_id, event_id, visited_on, events(start_date, venue, store_name)")
          .range(from, to)
      );

      let rows: ResultRow[];

      if (mode === "recent") {
        // この店の催事を新しい順に N 件取り、そのすべてに来場が無い顧客を抽出
        const n = Math.max(1, Number(recentN) || 1);
        setProgress("この店の催事を取得中…");
        const storeIds = await fetchStoreEventIds();
        // この店の催事を events から取得（来場が0回の催事も対象に含めるため）
        const allStoreEvents: { id: string; start_date: string }[] = [];
        if (storeIds && storeIds.size > 0) {
          for (const part of chunk(Array.from(storeIds), 300)) {
            const { data } = await supabase.from("events").select("id, start_date").in("id", part);
            allStoreEvents.push(...((data as { id: string; start_date: string }[]) || []));
          }
        }
        const recent = allStoreEvents
          .filter((e) => e.start_date <= today)
          .sort((a, b) => b.start_date.localeCompare(a.start_date))
          .slice(0, n);
        const recentIds = new Set(recent.map((e) => e.id));
        const visitedRecent = new Set(
          visits.filter((v) => recentIds.has(v.event_id)).map((v) => v.customer_id)
        );
        // 表示用の最終来場日（この店の催事への）
        const lastByCustomer = new Map<string, string>();
        for (const v of visits) {
          if (!storeIds || !storeIds.has(v.event_id)) continue;
          const d = v.visited_on || v.events?.start_date;
          if (!d) continue;
          const cur = lastByCustomer.get(v.customer_id);
          if (!cur || d > cur) lastByCustomer.set(v.customer_id, d);
        }
        rows = customers
          .map((c) => ({ ...c, lastVisit: lastByCustomer.get(c.id) || null }))
          .filter((c) => !visitedRecent.has(c.id))
          .sort((a, b) => a.customer_no.localeCompare(b.customer_no, "ja", { numeric: true }));
        setResultNote(
          `${selectedSeg?.segment_name} の直近${recent.length}回の催事すべてに来場なし` +
          (recent.length < n ? `（この店の催事はまだ${recent.length}回ぶんしか記録がありません）` : "")
        );
      } else {
        // N年以上来場なし
        const yrs = Math.max(0, Number(years) || 0);
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - yrs);
        const cutoffStr = cutoff.toISOString().slice(0, 10);

        let scopedVisits = visits;
        if (selectedSeg && scope === "venue") {
          const storeIds = await fetchStoreEventIds();
          if (storeIds) scopedVisits = visits.filter((v) => storeIds.has(v.event_id));
        }
        const lastByCustomer = new Map<string, string>();
        for (const v of scopedVisits) {
          const d = v.visited_on || v.events?.start_date;
          if (!d) continue;
          const cur = lastByCustomer.get(v.customer_id);
          if (!cur || d > cur) lastByCustomer.set(v.customer_id, d);
        }
        rows = customers
          .map((c) => ({ ...c, lastVisit: lastByCustomer.get(c.id) || null }))
          .filter((c) => !c.lastVisit || c.lastVisit < cutoffStr)
          .sort((a, b) => a.customer_no.localeCompare(b.customer_no, "ja", { numeric: true }));
        setResultNote(`${selectedSeg ? selectedSeg.segment_name : "全顧客"} ／ ${yrs}年以上来場なし`);
      }

      setResults(rows);
      setProgress("");
    } catch (e) {
      setError(`抽出中にエラーが発生しました: ${e instanceof Error ? e.message : String(e)}`);
      setProgress("");
    } finally {
      setRunning(false);
    }
  };

  const handleDownload = () => {
    if (!results) return;
    const today = new Date().toISOString().slice(0, 10);
    const header = ["顧客番号", "氏名", "カナ", "最終来場日", "区分"];
    const segLabel = selectedSeg ? `${selectedSeg.kbn_no}-${selectedSeg.code} ${selectedSeg.segment_name}` : "全顧客";
    downloadCsv(
      `来場なし抽出_${segLabel.replace(/[\\/:*?"<>| ]/g, "_")}_${today}.csv`,
      [header, ...results.map((r) => [r.customer_no, r.name, r.kana, r.lastVisit ?? "記録なし", segLabel])]
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-blue-800 text-xs">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              来場記録はこのアプリで登録した分（来場登録タブ）から蓄積されます。
              使い始めの時期は「記録なし」の人が多く出るため、過去の丸付け台帳と突き合わせてご利用ください。
              出力したCSVは産直くん11側の一括更新（DM対象から外す処理）に使えます。
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>対象のDM区分（百貨店）</Label>
              <Combobox
                items={segItems}
                value={segValue}
                onChange={(v) => setSegValue(v || ALL)}
                allowCustom={false}
                searchPlaceholder="百貨店名で検索"
              />
            </div>
            <div className="space-y-1.5">
              <Label>判定方式</Label>
              <Select value={mode} onValueChange={(v) => setMode((v as "years" | "recent") || "recent")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {mode === "recent" ? "直近◯回の催事すべてに来場なし" : "◯年以上来場なし"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">直近◯回の催事すべてに来場なし（店の頻度に対応）</SelectItem>
                  <SelectItem value="years">◯年以上来場なし</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground">
                {mode === "recent"
                  ? "年複数回の店は短期間、年1回の店は長期間で自然に判定されます（区分の選択が必要）"
                  : "全店共通の年数で判定します"}
              </div>
            </div>
            <div className="space-y-1.5">
              {mode === "recent" ? (
                <>
                  <Label>来場なしの回数</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={recentN}
                      onChange={(e) => setRecentN(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm">回連続（この店の直近の催事）</span>
                  </div>
                </>
              ) : (
                <>
                  <Label>来場がない期間</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      value={years}
                      onChange={(e) => setYears(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm">年以上（記録なしも含む）</span>
                  </div>
                  {selectedSeg && (
                    <Select
                      value={scope}
                      onValueChange={(v) => setScope((v as "all" | "venue") || "all")}
                    >
                      <SelectTrigger className="w-full mt-1">
                        <SelectValue>
                          {scope === "all" ? "どの催事への来場も数える" : "この区分の催事だけ数える"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">どの催事への来場も数える</SelectItem>
                        <SelectItem value="venue">この区分の催事だけ数える</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={running}>
              <Play className="h-4 w-4 mr-1" />
              {running ? "抽出中…" : "抽出する"}
            </Button>
            {progress && <span className="text-sm text-primary">{progress}</span>}
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </CardContent>
      </Card>

      {results !== null && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className="flex-1 font-medium">
                抽出結果: <span className="text-lg">{results.length.toLocaleString()}</span> 人
                {resultNote && (
                  <span className="text-sm text-muted-foreground ml-2">（{resultNote}）</span>
                )}
              </div>
              <Button variant="outline" onClick={handleDownload} disabled={results.length === 0}>
                <Download className="h-4 w-4 mr-1" />
                CSVダウンロード
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>番号</TableHead>
                  <TableHead>氏名</TableHead>
                  <TableHead className="hidden md:table-cell">カナ</TableHead>
                  <TableHead>最終来場</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.slice(0, 200).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.customer_no}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{r.kana || "—"}</TableCell>
                    <TableCell className="text-xs">{r.lastVisit || <span className="text-muted-foreground">記録なし</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {results.length > 200 && (
              <div className="text-xs text-muted-foreground">
                先頭200件を表示しています。全{results.length.toLocaleString()}件はCSVでダウンロードしてください。
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
