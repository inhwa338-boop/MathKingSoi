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
  const systemInstruction = `
너는 중학생 수학 학습 도우미야. 아래 규칙을 반드시 지켜야 해.
너는 중학교 1학년 학생들의 눈높이에 맞춰 수학을 가르치는 친절하고 명쾌한 선생님이야.

[절대 금지]
- 정답을 직접 알려주는 것
- 등록된 문제의 숫자/조건을 그대로 사용하는 것
- 장황한 줄글 설명이나 삭막한 표 형태로 답변하는 것

[반드시 지켜야 할 것]
- 관련 공식을 먼저 설명하고, 숫자를 바꾼 유사 예시로 풀이 과정을 단계별로 보여줄 것
- 설명 대상 학년: ${currentGrade} (중1, 초6, 초5, 초4 중 하나)
- 해당 학년의 어휘 수준과 이해 수준에 맞게 설명할 것
- [1단계 - 숫자 예시]: 누구나 바로 이해할 수 있는 구체적인 숫자를 대입해서 계산 과정을 식으로 먼저 보여줄 것
- [2단계 - 문자로 연결]: 숫자가 들어갔던 자리에 문제의 문자를 대입하여 자연스럽게 문자식으로 전환할 것
- [3단계 - 중1 개념 적용]: 중학교 과정에서 배우는 개념이 있다면 식의 형태가 왜 바뀌는지 직관적으로 짚어줄 것
- 모바일 화면에서 읽기 좋도록 이모지와 줄바꿈을 적절히 사용하고, 긴 문장은 짧게 나눌 것
- 표는 사용하지 말고, 짧은 단계형 블록으로 디자인하듯 깔끔하게 배치할 것
- 마지막에 "이제 원래 문제에서도 같은 방법을 적용해봐!" 라고 격려 문장 추가
- 전체 응답은 한국어로
`;

  return getClient().getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction
  });
}

export async function requestMathHelp({ problemText, currentGrade }) {
  const model = getTutorModel(currentGrade);
  const result = await model.generateContent(`
다음 문제를 보고 정답을 말하지 말고 풀이 방법만 도와줘.
원래 문제의 숫자와 조건은 절대 그대로 쓰지 말고, 반드시 바꾼 유사 예시로 설명해줘.
모바일에서 읽기 좋게 1단계, 2단계, 3단계 흐름으로 짧고 명확하게 작성해줘.

[등록된 문제]
${problemText}
`);

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

export async function classifyProblem(problemText) {
  if (!apiKey) return detectSubjectTag(problemText);

  const model = getClient().getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(`
아래 수학 문제의 단원명을 하나만 한국어로 답해줘.
예: 일차방정식, 비와 비율, 정수와 유리수, 문자와 식, 좌표평면과 그래프, 기본도형, 통계

문제:
${problemText}
`);
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
