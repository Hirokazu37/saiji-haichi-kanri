"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, ClipboardCheck, Filter, Store } from "lucide-react";
import { CustomerListTab } from "@/components/customers/CustomerListTab";
import { VisitEntryTab } from "@/components/customers/VisitEntryTab";
import { ExtractTab } from "@/components/customers/ExtractTab";
import { SegmentSummaryTab } from "@/components/customers/SegmentSummaryTab";
import { segKey, type SegmentMaster } from "@/components/customers/types";

export default function CustomersPage() {
  const supabase = createClient();
  const [segments, setSegments] = useState<SegmentMaster[]>([]);
  const [tab, setTab] = useState("visits");
  // 顧客一覧の区分(百貨店)フィルタ。百貨店サマリからの遷移でも設定する
  const [listSegFilter, setListSegFilter] = useState("__all__");

  // 区分マスターは3タブ共通で使うのでここで一度だけ読む
  useEffect(() => {
    supabase
      .from("sanchoku_segments")
      .select("kbn_no, code, segment_name, venue_id")
      .order("kbn_no")
      .order("code")
      .then(({ data }) => setSegments((data as SegmentMaster[]) || []));
  }, [supabase]);

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold">顧客・来場管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          産直くんの催事顧客を取り込み、DM持参のお客様を催事ごとに記録します（丸付けのデジタル化）
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="visits">
            <ClipboardCheck className="h-3.5 w-3.5" />
            来場登録
          </TabsTrigger>
          <TabsTrigger value="list">
            <Users className="h-3.5 w-3.5" />
            顧客一覧
          </TabsTrigger>
          <TabsTrigger value="extract">
            <Filter className="h-3.5 w-3.5" />
            来場なし抽出
          </TabsTrigger>
          <TabsTrigger value="summary">
            <Store className="h-3.5 w-3.5" />
            百貨店サマリ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visits">
          <VisitEntryTab segments={segments} />
        </TabsContent>
        <TabsContent value="list">
          <CustomerListTab segments={segments} segFilter={listSegFilter} onSegFilterChange={setListSegFilter} />
        </TabsContent>
        <TabsContent value="extract">
          <ExtractTab segments={segments} />
        </TabsContent>
        <TabsContent value="summary">
          <SegmentSummaryTab
            segments={segments}
            onOpenStore={(kbn, code) => { setListSegFilter(segKey(kbn, code)); setTab("list"); }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
