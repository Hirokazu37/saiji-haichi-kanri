"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermission } from "@/hooks/usePermission";
import { canAccessPath } from "@/lib/access";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, loading } = usePermission();

  const allowed = loading ? true : canAccessPath(role, pathname);

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace("/");
    }
  }, [loading, allowed, router]);

  if (loading) return null;
  if (!allowed) return null;
  return <>{children}</>;
}
