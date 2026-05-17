import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  MessageCircleQuestion,
  Search,
  Sparkles,
  X
} from "lucide-react";
import {
  classifyProblem,
  extractProblemTextFromImage,
  hasGeminiConfig,
  requestMathHelp,
  requestPracticeProblems
} from "./lib/gemini";
import { saveStudyLogViaApi } from "./lib/studyLogApi";
import { getHistory, updateHistoryItem, upsertHistoryItem } from "./lib/storage";
import { GRADE_LEVELS, detectSubjectTag, statusForServer, statusLabel, summarizeProblem } from "./lib/math";

const todayIso = () => new Date().toISOString().slice(0, 10);
const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [view, setView] = useState("home");
  const [question, setQuestion] = useState("");
  const [attachedFile, setAttachedFile] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeProblem, setActiveProblem] = useState(null);
  const [message, setMessage] = useState("");
  const [isSolving, setIsSolving] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [unitFilter, setUnitFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [openHistoryId, setOpenHistoryId] = useState(null);
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

    if (!hasGeminiConfig) {
      setMessage(".env에 VITE_GEMINI_API_KEY를 입력해야 AI 풀이 도움을 받을 수 있어요.");
      return;
    }

    setMessage("");
    setView("solving");
    setIsSolving(true);
    setLoadingMessage("AI가 문제를 분석 중이에요.");

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
      explanation: ""
    };
    setActiveProblem(problem);

    try {
      let problemText = typedQuestion;
      if (attachedFile) {
        setLoadingMessage("AI가 사진 속 문제를 읽고 있어요.");
        problemText = await extractProblemTextFromImage(attachedFile);
      }

      setLoadingMessage("AI가 풀이 과정을 준비 중이에요.");
      const subjectTag = hasGeminiConfig ? await classifyProblem(problemText) : detectSubjectTag(problemText);
      const explanation = await requestMathHelp({
        problemText,
        currentGrade: GRADE_LEVELS[0]
      });

      const explained = {
        ...problem,
        problemText,
        problemSummary: summarizeProblem(problemText),
        subjectTag,
        explanation
      };
      setActiveProblem(explained);
      setHistory(upsertHistoryItem(explained));

      setLoadingMessage("이해 확인용 객관식 문제를 만들고 있어요.");
      const practiceProblems = await requestPracticeProblems({ problemText, explanation });
      const completed = {
        ...explained,
        practiceProblems,
        practiceSelections: {},
        practiceCheckedIds: [],
        practiceCheckedCount: 0
      };
      setActiveProblem(completed);
      setHistory(updateHistoryItem(completed.id, completed));
      setQuestion("");
      setAttachedFile(null);
    } catch (error) {
      setMessage(error.message || "AI 풀이를 준비하지 못했어요.");
      setView("home");
    } finally {
      setIsSolving(false);
      setLoadingMessage("");
    }
  }

  async function handleUnderstanding(status) {
    if (!activeProblem) return;

    const updated = {
      ...activeProblem,
      understandingStatus: status,
      completedAt: new Date().toISOString()
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
        practiceCheckedCount: updated.practiceCheckedCount || 0
      });
    } catch {
      // Server logging can be configured later without blocking local learning.
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
      practiceCheckedCount: (activeProblem.practiceCheckedCount || 0) + 1
    };

    setActiveProblem(updated);
    setHistory(updateHistoryItem(updated.id, updated));
  }

  function handleCloseSolving() {
    setView("home");
    setMessage("");
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
        loadingMessage={loadingMessage}
        onClose={handleCloseSolving}
        onUnderstanding={handleUnderstanding}
        onPracticeChoice={handlePracticeChoice}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 pb-5 pt-6">
        <TopNav view={view} setView={setView} />

        {message && (
          <div className="mt-4 rounded-xl border border-line bg-subtle px-4 py-3 text-sm font-bold text-vivid">
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
            openHistoryId={openHistoryId}
            setOpenHistoryId={setOpenHistoryId}
          />
        ) : (
          <HomeView
            question={question}
            setQuestion={setQuestion}
            attachedFile={attachedFile}
            setAttachedFile={setAttachedFile}
            fileInputRef={fileInputRef}
            onSubmit={handleSubmit}
          />
        )}
      </main>
    </div>
  );
}

