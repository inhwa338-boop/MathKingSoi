const ACTIVE_PROBLEM_KEY = "mathking-soi:active-problem";
const HISTORY_KEY = "mathking-soi:history";
const DAILY_USAGE_KEY = "mathking-soi:daily-usage";
const MAX_DAILY = 10;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getDailyUsage() {
  const stored = readJson(DAILY_USAGE_KEY, {});
  if (stored.date !== todayStr()) return { date: todayStr(), count: 0 };
  return stored;
}

export function getDailyRemaining() {
  return Math.max(0, MAX_DAILY - getDailyUsage().count);
}

export function consumeDailyUsage() {
  const usage = getDailyUsage();
  const next = { date: usage.date, count: usage.count + 1 };
  localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(next));
  return Math.max(0, MAX_DAILY - next.count);
}

export function getActiveProblem() {
  return readJson(ACTIVE_PROBLEM_KEY, null);
}

export function setActiveProblem(problem) {
  localStorage.setItem(ACTIVE_PROBLEM_KEY, JSON.stringify(problem));
}

export function clearActiveProblem() {
  localStorage.removeItem(ACTIVE_PROBLEM_KEY);
}

export function getHistory() {
  return readJson(HISTORY_KEY, []);
}

export function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function upsertHistoryItem(item) {
  const history = getHistory();
  const index = history.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    history[index] = { ...history[index], ...item };
  } else {
    history.unshift(item);
  }
  saveHistory(history);
  return history;
}

export function updateHistoryItem(id, patch) {
  const history = getHistory().map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
  saveHistory(history);
  return history;
}

export function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
