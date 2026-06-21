// quiz.js — pure quiz logic: turn CSV rows into questions, sample/shuffle them,
// and grade a session. Deliberately free of any DOM access so the rules stay
// easy to read and to test in isolation.

// ---------------------------------------------------------------------------
// Column layout of the source CSV, BY POSITION (there is no reliable header).
// If your sheet's columns are in a different order, change them here only.
// ---------------------------------------------------------------------------
export const COLS = {
  number: 0,      // A: question number — present only on a question's FIRST row
  question: 1,    // B: question text   — present only on a question's FIRST row
  answer: 2,      // C: one answer option per row
  explanation: 3, // D: explanation for the question (optional)
  correct: 4,     // E: "x" / "X" marks a correct option (a question may have several)
};

const trim = (v) => (v == null ? '' : String(v).trim());

// A correct-marker cell counts as "marked" for a short marker that contains an
// x/X (so "x", "X", "[x]", "(x)" all work) or a common affirmative token. The
// length guard keeps stray prose like "mixed"/"max" from being read as a marker
// if data lands in the wrong column.
function isMarked(cell) {
  const v = trim(cell).toLowerCase();
  if (v === '') return false;
  if (v.length <= 4 && v.includes('x')) return true;
  return v === '✓' || v === '✔' || v === 'yes' || v === 'true' || v === '1';
}

function isBlankRow(row) {
  return !row || row.every((cell) => trim(cell) === '');
}

// Heuristic: does this row look like a header rather than real data?
function looksLikeHeader(row) {
  if (!row) return false;
  const num = trim(row[COLS.number]);
  if (num !== '' && !/^\d+$/.test(num)) return true; // e.g. "Number", "#", "No."
  const q = trim(row[COLS.question]).toLowerCase();
  const a = trim(row[COLS.answer]).toLowerCase();
  const headerWords = ['question', 'questions', 'answer', 'answers', 'option', 'options', 'text'];
  if (num === '' && (headerWords.includes(q) || headerWords.includes(a))) return true;
  return false;
}

// Turn raw CSV rows into structured questions.
//
// Grouping rule: a new question starts on any row whose NUMBER or QUESTION-TEXT
// cell is non-empty. Every following row with an empty number cell belongs to
// that question. From each group we collect the option from every row's answer
// cell (including the first row), which options are correct, and the first
// non-empty explanation seen in the group.
export function rowsToQuestions(rows) {
  if (!rows || rows.length === 0) return [];

  // Skip a leading header row when present.
  let start = 0;
  if (looksLikeHeader(rows[0])) start = 1;

  const questions = [];
  let current = null;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue; // tolerate blank separators / trailing rows

    const num = trim(row[COLS.number]);
    const qText = trim(row[COLS.question]);
    const startsNew = num !== '' || qText !== '';

    if (startsNew) {
      current = { number: num, text: qText, options: [], explanation: '' };
      questions.push(current);
    }
    if (!current) continue; // option row before any question — skip defensively

    const optText = trim(row[COLS.answer]);
    if (optText !== '') {
      current.options.push({ text: optText, correct: isMarked(row[COLS.correct]) });
    }
    const expl = trim(row[COLS.explanation]);
    if (expl !== '' && current.explanation === '') current.explanation = expl;
  }

  // Keep only usable questions: real text and at least two options to choose from.
  return questions.filter((q) => q.text !== '' && q.options.length >= 2);
}

// Fisher–Yates shuffle — returns a new array, leaves the input untouched.
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build a fresh practice session: randomly sample `count` questions (no repeats),
// shuffle the option order within each, and decide single- vs multi-correct.
export function buildSession(questions, count) {
  const n = Math.max(1, Math.min(Number(count) || 1, questions.length));
  return shuffle(questions).slice(0, n).map((q) => {
    const options = shuffle(q.options).map((o) => ({ text: o.text, correct: o.correct }));
    const correctCount = options.filter((o) => o.correct).length;
    return {
      text: q.text,
      explanation: q.explanation,
      options,
      multi: correctCount > 1, // more than one correct -> checkboxes
      selected: [],            // indices into `options`
    };
  });
}

// Indices of the correct options for a question.
export function correctIndices(q) {
  return q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
}

// Correct iff the selected set equals the correct set EXACTLY (no partial credit).
export function isQuestionCorrect(q) {
  const correct = correctIndices(q);
  const sel = q.selected || [];
  if (sel.length !== correct.length) return false;
  const selSet = new Set(sel);
  return correct.every((i) => selSet.has(i));
}

// Tally a finished session.
export function gradeSession(session) {
  let correct = 0, wrong = 0, unanswered = 0;
  for (const q of session) {
    if (!q.selected || q.selected.length === 0) unanswered++;
    else if (isQuestionCorrect(q)) correct++;
    else wrong++;
  }
  const total = session.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return { correct, wrong, unanswered, total, percent };
}
