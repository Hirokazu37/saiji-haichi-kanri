import { SupabaseClient } from "@supabase/supabase-js";

export async function addLog(
  supabase: SupabaseClient,
  eventId: string,
  category: string,
  action: string
) {
  // 現在ログイン中のユーザーメール取得
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email || "不明";

  await supabase.from("arrangement_logs").insert({
    event_id: eventId,
    category,
    action,
    performed_by_name: email,
  });
}
