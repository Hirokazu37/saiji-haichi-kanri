"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Printer, Info, Save } from "lucide-react";
import { parseCsvFile } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { PrintPortal } from "@/components/PrintPortal";

const NONE = "__none__";

type FieldKey = "customer_no" | "name" | "postal" | "pref" | "city" | "addr1" | "addr2" | "addr3";
const FIELDS: { key: FieldKey; label: string; required?: boolean; re: RegExp }[] = [
  { key: "customer_no", label: "顧客番号（QRに入れる）", required: true, re: /得意先コード|得意先CD|顧客番号|顧客コード|顧客No|会員番号|^コード$/i },
  { key: "name", label: "氏名", required: true, re: /氏名|名前|得意先名|顧客名/ },
  { key: "postal", label: "郵便番号", re: /郵便|〒/ },
  { key: "pref", label: "都道府県", re: /都道府県/ },
  { key: "city", label: "市区町村", re: /市区町村|市町村/ },
  { key: "addr1", label: "住所１", re: /住所[1１]|^住所$|得意先住所$/ },
  { key: "addr2", label: "住所２（建物名など）", re: /住所[2２]/ },
  { key: "addr3", label: "住所３", re: /住所[3３]/ },
];

type Postcard = { no: string; name: string; postal: string; address: string; qr: string };

function guess(headers: string[]): Record<FieldKey, string> {
  const m = {} as Record<FieldKey, string>;
  for (const f of FIELDS) m[f.key] = NONE;
  headers.forEach((h, i) => {
    for (const f of FIELDS) {
      if (m[f.key] !== NONE) continue;
      if (f.key === "name" && /カナ|かな|フリガナ/.test(h)) continue;
      if (f.re.test(h)) { m[f.key] = String(i); break; }
    }
  });
  return m;
}

// 郵便番号は住所のすぐ上に 〒XXX-XXXX 形式で表示
const fmtPostal = (p: string) => {
  const d = p.replace(/[^0-9]/g, "");
  if (d.length === 7) return `〒${d.slice(0, 3)}-${d.slice(3)}`;
  return d ? `〒${d}` : "";
};

// 画面プレビューの宛名要素スタイル（印刷CSSの .qr-* と同じ値）
const S_POSTAL: React.CSSProperties = { position: "absolute", top: "21mm", left: "30mm", width: "65mm", fontSize: "11pt" };
const S_ADDR: React.CSSProperties = { position: "absolute", top: "27mm", left: "30mm", width: "65mm", fontSize: "11pt", lineHeight: 1.5 };
const S_NAME: React.CSSProperties = { position: "absolute", top: "46mm", left: "30mm", width: "65mm", fontSize: "14pt" };
const S_QR: React.CSSProperties = { position: "absolute", top: "55mm", right: "10mm", width: "18mm", height: "18mm" };
const S_NO: React.CSSProperties = { position: "absolute", top: "73mm", right: "8mm", width: "22mm", textAlign: "center", fontSize: "9pt", color: "#333" };

/** 名簿CSV（宛名つき）から QR付き宛名はがきを作って印刷する部品。
 *  印刷は body.pp-address クラスで制御し、他の印刷（文面など）と共存できる。 */
