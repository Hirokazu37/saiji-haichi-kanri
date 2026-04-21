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
          .select("id, display_name, can_edit, role, can_view_payments")
          .eq("id", user.id)
          .single();
        if (data) {
          const role = (data.role ?? (data.can_edit ? "admin" : "viewer")) as UserRole;
          const derived = derive(role);
          setState({
            role,
            ...derived,
            // admin は自動的に経理閲覧ON扱い、他ユーザーは DB の can_view_payments に従う
            canViewPayments: role === "admin" ? true : !!data.can_view_payments,
            loading: false,
            displayName: data.display_name,
            userId: data.id,
          });
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
