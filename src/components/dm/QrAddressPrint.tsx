"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Printer, Info } from "lucide-react";
import { parseCsvFile } from "@/lib/csv";
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

// 郵便番号は枠に重ね刷りするのでハイフンなし・数字のみ
const fmtPostal = (p: string) => p.replace(/[^0-9]/g, "");

/** 名簿CSV（宛名つき）から QR付き宛名はがきを作って印刷する部品。
 *  印刷は body.pp-address クラスで制御し、他の印刷（文面など）と共存できる。 */
export function QrAddressPrint() {
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
  // 面ごと（左上/右上/左下/右下）の宛名位置の微調整（mm）。テンプレ枠に合わせる
  const [quadOffsets, setQuadOffsets] = useState<{ dx: number; dy: number }[]>([
    { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 },
  ]);
  const setQuad = (i: number, axis: "dx" | "dy", v: number) =>
    setQuadOffsets((prev) => prev.map((q, idx) => (idx === i ? { ...q, [axis]: v } : q)));
  const shiftFor = (i: number): React.CSSProperties => ({ transform: `translate(${quadOffsets[i].dx}mm, ${quadOffsets[i].dy}mm)` });
  const QUAD_LABELS = ["左上", "右上", "左下", "右下"];

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

  const printAddresses = () => {
    document.body.classList.add("pp-address");
    window.print();
    document.body.classList.remove("pp-address");
  };

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

      <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors max-w-xl mx-auto">
        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm">{fileName || "宛名つき名簿CSVを選択（Shift_JIS / UTF-8）"}</span>
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

      {cards && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={printAddresses}>
              <Printer className="h-4 w-4 mr-1" />宛名を印刷する（{cards.length}枚 / {pages.length}ページ）
            </Button>
            <span className="text-xs text-muted-foreground">
              印刷ダイアログで「余白なし」「等倍(100%)」に設定し、A4厚紙に印刷して4分割してください。
            </span>
          </div>
          {/* 面ごとの位置微調整（テンプレの枠に合わせる） */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground text-center">郵便番号・宛名の位置を面ごとに微調整（mm／＋横=右・＋縦=下）</div>
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
        </div>
      )}

      {/* 仕上がりの実物プレビュー（1人目のサンプル） — はみ出し確認用 */}
      {cards && cards.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground text-center">宛名プレビュー（1人目のサンプル・はがき1枚）</div>
          <div className="mx-auto relative border bg-white shadow-sm overflow-hidden" style={{ width: "100mm", height: "148mm", boxSizing: "border-box" }}>
            <div style={{ position: "absolute", inset: 0, ...shiftFor(0) }}>
              {cards[0].postal && <div style={{ position: "absolute", top: "13mm", right: "14mm", fontSize: "14pt", fontWeight: "bold", letterSpacing: "3.2mm" }}>{fmtPostal(cards[0].postal)}</div>}
              <div style={{ position: "absolute", top: "27mm", left: "30mm", width: "65mm", fontSize: "11pt", lineHeight: 1.5 }}>{cards[0].address}</div>
              <div style={{ position: "absolute", top: "44mm", left: "30mm", width: "65mm", fontSize: "18pt", fontWeight: "bold" }}>{cards[0].name}　様</div>
              <div style={{ position: "absolute", top: "55mm", right: "10mm", width: "18mm", height: "18mm" }} dangerouslySetInnerHTML={{ __html: cards[0].qr }} />
              <div style={{ position: "absolute", top: "74mm", right: "10mm", width: "18mm", textAlign: "center", fontSize: "7pt", color: "#333" }}>{cards[0].no}</div>
            </div>
          </div>
        </div>
      )}

      {/* 印刷レイアウト — body直下にポータルで出す（body.pp-address のときだけ印刷） */}
      {cards && (
        <PrintPortal>
          <div className="qr-print">
            <style>{`
              .qr-print { display: none; }
              @media print {
                @page { size: A4 portrait; margin: 0; }
                body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                body.pp-address .qr-print { display: block !important; margin: 0; }
                body.pp-address .qr-sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; page-break-after: always; }
                /* 差出人=左上／郵便枠=右上 はテンプレ側。郵便番号は右上の枠、宛名はその下 */
                .qr-card { position: relative; box-sizing: border-box; overflow: hidden; }
                .qr-shift { position: absolute; inset: 0; }
                .qr-postal { position: absolute; top: 13mm; right: 14mm; font-size: 14pt; font-weight: bold; letter-spacing: 3.2mm; }
                .qr-addr { position: absolute; top: 27mm; left: 30mm; width: 65mm; font-size: 11pt; line-height: 1.5; }
                .qr-name { position: absolute; top: 44mm; left: 30mm; width: 65mm; font-size: 18pt; font-weight: bold; }
                .qr-qrcode { position: absolute; top: 55mm; right: 10mm; width: 18mm; height: 18mm; }
                .qr-qrcode svg { width: 100%; height: 100%; }
                .qr-no { position: absolute; top: 74mm; right: 10mm; width: 18mm; text-align: center; font-size: 7pt; color: #333; }
              }
            `}</style>
            {pages.map((page, pi) => (
              <div key={pi} className="qr-sheet">
                {page.map((c, ci) => (
                  <div key={c.no} className="qr-card">
                    <div className="qr-shift" style={shiftFor(ci % 4)}>
                      {c.postal && <div className="qr-postal">{fmtPostal(c.postal)}</div>}
                      <div className="qr-addr">{c.address}</div>
                      <div className="qr-name">{c.name}　様</div>
                      <div className="qr-qrcode" dangerouslySetInnerHTML={{ __html: c.qr }} />
                      <div className="qr-no">{c.no}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </PrintPortal>
      )}
    </div>
  );
}
