// app.js — UI controller. Wires the screens together and owns the session state.
// All question/option text is inserted with textContent (never innerHTML) so that
// content coming from a spreadsheet can never inject markup.

import { parseCSV } from './csv.js';
import { rowsToQuestions, buildSession, gradeSession, isQuestionCorrect } from './quiz.js';
import { getHistory, addAttempt, clearHistory } from './storage.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  exams: [],          // parsed from exams.json
  selectedExam: null, // { name, url }
  questions: [],      // all questions parsed from the loaded exam
  session: [],        // the current practice set
  current: 0,         // index into session
  startTime: 0,
  endTime: 0,
  timerId: null,
};

let retryHandler = null; // what the error screen's "Try again" button re-runs

// DOM refs (filled in init)
let el = {};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function init() {
  el = {
    timer: $('timer'), timerText: $('timerText'),
    examSelect: $('examSelect'), loadExamBtn: $('loadExamBtn'),
    historyPanel: $('historyPanel'), historyList: $('historyList'), clearHistoryBtn: $('clearHistoryBtn'),
    errorMessage: $('errorMessage'), retryBtn: $('retryBtn'), errorBackBtn: $('errorBackBtn'),
    setupExamName: $('setupExamName'), totalAvail: $('totalAvail'),
    countInput: $('countInput'), startBtn: $('startBtn'), setupBackBtn: $('setupBackBtn'),
    progressText: $('progressText'), questionText: $('questionText'),
    multiHint: $('multiHint'), optionsForm: $('optionsForm'),
    prevBtn: $('prevBtn'), nextBtn: $('nextBtn'), submitBtn: $('submitBtn'),
    statCorrect: $('statCorrect'), statTotal: $('statTotal'), statPercent: $('statPercent'),
    statWrong: $('statWrong'), statUnanswered: $('statUnanswered'), statTime: $('statTime'),
    reviewBtn: $('reviewBtn'), newPracticeBtn: $('newPracticeBtn'),
    reviewList: $('reviewList'), reviewBackBtn: $('reviewBackBtn'), reviewNewBtn: $('reviewNewBtn'),
  };

  registerSW();
  wireEvents();
  bootstrap();
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
  }
}

async function bootstrap() {
  showScreen('loading');
  try {
    state.exams = await loadExams();
    populateExamSelect(state.exams);
    renderHistory(currentExamName());
    showScreen('start');
  } catch (err) {
    showError(`Could not load the exam list (exams.json). ${friendlyError(err)}`, bootstrap);
  }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function wireEvents() {
  el.loadExamBtn.addEventListener('click', () => {
    const exam = state.exams[Number(el.examSelect.value)];
    if (exam) loadExam(exam);
  });
  el.examSelect.addEventListener('change', () => renderHistory(currentExamName()));
  el.clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear the saved attempt history for this exam?')) {
      clearHistory(currentExamName());
      renderHistory(currentExamName());
    }
  });
  el.retryBtn.addEventListener('click', () => { if (retryHandler) retryHandler(); });
  el.errorBackBtn.addEventListener('click', () => showScreen('start'));

  document.querySelectorAll('.preset').forEach((b) => {
    b.addEventListener('click', () => {
      const total = state.questions.length;
      const c = b.dataset.count === 'all' ? total : Number(b.dataset.count);
      el.countInput.value = String(clamp(c, 1, total));
    });
  });
  el.setupBackBtn.addEventListener('click', () => showScreen('start'));
  el.startBtn.addEventListener('click', startPractice);

  el.optionsForm.addEventListener('change', readSelection);
  el.prevBtn.addEventListener('click', () => navigate(-1));
  el.nextBtn.addEventListener('click', () => navigate(1));
  el.submitBtn.addEventListener('click', submit);

  el.reviewBtn.addEventListener('click', () => { renderReview(); showScreen('review'); });
  el.newPracticeBtn.addEventListener('click', () => { showScreen('start'); renderHistory(currentExamName()); });
  el.reviewBackBtn.addEventListener('click', () => showScreen('stats'));
  el.reviewNewBtn.addEventListener('click', () => { showScreen('start'); renderHistory(currentExamName()); });
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function loadExams() {
  const text = await fetchText('./exams.json');
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('exams.json is not valid JSON.'); }
  if (!Array.isArray(data)) throw new Error('exams.json must be a JSON array.');
  const exams = data.filter((e) => e && e.name && e.url);
  if (exams.length === 0) throw new Error('exams.json has no usable entries.');
  return exams;
}

