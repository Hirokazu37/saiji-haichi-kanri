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
  const [years, setYears] = useState("3");
  const [scope, setScope] = useState<"all" | "venue">("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<ResultRow[] | null>(null);

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

  const run = async () => {
    setRunning(true); setError(""); setResults(null);
    try {
      const n = Math.max(0, Number(years) || 0);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - n);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      // 1. 対象顧客
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
        customers = await fetchAll<Customer>(
          (from, to) => supabase.from("customers").select("*").order("customer_no").range(from, to),
          (cnt) => setProgress(`顧客を取得中… ${cnt.toLocaleString()}人`)
        );
      }

      // 2. 来場記録（催事情報つき）
      setProgress("来場記録を取得中…");
      const visits = await fetchAll<VisitRow>((from, to) =>
        supabase
          .from("event_visits")
          .select("customer_id, event_id, visited_on, events(start_date, venue, store_name)")
          .range(from, to)
      );

      // 区分の催事のみで判定する場合:
      //   ① DMハガキ画面で「この催事のDM名簿」としてひも付けた催事を優先（正確）
      //   ② ひも付けがまだ無ければ、区分の百貨店名で会場一致にフォールバック
      let scopedVisits = visits;
      if (selectedSeg && scope === "venue") {
        const { data: links } = await supabase
          .from("event_dm_segments")
          .select("event_id")
          .eq("kbn_no", selectedSeg.kbn_no)
          .eq("code", selectedSeg.code);
        const linkedIds = new Set(((links as { event_id: string }[]) || []).map((l) => l.event_id));
        if (linkedIds.size > 0) {
          scopedVisits = visits.filter((v) => linkedIds.has(v.event_id));
        } else if (selectedSeg.venue_id) {
          const { data: venue } = await supabase
            .from("venue_master")
            .select("venue_name, store_name")
            .eq("id", selectedSeg.venue_id)
            .single();
          if (venue) {
            scopedVisits = visits.filter(
              (v) =>
                v.events &&
                v.events.venue === venue.venue_name &&
                (v.events.store_name || "") === (venue.store_name || "")
            );
          }
        }
      }

      // 3. 顧客ごとの最終来場日
      const lastByCustomer = new Map<string, string>();
      for (const v of scopedVisits) {
        const d = v.visited_on || v.events?.start_date;
        if (!d) continue;
        const cur = lastByCustomer.get(v.customer_id);
        if (!cur || d > cur) lastByCustomer.set(v.customer_id, d);
      }

      // 4. 抽出: 最終来場が cutoff より前、または記録なし
      const rows: ResultRow[] = customers
        .map((c) => ({ ...c, lastVisit: lastByCustomer.get(c.id) || null }))
        .filter((c) => !c.lastVisit || c.lastVisit < cutoffStr)
        .sort((a, b) => a.customer_no.localeCompare(b.customer_no, "ja", { numeric: true }));

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
            </div>
            <div className="space-y-1.5">
              <Label>来場の数え方</Label>
              <Select
                value={scope}
                onValueChange={(v) => setScope((v as "all" | "venue") || "all")}
                disabled={!selectedSeg}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {scope === "all" ? "どの催事への来場も数える" : "この区分のDMを出した催事だけ数える"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">どの催事への来場も数える</SelectItem>
                  <SelectItem value="venue">この区分のDMを出した催事だけ数える</SelectItem>
                </SelectContent>
              </Select>
              {!selectedSeg ? (
                <div className="text-[11px] text-muted-foreground">
                  区分を選ぶと区分単位の判定が選べます
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  DMハガキ画面で催事に区分をひも付けるとより正確になります
                </div>
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
                <span className="text-sm text-muted-foreground ml-2">
                  （{selectedSeg ? selectedSeg.segment_name : "全顧客"} ／ {years}年以上来場なし）
                </span>
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