export function QrAddressPrint({ frontOverlay }: { frontOverlay?: React.ReactNode } = {}) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>(() => {
    const m = {} as Record<FieldKey, string>;
    for (const f of FIELDS) m[f.key] = NONE;
    return m;
  });
  const [cards, setCards] = useState<Postcard[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  // 面ごと（左上/右上/左下/右下）の宛名位置の微調整（mm）。テンプレ枠に合わせる。
  // この端末に保存した値があれば読み込む。
  const [quadOffsets, setQuadOffsets] = useState<{ dx: number; dy: number }[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const s = localStorage.getItem("dm_qr_quad_offsets");
        if (s) { const a = JSON.parse(s); if (Array.isArray(a) && a.length === 4) return a; }
      } catch { /* ignore */ }
    }
    return [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }];
  });
  const [posSaved, setPosSaved] = useState(false);
  const [dirty, setDirty] = useState(false); // 保存後に位置を変えたか（保存ボタンの色変化用）
  const setQuad = (i: number, axis: "dx" | "dy", v: number) => {
    setQuadOffsets((prev) => prev.map((q, idx) => (idx === i ? { ...q, [axis]: v } : q)));
    setDirty(true);
  };
  const savePositions = () => {
    try { localStorage.setItem("dm_qr_quad_offsets", JSON.stringify(quadOffsets)); } catch { /* ignore */ }
    setDirty(false);
    setPosSaved(true);
    setTimeout(() => setPosSaved(false), 2000);
  };
  // 全体を右に3mm寄せた上で、面ごとの微調整を加える
  const shiftFor = (i: number): React.CSSProperties => ({ transform: `translate(${3 + quadOffsets[i].dx}mm, ${quadOffsets[i].dy}mm)` });
  const QUAD_LABELS = ["左上", "右上", "左下", "右下"];

  // 1枚分の宛名（画面プレビュー用）。q=面インデックスで微調整を反映
  const cardInner = (c: Postcard, q: number) => (
    <div style={{ position: "absolute", inset: 0, ...shiftFor(q) }}>
      {c.postal && <div style={S_POSTAL}>{fmtPostal(c.postal)}</div>}
      <div style={S_ADDR}>{c.address}</div>
      <div style={S_NAME}>{c.name}　様</div>
      <div style={S_QR} dangerouslySetInnerHTML={{ __html: c.qr }} />
      <div style={S_NO}>{c.no}</div>
    </div>
  );

  const handleFile = async (file: File) => {
    setError(""); setCards(null);
    try {
      const parsed = await parseCsvFile(file);
      if (parsed.length < 2) { setError("データ行がありません"); return; }
      setFileName(file.name);
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      setMapping(guess(parsed[0]));
    } catch (e) {
      setError(`読み込み失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const col = (row: string[], key: FieldKey): string => {
    const idx = mapping[key];
    if (idx === NONE) return "";
    return (row[Number(idx)] ?? "").trim();
  };

  const generate = async () => {
    if (mapping.customer_no === NONE || mapping.name === NONE) {
      setError("「顧客番号」と「氏名」の列を指定してください");
      return;
    }
    setBusy(true); setError("");
    try {
      const byNo = new Map<string, string[]>();
      for (const r of rows) {
        const no = col(r, "customer_no");
        if (!no) continue;
        byNo.set(no, r);
      }
      const list: Postcard[] = [];
      for (const [no, r] of byNo) {
        const main = [col(r, "pref"), col(r, "city"), col(r, "addr1")].filter(Boolean).join("");
        const tail = [col(r, "addr2"), col(r, "addr3")].filter(Boolean).join(" ");
        const qr = await QRCode.toString(no, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
        list.push({ no, name: col(r, "name"), postal: col(r, "postal"), address: [main, tail].filter(Boolean).join(" "), qr });
      }
      setCards(list);
    } catch (e) {
      setError(`QR生成に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const printWith = (cls: string) => {
    document.body.classList.add(cls);
    window.print();
    document.body.classList.remove(cls);
  };

  // 印刷用の宛名（クラス指定。qr-shift で面ごとの微調整を反映）
  const printAddr = (c: Postcard, q: number) => (
    <div className="qr-shift" style={shiftFor(q)}>
      {c.postal && <div className="qr-postal">{fmtPostal(c.postal)}</div>}
      <div className="qr-addr">{c.address}</div>
      <div className="qr-name">{c.name}　様</div>
      <div className="qr-qrcode" dangerouslySetInnerHTML={{ __html: c.qr }} />
      <div className="qr-no">{c.no}</div>
    </div>
  );

  const pages: Postcard[][] = [];
  if (cards) for (let i = 0; i < cards.length; i += 4) pages.push(cards.slice(i, i + 4));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          産直くんで区分抽出した名簿CSV（宛名つき）を読み込み、A4・4分割のはがきに<span className="font-semibold">宛名＋顧客番号QR</span>を印刷します。
          QRには顧客番号だけを入れ、住所などはこのブラウザ内で処理するだけで保存しません。
        </div>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors max-w-xl mx-auto ${dragging ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
      >
        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm">{fileName || (dragging ? "ここにCSVをドロップ" : "宛名つき名簿CSVを選択／ここにドラッグ＆ドロップ（Shift_JIS / UTF-8）")}</span>
        <input type="file" accept=".csv,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </label>

      {headers.length > 0 && (
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-4 space-y-3">
            <div className="text-sm font-medium">列の割り当て（自動で推測。違っていたら直してください）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label}{f.required && <span className="text-destructive ml-1">必須</span>}</Label>
                  <select
                    value={mapping[f.key]}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm"
                  >
                    <option value={NONE}>（使わない）</option>
                    {headers.map((h, i) => <option key={i} value={String(i)}>{h || `列${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">データ行数: {rows.length.toLocaleString()}（同じ顧客番号は1枚にまとめます）</div>
            <Button onClick={generate} disabled={busy}>{busy ? "生成中…" : "プレビューを作成"}</Button>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </CardContent>
        </Card>
      )}

      {/* 面ごとの位置微調整（テンプレの枠に合わせる） */}
      {cards && (
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">位置を面ごとに微調整（mm／＋横=右・＋縦=下）</span>
            <button
              type="button"
              onClick={savePositions}
              title="この位置を保存（この端末）"
              className={cn(
                "inline-flex items-center justify-center h-10 w-10 rounded-full border cursor-pointer transition-transform hover:scale-110 active:scale-95",
                dirty ? "bg-orange-50 border-orange-300 text-orange-600 animate-pulse" : "bg-muted/50 border-border text-primary hover:bg-muted"
              )}
            >
              <Save className="h-6 w-6" />
            </button>
            {posSaved && <span className="text-xs text-emerald-700 font-medium">✓ 保存しました</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
            {QUAD_LABELS.map((lbl, i) => (
              <div key={i} className="flex items-center gap-1 border rounded-md px-2 py-1 text-xs">
                <span className="w-8 font-medium shrink-0">{lbl}</span>
                <span>横</span>
                <input type="number" step={0.5} value={quadOffsets[i].dx} onChange={(e) => setQuad(i, "dx", parseFloat(e.target.value) || 0)} className="h-7 w-14 rounded border border-input bg-white px-1" />
                <span>縦</span>
                <input type="number" step={0.5} value={quadOffsets[i].dy} onChange={(e) => setQuad(i, "dy", parseFloat(e.target.value) || 0)} className="h-7 w-14 rounded border border-input bg-white px-1" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 仕上がりプレビュー（4面） — タブで うら面(文面)/おもて面(宛名) 切替 */}
      {cards && cards.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground text-center">
            {frontOverlay ? "おもて面プレビュー（宛名＋出店情報・4面）" : "宛名プレビュー（4面）"}。位置微調整が反映されます
          </div>
          <div className="overflow-auto">
            <div className="w-fit mx-auto" style={{ zoom: 0.6 } as React.CSSProperties}>
              <div className="grid grid-cols-2 border-l border-t" style={{ width: "210mm" }}>
                {[0, 1, 2, 3].map((q) => {
                  const c = (pages[0] || [])[q];
                  return (
                    <div key={q} className="relative bg-white border-r border-b overflow-hidden" style={{ width: "105mm", height: "148.5mm" }}>
                      <span className="absolute top-0 left-0 z-10 bg-white/80 px-1 text-muted-foreground" style={{ fontSize: "9pt" }}>{QUAD_LABELS[q]}</span>
                      {frontOverlay}
                      {c ? cardInner(c, q) : <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">（データなし）</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* まとめて印刷 */}
      {cards && (
        <div className="rounded-md border bg-muted/20 p-3 space-y-2 max-w-xl mx-auto">
          <div className="text-sm font-bold text-center">🖨️ まとめて印刷</div>
          {frontOverlay ? (
            <>
              <div className="text-xs text-muted-foreground text-center">裏面（チラシ）印刷済みのA4厚紙に、おもて面（宛名＋出店情報）を印刷します（{cards.length}件 / {pages.length}ページ）。</div>
              <div className="flex justify-center">
                <Button onClick={() => printWith("pp-both")}>
                  <Printer className="h-4 w-4 mr-1" />おもて面を印刷
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-center">
              <Button onClick={() => printWith("pp-address")}>
                <Printer className="h-4 w-4 mr-1" />宛名を印刷（{cards.length}枚 / {pages.length}ページ）
              </Button>
            </div>
          )}
          <div className="text-[11px] text-muted-foreground text-center">印刷ダイアログで「余白なし」「等倍(100%)」に。PDFに保存も可。</div>
        </div>
      )}

      {/* 印刷レイアウト — body直下にポータルで出す（body.pp-address のときだけ印刷） */}
      {cards && (
        <PrintPortal>
          <div className="qr-print">
            <style>{`
              .qr-print, .qr-print-both { display: none; }
              @media print {
                @page { size: A4 portrait; margin: 0; }
                body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                body.pp-address .qr-print { display: block !important; margin: 0; }
                body.pp-both .qr-print-both { display: block !important; margin: 0; }
                .qr-sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; page-break-after: always; }
                /* 差出人=左上／郵便枠=右上 はテンプレ側。郵便番号は右上の枠、宛名はその下 */
                .qr-card { position: relative; box-sizing: border-box; overflow: hidden; }
                .qr-shift { position: absolute; inset: 0; }
                .qr-postal { position: absolute; top: 21mm; left: 30mm; width: 65mm; font-size: 11pt; }
                .qr-addr { position: absolute; top: 27mm; left: 30mm; width: 65mm; font-size: 11pt; line-height: 1.5; }
                .qr-name { position: absolute; top: 46mm; left: 30mm; width: 65mm; font-size: 14pt; }
                .qr-qrcode { position: absolute; top: 55mm; right: 10mm; width: 18mm; height: 18mm; }
                .qr-qrcode svg { width: 100%; height: 100%; }
                .qr-no { position: absolute; top: 73mm; right: 8mm; width: 22mm; text-align: center; font-size: 9pt; color: #333; }
              }
            `}</style>
            {pages.map((page, pi) => (
              <div key={pi} className="qr-sheet">
                {page.map((c, ci) => (
                  <div key={c.no} className="qr-card">{printAddr(c, ci % 4)}</div>
                ))}
              </div>
            ))}
          </div>
          {/* まとめ印刷: 宛名＋文面（文面は全面共通、宛名は面ごと） */}
          {frontOverlay && (
            <div className="qr-print-both">
              {pages.map((page, pi) => (
                <div key={pi} className="qr-sheet">
                  {page.map((c, ci) => (
                    <div key={c.no} className="qr-card">
                      {frontOverlay}
                      {printAddr(c, ci % 4)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </PrintPortal>
      )}
    </div>
  );
}
