"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { addLog } from "@/lib/log";

type PersonType = "employee" | "mannequin";

type Employee = { id: string; name: string; position: string | null };
type MannequinPerson = { id: string; name: string; agency_id: string | null };
type Agency = { id: string; name: string };

type EventOption = { id: string; name: string | null; venue: string; store_name: string | null; start_date: string; end_date: string };

type FormState = {
  event_id: string;
  person_type: PersonType;
  employee_id: string;
  mannequin_person_id: string;
  start_date: string;
  end_date: string;
  role: string;
  notes: string;
};

const emptyForm: FormState = {
  event_id: "",
  person_type: "employee",
  employee_id: "",
  mannequin_person_id: "",
  start_date: "",
  end_date: "",
  role: "",
  notes: "",
};

// 親（/schedule など）に変更内容を伝えるためのペイロード
export type StaffChange =
  | {
      type: "update";
      assignmentId: string;
      prev: {
        event_id: string;
        person_type: PersonType;
        employee_id: string | null;
        mannequin_person_id: string | null;
        start_date: string;
        end_date: string;
        role: string | null;
        notes: string | null;
      };
      next: {
        event_id: string;
        person_type: PersonType;
        employee_id: string | null;
        mannequin_person_id: string | null;
        start_date: string;
        end_date: string;
        role: string | null;
        notes: string | null;
      };
      label: string; // トーストに表示する説明
    }
  | {
      type: "create";
      assignmentId: string; // 作成されたID（undo で削除する対象）
      label: string;
    }
  | {
      type: "delete";
      // 再INSERT用の完全データ（idは再採番されるが、元のassignmentIdは表示用）
      prevAssignmentId: string;
      row: {
        event_id: string;
        person_type: PersonType;
        employee_id: string | null;
        mannequin_person_id: string | null;
        start_date: string;
        end_date: string;
        role: string | null;
        notes: string | null;
      };
      label: string;
    };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // 編集対象の event_staff.id（新規作成時は null）
  assignmentId: string | null;
  // 新規作成時に指定する対象催事
  eventId?: string | null;
  // 新規作成時のデフォルト期間
  defaultStart?: string;
  defaultEnd?: string;
  // 新規作成時の対象社員の初期値
  initialPersonKey?: string | null;
  // 保存・削除後のコールバック
  onSaved?: () => void;
  // より詳細な変更通知（元に戻す用）
  onChange?: (change: StaffChange) => void;
  // 催事選択を表示するかどうか（/schedule からの新規作成時など）
  showEventSelect?: boolean;
};

