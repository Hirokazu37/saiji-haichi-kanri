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
import { ArrowLeft, Printer, Info, Save, ArrowUp, ArrowDown, Trash2, Plus, AlignLeft, AlignCenter, AlignRight, Mail, FileText } from "lucide-react";
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
  { value: "top", name: "上寄せ" },
  { value: "center", name: "中央" },
  { value: "bottom", name: "下寄せ" },
];
const VPOS_JUSTIFY: Record<VPos, string> = { top: "flex-start", center: "center", bottom: "flex-end" };
const normVPos = (v: unknown): VPos => (v === "center" || v === "bottom" ? v : "top");

// 裏面（ビジュアル面）の種別。画像は public/dm に同梱
type Kind = "jisshin" | "sokubai";
const KIND_OPTIONS: { value: Kind; name: string }[] = [
  { value: "jisshin", name: "実演" },
  { value: "sokubai", name: "即売" },
];
const URA_SRC: Record<Kind, string> = { jisshin: "/dm/ura-jisshin.jpg", sokubai: "/dm/ura-sokubai.jpg" };
const OMOTE_SRC = "/dm/omote.jpg";

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
  const [kind, setKind] = useState<Kind>("sokubai");
  const [saved, setSaved] = useState(false);

  const printWith = (cls: string) => {
    document.body.classList.add(cls);
    window.print();
    document.body.classList.remove(cls);
  };

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

  // 校正依頼に使う催事情報
  const proofInfo = () => {
    const ev = events.find((e) => e.id === eventId);
    const venue = ev ? `${ev.venue}${ev.store_name ? ` ${ev.store_name}` : ""}` : "";
    const title = (blocks.find((b) => normStyle(b.style) === "xl")?.text || ev?.name || "").replace(/[「」]/g, "");
    const period = ev ? periodFromDates(ev.start_date, ev.end_date) : "";
    return { venue, title, period };
  };

  const sendMail = () => {
    const { venue, title, period } = proofInfo();
    const subject = `DMハガキ校正のお願い（${venue}${title ? ` / ${title}` : ""}）`;
    const body =
      `いつもお世話になっております。安岡蒲鉾でございます。\n\n` +
      `下記催事のDMハガキにつきまして、校正をお願いいたします。\n` +
      `　会場：${venue}\n` +
      (title ? `　催事名：${title}\n` : "") +
      (period ? `　会期：${period}\n` : "") +
      `\n校正用PDFを添付いたしますので、ご確認のほどよろしくお願いいたします。\n\n` +
      `------------------------------\n` +
      `有限会社 安岡蒲鉾店\n〒798-1133 愛媛県宇和島市三間町中野中293番地\n` +
      `TEL 0895-58-2155 / FAX 0895-58-2706 / フリーダイヤル 0120-58-7771`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const downloadFax = () => {
    const { venue, title, period } = proofInfo();
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    const recipient = venue ? `${venue}　御中` : "○○　様";
    const eventBullet = venue || title || period
      ? `<p>・催事：${venue}${title ? ` ${title}` : ""}${period ? `（${period}）` : ""}</p>`
      : "";
    const html =
      `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>ＦＡＸ送信のご案内</title></head>` +
      `<body style="font-family:'Yu Gothic','游ゴシック','ＭＳ Ｐゴシック',sans-serif; font-size:11pt; line-height:1.9;">` +
      `<h2 style="text-align:center; letter-spacing:6px; margin-bottom:18pt;">ＦＡＸ送信のご案内</h2>` +
      `<p>発信日　${dateStr}</p>` +
      `<p>発信元　　　有限会社　安岡蒲鉾店<br>` +
      `　　　　　　本社工場　愛媛県宇和島市三間町中野中293番地<br>` +
      `　　　　　　ＴＥＬ　0895-58-2155<br>` +
      `　　　　　　ＦＡＸ　0895-58-2706</p>` +
      `<p style="font-size:13pt; margin-top:14pt;">${recipient}</p>` +
      `<p>発信枚数　　　　　　枚　（　本紙含む　・　本紙含まず　）</p>` +
      `<p>ＤＭハガキの原稿を送信いたしますので、ご校正のほどよろしくお願いいたします。</p>` +
      `<p style="text-align:center; margin:12pt 0;">記</p>` +
      `<p>この度は大変お世話になっております。<br>` +
      `下記のとおり、ＤＭハガキの原稿（校正用）を送信いたしますので、ご確認のうえ、ご校正くださいますようお願い申し上げます。<br>` +
      `お気づきの点やご修正のご指示がございましたら、ご連絡いただきますようお願いいたします。</p>` +
      `<p>■ＤＭハガキ　原稿校正のお願い</p>` +
      `<p>・ＤＭハガキ原稿（校正用）　　１部</p>` +
      eventBullet +
      `<p style="text-align:right; margin-top:8pt;">以上</p>` +
      `</body></html>`;
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DM校正依頼_${venue || "FAX送信状"}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const renderPostcard = () => (
    <div className="pc-msg">
      <div className="pc-anno" style={{ justifyContent: VPOS_JUSTIFY[vpos] }}>
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
        /* 案内文面ボックス: 横98mm×縦42mm、下から25mm。縦位置(vpos)は枠内の寄せ */
        .pc-msg { box-sizing: border-box; position: absolute; inset: 0; color: #1a1a1a; }
        .pc-anno { position: absolute; left: 0; right: 0; bottom: 25mm; margin: 0 auto; width: 98mm; height: 42mm; padding: 2mm 3mm; box-sizing: border-box; display: flex; flex-direction: column; }
        .pc-msg ruby rt { font-size: 0.5em; }
        /* はがき台紙（校正で背景画像を敷く） */
        .hagaki { position: relative; overflow: hidden; background: #fff; }
        .hagaki > img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pc-print { display: none !important; }
          body.pp-4 .pc-print-4 { display: block !important; }
          body.pp-proof .pc-print-proof { display: block !important; }
          .pc-sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; }
          .pc-sheet > .pc-cell { position: relative; background: #fff; border: 0.3pt dashed #ccc; overflow: hidden; box-sizing: border-box; }
          /* 校正: 単票・両面をA4縦に横並び（おもて左／裏面右） */
          .proof-stack { width: 210mm; display: flex; justify-content: center; gap: 5mm; padding-top: 8mm; }
          .proof-card { width: 100mm; height: 148mm; }
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0">枠内の縦寄せ</Label>
              <Select value={vpos} onValueChange={(v) => v && setVpos(v as VPos)}>
                <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue>{VPOS_OPTIONS.find((o) => o.value === vpos)?.name}</SelectValue></SelectTrigger>
                <SelectContent>
                  {VPOS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0">裏面の種別</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as Kind)}>
                <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue>{KIND_OPTIONS.find((o) => o.value === kind)?.name}</SelectValue></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
                  <Button variant="outline" onClick={() => printWith("pp-4")}><Printer className="h-4 w-4 mr-1" />4面印刷（文面）</Button>
                </div>
              </CardContent>
            </Card>

            {/* プレビュー（1枚・文面のみ） */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">プレビュー（文面のみ）</Label>
              <div className="relative overflow-hidden border rounded-md bg-white shadow-sm mx-auto" style={{ width: "105mm", height: "148.5mm" }}>
                {renderPostcard()}
              </div>
            </div>
          </div>
        )}

        {/* 校正プレビュー（実物イメージ・両面） */}
        {eventId && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-sm font-medium mr-1">校正プレビュー（実物イメージ）</Label>
              <Button variant="outline" size="sm" onClick={() => printWith("pp-proof")}>
                <Printer className="h-4 w-4 mr-1" />校正を印刷／PDF
              </Button>
              <Button variant="outline" size="sm" onClick={sendMail}>
                <Mail className="h-4 w-4 mr-1" />メールで校正依頼
              </Button>
              <Button variant="outline" size="sm" onClick={downloadFax}>
                <FileText className="h-4 w-4 mr-1" />FAX送信状（Word）
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              「校正を印刷／PDF」でPDF保存 → メールに添付して送付できます（メール本文・FAX送信状にはテンプレートが入ります）。
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">おもて（宛名面＋案内文面）</div>
                <div className="hagaki border shadow-sm" style={{ width: "100mm", height: "148mm" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="bg" src={OMOTE_SRC} alt="おもて" />
                  {renderPostcard()}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">裏面（{KIND_OPTIONS.find((o) => o.value === kind)?.name}）</div>
                <div className="hagaki border shadow-sm" style={{ width: "100mm", height: "148mm" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="bg" src={URA_SRC[kind]} alt="裏面" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 印刷 — body直下にポータルで出す（印刷時にbodyのクラスでどちらを出すか切替） */}
      {eventId && (
        <PrintPortal>
          {/* 本番: 文面4面 */}
          <div className="pc-print pc-print-4">
            <div className="pc-sheet">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="pc-cell">{renderPostcard()}</div>
              ))}
            </div>
          </div>
          {/* 校正: 単票・両面（おもて左／裏面右の横並び） */}
          <div className="pc-print pc-print-proof">
            <div className="proof-stack">
              <div className="hagaki proof-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="bg" src={OMOTE_SRC} alt="おもて" />
                {renderPostcard()}
              </div>
              <div className="hagaki proof-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="bg" src={URA_SRC[kind]} alt="裏面" />
              </div>
            </div>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}
