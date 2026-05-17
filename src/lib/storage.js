const ACTIVE_PROBLEM_KEY = "mathking-soi:active-problem";
const HISTORY_KEY = "mathking-soi:history";

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
