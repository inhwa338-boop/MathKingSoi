import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import {
  ArrowLeft,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Search,
  X,
} from "lucide-react";
import {
  classifyProblem,
  extractProblemTextFromImage,
  hasGeminiConfig,
  requestMathHelp,
} from "./lib/gemini";
import { saveStudyLogViaApi } from "./lib/studyLogApi";
import { getHistory, updateHistoryItem, upsertHistoryItem, getDailyRemaining, consumeDailyUsage } from "./lib/storage";
import { GRADE_LEVELS, detectSubjectTag, statusForServer, statusLabel, summarizeProblem } from "./lib/math";

const todayIso = () => new Date().toISOString().slice(0, 10);
const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const LOADING_STEPS = [
  "문제를 확인하고 있어요",
  "AI가 문제를 분석하고 있어요",
  "풀이 방법을 완성하고 있어요",
];

const QUIZ_MARKER = "✏️ 스스로 맞히는 퀴즈 카드";
const CIRCLE_NUMS = ["①", "②", "③", "④"];

function parseQuizFromExplanation(explanation) {
  if (!explanation) return { content: explanation, quiz: null };
  const idx = explanation.indexOf(QUIZ_MARKER);
  if (idx === -1) return { content: explanation, quiz: null };

  const content = explanation.slice(0, idx).trim();
  const quizSection = explanation.slice(idx + QUIZ_MARKER.length);

  const choices = CIRCLE_NUMS.map((num) => {
    const start = quizSection.indexOf(num);
    if (start === -1) return null;
    const end = quizSection.indexOf("\n", start);
    const line = end === -1 ? quizSection.slice(start + num.length) : quizSection.slice(start + num.length, end);
    return line.trim();
  }).filter(Boolean);

  if (choices.length !== 4) return { content: explanation, quiz: null };
  return { content, quiz: { choices, correctIndex: 3 } };
}

