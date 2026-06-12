/**
 * CSVユーティリティ
 * - 産直くん11のエクスポートCSVは Shift_JIS の可能性が高いため、
 *   UTF-8で読んで文字化けが検出されたら Shift_JIS で再デコードする
 * - 出力は Excel/産直くんで開けるよう BOM付きUTF-8 または Shift_JIS風に
 *   ならないよう注意 (BOM付きUTF-8はExcelで文字化けしない)
 */

/** ArrayBuffer をエンコーディング自動判定でテキスト化 */
export function decodeCsvBuffer(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // U+FFFD (置換文字) が含まれていれば UTF-8 ではない → Shift_JIS で再試行
  if (utf8.includes("�")) {
    try {
      return new TextDecoder("shift_jis").decode(buf);
    } catch {
      return utf8; // shift_jis 非対応環境では UTF-8 結果をそのまま返す
    }
  }
  return utf8;
}

/**
 * CSVテキストを2次元配列にパースする (RFC4180準拠: ダブルクォート・改行入りセル対応)
 * 先頭のBOMは除去。空行はスキップ。
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** File を読み込んでパースまで行う */
export async function parseCsvFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  return parseCsv(decodeCsvBuffer(buf));
}

function escapeCsvField(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** 2次元配列を BOM付きUTF-8 のCSVとしてダウンロードさせる */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const text = rows
    .map((r) => r.map((v) => escapeCsvField(v == null ? "" : String(v))).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
