"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type PermissionContextType = {
  canEdit: boolean;
  loading: boolean;
  displayName: string;
  userId: string | null;
};

const PermissionContext = createContext<PermissionContextType>({
  canEdit: false,
  loading: true,
  displayName: "",
  userId: null,
});

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PermissionContextType>({
    canEdit: false,
    loading: true,
    displayName: "",
    userId: null,
  });

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("user_profiles")
          .select("id, display_name, can_edit")
          .eq("id", user.id)
          .single();
        if (data) {
          setState({
            canEdit: data.can_edit,
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
