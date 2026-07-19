"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/usePermission";
import { ArrowLeft, Plus, Save, Truck } from "lucide-react";

type Product = { id: string; name: string; spec: string; sort_order: number; is_active: boolean };
type Standard = { rank_key: string; product_id: string; qty: string };

// ランクは「1日あたりの売上（日販・万円）」の規模
const RANKS = [
  { key: "A", label: "日販80〜100万" },
  { key: "B", label: "日販50〜80万" },
  { key: "C", label: "日販30〜50万" },
  { key: "D", label: "日販20〜30万" },
  { key: "E", label: "日販10〜20万" },
  { key: "F", label: "日販15万以下" },
];

export default function ShippingMasterPage() {
  const { canEdit } = usePermission();
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  // "rank|productId" -> qty
  const [std, setStd] = useState<Map<string, string>>(new Map());
  const [dirtyStd, setDirtyStd] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchData = useCallback(async () => {
    const [prodRes, stdRes] = await Promise.all([
      supabase.from("shipment_products").select("*").order("sort_order"),
      supabase.from("shipment_standards").select("rank_key, product_id, qty"),
    ]);
    setProducts((prodRes.data as Product[]) || []);
    const m = new Map<string, string>();
    for (const s of ((stdRes.data as Standard[]) || [])) m.set(`${s.rank_key}|${s.product_id}`, s.qty);
    setStd(m);
    setDirtyStd(new Set());
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setQty = (rank: string, productId: string, v: string) => {
    const key = `${rank}|${productId}`;
    setStd((prev) => new Map(prev).set(key, v));
    setDirtyStd((prev) => new Set(prev).add(key));
  };

  const updateProduct = async (id: string, patch: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from("shipment_products").update(patch).eq("id", id);
    if (error) { alert(`商品の更新に失敗しました。\n${error.message}`); fetchData(); }
  };

  // 名前・規格の編集: 入力中はローカルだけ更新し、欄を離れたときに保存する
  const setProdLocal = (id: string, patch: Partial<Product>) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const persistProduct = async (id: string, patch: Partial<Product>) => {
    const { error } = await supabase.from("shipment_products").update(patch).eq("id", id);
    if (error) {
      alert(`保存に失敗しました。\n${error.message}\n※同じ「商品名＋規格」の組み合わせが既にあると保存できません。`);
      fetchData();
    }
  };

  const addProduct = async () => {
    const name = window.prompt("商品名を入力してください（例: 季節の天ぷら）");
    if (!name || !name.trim()) return;
    const spec = window.prompt("規格があれば入力（例: 5枚入。無ければ空でOK）") || "";
    const maxSort = products.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { error } = await supabase.from("shipment_products").insert({ name: name.trim(), spec: spec.trim(), sort_order: maxSort + 1 });
    if (error) { alert(`追加に失敗しました。\n${error.message}`); return; }
    fetchData();
  };

  const saveStandards = async () => {
    if (dirtyStd.size === 0) { setSaved(true); setTimeout(() => setSaved(false), 1500); return; }
    setSaving(true);
    try {
      const rows = Array.from(dirtyStd).map((key) => {
        const [rank_key, product_id] = key.split("|");
        return { rank_key, product_id, qty: std.get(key) || "" };
      });
      const { error } = await supabase.from("shipment_standards").upsert(rows, { onConflict: "rank_key,product_id" });
      if (error) { alert(`保存に失敗しました。\n${error.message}`); return; }
      setDirtyStd(new Set());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const moveProduct = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= products.length) return;
    const a = products[idx], b = products[j];
    setProducts((prev) => {
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    await Promise.all([
      supabase.from("shipment_products").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("shipment_products").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
  };

  const activeFirst = useMemo(() => products, [products]);

  if (loading) return <p className="text-muted-foreground">読み込み中...</p>;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />日程表へ
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
            <Truck className="h-6 w-6" />出荷 標準数量マスター
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            売上規模ランク（A〜F）ごとの標準出荷数。出荷帳面で「ランクを選ぶと初回便に自動で入る」数字です。
            数量は「15K」「45×4」のような表記もそのまま使えます。
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addProduct}><Plus className="h-4 w-4 mr-1" />商品を追加</Button>
            <Button size="sm" onClick={saveStandards} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />{saving ? "保存中..." : `数量を保存${dirtyStd.size ? `（${dirtyStd.size}）` : ""}`}
            </Button>
            {saved && <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 sticky left-0 bg-muted/50 min-w-[170px]">商品（規格）</th>
                {RANKS.map((r) => (
                  <th key={r.key} className="px-2 py-2 text-center min-w-[80px]">
                    {r.key}<span className="block text-[9px] font-normal text-muted-foreground">{r.label}</span>
                  </th>
                ))}
                {canEdit && <th className="px-2 py-2 text-center min-w-[130px]">並び / 使用</th>}
              </tr>
            </thead>
            <tbody>
              {activeFirst.map((p, idx) => (
                <tr key={p.id} className={`border-b last:border-b-0 ${p.is_active ? "" : "opacity-45"}`}>
                  <td className="px-2 py-1 sticky left-0 bg-white whitespace-nowrap">
                    {canEdit ? (
                      <div className="flex items-center gap-1">
                        <Input value={p.name} onChange={(e) => setProdLocal(p.id, { name: e.target.value })}
                          onBlur={(e) => persistProduct(p.id, { name: e.target.value.trim() })}
                          className="h-7 w-32 text-sm font-medium" title="商品名（書き換えて欄の外をクリックで保存）" />
                        <Input value={p.spec} onChange={(e) => setProdLocal(p.id, { spec: e.target.value })}
                          onBlur={(e) => persistProduct(p.id, { spec: e.target.value.trim() })}
                          placeholder="規格" className="h-7 w-16 text-xs" title="規格（10枚入/大/2入など。空でもOK）" />
                      </div>
                    ) : (
                      <>
                        <span className="font-medium">{p.name}</span>
                        {p.spec && <span className="ml-1 text-[10px] text-muted-foreground">{p.spec}</span>}
                      </>
                    )}
                  </td>
                  {RANKS.map((r) => {
                    const key = `${r.key}|${p.id}`;
                    return (
                      <td key={r.key} className="px-1.5 py-1">
                        <Input value={std.get(key) || ""} onChange={(e) => setQty(r.key, p.id, e.target.value)} disabled={!canEdit}
                          className={`h-8 text-center bg-white ${dirtyStd.has(key) ? "border-amber-400 bg-amber-50" : ""}`} />
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className="px-2 py-1 text-center whitespace-nowrap">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveProduct(idx, -1)} disabled={idx === 0}>↑</Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveProduct(idx, 1)} disabled={idx === products.length - 1}>↓</Button>
                      <button type="button" onClick={() => updateProduct(p.id, { is_active: !p.is_active })}
                        className={`ml-1 px-2 py-0.5 text-[10px] rounded border ${p.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-300"}`}
                        title="使用中/休止を切り替え（休止すると出荷帳面に出なくなります。削除はしません）">
                        {p.is_active ? "使用中" : "休止"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        ※ <span className="font-medium">商品名・規格はそのまま書き換えて、欄の外をクリックすると保存</span>されます。
        並び順は「↑↓」ボタンで変更（例：5枚入を上にしたいなら、その行の↑を押す。帳面の列・段の順に反映されます）。<br />
        ※ 商品が増えたら「商品を追加」。売らなくなった商品は「休止」にすると帳面から消えます（過去の帳面は残ります）。
      </p>
    </div>
  );
}
