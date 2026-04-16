"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const TIMEOUT_MS = 30 * 60 * 1000; // 30分

export function AutoLogout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createClient();

  const logout = useCallback(async () => {
    sessionStorage.removeItem("consent_agreed");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [supabase, router]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    // 監視するイベント
    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];

    // スロットリング: 最大1秒に1回だけリセット
    let lastReset = Date.now();
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 1000) {
        lastReset = now;
        resetTimer();
      }
    };

    events.forEach((e) => window.addEventListener(e, throttledReset, { passive: true }));
    resetTimer(); // 初回タイマー開始

    return () => {
      events.forEach((e) => window.removeEventListener(e, throttledReset));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  return null;
}
