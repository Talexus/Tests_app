# Exam Prep — a personal, installable quiz PWA

A tiny, framework-free web app for practicing multiple-choice exam questions.
Questions live in **Google Sheets published as CSV** and are fetched at runtime, so
updating questions never requires rebuilding or redeploying. It's a **static site**
(plain HTML/CSS/vanilla JS, no build step) that installs to your home screen and
launches offline as a **PWA**.

- Works on desktop, Android (Chrome) and iOS (Safari).
- No backend, no accounts, no API keys. Attempt history is stored on-device with
  `localStorage`.
- New random sample of questions — and shuffled answer order — every session, so
  you practice the material instead of memorizing answer positions.

---

## Quick start (run locally)

The app uses ES modules and a service worker, so it must be served over **HTTP**
(opening `index.html` from `file://` will not work). Any static server is fine:

```bash
# Python 3 (no install needed on most systems)
python -m http.server 8000
# then open http://localhost:8000/
```

The bundled **“Sample Exam”** loads from `sample-exam.csv` and needs no internet,
so you can try the whole flow immediately.

---

## File layout

```
index.html            App shell (all screens live here, toggled by JS)
styles.css            Mobile-first styles (light + dark)
app.js                UI controller / app state
csv.js                Small, robust CSV parser (quoted fields, commas, newlines)
quiz.js               Pure quiz logic: parse rows → questions, sample, shuffle, grade
storage.js            Per-exam attempt history (localStorage)
manifest.webmanifest  PWA manifest
sw.js                 Service worker (offline app shell; live data when online)
exams.json            The list of exams (edit this to add/remove exams)
sample-exam.csv       A tiny example exam for local testing
icons/                App icons (192, 512, maskable, apple-touch)
tests/test.html       Open in a browser to run the parser/grading self-tests
```

Everything is deployed exactly as written — there is no compile or bundle step.

---

## The CSV format

There is **no reliable header row**, so columns are read **by position**. The
default layout (configurable — see below):

| Index | Column          | Meaning                                                                 |
|-------|-----------------|------------------------------------------------------------------------|
| 0 (A) | Question number | Present only on the **first row** of each question; blank on option rows |
| 1 (B) | Question text   | Present only on the first row of the question                            |
| 2 (C) | Answer option   | **One option per row**; a question has 3–6 option rows                   |
| 3 (D) | Explanation     | Optional; belongs to the question                                       |
| 4 (E) | Correct marker  | `x` / `X` on the rows whose option is correct (**multiple allowed**)    |

**How rows become questions:** a new question begins on any row whose *number* or
*question-text* cell is non-empty. Every following row with a blank number cell
belongs to that question. The parser collects the question text, all answer
options, which options are correct, and the first non-empty explanation in the
group. Blank rows are skipped, a leading header row is auto-detected and skipped,
and a question needs at least two options to be usable.

Single-correct questions render as **radio buttons**; multi-correct as
**checkboxes**. Multi-correct grading is all-or-nothing: you must select exactly
the full set of correct options (no partial credit).

### Changing the column order

If your sheet's columns are arranged differently, edit the one constant at the top
of [`quiz.js`](quiz.js):

```js
export const COLS = { number: 0, question: 1, answer: 2, explanation: 3, correct: 4 };
```

---

## Publishing a Google Sheet as CSV

1. Put your questions in a Google Sheet using the column layout above (a header
   row is fine — it's auto-skipped).
2. **File → Share → Publish to web**.
3. In the dialog, pick the specific **sheet/tab**, choose **Comma-separated values
   (.csv)** as the format, and click **Publish**.
4. Copy the generated URL. It looks like:
   `https://docs.google.com/spreadsheets/d/e/<LONG_ID>/pub?gid=0&single=true&output=csv`
5. (Optional) **Share → General access → Anyone with the link → Viewer**, so the
   data is readable.

The published CSV endpoint allows cross-origin fetches, so no proxy is needed.
Google may cache the published CSV for a few minutes after you edit — that's
expected; the app fetches fresh on each open.

---

## Adding / removing exams

Edit [`exams.json`](exams.json) — an array of `{ name, url }`:

```json
[
  { "name": "Sample Exam (bundled, works offline)", "url": "./sample-exam.csv" },
  { "name": "Biology 101", "url": "https://docs.google.com/.../pub?output=csv" }
]
```

`name` is what shows in the picker; `url` is the published CSV (or a local file).
Add a line to add an exam, remove a line to remove one. No redeploy is needed to
change the **questions** inside an exam — only to change this list.

---

## Deploying to GitHub Pages

This repo deploys from the **repository root**.

1. Create a GitHub repo and push these files to the default branch (e.g. `main`).
2. On GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set **Source = “Deploy from a branch”**, then
   **Branch = `main`** and **folder = `/ (root)`**. Save.
4. Wait ~1 minute. Your app is live at
   `https://<your-username>.github.io/<your-repo>/`.

All paths in the app are **relative**, so it works correctly from that `/<repo>/`
subpath. (Prefer `/docs`? Move every file into a `docs/` folder and choose
**folder = `/docs`** in step 3 instead.)

> **Updating the app code.** The service worker caches the app shell, so after you
> change `index.html`, `app.js`, `styles.css`, etc., bump `CACHE_VERSION` near the
> top of [`sw.js`](sw.js) (e.g. `v1` → `v2`). Returning visitors then pick up the
> new files. You do **not** need to do this when you only change questions in a
> sheet or edit `exams.json` — that data is fetched fresh (network-first).

---

## Installing on a phone (Add to Home Screen)

**iOS (Safari):** open the site → tap the **Share** button → **Add to Home
Screen** → **Add**. Launch it from the new icon for a full-screen, app-like
experience.

**Android (Chrome):** open the site → tap the **⋮** menu → **Install app** (or
**Add to Home screen**) → confirm.

After the first online visit the app shell is cached, so it launches offline.
Question data is fetched live when you're online (and the most recently loaded CSV
is served from cache if you happen to be offline).

---

## Privacy

Everything runs client-side. The only thing stored is a short per-exam attempt
history (date, score, time) in your browser's `localStorage`. Clear it any time
from the **Recent attempts** panel on the start screen.

---

## Running the self-tests

Open `tests/test.html` through the local server
(`http://localhost:8000/tests/test.html`). It exercises the CSV parser, the
row→question grouping, option shuffling, and the multi-correct grading rule, and
prints PASS/FAIL for each case.
