"use client";

import { useState } from "react";
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
  // セッション中の同意状態（sessionStorageで管理、タブを閉じるとリセット）
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("consent_agreed") !== "true";
  });
  const [checked, setChecked] = useState(false);

  const handleAgree = () => {
    sessionStorage.setItem("consent_agreed", "true");
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next, details) => {
        // ESCキーでの閉じる操作も無効化
        if (!next && details.reason === "escape-key") {
          return;
        }
        setOpen(next);
      }}
    >
      <DialogContent
        className="max-w-md [&>button]:hidden"
        showCloseButton={false}
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
            disabled={!checked}
            className="w-full bg-green-700 hover:bg-green-800"
          >
            同意して利用開始
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
