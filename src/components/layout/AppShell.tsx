"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { Fab } from "./Fab";
import { PermissionProvider } from "@/hooks/usePermission";
import { ConsentDialog } from "./ConsentDialog";
import { AutoLogout } from "./AutoLogout";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PermissionProvider>
      <ConsentDialog />
      <AutoLogout />
      <div className="min-h-screen bg-muted/40">
        <Sidebar />
        <div className="md:pl-60">
          <Header />
          <main className="p-4 md:p-6 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-6">
            {children}
          </main>
        </div>
        <BottomNav />
        <Fab />
      </div>
    </PermissionProvider>
  );
}
