"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Users, CalendarClock } from "lucide-react";
import Link from "next/link";
import { StaffAssignmentDialog } from "@/components/arrangements/StaffAssignmentDialog";
import { usePermission } from "@/hooks/usePermission";

type PersonType = "employee" | "mannequin";

type StaffAssignment = {
  id: string;
  person_type: PersonType;
  employee_id: string | null;
  mannequin_person_id: string | null;
  start_date: string;
  end_date: string;
  role: string | null;
  notes: string | null;
  employees: { name: string; position: string | null } | null;
  mannequin_people: { name: string; agency_id: string | null } | null;
};

export function StaffTab({ eventId, startDate, endDate }: { eventId: string; startDate: string; endDate: string }) {
  const supabase = createClient();
  const { canEdit } = usePermission();
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from("event_staff")
      .select("id, person_type, employee_id, mannequin_person_id, start_date, end_date, role, notes, employees(name, position), mannequin_people(name, agency_id)")
      .eq("event_id", eventId)
      .order("start_date");
    setAssignments((data as unknown as StaffAssignment[]) || []);
  }, [supabase, eventId]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => {
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (a: StaffAssignment) => {
    setEditingId(a.id);
    setDialogOpen(true);
  };

  const displayName = (a: StaffAssignment): string => {
    if (a.person_type === "mannequin") return a.mannequin_people?.name || "（削除済みマネキン）";
    return a.employees?.name || "（削除済み社員）";
  };

  return (
    <Card className="border-l-4 border-l-cyan-500 bg-cyan-50/50">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-600" />
          <CardTitle className="text-cyan-800">社員配置</CardTitle>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />追加
            </Button>
          )}
          <Link href="/schedule">
            <Button size="sm" variant="outline">
              <CalendarClock className="h-4 w-4 mr-1" />スケジュールで編集
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {canEdit && (
          <p className="text-[11px] text-muted-foreground mb-2">
            既存の配置の<strong>差替え・日程変更・削除</strong>は「社員スケジュール」ページのガントバーから行えます。
          </p>
        )}
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">社員配置がまだありません。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">種別</TableHead>
                <TableHead>氏名</TableHead>
                <TableHead>期間</TableHead>
                <TableHead className="hidden md:table-cell">役割</TableHead>
                {canEdit && <TableHead className="w-24">編集</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {a.person_type === "mannequin" ? (
                      <Badge className="bg-pink-100 text-pink-800 hover:bg-pink-100">マネキン</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">社員</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{displayName(a)}</TableCell>
                  <TableCell className="text-sm">{a.start_date} 〜 {a.end_date}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {a.role ? <Badge variant="outline">{a.role}</Badge> : "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => openEdit(a)}>
                        編集
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <StaffAssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        assignmentId={editingId}
        eventId={eventId}
        defaultStart={startDate}
        defaultEnd={endDate}
        onSaved={fetch}
      />
    </Card>
  );
}
