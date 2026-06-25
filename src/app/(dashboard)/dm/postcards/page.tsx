"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { QrAddressPrint } from "@/components/dm/QrAddressPrint";

export default function PostcardPrintPage() {
  const { role } = usePermission();
  const canUse = role === "admin" || role === "viewer";

  if (!canUse) {
    return <p className="text-sm text-muted-foreground">この機能を使う権限がありません。</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      <Link href="/dm" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" />DMハガキ一覧へ
      </Link>
      <h1 className="text-2xl font-bold">QR付きはがき印刷（宛名）</h1>
      <QrAddressPrint />
    </div>
  );
}
