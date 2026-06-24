import React from "react";

/**
 * 簡易ルビ記法を React ノードに変換する。
 * 記法（青空文庫風）:
 *   ｜漢字《かんじ》   → 親文字「漢字」にルビ「かんじ」
 *   全角｜ でも半角| でもOK。改行は <br/> に変換。
 * 例: 「｜四国《しこく》瀬戸内うまいものめぐり」
 */
export function renderRuby(text: string | null | undefined): React.ReactNode[] {
  if (!text) return [];
  const out: React.ReactNode[] = [];
  // ｜base《ruby》 を抽出（base は直前の ｜ または | 以降）
  const re = /[｜|]([^｜|《]+)《([^》]+)》/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  const pushPlain = (s: string) => {
    const parts = s.split("\n");
    parts.forEach((p, i) => {
      if (p) out.push(<React.Fragment key={`t${key++}`}>{p}</React.Fragment>);
      if (i < parts.length - 1) out.push(<br key={`b${key++}`} />);
    });
  };
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pushPlain(text.slice(last, m.index));
    out.push(
      <ruby key={`r${key++}`}>
        {m[1]}
        <rt>{m[2]}</rt>
      </ruby>
    );
    last = re.lastIndex;
  }
  if (last < text.length) pushPlain(text.slice(last));
  return out;
}
