const TAG_RULES = [
  { tag: "일차방정식", patterns: [/방정식/, /x/, /해를/, /=/] },
  { tag: "비와 비율", patterns: [/비율/, /비례/, /퍼센트|%/, /할인/] },
  { tag: "정수와 유리수", patterns: [/정수/, /유리수/, /음수/, /양수/, /절댓값/] },
  { tag: "문자와 식", patterns: [/문자/, /식을/, /대입/, /계수/, /항/] },
  { tag: "좌표평면과 그래프", patterns: [/좌표/, /그래프/, /원점/, /x축/, /y축/] },
  { tag: "기본도형", patterns: [/각도/, /평행/, /수직/, /삼각형/, /사각형/, /원/] },
  { tag: "통계", patterns: [/평균/, /중앙값/, /최빈값/, /자료/, /도수/] }
];

export const GRADE_LEVELS = ["중1", "초6", "초5", "초4"];

export function detectSubjectTag(problemText) {
  const source = problemText || "";
  const found = TAG_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(source)));
  return found?.tag || "중1 수학";
}

export function summarizeProblem(problemText, maxLength = 60) {
  const compact = (problemText || "이미지 문제").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}

export function isSimilarProblemType(newProblemText, historyItem) {
  const newTag = detectSubjectTag(newProblemText);
  if (newTag !== historyItem.subjectTag) return false;

  const tokens = new Set(
    (newProblemText || "")
      .replace(/[0-9.,/%=+\-*/()]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2)
  );

  const previousTokens = (historyItem.problemText || historyItem.problemSummary || "")
    .replace(/[0-9.,/%=+\-*/()]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  const overlap = previousTokens.filter((token) => tokens.has(token)).length;
  return overlap >= 2 || newTag !== "중1 수학";
}

export function statusLabel(status) {
  if (status === "understood") return "이해했어요";
  if (status === "confused") return "아직 헷갈려요";
  return "미응답";
}

export function statusForServer(status) {
  if (status === "understood") return "understood";
  if (status === "confused") return "confused";
  return "unanswered";
}