export default function App() {
  const [showIntro, setShowIntro] = useState(false);
  const [view, setView] = useState("home");
  const [question, setQuestion] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeProblem, setActiveProblem] = useState(null);
  const [historyDetailItem, setHistoryDetailItem] = useState(null);
  const [message, setMessage] = useState("");
  const [isSolving, setIsSolving] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [unitFilter, setUnitFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [dailyRemaining, setDailyRemaining] = useState(() => getDailyRemaining());
  const fileInputRef = useRef(null);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const subjectTags = useMemo(() => {
    return ["전체", ...Array.from(new Set(history.map((item) => item.subjectTag).filter(Boolean)))];
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const unitMatch = unitFilter === "전체" || item.subjectTag === unitFilter;
      const statusMatch =
        statusFilter === "전체" ||
        (statusFilter === "이해함" && item.understandingStatus === "understood") ||
        (statusFilter === "헷갈림" && item.understandingStatus === "confused");
      return unitMatch && statusMatch;
    });
  }, [history, statusFilter, unitFilter]);

  async function handleSubmit(event) {
    event?.preventDefault();
    if (isSolving) return;

    const typedQuestion = question.trim();
    if (!typedQuestion && !attachedFile) {
      setMessage("문제를 입력하거나 사진을 첨부해주세요.");
      return;
    }

    if (getDailyRemaining() <= 0) {
      setMessage("오늘 사용 가능한 횟수를 모두 썼어요. 내일 다시 시도해주세요.");
      return;
    }

    if (!hasGeminiConfig) {
      setMessage(".env에 VITE_GEMINI_API_KEY를 입력해야 AI 풀이 도움을 받을 수 있어요.");
      return;
    }

    const remaining = consumeDailyUsage();
    setDailyRemaining(remaining);

    setMessage("");
    setView("solving");
    setIsSolving(true);
    setLoadingStep(1);
    setLoadingMessage(LOADING_STEPS[0]);

    const imagePreview = attachedFile ? URL.createObjectURL(attachedFile) : "";
    const problem = {
      id: makeId(),
      problemText: typedQuestion || "이미지 문제",
      problemSummary: summarizeProblem(typedQuestion || "이미지 문제"),
      imagePreview,
      subjectTag: "분석 중",
      registeredAt: new Date().toISOString(),
      understandingStatus: "unanswered",
      easierCount: 0,
      practiceProblems: [],
      practiceSelections: {},
      practiceCheckedIds: [],
      practiceCheckedCount: 0,
      currentGradeIndex: 0,
      explanation: "",
      inlineQuizSelection: null,
    };
    setActiveProblem(problem);

    try {
      setLoadingStep(1);
      setLoadingMessage(LOADING_STEPS[1]);

      const [problemText, subjectTag, explanation] = await Promise.all([
        attachedFile
          ? extractProblemTextFromImage(attachedFile)
          : Promise.resolve(typedQuestion),
        hasGeminiConfig
          ? classifyProblem(typedQuestion || "", attachedFile || null)
          : Promise.resolve(detectSubjectTag(typedQuestion)),
        requestMathHelp({
          problemText: typedQuestion || "이미지 문제",
          imageFile: attachedFile || null,
          currentGrade: GRADE_LEVELS[0],
        }),
      ]);

      const completed = {
        ...problem,
        problemText,
        problemSummary: summarizeProblem(problemText),
        subjectTag,
        explanation,
        practiceProblems: [],
        practiceSelections: {},
        practiceCheckedIds: [],
        practiceCheckedCount: 0,
        inlineQuizSelection: null,
      };
      setActiveProblem(completed);
      setHistory(upsertHistoryItem(completed));
      setQuestion("");
      setAttachedFile(null);
    } catch (error) {
      const msg = error.message || "";
      if (msg.includes("429") || msg.includes("quota") || msg.includes("rate")) {
        setMessage("오늘 AI 사용 횟수를 모두 썼어요. 잠시 후 다시 시도해주세요.");
      } else {
        setMessage("AI 풀이를 준비하지 못했어요. 다시 시도해주세요.");
      }
      setView("home");
    } finally {
      setIsSolving(false);
      setLoadingStep(0);
      setLoadingMessage("");
    }
  }

  async function handleUnderstanding(status) {
    if (!activeProblem) return;

    const updated = {
      ...activeProblem,
      understandingStatus: status,
      completedAt: new Date().toISOString(),
    };

    setActiveProblem(updated);
    setHistory(updateHistoryItem(updated.id, updated));

    try {
      await saveStudyLogViaApi({
        date: todayIso(),
        problemSummary: updated.problemSummary,
        subjectTag: updated.subjectTag,
        understandingStatus: statusForServer(status),
        easierCount: updated.easierCount,
        practiceProblemsCount: updated.practiceProblems?.length || 0,
        practiceCheckedCount: updated.practiceCheckedCount || 0,
      });
    } catch {
      // Server logging optional
    }
  }

  function handlePracticeChoice(problemId, choiceIndex) {
    if (!activeProblem) return;

    const selections = activeProblem.practiceSelections || {};
    if (selections[problemId] !== undefined) return;

    const nextSelections = { ...selections, [problemId]: choiceIndex };
    const nextCheckedIds = [...(activeProblem.practiceCheckedIds || []), problemId];
    const updated = {
      ...activeProblem,
      practiceSelections: nextSelections,
      practiceCheckedIds: nextCheckedIds,
      practiceCheckedCount: (activeProblem.practiceCheckedCount || 0) + 1,
    };

    setActiveProblem(updated);
    setHistory(updateHistoryItem(updated.id, updated));
  }

  function handleInlineQuizChoice(choiceIndex) {
    if (!activeProblem || activeProblem.inlineQuizSelection !== null) return;
    const updated = { ...activeProblem, inlineQuizSelection: choiceIndex };
    setActiveProblem(updated);
    setHistory(updateHistoryItem(updated.id, updated));
  }

  function handleCloseSolving() {
    setView("home");
    setMessage("");
  }

  function handleOpenHistoryDetail(item) {
    setHistoryDetailItem(item);
    setView("history-detail");
  }

  if (showIntro) {
    return (
      <div className="splash-screen flex items-center justify-center overflow-hidden">
        <img src="/intro-logo.png" alt="" className="intro-logo w-[88vw] max-w-[430px] select-none object-contain" />
      </div>
    );
  }

  if (view === "solving") {
    return (
      <SolvingView
        activeProblem={activeProblem}
        isSolving={isSolving}
        loadingStep={loadingStep}
        loadingMessage={loadingMessage}
        onClose={handleCloseSolving}
        onUnderstanding={handleUnderstanding}
        onQuizChoice={handleInlineQuizChoice}
      />
    );
  }

  if (view === "history-detail") {
    return (
      <HistoryDetailView
        item={historyDetailItem}
        onBack={() => setView("history")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 pb-5 pt-6">
        <TopNav view={view} setView={setView} />

        {message && (
          <div className="mt-4 rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-[13px] text-error">
            {message}
          </div>
        )}

        {view === "history" ? (
          <HistoryView
            history={filteredHistory}
            subjectTags={subjectTags}
            unitFilter={unitFilter}
            setUnitFilter={setUnitFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onSelectItem={handleOpenHistoryDetail}
          />
        ) : (
          <HomeView
            question={question}
            setQuestion={setQuestion}
            attachedFile={attachedFile}
            setAttachedFile={setAttachedFile}
            fileInputRef={fileInputRef}
            onSubmit={handleSubmit}
            dailyRemaining={dailyRemaining}
          />
        )}
      </main>
    </div>
  );
}

function TopNav({ view, setView }) {
  return (
    <header className="mb-2">
      <nav className="grid h-12 grid-cols-2 rounded-[20px] bg-subtle p-1">
        <button
          onClick={() => setView("home")}
          className={`flex items-center justify-center gap-1.5 rounded-2xl text-[13px] font-bold transition duration-150 ease-bezier ${
            view === "home" ? "bg-white text-ink shadow-soft" : "text-muted"
          }`}
        >
          <Search className="h-4 w-4" />
          질문
        </button>
        <button
          onClick={() => setView("history")}
          className={`flex items-center justify-center gap-1.5 rounded-2xl text-[13px] font-bold transition duration-150 ease-bezier ${
            view === "history" ? "bg-white text-ink shadow-soft" : "text-muted"
          }`}
        >
          <History className="h-4 w-4" />
          기록
        </button>
      </nav>
    </header>
  );
}

function HomeView({ question, setQuestion, attachedFile, setAttachedFile, fileInputRef, onSubmit, dailyRemaining }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!attachedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachedFile]);

  const exhausted = dailyRemaining <= 0;
  const canSubmit = (question.trim() || attachedFile) && !exhausted;

  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center pb-28 text-center">
        <h1 className="text-[22px] font-bold leading-7 tracking-[-0.4px] text-ink">안녕 소이야 👋</h1>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-muted">
          {"모르는 수학 문제를 물어보면\n풀이 방법을 쉽게 알려줄게!"}
        </p>
        <p className={`mt-5 text-[13px] ${exhausted ? "text-error" : "text-muted"}`}>
          {exhausted
            ? "오늘 사용 가능한 횟수를 모두 썼어요.\n내일 다시 시도해주세요."
            : `오늘 남은 횟수 : ${dailyRemaining}회`}
        </p>
      </section>

      <form onSubmit={onSubmit} className="sticky bottom-5">
        <div className="rounded-[20px] border border-line bg-subtle p-4">
          {previewUrl && (
            <div className="relative mb-3 w-fit">
              <img src={previewUrl} alt="첨부 이미지" className="h-24 w-24 rounded-xl object-cover" />
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                aria-label="이미지 삭제"
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit(event);
              }
            }}
            placeholder="수학 문제를 입력해보세요..."
            rows={2}
            className="max-h-32 min-h-12 w-full resize-none bg-transparent text-[16px] leading-6 outline-none placeholder:text-muted"
          />

          <div className="mt-3 flex items-center justify-between">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => setAttachedFile(event.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={exhausted}
              aria-label="사진 첨부"
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-white transition duration-150 ease-bezier ${
                exhausted ? "cursor-not-allowed opacity-30 text-muted" : "text-muted"
              }`}
            >
              <Camera className="h-5 w-5" />
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label="전송"
              className={`flex h-10 w-10 items-center justify-center rounded-full transition duration-150 ease-bezier ${
                canSubmit ? "bg-cobalt text-white" : "bg-white text-muted opacity-30"
              }`}
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function SolvingView({ activeProblem, isSolving, loadingStep, loadingMessage, onClose, onUnderstanding, onQuizChoice }) {
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    if (!isSolving) return;
    setBarWidth(0);
    const timer = setInterval(() => {
      setBarWidth((prev) => {
        if (prev >= 95) return prev;
        if (prev < 80) return Math.min(80, prev + 2.5); // 빠르게 80%까지
        return prev + (95 - prev) * 0.008;              // 80% 이후 천천히
      });
    }, 100);
    return () => clearInterval(timer);
  }, [isSolving]);

  useEffect(() => {
    if (activeProblem?.explanation) setBarWidth(100);
  }, [activeProblem?.explanation]);

  const { content: explanationContent, quiz } = useMemo(
    () => parseQuizFromExplanation(activeProblem?.explanation),
    [activeProblem?.explanation]
  );

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle text-ink transition duration-150 ease-bezier"
          >
            <X className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-[17px] font-bold leading-6 tracking-[-0.1px]">풀이 방법</h1>
            <p className="text-[13px] text-muted">정답 대신 방법을 익혀요</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-5 py-5">
        {isSolving && (
          <div className="app-card p-5">
            <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-divider">
              <div
                className="h-full rounded-full bg-cobalt transition-all duration-200 ease-linear"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cobalt" />
              <p className="text-[15px] text-ink">{loadingMessage || LOADING_STEPS[0]}</p>
            </div>
          </div>
        )}

        {activeProblem?.explanation && (
          <>
            <section className="app-card p-5">
              <div className="mb-3">
                <span className="rounded-md bg-cobalt/10 px-2 py-1 text-[12px] text-cobalt">
                  {activeProblem.subjectTag}
                </span>
              </div>
              <Markdown
                rehypePlugins={[rehypeRaw]}
                className="text-[16px] leading-[1.8] text-ink"
                components={markdownComponents}
              >
                {explanationContent || activeProblem.explanation}
              </Markdown>
            </section>

            {quiz && (
              <InlineQuizCard
                quiz={quiz}
                selection={activeProblem.inlineQuizSelection ?? null}
                onChoice={onQuizChoice}
              />
            )}

            <section className="flex gap-2">
              <button
                onClick={() => onUnderstanding("understood")}
                className="flex-1 rounded py-3 text-[14px] font-bold text-white bg-success transition duration-150 ease-bezier"
              >
                이해했어요
              </button>
              <button
                onClick={() => onUnderstanding("confused")}
                className="flex-1 rounded py-3 text-[14px] font-bold text-white bg-error transition duration-150 ease-bezier"
              >
                아직 헷갈려요
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

const markdownComponents = {
  p: ({ children }) => (
    <p className="mb-4 last:mb-0 text-[16px] leading-[1.8] text-ink">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
  hr: () => <hr className="my-6 border-divider" />,
  ul: ({ children }) => <ul className="my-3 space-y-2">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 space-y-2">{children}</ol>,
  li: ({ children }) => (
    <li className="flex gap-2 text-[16px] leading-[1.8] text-ink">
      <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-cobalt" />
      <span>{children}</span>
    </li>
  ),
  h1: ({ children }) => <h1 className="mb-3 mt-6 text-[18px] font-bold text-ink">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-5 text-[17px] font-bold text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-[16px] font-bold text-ink">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 text-[16px] font-bold text-ink">{children}</h4>,
  code: ({ children }) => (
    <code className="rounded-md bg-subtle px-2 py-0.5 text-[14px] text-ink font-mono">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 rounded-xl bg-subtle px-4 py-3 text-[15px] text-ink overflow-x-auto leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-xl bg-subtle border-l-4 border-cobalt px-4 py-3 text-[16px] leading-[1.8] text-ink">
      {children}
    </blockquote>
  ),
};

function InlineQuizCard({ quiz, selection, onChoice }) {
  const [showConfetti, setShowConfetti] = useState(false);
  const { choices, correctIndex } = quiz;
  const hasSelected = selection !== null;

  function handleChoice(i) {
    if (hasSelected) return;
    onChoice(i);
    if (i === correctIndex) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 900);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-line bg-subtle p-5">
      {showConfetti && <ConfettiBurst />}
      <h2 className="mb-4 text-[16px] font-bold leading-6 text-ink">✏️ 스스로 맞히는 퀴즈 카드</h2>
      <div className="space-y-2">
        {choices.map((choice, i) => {
          const isSelected = selection === i;
          const isCorrect = i === correctIndex;
          const showO = hasSelected && isCorrect;
          const showX = hasSelected && isSelected && !isCorrect;
          return (
            <button
              key={i}
              disabled={hasSelected}
              onClick={() => handleChoice(i)}
              className={`relative w-full rounded-lg border px-3 py-2.5 pr-10 text-left text-[14px] leading-5 transition duration-150 ease-bezier ${
                showO
                  ? "border-success/30 bg-success/5 text-success"
                  : showX
                    ? "border-error/30 bg-error/5 text-error"
                    : "border-line bg-white text-ink hover:bg-subtle"
              }`}
            >
              {CIRCLE_NUMS[i]} {choice}
              {showO && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold text-success">O</span>}
              {showX && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold text-error">X</span>}
            </button>
          );
        })}
      </div>
      {hasSelected && selection !== correctIndex && (
        <p className="mt-3 text-[13px] text-muted">
          정답은 <span className="font-bold text-success">{CIRCLE_NUMS[correctIndex]} {choices[correctIndex]}</span> 이에요.
        </p>
      )}
    </section>
  );
}

const CONFETTI_COLORS = ["#a855f7", "#31A552", "#EDBC40", "#E94E58", "#6687FF", "#3CDDCD", "#FFAB5C", "#EC6FD3"];
const CONFETTI_DIRS = [
  { tx: "0px", ty: "-52px" },
  { tx: "37px", ty: "-37px" },
  { tx: "52px", ty: "0px" },
  { tx: "37px", ty: "37px" },
  { tx: "0px", ty: "52px" },
  { tx: "-37px", ty: "37px" },
  { tx: "-52px", ty: "0px" },
  { tx: "-37px", ty: "-37px" },
];

function ConfettiBurst() {
  return (
    <div
      style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 10 }}
      aria-hidden="true"
    >
      {CONFETTI_DIRS.map((dir, i) => (
        <span
          key={i}
          className="confetti-particle"
          style={{
            "--tx": dir.tx,
            "--ty": dir.ty,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${i * 25}ms`,
          }}
        />
      ))}
    </div>
  );
}

