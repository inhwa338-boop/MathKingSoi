import { createSupabaseServerClient } from "./_supabase.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "GET 요청만 사용할 수 있습니다." });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      throw new Error("텔레그램 환경변수가 설정되지 않았습니다.");
    }

    const reportDate = getKstYesterday();
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("study_logs")
      .select("*")
      .eq("date", reportDate.iso)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      return response.status(200).json({ ok: true, sent: false, reason: "전날 학습 기록이 없습니다." });
    }

    const message = buildTelegramMessage(data, reportDate);
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message
      })
    });

    const telegramPayload = await telegramResponse.json().catch(() => ({}));
    if (!telegramResponse.ok) {
      throw new Error(telegramPayload.description || "텔레그램 메시지 발송 실패");
    }

    return response.status(200).json({ ok: true, sent: true, count: data.length });
  } catch (error) {
    return response.status(500).json({ error: error.message || "일일 리포트 발송 실패" });
  }
}

function getKstYesterday() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);

  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");

  return {
    iso: `${year}-${month}-${day}`,
    label: `${year}년 ${month}월 ${day}일`
  };
}

function buildTelegramMessage(logs, reportDate) {
  const confusedUnits = Array.from(
    new Set(logs.filter((log) => log.understanding_status === "confused").map((log) => log.subject_tag))
  );

  const lines = logs.map((log, index) => {
    const emoji = log.understanding_status === "understood" ? "😊 이해했어요" : "🤔 아직 헷갈려요";
    const summary = shorten(log.problem_summary || "문제 요약 없음", 38);
    return `${index + 1}. [${log.subject_tag}] ${summary} → ${emoji} (더쉽게 ${log.easier_count || 0}회)`;
  });

  const practiceProblemsCount = logs.reduce((sum, log) => sum + Number(log.practice_problems_count || 0), 0);
  const practiceCheckedCount = logs.reduce((sum, log) => sum + Number(log.practice_checked_count || 0), 0);

  return `📚 [어제의 수학 학습 리포트] ${reportDate.label}

✏️ 총 ${logs.length}문제 질문했어요

🔢 연습 문제: ${practiceProblemsCount}개 생성 → ${practiceCheckedCount}개 정답 확인함

📌 문제별 현황:
${lines.join("\n")}

⚠️ 아직 헷갈리는 단원: ${confusedUnits.length ? confusedUnits.join(", ") : "없음"}
💪 오늘도 열심히 공부했어요!`;
}

function shorten(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}
