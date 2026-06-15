"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Info } from "lucide-react";
import { segKey, type SegmentMaster } from "./types";

type SummaryRow = { kbn_no: number; code: number; customer_count: number; visited_count: number };

type Props = {
  segments: SegmentMaster[];
  /** 店をクリックしたとき、その区分の顧客一覧へ遷移する */
  onOpenStore?: (kbn: number, code: number) => void;
};

/** 百貨店（DM区分）ごとの顧客数・来場・反応率サマリ */
export function SegmentSummaryTab({ segments, onOpenStore }: Props) {
  const supabase = createClient();
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"customers" | "rate">("customers");

  useEffect(() => {
    supabase
      .from("segment_customer_summary")
      .select("kbn_no, code, customer_count, visited_count")
      .then(({ data }) => {
        setRows((data as SummaryRow[]) || []);
        setLoading(false);
      });
  }, [supabase]);

  // 区分マスター（名前）と結合
  const segName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of segments) m.set(segKey(s.kbn_no, s.code), s.segment_name);
    return m;
  }, [segments]);

  const merged = useMemo(() => {
    const q = query.trim();
    const list = rows
      .map((r) => ({
        ...r,
        name: segName.get(segKey(r.kbn_no, r.code)) || `区分${r.kbn_no}-${r.code}`,
        rate: r.customer_count > 0 ? (r.visited_count / r.customer_count) * 100 : 0,
      }))
      .filter((r) => q === "" || r.name.includes(q) || `${r.kbn_no}-${r.code}`.includes(q));
    list.sort((a, b) =>
      sortKey === "customers" ? b.customer_count - a.customer_count : b.rate - a.rate
    );
    return list;
  }, [rows, segName, query, sortKey]);

  const totals = useMemo(() => {
    const customers = rows.reduce((s, r) => s + r.customer_count, 0);
    return { customers, stores: rows.length };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          「経由＝DM区分（送っている店）」で集計しています。<span className="font-semibold">顧客数</span>はその区分に登録された人数、
          <span className="font-semibold">来場あり</span>はそのうち（いずれかの催事に）来場実績がある人数です。
          ※同じ方が複数の区分に登録されている場合は、各区分でそれぞれ数えます（合計は実人数と一致しません）。
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="百貨店名・区分番号で検索"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>店数: {totals.stores}</span>
          <span>区分登録のべ: {totals.customers.toLocaleString()}件</span>
          <div className="inline-flex rounded-md border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setSortKey("customers")}
              className={`px-2 h-8 ${sortKey === "customers" ? "bg-primary text-primary-foreground font-bold" : "bg-white"}`}
            >顧客数順</button>
            <button
              type="button"
              onClick={() => setSortKey("rate")}
              className={`px-2 h-8 border-l ${sortKey === "rate" ? "bg-primary text-primary-foreground font-bold" : "bg-white"}`}
            >反応率順</button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* PC・タブレット: 表 */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">区分</TableHead>
                <TableHead>百貨店</TableHead>
                <TableHead className="text-right">顧客数</TableHead>
                <TableHead className="text-right">来場あり</TableHead>
                <TableHead className="text-right">反応率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">読み込み中…</TableCell></TableRow>
              )}
              {!loading && merged.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">データがありません</TableCell></TableRow>
              )}
              {!loading && merged.map((r) => (
                <TableRow
                  key={`${r.kbn_no}-${r.code}`}
                  className={onOpenStore ? "cursor-pointer" : ""}
                  onClick={onOpenStore ? () => onOpenStore(r.kbn_no, r.code) : undefined}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.kbn_no}-{r.code}</TableCell>
                  <TableCell className="font-medium">
                    {r.name}
                    {onOpenStore && <span className="ml-1 text-[10px] text-primary">顧客一覧 ›</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.customer_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.visited_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {r.customer_count > 0 ? `${r.rate.toFixed(1)}%` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* スマホ: カード */}
          <div className="md:hidden divide-y">
            {loading && <div className="text-center text-muted-foreground py-6 text-sm">読み込み中…</div>}
            {!loading && merged.length === 0 && (
              <div className="text-center text-muted-foreground py-6 text-sm">データがありません</div>
            )}
            {!loading && merged.map((r) => (
              <div
                key={`${r.kbn_no}-${r.code}`}
                className={`px-4 py-3 ${onOpenStore ? "active:bg-muted cursor-pointer" : ""}`}
                onClick={onOpenStore ? () => onOpenStore(r.kbn_no, r.code) : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">区分 {r.kbn_no}-{r.code}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">反応率 {r.customer_count > 0 ? `${r.rate.toFixed(1)}%` : "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      顧客 {r.customer_count.toLocaleString()} ／ 来場 {r.visited_count.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
