import { GoogleGenerativeAI } from "@google/generative-ai";
import { detectSubjectTag } from "./math";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";

export const hasGeminiConfig = Boolean(apiKey);

function getClient() {
  if (!apiKey) {
    throw new Error("Gemini API 키가 없습니다. .env에 VITE_GEMINI_API_KEY를 입력해주세요.");
  }
  return new GoogleGenerativeAI(apiKey);
}

function getTutorModel(currentGrade) {
  const systemInstruction = `너는 중학교 1학년 수학을 가르치는 친절한 선생님이야.
이해력이 낮은 중1 학생도 혼자 읽고 이해할 수 있도록
아래 규칙을 반드시 지켜서 풀이 설명을 작성해줘.

[절대 금지]
- 정답을 직접 알려주는 것
- 등록된 문제의 숫자/조건을 그대로 예시로 사용하는 것
- 객관식 보기 제시 (① ② ③ ④ 형태 완전 금지)
- 어려운 수학 용어를 설명 없이 사용하는 것

[풀이 구성 순서 - 반드시 이 순서로 작성]

1. 🔑 핵심 개념
   - 이 문제를 풀기 위해 꼭 알아야 할 공식이나 개념 1가지만
   - 중학교 1학년이 이해할 수 있는 쉬운 말로 설명
   - 한 문장은 최대 2줄 이내로 짧게 끊어서 작성

2. 💡 실생활 예시
   - "실생활에서 이런 상황을 생각해봐!" 로 시작
   - 원래 문제와 같은 유형이지만 숫자를 완전히 다르게 바꾼 예시 사용
   - 숫자를 직접 대입해서 계산 과정을 아래처럼 한 줄씩 나눠서 표시

   예시 형태:
   거리 = 6km, 속력 = 시속 2km 라면
   ① 내야 할 돈 = 2000 × 3 = 6000원
   ② 거스름돈 = 10000 - 6000 = 4000원

3. 📝 문자로 바꾸는 방법
   - 예시의 숫자를 문자로 어떻게 바꾸는지 설명
   - 반드시 번호를 붙여서 한 단계씩 나눠서 작성
   - 수식은 반드시 별도 줄에 단독으로 표시
   - 곱하기 기호는 × 대신 · (중점) 사용

4. ⚠️ 자주 하는 실수 (해당되는 경우만 포함)
   - 이 유형에서 학생들이 자주 틀리는 포인트 1가지만
   - 왜 틀리는지, 어떻게 생각해야 하는지 짧게 설명

5. 💬 마무리
   - "이제 원래 문제에서도 같은 방법을 적용해봐! 💪"
   - 어떤 단계부터 시작하면 좋을지 힌트 1줄 추가

[문체 규칙]
- 전체 반말 사용 (예: "~이야", "~해봐", "~거야")
- 한 문장은 최대 2줄 이내로 짧게 끊어서 작성
- 수식은 반드시 별도 줄에 단독으로 표시
- 이모지를 각 섹션 앞에 사용해서 시각적으로 구분
- 전체 응답은 한국어로

[설명 대상 학년]: ${currentGrade}
(중1 / 초6 / 초5 / 초4 중 하나. 해당 학년 눈높이에 맞게 어휘와 설명 수준 조절)`;

  return getClient().getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction
  });
}

export async function requestMathHelp({ problemText, imageFile, currentGrade }) {
  const model = getTutorModel(currentGrade);
  const parts = [];
  if (imageFile) {
    const base64 = await fileToBase64(imageFile);
    parts.push({ inlineData: { data: base64, mimeType: imageFile.type } });
  }
  parts.push(`[입력된 문제]: ${problemText}`);
  const result = await model.generateContent(parts);
  return result.response.text();
}

export async function requestPracticeProblems({ problemText, explanation }) {
  const model = getClient().getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json"
    }
  });

  const result = await model.generateContent(`
위에서 설명한 수학 유형과 동일한 유형의 4지선다 객관식 연습 문제를 1~2개 새로 만들어줘.

[규칙]
- 원래 등록된 문제의 숫자와 조건은 절대 그대로 사용하지 말 것
- 난이도는 원래 문제와 비슷하게 유지할 것
- 각 문제마다 선택지 4개, 정답 선택지 번호, 핵심 힌트(1~2줄)를 함께 생성할 것
- 정답 선택지는 0부터 시작하는 배열 인덱스로 correctIndex에 넣을 것
- 문제는 아이가 혼자 풀 수 있는 완결된 형태로 만들 것
- 전체 응답은 한국어로

[응답 JSON 형식]
{
  "problems": [
    {
      "question": "문제 내용",
      "choices": ["선택지 1", "선택지 2", "선택지 3", "선택지 4"],
      "correctIndex": 0,
      "answer": "정답 선택지 내용",
      "hint": "핵심 힌트 1~2줄"
    }
  ]
}

[원래 등록된 문제]
${problemText}

[방금 제공한 풀이 설명]
${explanation}
`);

  return parsePracticeProblems(result.response.text());
}

export async function extractProblemTextFromImage(file) {
  const model = getClient().getGenerativeModel({ model: GEMINI_MODEL });
  const base64 = await fileToBase64(file);

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64,
        mimeType: file.type
      }
    },
    "이미지 안의 중학교 수학 문제 텍스트만 한국어로 정확히 추출해줘. 풀이하거나 정답을 말하지 마."
  ]);

  return result.response.text().trim();
}

export async function classifyProblem(problemText, imageFile) {
  if (!apiKey) return detectSubjectTag(problemText);

  const model = getClient().getGenerativeModel({ model: GEMINI_MODEL });
  const parts = [];
  if (imageFile) {
    const base64 = await fileToBase64(imageFile);
    parts.push({ inlineData: { data: base64, mimeType: imageFile.type } });
  }
  parts.push(`아래 수학 문제의 단원명을 하나만 한국어로 답해줘.
예: 일차방정식, 비와 비율, 정수와 유리수, 문자와 식, 좌표평면과 그래프, 기본도형, 통계

문제:
${problemText}`);
  const result = await model.generateContent(parts);
  return result.response.text().replace(/\s+/g, " ").trim() || detectSubjectTag(problemText);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parsePracticeProblems(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  const problems = Array.isArray(parsed.problems) ? parsed.problems : [];

  return problems
    .slice(0, 2)
    .map((problem, index) => ({
      id: `practice-${Date.now()}-${index}`,
      question: String(problem.question || "").trim(),
      choices: normalizeChoices(problem),
      correctIndex: normalizeCorrectIndex(problem),
      answer: String(problem.answer || "").trim(),
      hint: String(problem.hint || "").trim()
    }))
    .filter((problem) => problem.question && problem.choices.length === 4 && problem.hint);
}

function normalizeChoices(problem) {
  const choices = Array.isArray(problem.choices) ? problem.choices.map((choice) => String(choice).trim()) : [];
  return choices.filter(Boolean).slice(0, 4);
}

function normalizeCorrectIndex(problem) {
  const index = Number(problem.correctIndex);
  if (Number.isInteger(index) && index >= 0 && index <= 3) return index;

  const choices = normalizeChoices(problem);
  const answer = String(problem.answer || "").trim();
  const foundIndex = choices.findIndex((choice) => choice === answer);
  return foundIndex >= 0 ? foundIndex : 0;
}