function TopNav({ view, setView }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <img src="/app-icon.png" alt="수학왕 추소이" className="h-12 w-12 rounded-xl border border-line object-cover" />

      <nav className="grid min-h-14 flex-1 grid-cols-2 rounded-[32px] bg-subtle p-1">
        <button
          onClick={() => setView("home")}
          className={`flex items-center justify-center gap-2 rounded-[28px] text-sm font-bold transition ${
            view === "home" ? "bg-white text-vivid shadow-soft" : "text-muted"
          }`}
        >
          <Search className="h-5 w-5" />
          질문
        </button>
        <button
          onClick={() => setView("history")}
          className={`flex items-center justify-center gap-2 rounded-[28px] text-sm font-bold transition ${
            view === "history" ? "bg-white text-vivid shadow-soft" : "text-muted"
          }`}
        >
          <History className="h-5 w-5" />
          기록
        </button>
      </nav>

      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-skyline/10">
        <Sparkles className="h-6 w-6 text-vivid" />
      </div>
    </header>
  );
}

function HomeView({ question, setQuestion, attachedFile, setAttachedFile, fileInputRef, onSubmit }) {
  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center pb-28 text-center">
        <div className="mb-7 flex h-20 w-20 items-center justify-center rounded-3xl bg-skyline/10">
          <img src="/app-icon.png" alt="" className="h-16 w-16 rounded-2xl object-cover" />
        </div>
        <h1 className="text-[28px] font-bold leading-10 text-ink">안녕 소이야 👋</h1>
        <p className="mt-4 whitespace-pre-line text-[20px] font-bold leading-8 text-ink">
          {`모르는 수학 문제를 물어보면\n풀이 방법을 쉽게 알려줄게!`}
        </p>
      </section>

      <form onSubmit={onSubmit} className="sticky bottom-5">
        <div className="rounded-[32px] border border-line bg-subtle p-4 shadow-soft">
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
            className="max-h-32 min-h-14 w-full resize-none bg-transparent text-[18px] font-bold leading-7 outline-none placeholder:text-muted"
          />

          {attachedFile && (
            <div className="mt-2 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm font-bold text-muted">
              <span className="truncate">{attachedFile.name}</span>
              <button type="button" onClick={() => setAttachedFile(null)} className="text-vivid">
                삭제
              </button>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              capture="environment"
              className="sr-only"
              onChange={(event) => setAttachedFile(event.target.files?.[0] || null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="사진 첨부"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-vivid shadow-soft"
            >
              <Camera className="h-6 w-6" />
            </button>
            <button type="submit" className="sr-only">
              전송
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function SolvingView({ activeProblem, isSolving, loadingMessage, onClose, onUnderstanding, onPracticeChoice }) {
  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-white/90 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle text-ink"
          >
            <X className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">풀이 방법</h1>
            <p className="text-sm font-bold text-muted">정답 대신 방법을 익혀요</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {isSolving && (
          <div className="app-card flex items-center gap-3 p-5">
            <Loader2 className="h-5 w-5 animate-spin text-vivid" />
            <p className="text-base font-bold">{loadingMessage || "AI가 풀이 과정을 준비 중이에요."}</p>
          </div>
        )}

        {activeProblem?.explanation && (
          <>
            <section className="app-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-vivid">
                <Sparkles className="h-4 w-4" />
                {activeProblem.subjectTag}
              </div>
              <p className="whitespace-pre-wrap text-[16px] leading-7">{activeProblem.explanation}</p>
            </section>

            <PracticeQuiz activeProblem={activeProblem} onPracticeChoice={onPracticeChoice} />

            <section className="grid gap-2 sm:grid-cols-2">
              <button onClick={() => onUnderstanding("understood")} className="control-button bg-mint text-white">
                <CheckCircle2 className="h-4 w-4" />
                이해했어요
              </button>
              <button onClick={() => onUnderstanding("confused")} className="control-button bg-coral text-white">
                <MessageCircleQuestion className="h-4 w-4" />
                아직 헷갈려요
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function PracticeQuiz({ activeProblem, onPracticeChoice }) {
  const problems = activeProblem.practiceProblems || [];
  const selections = activeProblem.practiceSelections || {};

  if (problems.length === 0) {
    return (
      <section className="app-card p-5">
        <div className="flex items-center gap-2 text-base font-bold text-coral">
          <Loader2 className="h-4 w-4 animate-spin" />
          이해 확인 문제를 준비하고 있어요.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-coral/20 bg-coral/5 p-5">
      <h2 className="text-lg font-bold">이해한게 맞는지 테스트해봐요!</h2>
      <div className="mt-4 space-y-4">
        {problems.map((problem, index) => {
          const selected = selections[problem.id];
          const hasSelected = selected !== undefined;
          const correctIndex = problem.correctIndex ?? 0;
          return (
            <div key={problem.id} className="rounded-xl border border-line bg-white p-4">
              <p className="text-sm font-bold leading-6">
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
                      key={`${problem.id}-${choice}`}
                      disabled={hasSelected}
                      onClick={() => onPracticeChoice(problem.id, choiceIndex)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm font-bold leading-6 transition ${
                        showCorrect
                          ? "border-mint bg-mint/10 text-mint"
                          : showWrong
                            ? "border-coral bg-coral/10 text-coral"
                            : "border-line bg-subtle text-ink"
                      }`}
                    >
                      {choice}
                    </button>
                  );
                })}
              </div>
              {hasSelected && (
                <div className="mt-3 rounded-lg bg-lemon/15 p-3 text-sm font-bold leading-6">
                  {selected === correctIndex ? "맞았어요!" : `정답은 ${problem.choices?.[correctIndex] || problem.answer} 입니다.`}
                  <br />
                  {problem.hint}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HistoryView({
  history,
  subjectTags,
  unitFilter,
  setUnitFilter,
  statusFilter,
  setStatusFilter,
  openHistoryId,
  setOpenHistoryId
}) {
  return (
    <section className="mt-6 pb-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">기록</h1>
        <span className="text-sm font-bold text-muted">{history.length}개</span>
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
        <div className="rounded-xl border border-dashed border-line bg-subtle p-8 text-center text-sm font-bold text-muted">
          아직 저장된 기록이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => {
            const open = openHistoryId === item.id;
            return (
              <article key={item.id} className="overflow-hidden rounded-xl border border-line bg-white">
                <button
                  onClick={() => setOpenHistoryId(open ? null : item.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-mint/10 px-2 py-1 text-xs font-bold text-mint">{item.subjectTag}</span>
                      <span className="text-xs font-bold text-muted">{new Date(item.registeredAt).toLocaleDateString("ko-KR")}</span>
                      <span className="text-xs font-bold text-vivid">{statusLabel(item.understandingStatus)}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-bold leading-6">{item.problemSummary}</p>
                  </div>
                  {open ? <ChevronUp className="h-5 w-5 shrink-0 text-muted" /> : <ChevronDown className="h-5 w-5 shrink-0 text-muted" />}
                </button>

                {open && (
                  <div className="space-y-4 border-t border-line bg-subtle p-4">
                    <section>
                      <h2 className="mb-2 text-sm font-bold text-vivid">등록한 문제</h2>
                      <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm font-bold leading-6">{item.problemText}</p>
                    </section>
                    <section>
                      <h2 className="mb-2 text-sm font-bold text-vivid">풀이 방법</h2>
                      <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6">
                        {item.explanation || "저장된 풀이가 없습니다."}
                      </p>
                    </section>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
