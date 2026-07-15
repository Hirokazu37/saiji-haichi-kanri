"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PrintPortal } from "@/components/PrintPortal";
import { usePermission } from "@/hooks/usePermission";
import { ArrowLeft, Printer, Save, Plus, Trash2, Truck, Settings, Sparkles } from "lucide-react";

type Evt = { id: string; name: string | null; venue: string; store_name: string | null; prefecture: string | null; start_date: string; end_date: string; revenue: number | null };
type Product = { id: string; name: string; spec: string; sort_order: number; is_active: boolean };
type Standard = { rank_key: string; product_id: string; qty: string };
type Shipment = { label: string; date: string; memo: string; items: Record<string, string> };

const RANKS = [
  { key: "A", label: "80〜100万" },
  { key: "B", label: "50〜80万" },
  { key: "C", label: "30〜50万" },
  { key: "D", label: "20〜30万" },
  { key: "E", label: "10〜20万" },
  { key: "F", label: "15万以下" },
];

// 予想売上（万円）からランクを提案
const suggestRank = (man: number): string =>
  man >= 80 ? "A" : man >= 50 ? "B" : man >= 30 ? "C" : man >= 20 ? "D" : man >= 15 ? "E" : "F";

// 配送に2日かかる地域（初回便は会期初日の2日前までに出荷）
const FAR_PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "沖縄県"];