async function loadExam(exam) {
  state.selectedExam = exam;
  showScreen('loading');
  try {
    const text = await fetchText(exam.url);
    const questions = rowsToQuestions(parseCSV(text));
    if (questions.length === 0) {
      showError('This exam loaded but contained no usable questions. Check that the sheet matches the expected column layout and is published as CSV.',
        () => loadExam(exam));
      return;
    }
    state.questions = questions;
    showSetup();
  } catch (err) {
    showError(`Couldn't load "${exam.name}". ${friendlyError(err)}`, () => loadExam(exam));
  }
}

function friendlyError(err) {
  if (err && err.name === 'AbortError') return 'The request timed out — please try again.';
  if (err instanceof TypeError) return 'Check your internet connection and that the CSV URL is correct and published.';
  return (err && err.message) ? err.message : 'Unknown error.';
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== `screen-${name}`; });
  el.timer.hidden = name !== 'quiz';
  window.scrollTo(0, 0);
}

function showError(message, retry) {
  el.errorMessage.textContent = message;
  retryHandler = retry || null;
  el.retryBtn.hidden = !retry;
  showScreen('error');
}

function populateExamSelect(exams) {
  el.examSelect.innerHTML = '';
  exams.forEach((e, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = e.name;
    el.examSelect.appendChild(opt);
  });
}

function currentExamName() {
  const exam = state.exams[Number(el.examSelect.value)];
  return exam ? exam.name : (state.selectedExam ? state.selectedExam.name : '');
}

function renderHistory(examName) {
  const list = examName ? getHistory(examName) : [];
  el.historyList.innerHTML = '';
  if (!list.length) { el.historyPanel.hidden = true; return; }
  el.historyPanel.hidden = false;
  list.forEach((a) => {
    const li = document.createElement('li');
    const d = new Date(a.date);
    const when = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    li.textContent = `${when} — ${a.correct}/${a.total} (${a.percent}%) · ${formatTime(a.timeMs)}`;
    el.historyList.appendChild(li);
  });
}

function showSetup() {
  el.setupExamName.textContent = state.selectedExam.name;
  const total = state.questions.length;
  el.totalAvail.textContent = String(total);
  el.countInput.min = '1';
  el.countInput.max = String(total);
  el.countInput.value = String(Math.min(20, total));
  document.querySelectorAll('.preset').forEach((b) => {
    if (b.dataset.count === 'all') return;
    b.disabled = Number(b.dataset.count) > total;
  });
  showScreen('setup');
}

// ---------------------------------------------------------------------------
// Quiz flow
// ---------------------------------------------------------------------------
function startPractice() {
  const total = state.questions.length;
  const count = clamp(parseInt(el.countInput.value, 10) || 1, 1, total);
  state.session = buildSession(state.questions, count);
  state.current = 0;
  startTimer();
  showScreen('quiz');
  renderQuiz();
}

function renderQuiz() {
  const q = state.session[state.current];
  el.progressText.textContent = `Question ${state.current + 1} of ${state.session.length}`;
  el.questionText.textContent = q.text;
  el.multiHint.textContent = q.multi ? 'Select all that apply' : 'Select one';

  el.optionsForm.innerHTML = '';
  const type = q.multi ? 'checkbox' : 'radio';
  const selected = new Set(q.selected || []);
  q.options.forEach((o, i) => {
    const label = document.createElement('label');
    label.className = 'option';
    const input = document.createElement('input');
    input.type = type;
    input.name = 'opt';
    input.value = String(i);
    input.checked = selected.has(i);
    const span = document.createElement('span');
    span.className = 'option-text';
    span.textContent = o.text;
    label.append(input, span);
    el.optionsForm.appendChild(label);
  });

  el.prevBtn.disabled = state.current === 0;
  el.nextBtn.disabled = state.current === state.session.length - 1;
}

