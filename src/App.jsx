import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Brain,
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  ImageUp,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  NotebookTabs,
  Send,
  Sparkles
} from "lucide-react";
import {
  classifyProblem,
  extractProblemTextFromImage,
  hasGeminiConfig,
  requestMathHelp,
  requestPracticeProblems
} from "./lib/gemini";
import { saveStudyLogViaApi } from "./lib/studyLogApi";
import {
  clearActiveProblem,
  getActiveProblem,
  getHistory,
  setActiveProblem,
  updateHistoryItem,
  upsertHistoryItem
} from "./lib/storage";
import {
  GRADE_LEVELS,
  detectSubjectTag,
  isSimilarProblemType,
  statusForServer,
  statusLabel,
  summarizeProblem
} from "./lib/math";

const tabs = [
  { id: "help", label: "문제 등록 & 풀이 도움", icon: NotebookTabs },
  { id: "history", label: "오답노트 히스토리", icon: History }
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function App() {
  const [activeTab, setActiveTab] = useState("help");
  const [inputMode, setInputMode] = useState("text");
  const [problemText, setProblemText] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [activeProblem, setActiveProblemState] = useState(null);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isGeneratingPractice, setIsGeneratingPractice] = useState(false);
  const [unitFilter, setUnitFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [selectedHistory, setSelectedHistory] = useState(null);

  useEffect(() => {
    setActiveProblemState(getActiveProblem());
    setHistory(getHistory());
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

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");
    setImagePreview(URL.createObjectURL(file));

    if (!hasGeminiConfig) {
      setMessage(".env에 VITE_GEMINI_API_KEY를 입력하면 이미지에서 문제를 자동 추출할 수 있어요.");
      return;
    }

    try {
      setIsExtracting(true);
      const extracted = await extractProblemTextFromImage(file);
      setProblemText(extracted);
    } catch (error) {
      setMessage(error.message || "이미지에서 문제를 읽지 못했어요.");
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleRegisterProblem() {
    setMessage("");
    const text = problemText.trim();

    if (activeProblem) {
      setMessage("먼저 등록된 문제를 해결한 후 새 문제를 등록해주세요.");
      return;
    }

    if (!text) {
      setMessage("문제 내용을 입력하거나 이미지를 업로드해주세요.");
      return;
    }

    const similar = history.find((item) => isSimilarProblemType(text, item) && item.explanation);
    if (similar) {
      setMessage("이 유형은 이전에 학습한 적 있어요! 아래에 기존 설명을 다시 보여줄게요.");
      setSelectedHistory(similar);
      setActiveTab("history");
      return;
    }

    try {
      setIsRegistering(true);
      const subjectTag = hasGeminiConfig ? await classifyProblem(text) : detectSubjectTag(text);
      const problem = {
        id: makeId(),
        problemText: text,
        problemSummary: summarizeProblem(text),
        imagePreview,
        subjectTag,
        registeredAt: new Date().toISOString(),
        understandingStatus: "unanswered",
        easierCount: 0,
        practiceProblems: [],
        practiceCheckedIds: [],
        practiceCheckedCount: 0,
        currentGradeIndex: 0,
        explanation: ""
      };

      setActiveProblem(problem);
      setActiveProblemState(problem);
      setHistory(upsertHistoryItem(problem));
      setProblemText("");
      setImagePreview("");
      setMessage("문제가 등록되었어요. 이제 풀이 방법을 요청할 수 있어요.");
    } catch (error) {
      setMessage(error.message || "문제 등록 중 오류가 발생했어요.");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleExplain(nextGradeIndex = activeProblem?.currentGradeIndex ?? 0) {
    if (!activeProblem) return;

    if (!hasGeminiConfig) {
      setMessage(".env에 VITE_GEMINI_API_KEY를 입력해야 AI 풀이 도움을 받을 수 있어요.");
      return;
    }

    try {
      setMessage("");
      setIsExplaining(true);
      const currentGrade = GRADE_LEVELS[nextGradeIndex];
      const explanation = await requestMathHelp({
        problemText: activeProblem.problemText,
        currentGrade
      });

      const explainedProblem = {
        ...activeProblem,
        explanation,
        currentGradeIndex: nextGradeIndex,
        easierCount: Math.max(activeProblem.easierCount || 0, nextGradeIndex),
        practiceProblems: [],
        practiceCheckedIds: [],
        practiceCheckedCount: 0
      };
      setActiveProblem(explainedProblem);
      setActiveProblemState(explainedProblem);
      setHistory(updateHistoryItem(explainedProblem.id, explainedProblem));
      setIsExplaining(false);

      try {
        setIsGeneratingPractice(true);
        const practiceProblems = await requestPracticeProblems({
          problemText: activeProblem.problemText,
          explanation
        });
        const updatedWithPractice = {
          ...explainedProblem,
          practiceProblems,
          practiceCheckedIds: [],
          practiceCheckedCount: 0
        };
        setActiveProblem(updatedWithPractice);
        setActiveProblemState(updatedWithPractice);
        setHistory(updateHistoryItem(updatedWithPractice.id, updatedWithPractice));
      } catch {
        setMessage("풀이 설명은 준비됐지만 연습 문제 생성은 실패했어요. 다시 풀이 방법을 요청해볼 수 있어요.");
      } finally {
        setIsGeneratingPractice(false);
      }
    } catch (error) {
      setMessage(error.message || "AI 설명을 가져오지 못했어요.");
    } finally {
      setIsExplaining(false);
    }
  }

  function handleEasier() {
    if (!activeProblem) return;
    const nextIndex = activeProblem.currentGradeIndex + 1;
    if (nextIndex >= GRADE_LEVELS.length) {
      setMessage("가장 쉬운 수준으로 설명하고 있어요.");
      return;
    }
    handleExplain(nextIndex);
  }

  async function handleUnderstanding(status) {
    if (!activeProblem) return;

    const updated = {
      ...activeProblem,
      understandingStatus: status,
      completedAt: status === "understood" ? new Date().toISOString() : activeProblem.completedAt
    };

    setHistory(updateHistoryItem(updated.id, updated));
    setActiveProblem(updated);
    setActiveProblemState(status === "understood" ? null : updated);

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
      // Local learning flow should continue even if server logging is not configured yet.
    }

    if (status === "understood") {
      clearActiveProblem();
      setMessage("이해 완료로 저장했어요. 이제 새 문제를 등록할 수 있어요.");
    } else {
      setActiveProblem(updated);
      setMessage("헷갈림으로 저장했어요. 더 쉬운 설명을 요청해볼 수 있어요.");
    }
  }

  function handleTogglePracticeAnswer(problemId) {
    if (!activeProblem) return;

    const checkedIds = activeProblem.practiceCheckedIds || [];
    const isVisible = checkedIds.includes(problemId);
    const nextCheckedIds = isVisible ? checkedIds.filter((id) => id !== problemId) : [...checkedIds, problemId];
    const nextCheckedCount = isVisible
      ? activeProblem.practiceCheckedCount || 0
      : (activeProblem.practiceCheckedCount || 0) + 1;

    const updated = {
      ...activeProblem,
      practiceCheckedIds: nextCheckedIds,
      practiceCheckedCount: nextCheckedCount
    };

    setActiveProblem(updated);
    setActiveProblemState(updated);
    setHistory(updateHistoryItem(updated.id, updated));
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="border-b border-ink/10 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-mint">
                <Sparkles className="h-4 w-4" />
                중1 수학 학습 도우미
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-normal text-ink">수학왕 추소이</h1>
            </div>
            <div className="rounded-md border border-ink/10 bg-lemon/20 px-3 py-2 text-sm font-semibold text-ink">
              정답 대신 방법을 익히는 학습 모드
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-ink/5 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition ${
                    active ? "bg-white text-skyline shadow-sm" : "text-ink/65 hover:bg-white/60"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {message && (
          <div className="mb-5 rounded-md border border-skyline/20 bg-skyline/10 px-4 py-3 text-sm font-semibold text-skyline">
            {message}
          </div>
        )}

        {activeTab === "help" ? (
          <HelpTab
            inputMode={inputMode}
            setInputMode={setInputMode}
            problemText={problemText}
            setProblemText={setProblemText}
            imagePreview={imagePreview}
            activeProblem={activeProblem}
            isExtracting={isExtracting}
            isRegistering={isRegistering}
            isExplaining={isExplaining}
            isGeneratingPractice={isGeneratingPractice}
            onImageUpload={handleImageUpload}
            onRegister={handleRegisterProblem}
            onExplain={() => handleExplain()}
            onEasier={handleEasier}
            onUnderstanding={handleUnderstanding}
            onTogglePracticeAnswer={handleTogglePracticeAnswer}
          />
        ) : (
          <HistoryTab
            history={filteredHistory}
            subjectTags={subjectTags}
            unitFilter={unitFilter}
            setUnitFilter={setUnitFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            selectedHistory={selectedHistory}
            setSelectedHistory={setSelectedHistory}
          />
        )}
      </main>
    </div>
  );
}

function HelpTab({
  inputMode,
  setInputMode,
  problemText,
  setProblemText,
  imagePreview,
  activeProblem,
  isExtracting,
  isRegistering,
  isExplaining,
  isGeneratingPractice,
  onImageUpload,
  onRegister,
  onExplain,
  onEasier,
  onUnderstanding,
  onTogglePracticeAnswer
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-coral" />
          <h2 className="text-lg font-black">문제 등록</h2>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-ink/5 p-1">
          <button
            onClick={() => setInputMode("text")}
            className={`rounded-md px-3 py-2 text-sm font-bold ${inputMode === "text" ? "bg-white text-skyline shadow-sm" : "text-ink/65"}`}
          >
            텍스트 입력
          </button>
          <button
            onClick={() => setInputMode("image")}
            className={`rounded-md px-3 py-2 text-sm font-bold ${inputMode === "image" ? "bg-white text-skyline shadow-sm" : "text-ink/65"}`}
          >
            이미지 업로드
          </button>
        </div>

        {inputMode === "text" ? (
          <textarea
            value={problemText}
            onChange={(event) => setProblemText(event.target.value)}
            placeholder="막힌 수학 문제를 입력하세요."
            className="mt-4 min-h-48 w-full resize-y rounded-md border border-ink/15 bg-white px-4 py-3 text-base outline-none transition focus:border-skyline focus:ring-4 focus:ring-skyline/10"
          />
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-ink/20 bg-ink/[0.02] p-4">
            <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-md bg-white px-4 py-6 text-center transition hover:bg-mint/5">
              <ImageUp className="h-9 w-9 text-mint" />
              <span className="text-sm font-bold">jpg 또는 png 파일 선택</span>
              <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={onImageUpload} />
            </label>
            {isExtracting && <LoadingLine text="이미지에서 문제를 읽는 중" />}
            {imagePreview && <img src={imagePreview} alt="업로드한 문제" className="mt-4 max-h-56 rounded-md border border-ink/10 object-contain" />}
            <textarea
              value={problemText}
              onChange={(event) => setProblemText(event.target.value)}
              placeholder="추출된 문제 텍스트를 확인하거나 직접 수정하세요."
              className="mt-4 min-h-28 w-full resize-y rounded-md border border-ink/15 bg-white px-4 py-3 text-base outline-none transition focus:border-skyline focus:ring-4 focus:ring-skyline/10"
            />
          </div>
        )}

        <button
          onClick={onRegister}
          disabled={isRegistering}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-black text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          등록
        </button>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-skyline" />
          <h2 className="text-lg font-black">AI 풀이 도움</h2>
        </div>

        {activeProblem ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-ink/10 bg-paper p-4">
              <div className="mb-2 text-xs font-black uppercase text-mint">{activeProblem.subjectTag}</div>
              <p className="whitespace-pre-wrap text-base leading-7">{activeProblem.problemText}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={onExplain} disabled={isExplaining} className="control-button bg-skyline text-white">
                {isExplaining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
                풀이 방법 알려줘
              </button>
              <button onClick={onEasier} disabled={isExplaining || isGeneratingPractice || !activeProblem.explanation} className="control-button bg-lemon text-ink">
                <MessageCircleQuestion className="h-4 w-4" />
                더 쉽게 설명해줘
              </button>
            </div>

            <div className="rounded-md bg-mint/10 px-3 py-2 text-sm font-bold text-mint">
              {GRADE_LEVELS[activeProblem.currentGradeIndex]} 수준으로 설명 중
            </div>

            <div className="min-h-56 rounded-lg border border-ink/10 bg-white p-4">
              {isExplaining ? (
                <LoadingLine text="정답을 가리고 풀이 방법을 준비하는 중" />
              ) : activeProblem.explanation ? (
                <p className="whitespace-pre-wrap leading-7">{activeProblem.explanation}</p>
              ) : (
                <p className="text-sm font-semibold text-ink/55">풀이 방법을 요청하면 공식과 유사 예시가 여기에 표시됩니다.</p>
              )}
            </div>

            {(activeProblem.explanation || isGeneratingPractice) && (
              <PracticeSection
                activeProblem={activeProblem}
                isGeneratingPractice={isGeneratingPractice}
                onTogglePracticeAnswer={onTogglePracticeAnswer}
              />
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={() => onUnderstanding("understood")} className="control-button bg-mint text-white">
                <CheckCircle2 className="h-4 w-4" />
                이해했어요
              </button>
              <button onClick={() => onUnderstanding("confused")} className="control-button bg-coral text-white">
                <MessageCircleQuestion className="h-4 w-4" />
                아직 헷갈려요
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex min-h-96 items-center justify-center rounded-lg border border-dashed border-ink/15 bg-ink/[0.02] p-6 text-center">
            <p className="max-w-sm text-sm font-semibold leading-6 text-ink/55">등록된 문제가 없습니다. 왼쪽에서 문제를 등록하면 풀이 도움 영역이 열립니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function PracticeSection({ activeProblem, isGeneratingPractice, onTogglePracticeAnswer }) {
  const practiceProblems = activeProblem.practiceProblems || [];
  const checkedIds = activeProblem.practiceCheckedIds || [];

  return (
    <div className="rounded-lg border border-coral/25 bg-coral/5 p-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-coral" />
        <h3 className="text-base font-black">이해한게 맞는지 테스트해봐요!</h3>
      </div>

      {isGeneratingPractice ? (
        <div className="mt-4 rounded-md bg-white/80 p-4">
          <LoadingLine text="연습 문제를 만들고 있어요... 잠깐만요!" />
        </div>
      ) : practiceProblems.length > 0 ? (
        <div className="mt-4 space-y-3">
          {practiceProblems.map((problem, index) => {
            const isVisible = checkedIds.includes(problem.id);
            return (
              <div key={problem.id} className="rounded-md border border-ink/10 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-coral text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm font-semibold leading-6">{problem.question}</p>
                </div>

                <button
                  onClick={() => onTogglePracticeAnswer(problem.id)}
                  className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-sm font-black text-coral transition hover:bg-coral/15"
                >
                  {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  정답 확인
                </button>

                {isVisible && (
                  <div className="mt-3 rounded-md border border-lemon/40 bg-lemon/15 p-3 text-sm leading-6">
                    <p>
                      <span className="font-black">정답:</span> {problem.answer}
                    </p>
                    <p className="mt-1">
                      <span className="font-black">힌트:</span> {problem.hint}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-white/80 p-4 text-sm font-semibold text-ink/55">아직 생성된 연습 문제가 없습니다.</p>
      )}
    </div>
  );
}

function HistoryTab({
  history,
  subjectTags,
  unitFilter,
  setUnitFilter,
  statusFilter,
  setStatusFilter,
  selectedHistory,
  setSelectedHistory
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-coral" />
          <h2 className="text-lg font-black">오답노트 히스토리</h2>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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

        <div className="mt-5 space-y-3">
          {history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink/15 p-6 text-center text-sm font-semibold text-ink/55">아직 저장된 학습 기록이 없습니다.</div>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedHistory(item)}
                className="w-full rounded-lg border border-ink/10 bg-white p-4 text-left transition hover:border-skyline hover:bg-skyline/5"
              >
                <div className="flex gap-3">
                  {item.imagePreview && <img src={item.imagePreview} alt="문제 썸네일" className="h-16 w-16 rounded-md border border-ink/10 object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-mint/10 px-2 py-1 text-xs font-black text-mint">{item.subjectTag}</span>
                      <span className="text-xs font-semibold text-ink/50">{new Date(item.registeredAt).toLocaleDateString("ko-KR")}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6">{item.problemSummary}</p>
                    <p className="mt-2 text-xs font-bold text-skyline">{statusLabel(item.understandingStatus)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-lemon" />
          <h2 className="text-lg font-black">다시 보기</h2>
        </div>

        {selectedHistory ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-ink/10 bg-paper p-4">
              <div className="mb-2 text-xs font-black uppercase text-mint">{selectedHistory.subjectTag}</div>
              <p className="whitespace-pre-wrap text-base leading-7">{selectedHistory.problemText}</p>
            </div>
            <div className="rounded-md bg-ink/5 px-3 py-2 text-sm font-bold">
              이해도: {statusLabel(selectedHistory.understandingStatus)} · 더 쉽게 {selectedHistory.easierCount || 0}회 · 연습 문제{" "}
              {selectedHistory.practiceProblems?.length || 0}개
            </div>
            <div className="rounded-lg border border-ink/10 p-4">
              {selectedHistory.explanation ? (
                <p className="whitespace-pre-wrap leading-7">{selectedHistory.explanation}</p>
              ) : (
                <p className="text-sm font-semibold text-ink/55">아직 저장된 AI 설명이 없습니다.</p>
              )}
            </div>
            {selectedHistory.practiceProblems?.length > 0 && (
              <div className="rounded-lg border border-coral/20 bg-coral/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-coral" />
                  <h3 className="text-base font-black">연습 문제</h3>
                </div>
                <div className="space-y-3">
                  {selectedHistory.practiceProblems.map((problem, index) => (
                    <div key={problem.id || problem.question} className="rounded-md bg-white p-3 text-sm leading-6">
                      <p className="font-bold">
                        {index + 1}. {problem.question}
                      </p>
                      <p className="mt-2 text-ink/70">
                        정답 확인 기록: {(selectedHistory.practiceCheckedIds || []).includes(problem.id) ? "확인함" : "미확인"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 flex min-h-96 items-center justify-center rounded-lg border border-dashed border-ink/15 bg-ink/[0.02] p-6 text-center">
            <p className="max-w-sm text-sm font-semibold leading-6 text-ink/55">왼쪽 목록에서 항목을 선택하면 문제와 AI 설명을 다시 볼 수 있습니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function LoadingLine({ text }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-skyline">
      <Loader2 className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}
