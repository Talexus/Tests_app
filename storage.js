// storage.js — tiny localStorage-backed attempt history, kept per exam.
// Best-effort: if storage is unavailable (private mode, quota), it fails quietly.

const KEY = 'examPrepHistory.v1';
const MAX_PER_EXAM = 10; // keep the list short

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full or unavailable — history is non-critical */
  }
}

// Returns an array of attempts (newest first). Each attempt:
//   { date: ISO string, correct, total, percent, timeMs }
export function getHistory(examName) {
  return readAll()[examName] || [];
}

export function addAttempt(examName, attempt) {
  const all = readAll();
  const list = all[examName] || [];
  list.unshift(attempt);                  // newest first
  all[examName] = list.slice(0, MAX_PER_EXAM);
  writeAll(all);
  return all[examName];
}

export function clearHistory(examName) {
  const all = readAll();
  delete all[examName];
  writeAll(all);
}
