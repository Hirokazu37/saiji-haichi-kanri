"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { ArrowLeft, Printer, Info, Save, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { renderRuby } from "@/lib/ruby";
import { PrintPortal } from "@/components/PrintPortal";

type Evt = { id: string; name: string | null; venue: string; store_name: string | null; start_date: string; end_date: string };
type BlockStyle = "lead" | "title" | "venue" | "normal" | "small";
type Block = { id: string; style: BlockStyle; label: string; text: string };

const STYLE_OPTIONS: { value: BlockStyle; label: string }[] = [
  { value: "lead", label: "見出し（囲み）" },
  { value: "title", label: "催事名（大）" },
  { value: "venue", label: "店名（中・太）" },
  { value: "normal", label: "通常" },
  { value: "small", label: "小・注記" },
];
const STYLE_CLASS: Record<BlockStyle, string> = { lead: "blk-lead", title: "blk-title", venue: "blk-venue", normal: "blk-normal", small: "blk-small" };

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `b${Math.random().toString(36).slice(2)}`;

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function periodFromDates(start: string, end: string): string {
  if (!start || !end) return "";
  const f = (ymd: string) => {
    const d = new Date(ymd + "T00:00:00");
    return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
  };
  return `${f(start)}〜${f(end)}`;
}

function defaultBlocks(evt: Evt | undefined): Block[] {
  const venue = evt ? `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}` : "";
  return [
    { id: newId(), style: "lead", label: "", text: "出店のご案内" },
    { id: newId(), style: "title", label: "", text: evt?.name ? `「${evt.name}」` : "" },
    { id: newId(), style: "normal", label: "期間", text: evt ? periodFromDates(evt.start_date, evt.end_date) : "" },
    { id: newId(), style: "normal", label: "会場", text: venue },
    { id: newId(), style: "small", label: "", text: "午前10時〜午後8時" },
  ];
}

