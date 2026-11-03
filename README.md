# Exee AI — desktop app

Free, local-first practice exams generated from your own course material.

Exee AI turns lecture slides and notes into realistic practice exams, grades
your answers, keeps a spaced-repetition flashcard deck of everything you miss,
and builds a study plan that works backwards from your exam date. It runs on
your computer (Windows, macOS, Linux) and uses **your own ChatGPT plan** for
AI features. There is no account, no server and no subscription.

## Features

- **Overview**: an exam-readiness score per course, today's plan, topic
  mastery, this week's activity, and what's coming up.
- **Practice exams**: generated from the materials you pick, with a choice of
  question count, difficulty, an optional timer, and an optional
  written-answer section. Multiple choice is checked instantly on your machine.
  Written answers are graded by the model with feedback.
- **Topic drills**: one click builds a six-question drill on your weakest
  topic.
- **Flashcards**: AI-generated decks plus an automatic *Mistakes* deck. Review
  is Leitner spaced repetition (Again / Hard / Good).
- **Study materials**: PDF, Word and plain text. Scanned PDFs are read with
  on-device OCR (Tesseract). Nothing is uploaded.
- **Study plan**: worked out locally from readiness and your exam date, with
  no plan usage.
- **AI coach**: answers questions grounded in the course's own notes (local
  BM25 retrieval) and your results. It is scoped to studying that course.
- **Command palette**: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>.

## Download

Get the latest installer from
[Releases](https://github.com/chrisprince-ic/exetasy-desktop/releases/latest):

| Platform | File |
| --- | --- |
| Windows (installer) | `Exee-AI-Setup-x64.exe` |
| Windows (portable, no install) | `Exee-AI-Portable-x64.exe` |
| macOS (Intel + Apple Silicon) | `Exee-AI-mac-universal.dmg` |

The builds aren't code-signed yet, so the first launch shows a warning:

- **Windows SmartScreen**: click *More info* → *Run anyway*.
- **macOS Gatekeeper**: right-click Exee AI in Applications → *Open* → *Open*.

## Releasing

Bump `version` in `package.json`, commit, then push a matching tag. The
[Release workflow](.github/workflows/release.yml) builds Windows and macOS on
GitHub Actions and publishes the release:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Getting started

Requires Node 22+.

```bash
npm install        # also builds the vendored DevKit packages
npm run dev        # Electron + Vite with hot reload
```

If `npm install` fails with `Cannot read properties of null (reading 'edgesOut')`,
that is an npm 10 workspace bug. Use npm 11: `npx npm@11 install`.

### Scripts

```bash
npm run dev         # develop
npm run typecheck   # tsc over main, preload and renderer
npm test            # vitest (readiness model, spaced repetition)
npm run build       # bundle to out/
npm run dist        # Windows installer + portable exe  → release/
npm run dist:mac    # macOS .dmg (must run on a Mac)
npm run dist:linux  # AppImage
```

The vendored DevKit has its own suite: `node --test vendor/siwc/local/test/*.test.mjs`.

## Layout

```
src/
  main/        Electron main process: storage, generation, grading, coach, IPC
  preload/     the only renderer ↔ main bridge (named operations, never tokens)
  renderer/    React UI
    src/pages/ Overview, Exams, ExamRun, Results, Flashcards, Materials, Plan, Coach, Settings
    src/plan.ts  local study-plan generator
  shared/      JSON parsing / normalisation helpers
vendor/        OpenAI's Sign in with ChatGPT DevKit, verbatim (see vendor/README.md)
build/         app icons
```

All data lives in the OS user-data folder (`data/exee.json` plus copied
material files). Sign-in tokens are encrypted with the OS credential store.

## Design

The UI follows *Exee AI redesign prototype (3)*: warm paper surfaces, navy for
action, gold for progress, wine and teal for misses and hits, Poppins and
Material Symbols Rounded. Fonts are bundled because the renderer's CSP allows
no remote origins.

## Licensing and cost

Exee AI is a **free, noncommercial, open-source project for students**. There
is no paid tier and nothing is sold.

This app integrates OpenAI's
[Sign in with ChatGPT DevKit](https://github.com/openai/sign-in-with-chatgpt-devkit),
which is distributed under the **Sign-in with ChatGPT DevKit Noncommercial
License v1.0**. That license permits noncommercial use only, so the app as a
whole is noncommercial. See [`NOTICE`](NOTICE) for attribution and
[`LICENSE`](LICENSE) (PolyForm Noncommercial 1.0.0) for this project's own code.

**Students bring their own ChatGPT plan.** AI features use your own ChatGPT
allowance; the project pays for no inference and charges you nothing. Plan
usage requires an eligible **ChatGPT Go, Plus or Pro** subscription. You can
control how much of your weekly allowance the app may use in ChatGPT Settings →
Usage.
