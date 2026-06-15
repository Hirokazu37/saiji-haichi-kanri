"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { Upload, Search, Info } from "lucide-react";
import Link from "next/link";
import { usePermission } from "@/hooks/usePermission";
import { CustomerImportDialog } from "./CustomerImportDialog";
import { segKey, statusColor, CUSTOMER_STATUSES, type Customer, type CustomerSegment, type SegmentMaster } from "./types";

type VisitWithEvent = {
  customer_id: string;
  visited_on: string | null;
  created_at: string;
  notes: string | null;
  events: { id: string; name: string | null; venue: string; store_name: string | null; start_date: string } | null;
};

const ALL = "__all__";
const CUSTOMER_FIELDS = "id, customer_no, name, kana, postal_code, address, phone, dm_active, notes, imported_at, status";
function chunk<T>(arr: T[], size: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size));
  return r;
}

type Props = {
  segments: SegmentMaster[];
  /** 区分(百貨店)フィルタ。"__all__" で全顧客、"kbn-code" でその区分 */
  segFilter: string;
  onSegFilterChange: (v: string) => void;
};

export function CustomerListTab({ segments, segFilter, onSegFilterChange }: Props) {
  // CSV取込も社員（viewer）が行う運用のため admin/viewer とも可
  const { role } = usePermission();
  const canImport = role === "admin" || role === "viewer";
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  // 区分フィルタ時の、その区分の顧客数（テキスト絞り込み前）
  const [segCount, setSegCount] = useState<number | null>(null);
  const [custSegs, setCustSegs] = useState<Map<string, CustomerSegment[]>>(new Map());
  const [visits, setVisits] = useState<Map<string, VisitWithEvent[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [detail, setDetail] = useState<Customer | null>(null);
  // 顧客メモ（「大量に買ってくださる」「送り常連」などの特記事項）の編集
  const [detailNotes, setDetailNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  // 並べ替え（ヘッダークリック）
  type SortKey = "no" | "name" | "store" | "kana" | "visits" | "last";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "no", dir: "asc" });
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const segNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of segments) m.set(segKey(s.kbn_no, s.code), s.segment_name);
    return m;
  }, [segments]);

  const fetchTotal = useCallback(async () => {
    const { count } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });
    setTotalCount(count ?? 0);
  }, [supabase]);

  const search = useCallback(async (q: string, seg: string) => {
    setLoading(true);
    const t = q.trim();
    let list: Customer[] = [];

    if (seg !== ALL) {
      // 区分(店)で絞り込み: その区分の顧客を全件取得して並べ替え可能にする
      const [kbnStr, codeStr] = seg.split("-");
      const kbn = Number(kbnStr), code = Number(codeStr);
      const ids: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase
          .from("customer_segments")
          .select("customer_id")
          .eq("kbn_no", kbn).eq("code", code)
          .range(from, from + 999);
        const part = (data as { customer_id: string }[]) || [];
        ids.push(...part.map((r) => r.customer_id));
        if (part.length < 1000) break;
      }
      setSegCount(ids.length);
      for (const cids of chunk(ids, 300)) {
        const { data } = await supabase.from("customers").select(CUSTOMER_FIELDS).in("id", cids);
        list.push(...((data as Customer[]) || []));
      }
      if (t !== "") {
        const tl = t.toLowerCase();
        list = list.filter(
          (c) =>
            c.customer_no.toLowerCase().includes(tl) ||
            (c.name || "").toLowerCase().includes(tl) ||
            (c.kana || "").toLowerCase().includes(tl)
        );
      }
      list.sort((a, b) => a.customer_no.localeCompare(b.customer_no, "ja", { numeric: true }));
    } else {
      // 全顧客: 重いので先頭100件 + テキスト検索
      setSegCount(null);
      let builder = supabase.from("customers").select(CUSTOMER_FIELDS).order("customer_no").limit(100);
      if (t !== "") {
        const esc = t.replace(/[%,]/g, "");
        builder = builder.or(`customer_no.ilike.%${esc}%,name.ilike.%${esc}%,kana.ilike.%${esc}%`);
      }
      const { data } = await builder;
      list = (data as Customer[]) || [];
    }
    setCustomers(list);

    // 表示分の区分・来場をまとめて取得（件数が多い区分でもチャンクで取得）
    if (list.length > 0) {
      const ids = list.map((c) => c.id);
      const sm = new Map<string, CustomerSegment[]>();
      const vm = new Map<string, VisitWithEvent[]>();
      for (const cids of chunk(ids, 300)) {
        const [segRes, visRes] = await Promise.all([
          supabase.from("customer_segments").select("customer_id, kbn_no, code").in("customer_id", cids),
          supabase
            .from("event_visits")
            .select("customer_id, visited_on, created_at, notes, events(id, name, venue, store_name, start_date)")
            .in("customer_id", cids),
        ]);
        for (const s of (segRes.data as CustomerSegment[]) || []) {
          if (!sm.has(s.customer_id)) sm.set(s.customer_id, []);
          sm.get(s.customer_id)!.push(s);
        }
        for (const v of (visRes.data as unknown as VisitWithEvent[]) || []) {
          if (!vm.has(v.customer_id)) vm.set(v.customer_id, []);
          vm.get(v.customer_id)!.push(v);
        }
      }
      for (const arr of vm.values()) {
        arr.sort((a, b) => (b.events?.start_date || "").localeCompare(a.events?.start_date || ""));
      }
      setCustSegs(sm);
      setVisits(vm);
    } else {
      setCustSegs(new Map());
      setVisits(new Map());
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTotal();
      search(query, segFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, segFilter, search, fetchTotal]);

  const openDetail = (c: Customer) => {
    setDetail(c);
    setDetailNotes(c.notes || "");
    setNotesSaved(false);
  };

  /** 顧客の状態（有効/宛先不明/削除候補）を変更。送付・抽出の対象から外す判断に使う */
  const saveStatus = async (status: string) => {
    if (!detail) return;
    const { error } = await supabase.from("customers").update({ status }).eq("id", detail.id);
    if (!error) {
      setCustomers((prev) => prev.map((c) => (c.id === detail.id ? { ...c, status } : c)));
      setDetail((prev) => (prev ? { ...prev, status } : prev));
    }
  };

  /** 顧客メモを保存（大量購入・送り常連などの特記事項。来場登録の確認画面に毎回表示される） */
  const saveCustomerNotes = async () => {
    if (!detail) return;
    const notes = detailNotes.trim() || null;
    const { error } = await supabase.from("customers").update({ notes }).eq("id", detail.id);
    if (!error) {
      setCustomers((prev) => prev.map((c) => (c.id === detail.id ? { ...c, notes } : c)));
      setDetail((prev) => (prev ? { ...prev, notes } : prev));
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    }
  };

  const lastVisitOf = (c: Customer): string | null => {
    const vs = visits.get(c.id);
    if (!vs || vs.length === 0) return null;
    return vs[0].visited_on || vs[0].events?.start_date || null;
  };

  /** 来場回数バッジ。3回以上は常連として★付き＆色を変える */
  const visitBadge = (count: number) => {
    if (count === 0) return <span className="text-muted-foreground text-sm">—</span>;
    const regular = count >= 3;
    return (
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${
          regular
            ? "bg-amber-100 text-amber-800 border border-amber-300"
            : "bg-blue-100 text-blue-800 border border-blue-200"
        }`}
        title={regular ? "常連（3回以上ご来場）" : undefined}
      >
        {regular && <span aria-hidden>★</span>}
        {count}回
      </span>
    );
  };

  const segBadges = (c: Customer) => {
    const segs = custSegs.get(c.id) || [];
    return segs.map((s) => (
      <Badge key={`${s.kbn_no}-${s.code}`} variant="secondary" className="text-[10px] whitespace-nowrap">
        {segNameMap.get(segKey(s.kbn_no, s.code)) || `区分${s.kbn_no}-${s.code}`}
      </Badge>
    ));
  };

  // 並べ替えを適用した表示用リスト（取得済みの最大100件を対象に並べ替え）
  const sortedCustomers = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const firstStore = (c: Customer) => {
      const segs = custSegs.get(c.id) || [];
      if (!segs.length) return "";
      return segNameMap.get(segKey(segs[0].kbn_no, segs[0].code)) || "";
    };
    const lastV = (c: Customer) => {
      const vs = visits.get(c.id);
      if (!vs || !vs.length) return "";
      return vs[0].visited_on || vs[0].events?.start_date || "";
    };
    return [...customers].sort((a, b) => {
      let r = 0;
      switch (sort.key) {
        case "no": r = a.customer_no.localeCompare(b.customer_no, "ja", { numeric: true }); break;
        case "name": r = (a.name || "").localeCompare(b.name || "", "ja"); break;
        case "kana": r = (a.kana || "").localeCompare(b.kana || "", "ja"); break;
        case "store": r = firstStore(a).localeCompare(firstStore(b), "ja"); break;
        case "visits": r = (visits.get(a.id)?.length ?? 0) - (visits.get(b.id)?.length ?? 0); break;
        case "last": r = lastV(a).localeCompare(lastV(b)); break;
      }
      return r * dir;
    });
  }, [customers, sort, visits, custSegs, segNameMap]);

  /** その顧客の所属百貨店名（DM区分名）の配列 */
  const storeNamesOf = (c: Customer): string[] =>
    (custSegs.get(c.id) || []).map((s) => segNameMap.get(segKey(s.kbn_no, s.code)) || `区分${s.kbn_no}-${s.code}`);

  /** 所属百貨店をコンパクトなバッジで（多い場合は先頭2件＋残り件数） */
  const storeBadges = (c: Customer) => {
    const names = storeNamesOf(c);
    if (names.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    const shown = names.slice(0, 2);
    return (
      <span className="flex flex-wrap gap-1 items-center" title={names.join("、")}>
        {shown.map((n, i) => (
          <span key={i} className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-sky-50 border border-sky-200 text-sky-800 whitespace-nowrap">
            {n}
          </span>
        ))}
        {names.length > 2 && <span className="text-[10px] text-muted-foreground">+{names.length - 2}</span>}
      </span>
    );
  };

  const segItems: ComboboxItem[] = [
    { value: ALL, label: "すべての顧客" },
    ...segments.map((s) => ({
      value: segKey(s.kbn_no, s.code),
      label: s.segment_name,
      group: `区分${s.kbn_no}`,
      sublabel: `${s.kbn_no}-${s.code}`,
    })),
  ];
  const selectedSegName = segFilter === ALL ? null : (segNameMap.get(segFilter) || segFilter);

  const renderSortHead = (k: SortKey, label: string, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground select-none"
      >
        {label}
        <span className="text-[10px] text-muted-foreground">
          {sort.key === k ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <Combobox
          items={segItems}
          value={segFilter}
          onChange={(v) => onSegFilterChange(v || ALL)}
          allowCustom={false}
          placeholder="百貨店（区分）で絞り込み"
          searchPlaceholder="百貨店名で検索"
          className="w-full md:w-64"
        />
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="顧客番号・氏名・カナで検索"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedSegName
              ? `${selectedSegName}: ${segCount === null ? "…" : segCount.toLocaleString()}人`
              : `登録顧客数: ${totalCount === null ? "…" : totalCount.toLocaleString()}人`}
          </span>
          {canImport && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              マスタ一括取込
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <div>
          名簿CSVの取込は、通常は{" "}
          <Link href="/dm" className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">
            「DMハガキ」画面
          </Link>
          {" "}の各催事の「名簿」ボタンから行ってください（催事にひも付き、来場の照合や反応率に使われます）。
          この画面の「マスタ一括取込」は補助用です（初回の一括登録／区分の付け直しなど）。
        </div>
      </div>

      {totalCount === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            まだ顧客が登録されていません。
            {canImport && "「DMハガキ」画面の各催事の「名簿」ボタンから名簿CSVを取り込むと、ここに顧客が登録されていきます。"}
          </CardContent>
        </Card>
      )}

      {(totalCount ?? 0) > 0 && (
        <Card>
          <CardContent className="p-0">
            {/* PC・タブレット: テーブル表示 */}
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  {renderSortHead("no", "番号")}
                  {renderSortHead("name", "氏名")}
                  {renderSortHead("store", "所属（百貨店）")}
                  {renderSortHead("kana", "カナ", "hidden lg:table-cell")}
                  {renderSortHead("visits", "来場")}
                  {renderSortHead("last", "最終来場", "hidden lg:table-cell")}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">読み込み中…</TableCell></TableRow>
                )}
                {!loading && customers.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">該当する顧客がいません</TableCell></TableRow>
                )}
                {!loading && sortedCustomers.map((c) => {
                  const last = lastVisitOf(c);
                  const count = visits.get(c.id)?.length ?? 0;
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => openDetail(c)}>
                      <TableCell className="font-mono text-xs">{c.customer_no}</TableCell>
                      <TableCell className="font-medium">
                        {c.name}
                        {c.status !== "有効" && (
                          <span className={`ml-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded-full border align-middle ${statusColor(c.status)}`}>{c.status}</span>
                        )}
                      </TableCell>
                      <TableCell>{storeBadges(c)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{c.kana || "—"}</TableCell>
                      <TableCell>{visitBadge(count)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs">{last || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* スマホ: カード表示 */}
            <div className="md:hidden divide-y">
              {loading && <div className="text-center text-muted-foreground py-6 text-sm">読み込み中…</div>}
              {!loading && customers.length === 0 && (
                <div className="text-center text-muted-foreground py-6 text-sm">該当する顧客がいません</div>
              )}
              {!loading && customers.map((c) => {
                const last = lastVisitOf(c);
                const count = visits.get(c.id)?.length ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openDetail(c)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-muted transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {c.name}
                        {c.status !== "有効" && (
                          <span className={`ml-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded-full border align-middle ${statusColor(c.status)}`}>{c.status}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        #{c.customer_no}{c.kana ? ` ／ ${c.kana}` : ""}
                      </div>
                      {storeNamesOf(c).length > 0 && (
                        <div className="mt-1">{storeBadges(c)}</div>
                      )}
                      {last && <div className="text-[11px] text-muted-foreground mt-0.5">最終来場 {last}</div>}
                    </div>
                    <div className="shrink-0">{visitBadge(count)}</div>
                  </button>
                );
              })}
            </div>

            {!loading && segFilter === ALL && customers.length === 100 && (
              <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                先頭100件を表示しています。百貨店（区分）で絞り込むと、その店の全件を並べ替えできます。
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 顧客詳細ダイアログ */}
      <Dialog open={detail !== null} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detail.name}
                  <span className="ml-2 font-mono text-sm text-muted-foreground">#{detail.customer_no}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-[5rem_1fr] gap-y-1.5">
                  <span className="text-muted-foreground">カナ</span><span>{detail.kana || "—"}</span>
                  <span className="text-muted-foreground">来場回数</span>
                  <span>{visitBadge(visits.get(detail.id)?.length ?? 0)}</span>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">
                    状態（宛先不明・削除候補はDM送付・抽出から除外されます）
                  </div>
                  {canImport ? (
                    <div className="flex gap-1.5 flex-wrap">
                      {CUSTOMER_STATUSES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => saveStatus(s)}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            detail.status === s ? statusColor(s) + " font-bold" : "bg-white text-muted-foreground border-input hover:bg-muted"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${statusColor(detail.status)}`}>{detail.status}</span>
                  )}
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">DM区分</div>
                  <div className="flex flex-wrap gap-1">
                    {(custSegs.get(detail.id) || []).length === 0
                      ? <span className="text-muted-foreground">—</span>
                      : segBadges(detail)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">
                    顧客メモ（大量購入・送り依頼などの特記事項。来場登録のときに毎回表示されます）
                  </div>
                  {canImport ? (
                    <div className="space-y-1.5">
                      <Textarea
                        value={detailNotes}
                        onChange={(e) => setDetailNotes(e.target.value)}
                        placeholder="例: 毎回大量に購入してくださる／ご自宅への発送を頼まれることが多い"
                        rows={2}
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={saveCustomerNotes}>メモを保存</Button>
                        {notesSaved && <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>}
                      </div>
                    </div>
                  ) : (
                    <div>{detail.notes || <span className="text-muted-foreground">—</span>}</div>
                  )}
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">来場履歴（DM持参の記録）</div>
                  {(visits.get(detail.id) || []).length === 0 ? (
                    <div className="text-muted-foreground">来場記録はまだありません</div>
                  ) : (
                    <ul className="space-y-1">
                      {(visits.get(detail.id) || []).map((v, i) => (
                        <li key={i}>
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-xs text-muted-foreground shrink-0">
                              {v.visited_on || v.events?.start_date || "—"}
                            </span>
                            <span>
                              {v.events ? `${v.events.venue}${v.events.store_name ? ` ${v.events.store_name}` : ""}` : "（削除された催事）"}
                            </span>
                          </div>
                          {v.notes && (
                            <div className="ml-6 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 mt-0.5 inline-block">
                              {v.notes}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CustomerImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => { fetchTotal(); search(query, segFilter); }}
        segments={segments}
      />
    </div>
  );
}
