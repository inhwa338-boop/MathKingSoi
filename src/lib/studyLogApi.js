export async function saveStudyLogViaApi(log) {
  const response = await fetch("/api/save-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(log)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "학습 기록 저장에 실패했습니다.");
  }

  return payload;
}