function readSelection() {
  const sel = [];
  el.optionsForm.querySelectorAll('input').forEach((inp) => { if (inp.checked) sel.push(Number(inp.value)); });
  state.session[state.current].selected = sel;
}

function navigate(delta) {
  readSelection();
  state.current = clamp(state.current + delta, 0, state.session.length - 1);
  renderQuiz();
}

function submit() {
  readSelection();
  const unanswered = state.session.filter((q) => !q.selected || q.selected.length === 0).length;
  if (unanswered > 0 && !confirm(`${unanswered} question(s) are unanswered. Submit anyway?`)) return;

  stopTimer();
  const result = gradeSession(state.session);
  const timeMs = state.endTime - state.startTime;
  addAttempt(currentExamName(), {
    date: new Date().toISOString(),
    correct: result.correct, total: result.total, percent: result.percent, timeMs,
  });
  renderStats(result, timeMs);
  showScreen('stats');
}

function renderStats(result, timeMs) {
  el.statCorrect.textContent = String(result.correct);
  el.statTotal.textContent = String(result.total);
  el.statPercent.textContent = `${result.percent}%`;
  el.statWrong.textContent = String(result.wrong);
  el.statUnanswered.textContent = String(result.unanswered);
  el.statTime.textContent = formatTime(timeMs);
}

function renderReview() {
  el.reviewList.innerHTML = '';
  state.session.forEach((q, qi) => {
    const card = document.createElement('article');
    card.className = 'review-card';

    const answered = q.selected && q.selected.length > 0;
    const status = !answered ? 'unanswered' : (isQuestionCorrect(q) ? 'correct' : 'incorrect');
    const labelText = status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Incorrect' : 'Unanswered';

    const head = document.createElement('div');
    head.className = 'review-head';
    const qn = document.createElement('span');
    qn.className = 'review-q';
    qn.textContent = `Q${qi + 1}`;
    const badge = document.createElement('span');
    badge.className = `badge badge-${status}`;
    badge.textContent = labelText;
    head.append(qn, badge);
    card.appendChild(head);

    const qt = document.createElement('p');
    qt.className = 'review-question';
    qt.textContent = q.text;
    card.appendChild(qt);

    const ul = document.createElement('ul');
    ul.className = 'review-options';
    const sel = new Set(q.selected || []);
    q.options.forEach((o, i) => {
      const li = document.createElement('li');
      li.className = 'review-option';
      const picked = sel.has(i);
      if (o.correct) li.classList.add('opt-correct');
      if (picked && !o.correct) li.classList.add('opt-wrong');

      const mark = document.createElement('span');
      mark.className = 'opt-mark';
      mark.textContent = o.correct ? '✓' : (picked ? '✗' : '');
      const txt = document.createElement('span');
      txt.className = 'opt-text';
      txt.textContent = o.text;
      li.append(mark, txt);

      if (picked) {
        const tag = document.createElement('span');
        tag.className = 'opt-tag';
        tag.textContent = 'Your pick';
        li.appendChild(tag);
      }
      ul.appendChild(li);
    });
    card.appendChild(ul);

    if (q.explanation) {
      const ex = document.createElement('p');
      ex.className = 'review-explanation';
      const strong = document.createElement('strong');
      strong.textContent = 'Explanation: ';
      ex.appendChild(strong);
      ex.appendChild(document.createTextNode(q.explanation));
      card.appendChild(ex);
    }
    el.reviewList.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------
function startTimer() {
  state.startTime = Date.now();
  state.endTime = 0;
  updateTimer();
  state.timerId = setInterval(updateTimer, 1000);
}

function stopTimer() {
  state.endTime = Date.now();
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  updateTimer();
}

function updateTimer() {
  const ms = (state.endTime || Date.now()) - state.startTime;
  el.timerText.textContent = formatTime(ms);
}

function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi);
}

// Modules are deferred, so the DOM is ready by the time this runs.
init();