const addDaysStr = (ymd: string, n: number) => {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function ShippingSheetPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { role } = usePermission();
  const canWrite = role === "admin" || role === "viewer";
  const supabase = createClient();

  const [evt, setEvt] = useState<Evt | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [pastEvents, setPastEvents] = useState<Evt[]>([]);
  const [rankKey, setRankKey] = useState<string>("");
  const [shipments, setShipments] = useState<Shipment[]>([{ label: "初回", date: "", memo: "", items: {} }]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const fetchData = useCallback(async () => {
    const [evRes, prodRes, stdRes, sheetRes] = await Promise.all([
      supabase.from("events").select("id, name, venue, store_name, prefecture, start_date, end_date, revenue").eq("id", eventId).single(),
      supabase.from("shipment_products").select("*").order("sort_order"),
      supabase.from("shipment_standards").select("rank_key, product_id, qty"),
      supabase.from("event_shipment_sheets").select("rank_key, shipments, notes").eq("event_id", eventId).maybeSingle(),
    ]);
    const e = evRes.data as Evt | null;
    setEvt(e);
    setProducts(((prodRes.data as Product[]) || []).filter((p) => p.is_active));
    setStandards((stdRes.data as Standard[]) || []);
    const sheet = sheetRes.data as { rank_key: string | null; shipments: Shipment[]; notes: string | null } | null;
    if (sheet) {
      setRankKey(sheet.rank_key || "");
      setShipments(Array.isArray(sheet.shipments) && sheet.shipments.length > 0 ? sheet.shipments : [{ label: "初回", date: "", memo: "", items: {} }]);
      setNotes(sheet.notes || "");
    }
    // 同じ会場の過去催事（売上あり）＝ランク提案の材料
    if (e) {
      const { data: past } = await supabase
        .from("events")
        .select("id, name, venue, store_name, prefecture, start_date, end_date, revenue")
        .eq("venue", e.venue)
        .order("start_date", { ascending: false })
        .limit(12);
      setPastEvents(((past as Evt[]) || []).filter((p) => p.id !== e.id && (p.store_name || "") === (e.store_name || "") && p.end_date < e.start_date && p.revenue != null && p.revenue > 0).slice(0, 3));
    }
    setLoading(false);
  }, [supabase, eventId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stdMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of standards) m.set(`${s.rank_key}|${s.product_id}`, s.qty);
    return m;
  }, [standards]);

  // 過去実績からの提案（平均・万円）
  const suggestion = useMemo(() => {
    if (pastEvents.length === 0) return null;
    const avgMan = pastEvents.reduce((s, p) => s + (p.revenue || 0), 0) / pastEvents.length / 10000;
    return { avgMan, rank: suggestRank(avgMan) };
  }, [pastEvents]);

  /** ランクの標準数量を初回便へ反映 */
  const applyStandards = (rk: string) => {
    setShipments((prev) => {
      const first = prev[0] || { label: "初回", date: "", memo: "", items: {} };
      const items: Record<string, string> = {};
      for (const p of products) items[p.id] = stdMap.get(`${rk}|${p.id}`) || "";
      return [{ ...first, items }, ...prev.slice(1)];
    });
  };

  const pickRank = (rk: string) => {
    setRankKey(rk);
    const hasQty = Object.values(shipments[0]?.items || {}).some((v) => v && v.trim() !== "");
    if (!hasQty || window.confirm(`初回便の数量をランク${rk}の標準数量で入れ直しますか？（手で直した数字は上書きされます）`)) {
      applyStandards(rk);
    }
  };

  const setQty = (si: number, productId: string, v: string) =>
    setShipments((prev) => prev.map((s, i) => (i === si ? { ...s, items: { ...s.items, [productId]: v } } : s)));
  const setShipMeta = (si: number, patch: Partial<Shipment>) =>
    setShipments((prev) => prev.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const addShipment = () => setShipments((prev) => [...prev, { label: `追加${prev.length}`, date: "", memo: "", items: {} }]);
  const removeShipment = (si: number) => {
    if (!window.confirm(`「${shipments[si].label}」の便を削除しますか？`)) return;
    setShipments((prev) => prev.filter((_, i) => i !== si));
  };

  const save = async () => {
    const { error } = await supabase
      .from("event_shipment_sheets")
      .upsert({ event_id: eventId, rank_key: rankKey || null, shipments, notes: notes.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "event_id" });
    if (error) { alert(`保存に失敗しました。\n${error.message}\n※「relation does not exist」の場合は migration 052 を実行してください。`); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const printSheet = () => {
    document.body.classList.add("pp-ship");
    window.print();
    document.body.classList.remove("pp-ship");
  };

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;
  if (!evt) return <p className="text-muted-foreground">催事が見つかりません。</p>;

  const venueLabel = `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}`;
  const isFar = evt.prefecture ? FAR_PREFS.includes(evt.prefecture) : false;
  const rankLabel = RANKS.find((r) => r.key === rankKey)?.label || "";

  return (
    <div className="space-y-4 pb-8">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .ship-print { display: none; }
          body.pp-ship .ship-print { display: block !important; }
        }
        .ship-print { display: none; }
      `}</style>

      {/* 画面UI */}
      <div className="print:hidden space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <Link href={`/events/${evt.id}`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />催事詳細へ戻る
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
              <Truck className="h-6 w-6" />出荷帳面：{venueLabel}
            </h1>
            <p className="text-sm text-muted-foreground">{evt.name || ""}　{evt.start_date} 〜 {evt.end_date}{evt.prefecture ? `（${evt.prefecture}）` : ""}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {role === "admin" && (
              <Link href="/shipping/master" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <Settings className="h-4 w-4 mr-1" />標準数量マスター
              </Link>
            )}
            <Button variant="outline" size="sm" onClick={printSheet}><Printer className="h-4 w-4 mr-1" />印刷（紙で工場へ）</Button>
            {canWrite && <Button size="sm" onClick={save}><Save className="h-4 w-4 mr-1" />保存</Button>}
            {saved && <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>}
          </div>
        </div>

        {/* 配送リードタイム警告 */}
        {isFar && (
          <div className="rounded-md border-2 border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
            🚚 <span className="font-bold">{evt.prefecture}は配送に2日かかります。</span>
            初回便は会期初日の<span className="font-bold">2日前（{addDaysStr(evt.start_date, -2)}）までに出荷</span>してください。追加出荷も2日前出荷で計画を。
          </div>
        )}

        {/* ランク選択（過去実績の提案つき） */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold">売上規模ランク：</span>
              <div className="inline-flex rounded-lg border-2 overflow-hidden">
                {RANKS.map((r) => (
                  <button key={r.key} type="button" onClick={() => canWrite && pickRank(r.key)}
                    className={`h-10 px-3 text-sm font-bold transition-colors ${rankKey === r.key ? "bg-primary text-primary-foreground" : "bg-white text-gray-500 hover:bg-muted"}`}
                    title={r.label}>
                    {r.key}<span className="block text-[9px] font-normal leading-none">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {suggestion ? (
              <div className="flex items-start gap-2 rounded-md bg-violet-50 border border-violet-200 px-3 py-2 text-sm text-violet-900">
                <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-violet-600" />
                <div>
                  この会場の過去実績（{pastEvents.length}回）の平均は <span className="font-bold">約{Math.round(suggestion.avgMan)}万円</span> →
                  <span className="font-bold"> ランク{suggestion.rank} が目安</span>です（最終判断は担当者）。
                  <div className="text-xs mt-0.5 text-violet-700">
                    {pastEvents.map((p) => `${p.start_date.slice(0, 7)}: ${Math.round((p.revenue || 0) / 10000)}万円`).join(" ／ ")}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">この会場の過去売上データがまだ無いため自動提案はできません。似た規模の会場を参考にランクを選んでください。</p>
            )}
            <p className="text-xs text-muted-foreground">ランクを選ぶと標準数量が「初回」に入ります。会場の事情に合わせて数字を直してください。</p>
          </CardContent>
        </Card>

        {/* 数量グリッド（行=商品、列=便） */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 sticky left-0 bg-muted/50 min-w-[150px]">商品</th>
                  {shipments.map((s, si) => (
                    <th key={si} className="px-2 py-1.5 min-w-[110px]">
                      <div className="flex items-center justify-center gap-1">
                        <Input value={s.label} onChange={(e) => setShipMeta(si, { label: e.target.value })} disabled={!canWrite}
                          className="h-7 w-20 text-xs text-center font-bold bg-white" />
                        {si > 0 && canWrite && (
                          <button type="button" onClick={() => removeShipment(si)} className="text-muted-foreground hover:text-destructive" title="この便を削除">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <Input type="date" value={s.date} onChange={(e) => setShipMeta(si, { date: e.target.value })} disabled={!canWrite}
                        className="h-7 mt-1 text-[10px] bg-white" title="出荷日" />
                    </th>
                  ))}
                  {canWrite && (
                    <th className="px-2">
                      <Button variant="outline" size="sm" onClick={addShipment} title="追加出荷の便を足す">
                        <Plus className="h-4 w-4" />便
                      </Button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-3 py-1 sticky left-0 bg-white font-medium whitespace-nowrap">
                      {p.name}{p.spec && <span className="ml-1 text-[10px] text-muted-foreground">{p.spec}</span>}
                    </td>
                    {shipments.map((s, si) => (
                      <td key={si} className="px-2 py-1">
                        <Input value={s.items[p.id] || ""} onChange={(e) => setQty(si, p.id, e.target.value)} disabled={!canWrite}
                          className="h-8 text-center bg-white" />
                      </td>
                    ))}
                    {canWrite && <td />}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="max-w-2xl">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canWrite} rows={2}
            placeholder="メモ（会場の事情・注意点など。印刷にも載ります）" />
        </div>
      </div>

      {/* 印刷（現行の帳面と同じ横型・商品が列） */}
      <PrintPortal>
        <div className="ship-print">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #333", paddingBottom: "2mm", marginBottom: "2mm" }}>
            <div style={{ fontSize: "14pt", fontWeight: 700 }}>
              出荷帳面　{venueLabel}{evt.name ? `　「${evt.name}」` : ""}
            </div>
            <div style={{ fontSize: "10pt" }}>
              会期 {evt.start_date} 〜 {evt.end_date}　／　ランク {rankKey || "—"}{rankLabel ? `（${rankLabel}）` : ""}
            </div>
          </div>
          {isFar && (
            <div style={{ fontSize: "9pt", color: "#b45309", marginBottom: "1.5mm" }}>
              🚚 {evt.prefecture}：配送2日。初回便は {addDaysStr(evt.start_date, -2)} までに出荷。
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #333", padding: "1mm", background: "#f1f5f9", width: "22mm" }}>便</th>
                {products.map((p) => (
                  <th key={p.id} style={{ border: "1px solid #333", padding: "0.5mm", background: "#f1f5f9", fontWeight: 600, lineHeight: 1.2 }}>
                    {p.name}{p.spec ? <span style={{ display: "block", fontSize: "6.5pt", fontWeight: 400 }}>{p.spec}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shipments.map((s, si) => (
                <tr key={si}>
                  <td style={{ border: "1px solid #333", padding: "1mm", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {s.label}
                    {s.date && <span style={{ display: "block", fontSize: "7pt", fontWeight: 400 }}>{s.date.slice(5).replace("-", "/")}出荷</span>}
                  </td>
                  {products.map((p) => (
                    <td key={p.id} style={{ border: "1px solid #333", padding: "1mm", textAlign: "center", fontSize: "10pt" }}>
                      {s.items[p.id] || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {notes && <div style={{ marginTop: "2mm", fontSize: "9pt" }}>メモ：{notes}</div>}
          <div style={{ marginTop: "2mm", fontSize: "7pt", color: "#666" }}>印刷日時 {new Date().toLocaleString("ja-JP")}　催事手配管理システム</div>
        </div>
      </PrintPortal>
    </div>
  );
}