function PracticeQuiz({ activeProblem, onPracticeChoice }) {
  const [confettiIds, setConfettiIds] = useState([]);

  const problems = activeProblem.practiceProblems || [];
  const selections = activeProblem.practiceSelections || {};

  function handleChoice(problemId, choiceIndex) {
    const problem = problems.find((p) => p.id === problemId);
    onPracticeChoice(problemId, choiceIndex);
    if (problem && choiceIndex === (problem.correctIndex ?? 0)) {
      setConfettiIds((prev) => [...prev, problemId]);
      setTimeout(() => setConfettiIds((prev) => prev.filter((id) => id !== problemId)), 900);
    }
  }

  if (problems.length === 0) {
    return (
      <section className="app-card p-5">
        <div className="flex items-center gap-2 text-[14px] text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          확인 문제를 준비하고 있어요.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-subtle p-5">
      <h2 className="text-[16px] font-bold leading-6 text-ink">이해했는지 확인해봐요</h2>
      <div className="mt-4 space-y-4">
        {problems.map((problem, index) => {
          const selected = selections[problem.id];
          const hasSelected = selected !== undefined;
          const correctIndex = problem.correctIndex ?? 0;
          const showConfetti = confettiIds.includes(problem.id);
          return (
            <div key={problem.id} className="relative overflow-hidden rounded-xl border border-line bg-white p-4">
              {showConfetti && <ConfettiBurst />}
              <p className="text-[14px] leading-5 text-ink">
                {index + 1}. {problem.question}
              </p>
              <div className="mt-3 grid gap-2">
                {(problem.choices || []).map((choice, choiceIndex) => {
                  const isCorrect = choiceIndex === correctIndex;
                  const isSelected = selected === choiceIndex;
                  const showCorrect = hasSelected && isCorrect;
                  const showWrong = hasSelected && isSelected && !isCorrect;
                  return (
                    <button
                      key={`${problem.id}-${choiceIndex}`}
                      disabled={hasSelected}
                      onClick={() => handleChoice(problem.id, choiceIndex)}
                      className={`relative rounded-lg border px-3 py-2.5 pr-9 text-left text-[14px] leading-5 transition duration-150 ease-bezier ${
                        showCorrect
                          ? "border-success/30 bg-success/5 text-success"
                          : showWrong
                            ? "border-error/30 bg-error/5 text-error"
                            : "border-line bg-subtle text-ink hover:bg-white"
                      }`}
                    >
                      {choice}
                      {showCorrect && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold text-success">
                          O
                        </span>
                      )}
                      {showWrong && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold text-error">
                          X
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {hasSelected && (
                <div className="mt-3 rounded-lg bg-cobalt/5 px-3 py-2.5 text-[13px] leading-5 text-ink">
                  {selected === correctIndex
                    ? "정답이에요!"
                    : `정답은 '${problem.choices?.[correctIndex] || problem.answer}'예요.`}
                  {problem.hint && (
                    <>
                      <br />
                      {problem.hint}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HistoryView({ history, subjectTags, unitFilter, setUnitFilter, statusFilter, setStatusFilter, onSelectItem }) {
  return (
    <section className="mt-5 pb-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-[-0.4px] text-ink">기록</h1>
        <span className="text-[13px] text-muted">{history.length}개</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="filter-select">
          {subjectTags.map((tag) => (
            <option key={tag}>{tag}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="filter-select">
          <option>전체</option>
          <option>이해함</option>
          <option>헷갈림</option>
        </select>
      </div>

      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-subtle p-8 text-center text-[14px] text-muted">
          아직 저장된 기록이 없어요.
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="w-full rounded-xl border border-line bg-white p-4 text-left transition duration-150 ease-bezier hover:bg-subtle"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-cobalt/10 px-2 py-0.5 text-[12px] text-cobalt">
                      {item.subjectTag}
                    </span>
                    <span className="text-[12px] text-muted">
                      {new Date(item.registeredAt).toLocaleDateString("ko-KR")}
                    </span>
                    {item.understandingStatus !== "unanswered" && (
                      <span
                        className={`text-[12px] ${
                          item.understandingStatus === "understood" ? "text-success" : "text-error"
                        }`}
                      >
                        {statusLabel(item.understandingStatus)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[14px] leading-5 text-ink">{item.problemSummary}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryDetailView({ item, onBack }) {
  const [problemOpen, setProblemOpen] = useState(false);

  if (!item) return null;

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            onClick={onBack}
            aria-label="뒤로 가기"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-subtle text-ink transition duration-150 ease-bezier"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-[17px] font-bold leading-6 tracking-[-0.1px]">풀이 방법</h1>
            <p className="text-[13px] text-muted">
              {new Date(item.registeredAt).toLocaleDateString("ko-KR")}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-5 py-5">
        {/* 등록한 문제 accordion */}
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <button
            onClick={() => setProblemOpen(!problemOpen)}
            className="flex w-full items-center justify-between p-4 text-left transition duration-150 ease-bezier"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-cobalt/10 px-2 py-0.5 text-[12px] text-cobalt">
                {item.subjectTag}
              </span>
              <span className="text-[14px] font-bold text-ink">등록한 문제</span>
            </div>
            {problemOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
            )}
          </button>
          {problemOpen && (
            <div className="border-t border-line bg-subtle px-4 py-4">
              {item.imagePreview && (
                <img
                  src={item.imagePreview}
                  alt="문제 이미지"
                  className="mb-3 max-h-48 w-full rounded-lg object-cover"
                />
              )}
              <p className="whitespace-pre-wrap text-[14px] leading-5 text-ink">{item.problemText}</p>
            </div>
          )}
        </section>

        {/* 풀이 방법 */}
        <section className="app-card p-5">
          <h2 className="mb-3 text-[15px] font-bold text-ink">풀이 방법</h2>
          <Markdown
            rehypePlugins={[rehypeRaw]}
            className="text-[16px] leading-[1.8] text-ink"
            components={markdownComponents}
          >
            {parseQuizFromExplanation(item.explanation).content || "저장된 풀이가 없어요."}
          </Markdown>
        </section>

        {/* 퀴즈 (기록) */}
        {(() => {
          const { quiz } = parseQuizFromExplanation(item.explanation);
          if (!quiz) return null;
          return (
            <InlineQuizCard
              quiz={quiz}
              selection={item.inlineQuizSelection ?? null}
              onChoice={() => {}}
            />
          );
        })()}

        {/* 이해 상태 */}
        {item.understandingStatus !== "unanswered" && (
          <div
            className={`rounded-lg px-4 py-3 text-center text-[14px] font-bold ${
              item.understandingStatus === "understood"
                ? "bg-success/10 text-success"
                : "bg-error/10 text-error"
            }`}
          >
            {statusLabel(item.understandingStatus)}
          </div>
        )}
      </main>
    </div>
  );
}
