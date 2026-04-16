"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CurrentUser = {
  id: string;
  username: string;
  display_name: string;
  can_edit: boolean;
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
          .select("id, username, display_name, can_edit")
          .eq("id", authUser.id)
          .single();
        if (data) setUser(data);
      }
      setLoading(false);
    })();
  }, []);

  return { user, loading, canEdit: user?.can_edit ?? false };
}
