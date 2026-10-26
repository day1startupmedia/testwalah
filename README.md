# SONEXA — NEET, JEE Main & CBSE Board practice tests

Live: https://sonexa.sites.tab.bot/ (formerly TestWalah)

Static website (no backend, no login). Open `site/index.html` through any static web host.

## Folders
- `site/` — the deployable website (index.html, styles.css, app.js, strings.js, scoring.js, vendor/katex, data/, img/)
- `data-src/` — the question bank: one JSON file per paper/bank (the source of truth)
- `tools/build-data.mjs` — turns data-src/*.json into site/data/*.js + site/data/index.js (run `node tools/build-data.mjs`)
- `test/` — `node --test test/*.test.mjs` checks the files, the question bank and the marking maths

## Add a new year or paper (no code changes)
1. Put question images (if any) in `site/img/<paper-id>/`.
2. Create `data-src/<paper-id>.json` with the same shape as the existing files:
   paper: { id, exam: "NEET" | "JEE Main", year, title, date, minutes, kind ("full" or "bank"),
            answerKey: {type, name, url}, marking: {mcq: [4,-1], numerical: [4,-1]}, rules: {}, note, questions: [...] }
   question: { id, exam, year, paper, qno, subject, section, part, chapter, type ("mcq"|"numerical"),
               question (text, LaTeX in $...$ allowed), image ("img/..." or ""), options (4 strings; ["1","2","3","4"] when
               options are inside the image), optionsInImage, answer (list of accepted values: "1".."4" or a number),
               explanation, source }
3. Run `node tools/build-data.mjs` and `node --test test/*.test.mjs`, then publish `site/`.

## Hindi
All UI text is in `site/strings.js` (`STR.en`). Fill `STR.hi` with the same keys and a हिंदी toggle appears in the header.

## Where the questions come from (v1)
- NEET 2024 (Code T3, 200 Q), NEET 2025 (Code 45, 180 Q): original NTA paper images (via the MIT-licensed
  Reja1/jee-neet-benchmark dataset); every answer replaced/checked against NTA's official FINAL answer key
  (2024: revised key of 26.07.2024; 2025: final key, code 45).
- NEET 2026 (Code 13, 3 May exam, 179 Q): NTA held a re-exam, so only NTA's PROVISIONAL key exists for this paper;
  1 question where the dataset and the provisional key disagreed is left out.
- NEET 2023 (Code H1, 199 Q), 2022 (Code R6, 194 Q), 2021 (Code P1, 200 Q), 2020 (Code E1, 180 Q), added 26 Oct 2026:
  question images cropped from the original NTA booklets (2020: NTA's own published "English Set E1" PDF; 2021: original P1
  booklet PDF; 2022: scan of the original R6 booklet; 2023: scan of the original H1 booklet); answers from NTA's FINAL keys
  (2020 result key 16.10.2020; 2021 result key 01.11.2021; 2022 final key; 2023 final key 07.05.2023 exam). Dropped by NTA and
  left out: 2023 Q1, 2022 Q95. 2023 Q148 accepts 1 or 3 (NTA). 2022 Q34, Q112, Q113, Q161, Q170 left out: damaged in the only
  original R6 scan. 2021-2023 use the Section B rule (10 of 15); 2020 has no Section B (Biology Q1-90, Chemistry 91-135, Physics 136-180).
- JEE Main 2025, 22 Jan Shift 1 (74 Q) and Shift 2 (73 Q): NTA response-sheet images (Motion Education PDFs),
  answers from NTA's JEE Main 2025 Session 1 final key matched by question ID; dropped/disputed questions left out.
- JEE Main 2025 maths bank (425 Q, Jan + Apr sessions): typed text with LaTeX from the PhysicsWallahAI/JEE-Main-2025-Math
  dataset (Apache-2.0; answers cross-verified with NTA final keys by the publisher). Text was transcribed by the
  publisher and may contain occasional typos.

## Logo and intro splash
- The TestWalah wordmark is one file: `site/assets/logo.svg` (used by the splash and the header). Replace that file to change the logo everywhere.
- App icons: `site/favicon.ico`, `site/assets/favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` (+ `site/manifest.webmanifest`).
- Intro splash: markup + a tiny script at the top of `<body>` in `site/index.html`, styles under "Intro splash" in `site/styles.css`.
  Shows on every page load (~2.1 s; ~1.2 s with reduced motion, no scale), tap or any key skips it, deep links (#/…) open after it.
- Tagline font: Baloo 2 (SIL OFL), self-hosted in `site/assets/fonts/`.
