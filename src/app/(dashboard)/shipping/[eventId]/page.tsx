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

// ランクは「1日あたりの売上（日販・万円）」の規模
const RANKS = [
  { key: "A", label: "日販80〜100万" },
  { key: "B", label: "日販50〜80万" },
  { key: "C", label: "日販30〜50万" },
  { key: "D", label: "日販20〜30万" },
  { key: "E", label: "日販10〜20万" },
  { key: "F", label: "日販15万以下" },
];

// 日販（万円）からランクを提案
const suggestRank = (manPerDay: number): string =>
  manPerDay >= 80 ? "A" : manPerDay >= 50 ? "B" : manPerDay >= 30 ? "C" : manPerDay >= 20 ? "D" : manPerDay >= 15 ? "E" : "F";

// 会期日数（両端含む）
const eventDays = (start: string, end: string): number => {
  const ms = new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
};

// 配送に2日かかる地域（初回便は会期初日の2日前までに出荷）
const FAR_PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "沖縄県"];

const addDaysStr = (ymd: string, n: number) => {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// 出荷日の表示は「7/22(水)」形式（年なし・曜日つき）
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const fmtMD = (ymd: string) => {
  const d = new Date(ymd + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
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

  // 過去実績からの提案（平均日販・万円）。ランクは1日あたりの売上規模なので、
  // 各催事の売上を会期日数で割って日販に換算してから平均する。
  const suggestion = useMemo(() => {
    if (pastEvents.length === 0) return null;
    const dailies = pastEvents.map((p) => (p.revenue || 0) / eventDays(p.start_date, p.end_date) / 10000);
    const avgManPerDay = dailies.reduce((s, v) => s + v, 0) / dailies.length;
    return { avgManPerDay, rank: suggestRank(avgManPerDay) };
  }, [pastEvents]);

  // 印刷用: 紙の帳面と同じ「商品名ごとに1列」。規格（10枚入/5枚入など）は列の中で段にする
  const productGroups = useMemo(() => {
    const groups: { name: string; skus: Product[] }[] = [];
    for (const p of products) {
      const g = groups.find((x) => x.name === p.name);
      if (g) g.skus.push(p); else groups.push({ name: p.name, skus: [p] });
    }
    return groups;
  }, [products]);

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
                  この会場の過去実績（{pastEvents.length}回）の平均日販は <span className="font-bold">約{Math.round(suggestion.avgManPerDay)}万円/日</span> →
                  <span className="font-bold"> ランク{suggestion.rank} が目安</span>です（最終判断は担当者）。
                  <div className="text-xs mt-0.5 text-violet-700">
                    {pastEvents.map((p) => {
                      const days = eventDays(p.start_date, p.end_date);
                      return `${p.start_date.slice(0, 7)}: 計${Math.round((p.revenue || 0) / 10000)}万円（${days}日間・日販約${Math.round((p.revenue || 0) / days / 10000)}万円）`;
                    }).join(" ／ ")}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">この会場の過去売上データがまだ無いため自動提案はできません。似た規模の会場を参考にランクを選んでください。</p>
            )}
            <p className="text-xs text-muted-foreground">ランクを選ぶと標準数量が「初回」に入ります。会場の事情に合わせて数字を直してください。</p>
          </CardContent>
        </Card>

        {/* 数量グリッド（紙の帳面と同じ: 縦=便（日付）、横=商品名。規格は列内で段組み） */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="text-sm" style={{ minWidth: `${140 + productGroups.length * 96}px` }}>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-2 py-2 sticky left-0 bg-muted/50 min-w-[130px] z-10">便／出荷日</th>
                  {productGroups.map((g) => (
                    <th key={g.name} className="px-1 py-2 text-center min-w-[92px] text-xs whitespace-nowrap border-l">{g.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shipments.map((s, si) => (
                  <tr key={si} className="border-b align-top hover:bg-muted/10">
                    <td className="px-2 py-2 sticky left-0 bg-white z-10 space-y-1">
                      <div className="flex items-center gap-1">
                        <Input value={s.label} onChange={(e) => setShipMeta(si, { label: e.target.value })} disabled={!canWrite}
                          className="h-7 w-20 text-xs text-center font-bold bg-white" />
                        {si > 0 && canWrite && (
                          <button type="button" onClick={() => removeShipment(si)} className="text-muted-foreground hover:text-destructive" title="この便を削除">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {/* 表示は「7/22(水)」（年なし・曜日つき）。クリックでカレンダー選択 */}
                      <div className="relative h-7 w-24 rounded-md border border-input bg-white text-xs flex items-center justify-center">
                        {s.date ? <span className="font-medium">{fmtMD(s.date)}</span> : <span className="text-muted-foreground">出荷日</span>}
                        <input type="date" value={s.date} onChange={(e) => setShipMeta(si, { date: e.target.value })} disabled={!canWrite}
                          onClick={(e) => {
                            // 透明入力はクリックだけではカレンダーが開かないため、明示的に開く
                            const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                            try { el.showPicker?.(); } catch { /* フォーカスで代替 */ }
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer" title="出荷日を選ぶ" />
                      </div>
                    </td>
                    {productGroups.map((g) => (
                      <td key={g.name} className="px-1 py-1.5 border-l">
                        {g.skus.map((p) => (
                          <div key={p.id} className="flex items-center gap-1 mb-1 last:mb-0">
                            {g.skus.length > 1 && (
                              <span className="text-[9px] text-muted-foreground w-9 shrink-0 text-right leading-tight">{p.spec}</span>
                            )}
                            <Input value={s.items[p.id] || ""} onChange={(e) => setQty(si, p.id, e.target.value)} disabled={!canWrite}
                              className="h-7 text-center text-xs bg-white" title={`${p.name}${p.spec ? ` ${p.spec}` : ""}`} />
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
          {canWrite && (
            <div className="px-3 pb-3">
              <Button variant="outline" size="sm" onClick={addShipment} title="追加出荷の便（行）を足す">
                <Plus className="h-4 w-4 mr-1" />追加出荷の便を足す
              </Button>
            </div>
          )}
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
          {/* 紙の帳面と同じ: 商品名ごとに1列、規格（10枚入/5枚入・大/小など）は列の中で段にする */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #333", padding: "1mm", background: "#f1f5f9", width: "16mm" }}>便</th>
                {productGroups.map((g) => (
                  <th key={g.name} style={{ border: "1px solid #333", padding: "1mm 0.5mm", background: "#f1f5f9", fontWeight: 700, lineHeight: 1.2 }}>
                    {g.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shipments.map((s, si) => (
                <tr key={si}>
                  <td style={{ border: "1px solid #333", padding: "1mm", fontWeight: 700, whiteSpace: "nowrap", verticalAlign: "top" }}>
                    {s.label}
                    {s.date && <span style={{ display: "block", fontSize: "7pt", fontWeight: 400 }}>{fmtMD(s.date)}出荷</span>}
                  </td>
                  {productGroups.map((g) => (
                    <td key={g.name} style={{ border: "1px solid #333", padding: "1mm 0.5mm", textAlign: "center", verticalAlign: "top", minHeight: "10mm" }}>
                      {g.skus.map((p) => {
                        const v = s.items[p.id];
                        if (!v || !v.trim()) return null;
                        return (
                          <div key={p.id} style={{ lineHeight: 1.4, whiteSpace: "nowrap" }}>
                            {p.spec && <span style={{ fontSize: "6.5pt", color: "#555", marginRight: "0.8mm" }}>{p.spec}</span>}
                            <span style={{ fontSize: "10.5pt" }}>{v}</span>
                          </div>
                        );
                      })}
                    </td>
                  ))}
                </tr>
              ))}
              {/* 手書き追記用の予備行（紙運用のため空行を残す） */}
              {[0, 1, 2].map((i) => (
                <tr key={`blank-${i}`}>
                  <td style={{ border: "1px solid #333", height: "13mm" }} />
                  {productGroups.map((g) => (
                    <td key={g.name} style={{ border: "1px solid #333" }} />
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
