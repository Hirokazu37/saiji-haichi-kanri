"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/hooks/usePermission";

type CurrentUser = {
  id: string;
  username: string;
  display_name: string;
  can_edit: boolean;
  role: UserRole;
};

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data } = await supabase
          .from("user_profiles")
          .select("id, username, display_name, can_edit, role")
          .eq("id", authUser.id)
          .single();
        if (data) {
          const role = (data.role ?? (data.can_edit ? "admin" : "viewer")) as UserRole;
          setUser({
            id: data.id,
            username: data.username,
            display_name: data.display_name,
            can_edit: data.can_edit,
            role,
          });
        }
      }
      setLoading(false);
    })();
  }, []);

  return { user, loading, canEdit: user?.can_edit ?? false, role: user?.role ?? "viewer" };
}
