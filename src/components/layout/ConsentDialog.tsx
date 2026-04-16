"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ShieldCheck } from "lucide-react";

export function ConsentDialog() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_profiles")
        .select("agreed_at")
        .eq("id", user.id)
        .single();

      // 未同意なら表示
      if (data && !data.agreed_at) {
        setOpen(true);
      }
    })();
  }, [supabase]);

  const handleAgree = async () => {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("user_profiles")
      .update({ agreed_at: new Date().toISOString() })
      .eq("id", user.id);

    setSaving(false);
    setOpen(false);
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-700" />
            <DialogTitle>利用規約への同意</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted p-4 text-sm space-y-3">
            <p>
              本システムには安岡蒲鉾の<strong>社内機密情報</strong>が含まれています。
            </p>
            <p>以下の事項を遵守してください：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>本システムの情報を社外の第三者に開示・共有しないこと</li>
              <li>業務目的以外での利用をしないこと</li>
              <li>ログインID・パスワードを他人に貸与しないこと</li>
              <li>不正アクセスや情報の持ち出しを行わないこと</li>
            </ul>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="consent"
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
              className="mt-0.5 data-[state=checked]:bg-green-700 data-[state=checked]:border-green-700"
            />
            <label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
              上記の内容を理解し、同意します
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleAgree}
            disabled={!checked || saving}
            className="w-full bg-green-700 hover:bg-green-800"
          >
            {saving ? "処理中..." : "同意して利用開始"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