export default function PostcardMessagePage() {
  const { role } = usePermission();
  const canEdit = role === "admin" || role === "viewer";
  const supabase = createClient();
  const [events, setEvents] = useState<Evt[]>([]);
  const [eventId, setEventId] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("events")
      .select("id, name, venue, store_name, start_date, end_date")
      .order("start_date", { ascending: false })
      .limit(400)
      .then(({ data }) => setEvents((data as Evt[]) || []));
  }, [supabase]);

  const eventItems: ComboboxItem[] = useMemo(
    () => events.map((e) => ({
      value: e.id,
      label: `${e.start_date.slice(0, 7)} ${e.venue}${e.store_name ? ` ${e.store_name}` : ""}`,
      group: e.start_date.slice(0, 4) + "年",
    })),
    [events]
  );

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      const evt = events.find((e) => e.id === eventId);
      const { data } = await supabase.from("event_postcards").select("*").eq("event_id", eventId).maybeSingle();
      if (cancelled) return;
      setSaved(false);
      if (data?.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
        setBlocks((data.blocks as Block[]).map((b) => ({ ...b, id: b.id || newId() })));
      } else if (data) {
        // 旧フォーマット（固定列）からブロックへ移行
        const venue = evt ? `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}` : "";
        setBlocks([
          { id: newId(), style: "lead", label: "", text: data.lead || "出店のご案内" },
          { id: newId(), style: "title", label: "", text: data.title || evt?.name || "" },
          { id: newId(), style: "venue", label: "", text: data.venue_label || venue },
          { id: newId(), style: "normal", label: "会期", text: data.period_text || "" },
          { id: newId(), style: "normal", label: "営業時間", text: data.hours || "" },
          ...(data.body ? [{ id: newId(), style: "normal" as BlockStyle, label: "", text: data.body }] : []),
        ]);
      } else {
        setBlocks(defaultBlocks(evt));
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, events, supabase]);

  const save = async () => {
    if (!eventId) return;
    const { error } = await supabase.from("event_postcards").upsert({ event_id: eventId, blocks }, { onConflict: "event_id" });
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };

  const update = (id: string, patch: Partial<Block>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const move = (idx: number, dir: -1 | 1) =>
    setBlocks((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  const remove = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));
  const add = () => setBlocks((prev) => [...prev, { id: newId(), style: "normal", label: "", text: "" }]);

  const renderPostcard = () => (
    <div className="pc-msg">
      <div className="pc-anno">
        {blocks.filter((b) => b.text.trim() || b.label.trim()).map((b) => (
          <div key={b.id} className={STYLE_CLASS[b.style]}>
            {b.label.trim() && <span className="blk-label">{b.label} </span>}
            {renderRuby(b.text)}
          </div>
        ))}
      </div>
    </div>
  );

  if (!canEdit) return <p className="text-sm text-muted-foreground">この機能を使う権限がありません。</p>;

  return (
    <div className="space-y-4 pb-8">
      <style>{`
        /* 上半分は宛名用に空け、案内文面はカード下部の赤枠に中央寄せ */
        .pc-msg { box-sizing: border-box; height: 100%; padding: 0 7mm 16mm; display: flex; flex-direction: column; justify-content: flex-end; color: #1a1a1a; }
        .pc-anno { border: 1.2pt solid #cc0000; padding: 5mm 4mm 4mm; display: flex; flex-direction: column; align-items: center; gap: 2.5mm; text-align: center; }
        .pc-anno > * { max-width: 100%; }
        .blk-lead { border: 1pt solid #222; padding: 1.5mm 7mm; font-size: 13pt; letter-spacing: 3px; }
        .blk-title { font-size: 15pt; font-weight: 700; line-height: 1.3; }
        .blk-venue { font-size: 12pt; font-weight: 700; line-height: 1.4; }
        .blk-normal { font-size: 12pt; line-height: 1.5; }
        .blk-small { font-size: 9pt; line-height: 1.4; }
        .blk-label { }
        .pc-msg ruby rt { font-size: 0.5em; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pc-print { display: block !important; margin: 0; }
          .pc-sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; }
          .pc-sheet > .pc-cell { border: 0.3pt dashed #ccc; overflow: hidden; box-sizing: border-box; }
        }
        .pc-print { display: none; }
      `}</style>

      {/* 画面UI */}
      <div className="print:hidden space-y-4">
        <Link href="/dm" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />DMハガキ一覧へ
        </Link>
        <h1 className="text-2xl font-bold">DMはがき 文面の作成・印刷</h1>

        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
          <div>
            行を自由に足して、↑↓で並べ替え、改行もできます。ラベル（「会期」→「日程」など）も書き換え可能です。
            <span className="block mt-0.5">ルビは <span className="font-mono bg-white px-1 rounded">｜漢字《かんじ》</span> の形で入力。空欄の行は印刷されません。</span>
          </div>
        </div>

        <div className="max-w-md">
          <Label className="text-xs mb-1 block">対象の催事</Label>
          <Combobox items={eventItems} value={eventId} onChange={setEventId} allowCustom={false} placeholder="催事を選択" searchPlaceholder="会場名などで検索" />
        </div>

        {eventId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ブロック編集 */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                {blocks.map((b, i) => (
                  <div key={b.id} className="rounded-md border p-2.5 space-y-2 bg-muted/20">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={b.style}
                        onChange={(e) => update(b.id, { style: e.target.value as BlockStyle })}
                        className="h-8 rounded-md border border-input bg-white px-2 text-xs flex-1"
                      >
                        {STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} title="上へ"><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title="下へ"><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(b.id)} title="削除"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <Input
                      value={b.label}
                      onChange={(e) => update(b.id, { label: e.target.value })}
                      placeholder="ラベル（任意・例: 会期／日程）"
                      className="h-8 text-sm"
                    />
                    <Textarea
                      value={b.text}
                      onChange={(e) => update(b.id, { text: e.target.value })}
                      rows={2}
                      placeholder="本文（改行可・ルビ可）"
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" />行を追加</Button>
                <div className="flex items-center gap-2 pt-1 border-t mt-1">
                  <Button onClick={save}><Save className="h-4 w-4 mr-1" />保存</Button>
                  {saved && <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>}
                  <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />4面印刷</Button>
                </div>
              </CardContent>
            </Card>

            {/* プレビュー（1枚） */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">プレビュー（はがき1枚）</Label>
              <div className="border rounded-md bg-white shadow-sm mx-auto" style={{ width: "105mm", height: "148.5mm" }}>
                {renderPostcard()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 印刷（4面・全て同じ文面）— body直下にポータルで出す */}
      {eventId && (
        <PrintPortal>
          <div className="pc-print">
            <div className="pc-sheet">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="pc-cell">{renderPostcard()}</div>
              ))}
            </div>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}
