"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// 複数のポータルが同時に存在しても body クラスを正しく扱うための参照カウント
let portalCount = 0;

/**
 * 子要素を <body> 直下に描画するポータル。
 * 印刷時にアプリ本体(app shell)を display:none で外し、この中身だけを
 * 用紙に出すために使う（画面サイズの影響で縮小されるのを防ぐ）。
 * マウント中は body に .has-print-portal を付与する（globals.css の印刷ルールが反応）。
 */
export function PrintPortal({ children }: { children: React.ReactNode }) {
  const [el] = useState<HTMLDivElement | null>(() => {
    if (typeof document === "undefined") return null;
    const node = document.createElement("div");
    node.className = "print-portal";
    return node;
  });

  useEffect(() => {
    if (!el) return;
    document.body.appendChild(el);
    portalCount++;
    document.body.classList.add("has-print-portal");
    return () => {
      document.body.removeChild(el);
      portalCount = Math.max(0, portalCount - 1);
      if (portalCount === 0) document.body.classList.remove("has-print-portal");
    };
  }, [el]);

  if (!el) return null;
  return createPortal(children, el);
}
