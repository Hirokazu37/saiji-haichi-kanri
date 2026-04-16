"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TransportsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/hotels"); }, [router]);
  return <p className="text-muted-foreground">リダイレクト中...</p>;
}
