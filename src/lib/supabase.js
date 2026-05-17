import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function saveStudyLogToSupabase(log) {
  if (!supabase) {
    return { ok: false, skipped: true, reason: "Supabase 환경변수가 없습니다." };
  }

  const { data, error } = await supabase
    .from("study_logs")
    .insert({
      date: log.date,
      problem_summary: log.problemSummary,
      subject_tag: log.subjectTag,
      understanding_status: log.understandingStatus,
      easier_count: log.easierCount ?? 0,
      practice_problems_count: log.practiceProblemsCount ?? 0,
      practice_checked_count: log.practiceCheckedCount ?? 0
    })
    .select()
    .single();

  if (error) throw error;
  return { ok: true, data };
}

export async function loadStudyLogsFromSupabase(date) {
  if (!supabase) {
    return { ok: false, skipped: true, data: [] };
  }

  const query = supabase.from("study_logs").select("*").order("created_at", { ascending: false });
  if (date) query.eq("date", date);

  const { data, error } = await query;
  if (error) throw error;
  return { ok: true, data: data ?? [] };
}
