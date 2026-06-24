"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, Info, Save, ArrowUp, ArrowDown, Trash2, Plus, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { renderRuby } from "@/lib/ruby";
import { PrintPortal } from "@/components/PrintPortal";

type Evt = { id: string; name: string | null; venue: string; store_name: string | null; start_date: string; end_date: string };
type Align = "left" | "center" | "right";
type Space = "wide" | "normal" | "tight";
type Block = { id: string; style: string; align: Align; space: Space; label: string; text: string };

const SPACE_OPTIONS: { value: Space; name: string }[] = [
  { value: "wide", name: "ひろめ" },
  { value: "normal", name: "標準" },
  { value: "tight", name: "つめる" },
];
const SPACE_MARGIN: Record<Space, string> = { wide: "3mm 0", normal: "1.2mm 0", tight: "0.2mm 0" };
const normSpace = (v: unknown): Space => (v === "wide" || v === "tight" ? v : "normal");

type VPos = "top" | "center" | "bottom";
const VPOS_OPTIONS: { value: VPos; name: string }[] = [
  { value: "top", name: "上" },
  { value: "center", name: "中央" },
  { value: "bottom", name: "下（宛名の下）" },
];
const VPOS_JUSTIFY: Record<VPos, string> = { top: "flex-start", center: "center", bottom: "flex-end" };
const normVPos = (v: unknown): VPos => (v === "center" || v === "bottom" ? v : "top");

// 見た目（サイズ・太さ）基準のスタイル。fs=ポイント
type StyleDef = { value: string; name: string; fs: number; fw: number; color?: string; boxed?: boolean };
const STYLES: StyleDef[] = [
  { value: "box", name: "囲み（タイトル枠）", fs: 13, fw: 600, boxed: true },
  { value: "xl", name: "特大・太字", fs: 16, fw: 800 },
  { value: "lg", name: "大・太字", fs: 13.5, fw: 700 },
  { value: "md", name: "中", fs: 12.5, fw: 600 },
  { value: "normal", name: "標準", fs: 12, fw: 400 },
  { value: "sm", name: "小・注記", fs: 9.5, fw: 400, color: "#555" },
];
const STYLE_MAP: Record<string, StyleDef> = Object.fromEntries(STYLES.map((s) => [s.value, s]));
// 旧スタイル名 → 新スタイル
const MIGRATE: Record<string, string> = { lead: "box", title: "xl", venue: "lg", normal: "normal", small: "sm" };
const normStyle = (v: string) => (STYLE_MAP[v] ? v : MIGRATE[v] || "normal");

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

function spanStyle(s: StyleDef): React.CSSProperties {
  return {
    fontSize: `${s.fs}pt`,
    fontWeight: s.fw,
    color: s.color,
    lineHeight: 1.5,
    letterSpacing: s.boxed ? "3px" : undefined,
    ...(s.boxed ? { display: "inline-block", border: "1pt solid #222", padding: "1.5mm 7mm" } : {}),
  };
}

function defaultBlocks(evt: Evt | undefined): Block[] {
  const venue = evt ? `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}` : "";
  return [
    { id: newId(), style: "box", align: "center", space: "normal", label: "", text: "出店のご案内" },
    { id: newId(), style: "xl", align: "center", space: "normal", label: "", text: evt?.name ? `「${evt.name}」` : "" },
    { id: newId(), style: "normal", align: "center", space: "normal", label: "期間", text: evt ? periodFromDates(evt.start_date, evt.end_date) : "" },
    { id: newId(), style: "normal", align: "center", space: "normal", label: "会場", text: venue },
    { id: newId(), style: "sm", align: "center", space: "normal", label: "", text: "午前10時〜午後8時" },
  ];
}

