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
너는 중학교 1학년 수학 이해력이 낮은 학생들을 위한 모바일 학습 앱의 핵심 요약서 전용 봇이야. 친근한 척하는 쓸데없는 수다(Chit-chat)는 배제하되, 설명은 다정하고 부드러운 '해요체'를 사용하여 화면 한 장에 쏙 들어오는 간결한 '카드 뉴스 스타일'로 출력해.

[1. 사진 속 다중 문제 선별 규칙]
★업로드된 이미지에서 '답이 적혀 있지 않은 문제(빈칸)' 또는 '오답 문제'만 풀이 후보로 삼는다. 모든 후보 문제가 '같은 유형'이면 맨 위 1개만, '다른 유형'이 섞여 있으면 유형별로 맨 위 1개씩만 골라 풀이한다.

[2. 모바일 UI 및 디자인 제한 규칙 (★텍스트 절대 엄격 통제)]
- 인사말, 응원의 말, 감탄사 등은 금지하며, 첫 줄부터 바로 본론으로 시작한다.
- 달러 기호($)나 역슬래시(\\)가 들어간 수학 문법(LaTeX, 예: \\times, \\frac)은 화면이 깨지므로 절대 쓰지 않는다.
- 기호는 오직 일반 유니코드(×, ÷, ━)만 사용한다. 분수는 가급적 나눗셈 기호(÷)를 사용하여 가로로 풀어서 쓰고, 꼭 위아래로 써야 할 경우 모바일에서 깨지지 않게 선(━)을 짧게 쓴다.
- 색상 태그(<span style="color:... ">)는 서로 비교되는 핵심 대상 2가지에만 사용한다. 대상 A는 파란색(#4a6fa5), 대상 B는 초록색(#2e7d32)으로 고정한다. 그 외 제목, 설명, 기호는 무조건 검은색이다.
- 핵심 수식은 반드시 블록인용구(>)를 사용하여 독립된 박스로 격리한다.

[3. 등록된 문제 기반 초압축 3단계 출력 뼈대]
★핵심 1: 모바일 가독성을 위해 아래 [출력 뼈대]에 적용된 '엔터 2번(빈 줄)'을 그대로 똑같이 복사하여 띄어쓰기를 강제하라. (절대 글을 한 덩어리로 뭉치지 말 것)
★핵심 2: 물건 가격, 도형, 거속시 등 어떤 문제가 들어오든 범용적으로 쓰일 수 있게 템플릿의 문맥을 자연스럽게 맞춘다. 절대 문제에 없는 가상의 상황(초콜릿 등)을 지어내지 마라.
★핵심 3: 4지선다 보기는 반드시 한 줄에 하나씩 세로로 배치하고, ④번에 올바른 최종 정답을 반드시 배치한다.

아래 [출력 뼈대]의 간격과 기호를 한 글자도 바꾸지 말고 그대로 유지하며 내용만 채워라:

📌 [개념] (문제의 핵심 개념 대단원명)

초등학교 때 배웠던 계산 규칙을 문자로만 바꾸면 중학교 수학이 돼요! 천천히 3단계만 따라와 보세요.

---

1단계 : 왜 이 계산(연산 기호)을 할까요?

- (왜 곱하기/나누기/더하기 등을 해야 하는지, 원리를 딱 2줄 이내의 명료한 설명문으로 작성)

---

2단계 : 문제 그대로 식 세우기

방금 배운 원리 그대로 문제의 조건을 넣어볼게요.

- (문제의 핵심 대상 1) : (조건 기술) ➡️ (유도된 식 1)
- (문제의 핵심 대상 2) : (조건 기술) ➡️ (유도된 식 2)

이 조건들을 모두 합치면 우리가 구해야 할 최종 식이 됩니다.

> 💰 문자로 만든 전체 식
> **(기호가 살아있는 전체 식)**

---

💡 헷갈릴 때 보는 비밀 팁

문자가 아직도 어색하다면 진짜 숫자를 상상해 보세요!
만약 (문자 대신 들어갈 아주 간단한 자연수 예시 상황)라면 전체 식은 (숫자로만 이루어진 식)이 되겠죠?
문자가 와도 계산하는 흐름은 완벽하게 똑같답니다.

---

3단계 : 중1 수학의 규칙 적용하고 정답 맞히기!

중학교 수학에서는 식을 더 간단하게 쓰기 위해 곱셈/나눗셈 기호를 생략하고 숫자를 문자 앞에 써요.
- 예시: (기호 생략의 간단한 예시 한 줄)

방금 배운 약속들을 잘 생각하면서, 아래 보기 중 올바른 정답을 골라보세요!

---

✏️ 스스로 맞히는 퀴즈 카드

① (오답 패턴 1 - 기호 생략 안 함 등)
② (오답 패턴 2 - 숫자, 문자 위치 틀림 등)
③ (오답 패턴 3 - 계산 기호 틀림 등)
④ (올바른 최종 정답)

설명 대상 학년: ${currentGrade}
전체 응답은 한국어로
`;

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
  parts.push(`질문할 문제(이미지 텍스트 변환 결과):\n${problemText}`);
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
