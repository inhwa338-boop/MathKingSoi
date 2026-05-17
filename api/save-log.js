import { createSupabaseServerClient } from "./_supabase.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 사용할 수 있습니다." });
  }

  try {
    const body = request.body || {};
    const required = ["date", "problemSummary", "subjectTag", "understandingStatus"];
    const missing = required.filter((key) => !body[key]);

    if (missing.length > 0) {
      return response.status(400).json({ error: `필수 값이 없습니다: ${missing.join(", ")}` });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("study_logs")
      .insert({
        date: body.date,
        problem_summary: body.problemSummary,
        subject_tag: body.subjectTag,
        understanding_status: body.understandingStatus,
        easier_count: Number(body.easierCount || 0),
        practice_problems_count: Number(body.practiceProblemsCount || 0),
        practice_checked_count: Number(body.practiceCheckedCount || 0)
      })
      .select()
      .single();

    if (error) throw error;

    return response.status(200).json({ ok: true, data });
  } catch (error) {
    return response.status(500).json({ error: error.message || "학습 기록 저장 실패" });
  }
}