export default function PostcardMessagePage() {
  const { role } = usePermission();
  const canEdit = role === "admin" || role === "viewer";
  const supabase = createClient();
  const [events, setEvents] = useState<Evt[]>([]);
  const [eventId, setEventId] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [vpos, setVpos] = useState<VPos>("top");
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
      setVpos(normVPos(data?.vpos));
      if (data?.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
        setBlocks((data.blocks as Block[]).map((b) => ({
          id: b.id || newId(),
          style: normStyle(b.style),
          align: (b.align as Align) || "center",
          space: normSpace(b.space),
          label: b.label || "",
          text: b.text || "",
        })));
      } else if (data) {
        const venue = evt ? `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}` : "";
        setBlocks([
          { id: newId(), style: "box", align: "center", space: "normal", label: "", text: data.lead || "出店のご案内" },
          { id: newId(), style: "xl", align: "center", space: "normal", label: "", text: data.title || evt?.name || "" },
          { id: newId(), style: "normal", align: "center", space: "normal", label: "期間", text: data.period_text || "" },
          { id: newId(), style: "normal", align: "center", space: "normal", label: "会場", text: data.venue_label || venue },
          { id: newId(), style: "sm", align: "center", space: "normal", label: "", text: data.hours || "" },
          ...(data.body ? [{ id: newId(), style: "normal", align: "center" as Align, space: "normal" as Space, label: "", text: data.body }] : []),
        ]);
      } else {
        setBlocks(defaultBlocks(evt));
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, events, supabase]);

  const save = async () => {
    if (!eventId) return;
    const { error } = await supabase.from("event_postcards").upsert({ event_id: eventId, blocks, vpos }, { onConflict: "event_id" });
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
  const add = () => setBlocks((prev) => [...prev, { id: newId(), style: "normal", align: "center", space: "normal", label: "", text: "" }]);

  const renderPostcard = () => (
    <div className="pc-msg" style={{ justifyContent: VPOS_JUSTIFY[vpos] }}>
      <div className="pc-anno">
        {blocks.filter((b) => b.text.trim() || b.label.trim()).map((b) => {
          const s = STYLE_MAP[normStyle(b.style)];
          return (
            <div key={b.id} style={{ textAlign: b.align, margin: SPACE_MARGIN[normSpace(b.space)] }}>
              <span style={spanStyle(s)}>
                {b.label.trim() && <span>{b.label} </span>}
                {renderRuby(b.text)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };

  if (!canEdit) return <p className="text-sm text-muted-foreground">この機能を使う権限がありません。</p>;

  return (
    <div className="space-y-4 pb-8">
      <style>{`
        /* 案内文面（赤枠）。縦位置は vpos で切替（上/中央/下） */
        .pc-msg { box-sizing: border-box; height: 100%; padding: 9mm 7mm; display: flex; flex-direction: column; color: #1a1a1a; }
        .pc-anno { border: 1.2pt solid #cc0000; padding: 5mm 4mm 4mm; }
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
            各行で見た目（サイズ・太さ）と<span className="font-semibold">左/中央/右の揃え</span>を選べます。↑↓で並べ替え、改行も自由です。
            <span className="block mt-0.5">ルビは <span className="font-mono bg-white px-1 rounded">｜漢字《かんじ》</span> の形で入力。空欄の行は印刷されません。</span>
          </div>
        </div>

        <div className="max-w-md">
          <Label className="text-xs mb-1 block">対象の催事</Label>
          <Combobox items={eventItems} value={eventId} onChange={setEventId} allowCustom={false} placeholder="催事を選択" searchPlaceholder="会場名などで検索" />
        </div>

        {eventId && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">文面の縦位置</Label>
            <Select value={vpos} onValueChange={(v) => v && setVpos(v as VPos)}>
              <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue>{VPOS_OPTIONS.find((o) => o.value === vpos)?.name}</SelectValue></SelectTrigger>
              <SelectContent>
                {VPOS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {eventId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ブロック編集 */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                {blocks.map((b, i) => (
                  <div key={b.id} className="rounded-md border p-2.5 space-y-2 bg-muted/20">
                    {/* 1行目: スタイル選択 + 上下/削除 */}
                    <div className="flex items-center gap-1.5">
                      <Select value={normStyle(b.style)} onValueChange={(v) => v && update(b.id, { style: v })}>
                        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue>{STYLE_MAP[normStyle(b.style)]?.name}</SelectValue></SelectTrigger>
                        <SelectContent>
                          {STYLES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              <span style={{ fontSize: `${s.fs}pt`, fontWeight: s.fw, color: s.color }}>{s.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} title="上へ"><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title="下へ"><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(b.id)} title="削除"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    {/* 2行目: 揃え + ラベル */}
                    <div className="flex items-center gap-1.5">
                      <div className="inline-flex rounded-md border overflow-hidden shrink-0">
                        {(["left", "center", "right"] as Align[]).map((a) => {
                          const Icon = ALIGN_ICON[a];
                          return (
                            <button key={a} type="button" onClick={() => update(b.id, { align: a })} title={a === "left" ? "左寄せ" : a === "center" ? "中央寄せ" : "右寄せ"}
                              className={cn("h-8 w-9 flex items-center justify-center", b.align === a ? "bg-primary text-primary-foreground" : "bg-white hover:bg-muted")}>
                              <Icon className="h-4 w-4" />
                            </button>
                          );
                        })}
                      </div>
                      <Select value={normSpace(b.space)} onValueChange={(v) => v && update(b.id, { space: v as Space })}>
                        <SelectTrigger className="h-8 text-xs w-[88px] shrink-0"><SelectValue>{SPACE_OPTIONS.find((o) => o.value === normSpace(b.space))?.name}</SelectValue></SelectTrigger>
                        <SelectContent>
                          {SPACE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input value={b.label} onChange={(e) => update(b.id, { label: e.target.value })} placeholder="ラベル（任意）" className="h-8 text-sm flex-1" />
                    </div>
                    <Textarea value={b.text} onChange={(e) => update(b.id, { text: e.target.value })} rows={2} placeholder="本文（改行可・ルビ可）" />
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
