"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export type UserRole = "admin" | "viewer" | "limited";

type PermissionContextType = {
  role: UserRole;
  canEdit: boolean;
  canViewRatings: boolean;
  canViewAll: boolean;
  canViewPayments: boolean;
  loading: boolean;
  displayName: string;
  username: string;
  userId: string | null;
};

const defaultState: PermissionContextType = {
  role: "viewer",
  canEdit: false,
  canViewRatings: false,
  canViewAll: true,
  canViewPayments: false,
  loading: true,
  displayName: "",
  username: "",
  userId: null,
};

const PermissionContext = createContext<PermissionContextType>(defaultState);

function derive(role: UserRole): Pick<PermissionContextType, "canEdit" | "canViewRatings" | "canViewAll"> {
  return {
    canEdit: role === "admin",
    canViewRatings: role === "admin",
    canViewAll: role === "admin" || role === "viewer",
  };
}

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PermissionContextType>(defaultState);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("user_profiles")
          .select("id, username, display_name, can_edit, role, can_view_payments")
          .eq("id", user.id)
          .single();
        if (data) {
          const role = (data.role ?? (data.can_edit ? "admin" : "viewer")) as UserRole;
          const derived = derive(role);
          setState({
            role,
            ...derived,
            // 経理閲覧は role とは独立のフラグ。admin でも DB の値に従う
            canViewPayments: !!data.can_view_payments,
            loading: false,
            displayName: data.display_name,
            username: data.username ?? "",
            userId: data.id,
          });

          // 最終アクセス時刻を更新（5分に1回までに節流）
          try {
            const key = `last_active_touch_${user.id}`;
            const lastTouchStr = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
            const now = Date.now();
            const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
            if (!lastTouchStr || now - parseInt(lastTouchStr, 10) > TOUCH_INTERVAL_MS) {
              await supabase
                .from("user_profiles")
                .update({ last_active_at: new Date().toISOString() })
                .eq("id", user.id);
              if (typeof window !== "undefined") window.localStorage.setItem(key, String(now));
            }
          } catch (e) {
            // 失敗してもアプリは継続
            console.warn("[usePermission] failed to touch last_active_at:", e);
          }
          return;
        }
      }
      setState((prev) => ({ ...prev, loading: false }));
    })();
  }, []);

  return (
    <PermissionContext.Provider value={state}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  return useContext(PermissionContext);
}