export function StaffAssignmentDialog({
  open,
  onOpenChange,
  assignmentId,
  eventId: presetEventId = null,
  defaultStart = "",
  defaultEnd = "",
  initialPersonKey = null,
  onSaved,
  onChange,
  showEventSelect = false,
}: Props) {
  const supabase = createClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [mannequinPeople, setMannequinPeople] = useState<MannequinPerson[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalPerson, setOriginalPerson] = useState<string>(""); // 差替え時のログ用（編集前の人名）
  // 編集モード時の元のフォーム値（undoで元に戻すため）
  const [originalForm, setOriginalForm] = useState<FormState | null>(null);

  // マスター & ダイアログ開いたら該当データを取得
  const load = useCallback(async () => {
    const [empRes, mpRes, agRes, evRes] = await Promise.all([
      supabase.from("employees").select("id, name, position").order("sort_order").order("name"),
      supabase.from("mannequin_people").select("id, name, agency_id").order("name"),
      supabase.from("mannequin_agencies").select("id, name").order("name"),
      // 催事選択用（新規作成時のみ使う）: 過去1年〜未来1年
      showEventSelect
        ? supabase.from("events").select("id, name, venue, store_name, start_date, end_date").order("start_date", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] }),
    ]);
    setEmployees((empRes.data || []) as Employee[]);
    setMannequinPeople((mpRes.data || []) as MannequinPerson[]);
    setAgencies((agRes.data || []) as Agency[]);
    setEvents((evRes.data || []) as EventOption[]);

    if (assignmentId) {
      const { data } = await supabase
        .from("event_staff")
        .select("id, event_id, person_type, employee_id, mannequin_person_id, start_date, end_date, role, notes")
        .eq("id", assignmentId)
        .single();
      if (data) {
        const loaded: FormState = {
          event_id: data.event_id,
          person_type: (data.person_type ?? "employee") as PersonType,
          employee_id: data.employee_id || "",
          mannequin_person_id: data.mannequin_person_id || "",
          start_date: data.start_date,
          end_date: data.end_date,
          role: data.role || "",
          notes: data.notes || "",
        };
        setForm(loaded);
        setOriginalForm(loaded);
        // 現在選ばれている人の名前をログ用に控える
        if (data.person_type === "mannequin" && data.mannequin_person_id) {
          const p = (mpRes.data || []).find((x: MannequinPerson) => x.id === data.mannequin_person_id);
          setOriginalPerson(p?.name || "");
        } else if (data.employee_id) {
          const e = (empRes.data || []).find((x: Employee) => x.id === data.employee_id);
          setOriginalPerson(e?.name || "");
        }
      }
    } else {
      // 新規作成モード
      let initialPersonType: PersonType = "employee";
      let initialEmpId = "";
      let initialMpId = "";
      if (initialPersonKey?.startsWith("m:")) {
        initialPersonType = "mannequin";
        initialMpId = initialPersonKey.slice(2);
      } else if (initialPersonKey?.startsWith("e:")) {
        initialPersonType = "employee";
        initialEmpId = initialPersonKey.slice(2);
      }
      setForm({
        event_id: presetEventId ?? "",
        person_type: initialPersonType,
        employee_id: initialEmpId,
        mannequin_person_id: initialMpId,
        start_date: defaultStart,
        end_date: defaultEnd,
        role: "",
        notes: "",
      });
      setOriginalPerson("");
      setOriginalForm(null);
    }
  }, [supabase, assignmentId, presetEventId, defaultStart, defaultEnd, initialPersonKey, showEventSelect]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const canSave =
    !!form.event_id &&
    (form.person_type === "employee" ? !!form.employee_id : !!form.mannequin_person_id) &&
    !!form.start_date &&
    !!form.end_date;

  const currentPersonName = (): string => {
    if (form.person_type === "mannequin") {
      return mannequinPeople.find((p) => p.id === form.mannequin_person_id)?.name ?? "";
    }
    return employees.find((e) => e.id === form.employee_id)?.name ?? "";
  };

  const save = async () => {
    if (!canSave) return;
    // 催事の会期を超える場合はアラートして中断
    if (eventStart && eventEnd) {
      if (form.start_date < eventStart || form.end_date > eventEnd) {
        alert(`催事の会期（${eventStart} 〜 ${eventEnd}）を超えた日付は設定できません。`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        event_id: form.event_id,
        person_type: form.person_type,
        employee_id: form.person_type === "employee" ? form.employee_id : null,
        mannequin_person_id: form.person_type === "mannequin" ? form.mannequin_person_id : null,
        start_date: form.start_date,
        end_date: form.end_date,
        role: form.role.trim() || null,
        notes: form.notes.trim() || null,
      };
      const newName = currentPersonName();
      const label = form.person_type === "mannequin" ? `マネキン:${newName}` : newName;

      if (assignmentId) {
        await supabase.from("event_staff").update(payload).eq("id", assignmentId);
        const swapNote = originalPerson && originalPerson !== newName ? `【差替え】${originalPerson} → ${newName} / ` : "";
        await addLog(supabase, form.event_id, "社員配置", `${swapNote}${label}の配置を更新（${form.start_date}〜${form.end_date}${form.role ? ` ${form.role}` : ""}）`);
        if (originalForm) {
          onChange?.({
            type: "update",
            assignmentId,
            prev: {
              event_id: originalForm.event_id,
              person_type: originalForm.person_type,
              employee_id: originalForm.person_type === "employee" ? originalForm.employee_id || null : null,
              mannequin_person_id: originalForm.person_type === "mannequin" ? originalForm.mannequin_person_id || null : null,
              start_date: originalForm.start_date,
              end_date: originalForm.end_date,
              role: originalForm.role || null,
              notes: originalForm.notes || null,
            },
            next: payload,
            label: `${label}の配置を更新`,
          });
        }
      } else {
        const { data: inserted } = await supabase
          .from("event_staff")
          .insert(payload)
          .select("id")
          .single();
        await addLog(supabase, form.event_id, "社員配置", `${label}を配置（${form.start_date}〜${form.end_date}${form.role ? ` ${form.role}` : ""}）`);
        if (inserted?.id) {
          onChange?.({
            type: "create",
            assignmentId: inserted.id,
            label: `${label}を配置`,
          });
        }
      }
      onOpenChange(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!assignmentId) return;
    const name = currentPersonName();
    const snapshot = {
      event_id: form.event_id,
      person_type: form.person_type,
      employee_id: form.person_type === "employee" ? form.employee_id || null : null,
      mannequin_person_id: form.person_type === "mannequin" ? form.mannequin_person_id || null : null,
      start_date: form.start_date,
      end_date: form.end_date,
      role: form.role.trim() || null,
      notes: form.notes.trim() || null,
    };
    await supabase.from("event_staff").delete().eq("id", assignmentId);
    await addLog(supabase, form.event_id, "社員配置", `${form.person_type === "mannequin" ? "マネキン:" : ""}${name}の配置を削除`);
    onChange?.({
      type: "delete",
      prevAssignmentId: assignmentId,
      row: snapshot,
      label: `${form.person_type === "mannequin" ? "マネキン:" : ""}${name} の配置を削除`,
    });
    setDeleteOpen(false);
    onOpenChange(false);
    onSaved?.();
  };

  const selectedEmployeeLabel = form.employee_id
    ? employees.find((e) => e.id === form.employee_id)?.name ?? "（削除済み社員）"
    : undefined;
  const selectedMannequinLabel = form.mannequin_person_id
    ? (() => {
        const p = mannequinPeople.find((x) => x.id === form.mannequin_person_id);
        if (!p) return "（削除済みマネキン）";
        const agency = agencies.find((a) => a.id === p.agency_id)?.name;
        return agency ? `${p.name}（${agency}）` : p.name;
      })()
    : undefined;
  const selectedEventLabel = form.event_id
    ? (() => {
        const e = events.find((x) => x.id === form.event_id);
        if (!e) return "";
        const venueLabel = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
        return `${venueLabel} (${e.start_date}〜${e.end_date})`;
      })()
    : undefined;

  // 選択中の催事の会期（日付入力の min/max に使う）
  const selectedEvent = events.find((x) => x.id === form.event_id);
  const eventStart = selectedEvent?.start_date;
  const eventEnd = selectedEvent?.end_date;

  // 催事ドロップダウンのフィルタリング:
  // すでに開始/終了日が決まっている場合（空白ドラッグ後など）、その期間を含む催事のみを候補にする
  // 編集モード（assignmentId 有）の時は制限しない（既存の紐付けを壊さない）
  const filteredEvents = (() => {
    if (assignmentId) return events;
    if (!form.start_date || !form.end_date) return events;
    return events.filter((e) => e.start_date <= form.start_date && e.end_date >= form.end_date);
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{assignmentId ? "社員配置を編集" : "社員配置を追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 催事選択（/schedule からの追加時） */}
            {showEventSelect && (
              <div className="space-y-2">
                <Label>催事 *</Label>
                <Select
                  value={form.event_id}
                  onValueChange={(v) => v && setForm({ ...form, event_id: v })}
                  disabled={!!assignmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="催事を選択">{selectedEventLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {filteredEvents.length === 0 && !assignmentId && form.start_date && form.end_date && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">
                        選択した期間（{form.start_date}〜{form.end_date}）を含む催事がありません。<br />期間を短くするか、催事の会期を拡げてください。
                      </div>
                    )}
                    {filteredEvents.map((e) => {
                      const venueLabel = e.store_name ? `${e.venue} ${e.store_name}` : e.venue;
                      return (
                        <SelectItem key={e.id} value={e.id}>
                          {venueLabel}（{e.start_date}〜{e.end_date}）
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {assignmentId && <p className="text-[10px] text-muted-foreground">別催事へ移動したい場合は一度削除して再追加してください</p>}
                {!assignmentId && form.start_date && form.end_date && (
                  <p className="text-[10px] text-muted-foreground">期間「{form.start_date} 〜 {form.end_date}」に開催する催事のみ表示しています</p>
                )}
              </div>
            )}

            {/* 種別（社員/マネキン） */}
            <div className="space-y-2">
              <Label>種別 *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.person_type === "employee" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm({ ...form, person_type: "employee", mannequin_person_id: "" })}
                >社員</Button>
                <Button
                  type="button"
                  variant={form.person_type === "mannequin" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm({ ...form, person_type: "mannequin", employee_id: "" })}
                >マネキン</Button>
              </div>
            </div>

            {/* 社員/マネキンの選択 */}
            {form.person_type === "employee" ? (
              <div className="space-y-2">
                <Label>社員 *</Label>
                <Select value={form.employee_id} onValueChange={(v) => v && setForm({ ...form, employee_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="社員を選択">{selectedEmployeeLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}{e.position ? ` (${e.position})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignmentId && originalPerson && originalPerson !== currentPersonName() && (
                  <p className="text-[11px] text-amber-700">差替え: {originalPerson} → {currentPersonName()}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>マネキン *</Label>
                <Select value={form.mannequin_person_id} onValueChange={(v) => v && setForm({ ...form, mannequin_person_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="マネキンを選択">{selectedMannequinLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {mannequinPeople.map((p) => {
                      const agency = agencies.find((a) => a.id === p.agency_id)?.name;
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{agency ? `（${agency}）` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 期間 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>開始日 *</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  min={eventStart}
                  max={form.end_date || eventEnd}
                  onChange={(e) => {
                    let v = e.target.value;
                    if (eventStart && v < eventStart) v = eventStart;
                    if (eventEnd && v > eventEnd) v = eventEnd;
                    setForm({ ...form, start_date: v });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>終了日 *</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  min={form.start_date || eventStart}
                  max={eventEnd}
                  onChange={(e) => {
                    let v = e.target.value;
                    if (eventStart && v < eventStart) v = eventStart;
                    if (eventEnd && v > eventEnd) v = eventEnd;
                    setForm({ ...form, end_date: v });
                  }}
                />
              </div>
            </div>
            {eventStart && eventEnd && (
              <p className="text-[10px] text-muted-foreground -mt-2">
                催事の会期: {eventStart} 〜 {eventEnd}（この範囲内でのみ設定可能）
              </p>
            )}

            {/* 役割 */}
            <div className="space-y-2">
              <Label>役割</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="担当者 / 応援 など" />
            </div>

            {/* 備考 */}
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            {assignmentId ? (
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" />削除
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <DialogClose render={<Button variant="outline">キャンセル</Button>} />
              <Button onClick={save} disabled={!canSave || saving}>{saving ? "保存中..." : assignmentId ? "更新" : "追加"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この配置を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {currentPersonName()} の配置（{form.start_date} 〜 {form.end_date}）を削除します。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
