# Quizr build plan (for Claude Code)

A plan for building three study modes end to end, **Flashcards**, **Learn**, and **Test**, in one app that runs on phones and tablets, with web as a bonus target. **Spaced repetition** comes only after those three are finished and gated.

Feature behaviour is described in [quizlet-study-tools.md](quizlet-study-tools.md). That file is reference for _what the modes do_; Quizr uses its own name, visual design, wording, and content. Do not copy Quizlet's branding, layouts, or sets.

Written 2026-11-13. Versions below were checked that day; re-check before pinning.

---

## 1. Decisions already made

These are defaults chosen so work can start. Each is cheap to revisit before Phase 0, expensive after Phase 1.

| Decision                          | Choice                                                                                            | Why                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                         | Expo SDK 58 (React Native 0.88) + TypeScript strict                                               | One codebase for iOS, Android, tablets, and web                                                                                               |
| Navigation                        | Expo Router                                                                                       | File-based routes, works on all three targets                                                                                                 |
| Storage                           | `expo-sqlite` (async API only) + Drizzle ORM via its `sqlite-proxy` driver, on-device             | Local-first, works offline, typed schema and migrations. Async-only so web needs no special headers                                           |
| Accounts / sync                   | None in v1                                                                                        | Solo study needs neither; IDs are UUIDs so sync can be added later                                                                            |
| Animation                         | Reanimated + Gesture Handler                                                                      | Card flip and swipe run off the JS thread                                                                                                     |
| Session state                     | Pure reducers in `src/core`, held with `useReducer`                                               | Deterministic, serialisable, testable without a device                                                                                        |
| Lists                             | FlashList                                                                                         | Sets with thousands of cards stay smooth                                                                                                      |
| Package manager and script runner | Bun                                                                                               | Already installed (1.3.2); faster installs and script startup than npm. Lockfile is `bun.lock`                                                |
| Unit tests                        | Jest 30 + `jest-expo` + React Native Testing Library 14 + fast-check, started with `bun run test` | Expo's documented setup; fast-check for engine invariants. Bun's own runner (`bun test`) is not used: it does not load the `jest-expo` preset |
| Mobile E2E                        | Maestro against Expo Go on the Android emulator                                                   | A native debug build cannot be produced on this machine (see constraints below). Maestro itself is not installed yet                          |
| Web E2E                           | Playwright against the exported web build                                                         | Runs in CI without an emulator                                                                                                                |
| Spaced repetition                 | `ts-fsrs` 5.4.x (FSRS v6), wrapped                                                                | Proven open scheduler with four ratings; no need to invent one                                                                                |

### Why web is worth keeping even though it is optional

The web build is what makes the app **verifiable by Claude Code itself**. Claude can start the web dev server, open it in the browser pane, resize to phone and tablet viewports, click through a study session, and read the console. That closes the loop on UI work without a human in it. Treat web as the primary verification surface and Android as the confirmation surface.

### Constraints of this machine

- **Windows 11:** there is no iOS simulator. iPhone and iPad are checked with Expo Go on a real device, or with EAS cloud builds. Every library above works in Expo Go, so v1 needs no custom iOS build.
- **Android:** SDK, NDK, emulator, and `adb` are installed. The app runs in Expo Go on the emulator.
- **No native Android build:** `expo run:android` fails after about 20 minutes. react-native-reanimated's native build creates paths over 260 characters, Windows long paths are disabled, and the SDK's ninja (1.10.2) cannot handle them. Fixing it needs the owner to enable Windows long paths or move the project to a much shorter path. Until then, Android is Expo Go only.
- **Maestro is not installed.** Installing it means downloading a release from GitHub and adding it to PATH; that is the owner's call.
- **Git:** the repo has no commits and sits on `master`. Phase 0 makes the first commit and renames the branch to `main`.

### SQLite on web: resolved in Phase 0

The Phase 0 spike found that `expo-sqlite`'s **synchronous** API does not work reliably in the browser:

- It needs `SharedArrayBuffer`, which browsers only expose to pages served with `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers.
- Expo's dev server sends those headers on every path except the root `/` when `web.output` is `single`, so the app's home page fails in development.
- Even on a correctly isolated page, `openDatabaseSync` threw "Sync operation timeout".

Drizzle's own `expo-sqlite` driver is sync-only, so it is not used. Instead:

- **All SQLite access is async** (`openDatabaseAsync`, `runAsync`, `prepareAsync`). The async API talks to the SQLite worker with plain messages and needs no special headers, so the web build runs on any static host.
- **Drizzle runs through its `sqlite-proxy` driver**, wired to the async API in `src/data/db.ts`.
- **Migrations are applied by `prepareDatabase()`** in the same file, using drizzle-kit's generated bundle. The ordering logic is pure and tested in `src/data/migrationPlan.ts`.
- **Drizzle's `useLiveQuery` and `useMigrations` are not available** (they belong to the sync driver). Screens reload data through repositories after a write.

`withExclusiveTransactionAsync()` is not available on web; use `withTransactionAsync()`.

---

## 2. Scope

**In v1 (Phases 0–4):** set library, card editing, paste-import, Flashcards, Learn, Test, phone and tablet layouts, web build.

**After v1 (Phase 5):** spaced repetition inside Flashcards.

**Not planned:** accounts, sharing, AI generation, images or audio on cards, games, classes, study groups, premade content.

---

## 3. Architecture

```
src/app/              Expo Router routes. Thin: read params, render a feature screen.
src/core/             Pure TypeScript. No react, react-native, or expo imports.
  model.ts            Card, StudySet, ids, enums
  rng.ts              Seeded RNG (injected everywhere randomness is needed)
  grading.ts          Written-answer normalisation and comparison
  questions.ts        Question types and distractor selection
  flashcards/         Deck reducer
  learn/              Learn session reducer
  test/               Test generator and grader
  srs/                Phase 5: scheduler wrapper
src/data/
  schema.ts           Drizzle tables
  migrations/         Generated by drizzle-kit
  repos/              Interfaces + SQLite implementation + in-memory implementation
src/features/         sets/ flashcards/ learn/ test/ : screens, components, hooks
src/ui/               Tokens, primitives, responsive helpers
e2e/maestro/          Mobile flows
e2e/web/              Playwright specs
docs/
```

### Rules that keep it reliable

1. **`src/core` is pure and deterministic.** Time and randomness are passed in (`now: number`, `rng: Rng`). An ESLint `no-restricted-imports` rule fails the build if core imports React, React Native, or Expo.
2. **Every study mode is a reducer:** `(state, event) => state`, with selectors for what to render. State is plain JSON, so a session can be saved and resumed.
3. **Features never touch SQLite directly.** They call repository interfaces. Tests use the in-memory implementation.
4. **Routes hold no logic.** Anything worth testing lives in `core` or a feature hook.

### Data model

| Table                 | Columns                                                                     | Notes                                                                                 |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `sets`                | id, title, description, created_at, updated_at                              |                                                                                       |
| `cards`               | id, set_id, term, definition, position, starred, created_at, updated_at     | Index on (set_id, position)                                                           |
| `card_state`          | card_id, sort_status, learn_stage, last_answered_at                         | One row per card; sort_status is unsorted / still_learning / know; learn_stage is 0–2 |
| `sessions`            | id, set_id, mode, state_json, updated_at                                    | One resumable session per set and mode                                                |
| `test_attempts`       | id, set_id, config_json, answers_json, score, total, submitted_at           | History                                                                               |
| `review_log`          | id, card_id, mode, question_type, correct, rating, answered_at, duration_ms | Append-only; feeds stats and Phase 5                                                  |
| `srs_state` (Phase 5) | card_id, due, stability, difficulty, reps, lapses, state, last_review       | Mirrors the ts-fsrs card                                                              |
| `settings`            | key, value                                                                  | e.g. new cards per day                                                                |

---

## 4. Feature specs

Each bullet is an acceptance criterion. Tests are written from these.

### 4.0 Sets (prerequisite)

- Library screen lists sets with card counts; create, rename, delete (with confirm).
- Set screen lists cards; add, edit, delete, reorder, star.
- Paste-import: one card per line, term and definition split by tab or a chosen delimiter; preview before saving; 2,000 cards import inside one transaction in under 2 seconds.
- Set screen offers Flashcards, Learn, Test. Learn and Test are disabled with an explanation below 4 cards.
- A dev-only seed creates a 20-card set and a 5,000-card set.

### 4.1 Flashcards

- Card shows one side; tap or Space flips it with an animation. Reduce-motion setting swaps the flip for a cross-fade.
- Next and previous by swipe, on-screen arrows, and arrow keys. Progress shows "7 / 20".
- Options: shuffle, which side shows first, starred only, autoplay, text-to-speech (`expo-speech`).
- Sorting on: swipe right or press a button for **Know**, left for **Still learning**. Undo reverses the last sort.
- End of round shows both counts, with "Review still learning" and "Restart".
- Position, order, and piles survive leaving and reopening.

### 4.2 Learn

Quizr's own mastery model, built to match the documented behaviour (questions get harder as you get them right; missed items come back).

- **Stages per card:** 0 New → 1 Familiar → 2 Mastered.
- **Question by stage:** stage 0 gets multiple choice (with true/false mixed in when enabled); stage 1 gets a written question. If written is disabled, stage 1 gets multiple choice with harder distractors.
- **Correct** raises the stage by one. **Wrong** or "Don't know" lowers it by one (not below 0), shows the right answer, and re-queues the card at least two questions later in the same round.
- **Rounds:** up to 7 cards, drawn Familiar-first (oldest seen first) then New. A round ends when every card in it has been answered correctly once in that round. A checkpoint then shows New / Learning / Mastered counts.
- **Finish:** when every in-scope card is Mastered. Summary offers Restart and Take a test.
- **Distractors:** three wrong options from the same set, never textually equal to the right answer or each other, preferring similar length and shared words.
- **Written grading:** see 4.4. An "I was correct" button reverses the last wrong mark.
- **Streak:** a counter appears after five first-try correct answers in a row and resets on a miss.
- **Options:** answer with term or definition, question types, grading strictness, starred only, retype the correct answer after a miss.
- Session resumes after leaving. "Reset progress" clears stages for the set.

### 4.3 Test

- Setup: question count (1 to card count), types (true/false, multiple choice, matching, written), answer side, starred only, optional countdown timer.
- Generation is deterministic for a given seed. No card is used twice. Count is split across the enabled types; matching uses blocks of up to 6 pairs.
- Taking: all answers stay editable until submit. Submit warns about unanswered questions. Leaving mid-test asks for confirmation and discards the attempt.
- Timer reaching zero submits automatically.
- Results: percentage, per-type breakdown, each question with the given and correct answer.
- Follow-ups: "Retest missed" builds a new test from the missed cards; "Learn missed" opens Learn scoped to them.
- Submitted attempts are saved and listed on the set screen.

### 4.4 Shared: written-answer grading

- Normalise: trim, collapse whitespace, case-fold, Unicode NFKC, strip surrounding punctuation.
- A definition may hold alternatives separated by `/` or `;`; any one matches.
- Text in parentheses is optional.
- **Strict:** normalised equality. **Lenient:** also accepts one typo per five characters (edit distance) and ignores diacritics.
- No AI grading in v1.

### 4.5 Spaced repetition (Phase 5 only)

- Flashcards gains a study-method picker: Browse, Sort, Spaced repetition.
- After flipping, four ratings: **Again, Hard, Good, Easy**, each showing its next interval (from the scheduler's preview). Keys 1–4 rate.
- Queue is due cards plus new cards up to a daily limit (default 20, editable). Review continues until nothing is due, then falls back to Browse.
- Library shows a "due today" count per set and in total.
- `ts-fsrs` is called only from `src/core/srs`; the rest of the app sees Quizr's own interface.
- Stretch: daily local reminder, retention chart from `review_log`.

### 4.6 Responsive and accessible (applies to everything)

- Width classes: compact under 600, medium 600–839, expanded 840 and up, read from `useWindowDimensions` so rotation and split-screen work.
- Compact: single column. Expanded: content capped at a readable width; the set screen becomes two panes (card list beside study launcher); Test shows all questions in one scroll.
- Both orientations supported. Safe areas respected.
- Touch targets at least 48 dp. Text respects system font scaling up to 200% without clipping.
- Every control has an accessibility label; a card announces which side is showing.
- Hardware-keyboard shortcuts work on tablets and web.

---

## 5. Phases

One phase per Claude Code session. Each ends at a gate; do not start the next phase until the gate passes. Progress is recorded by ticking the checklist in section 9.

### Phase 0: Scaffold and harness

Build the working environment before any feature.

1. `bunx create-expo-app@latest` into the repo; TypeScript strict; Expo Router. Confirm the project has `bun.lock` and no `package-lock.json`.
2. Add ESLint (with the core-purity rule), Prettier, Jest 30 + `jest-expo`, RNTL 14, fast-check, Playwright. Install Expo-versioned packages with `bunx expo install` so they match the SDK, everything else with `bun add`. Use the Bun variant of `transformIgnorePatterns` from Expo's testing guide.
3. `bun run check` = typecheck + lint + unit tests. This is the one command that defines "green".
4. Spike: open a SQLite database, run a Drizzle migration, read a row, on **web** and on the **Android emulator**. If web fails, record why and build the fallback repository before Phase 1.
5. Install Maestro; one flow that launches the app and asserts the home screen.
6. Write `CLAUDE.md`, the hooks, the agents, and the `verify-app` skill (section 6).
7. GitHub Actions: `oven-sh/setup-bun`, `bun install --frozen-lockfile`, `bun run check`, web export, Playwright smoke.
8. First commit; rename branch to `main`.

**Gate:** `bun run check` green; placeholder screen renders on web at phone and tablet sizes and on the emulator; CI green.

**Status on 2026-11-13:**

| Gate item                      | Result                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check`                | Pass: typecheck, lint, 22 unit tests                                                                                               |
| Web at phone and tablet sizes  | Pass: checked in the browser at 375 and 1024 wide; 6 Playwright tests pass against the production build                            |
| SQLite on web                  | Pass, after switching to the async API (section 1)                                                                                 |
| Android emulator               | Pass in Expo Go on `Pixel_9_API_35`, first launch and relaunch. Native debug build fails (section 1)                               |
| Maestro flow                   | Written, never run: Maestro is not installed                                                                                       |
| CI                             | Pass: first run on GitHub Actions, both jobs green (typecheck, lint, unit tests; web build and browser tests)                      |
| Hooks and permissions          | Scripts written and tested by hand. `.claude/settings.json` was not created; its content is in `docs/claude-settings.example.json` |
| First commit, rename to `main` | Done: `b80f8f2`, pushed to `origin/main`                                                                                           |
| iOS                            | Not verified: no simulator on Windows                                                                                              |

### Phase 1: Core engines and data layer

No UI beyond Sets. This phase is where correctness is won.

1. `model.ts`, `rng.ts`, schema, migrations, repositories (SQLite and in-memory).
2. `grading.ts` and `questions.ts`, tests first.
3. Flashcards deck reducer, Learn reducer, Test generator and grader, tests first.
4. Sets feature (4.0) with UI.

Steps 2 and 3 are four independent pure modules once step 1 has fixed the types, so they suit parallel subagents (section 6.3).

**Gate:** core coverage at or above 95% lines; every invariant in section 7.2 passes; the 5,000-card seed imports within budget; Sets works on web and emulator.

### Phase 2: Flashcards UI

First study screen, built alone so it sets the UI patterns (tokens, primitives, responsive helpers, session persistence hook) that Learn and Test reuse.

**Gate:** all 4.1 criteria pass; Maestro and Playwright flows for a full round; flip stays at 60 fps on the emulator; `/code-review` findings resolved.

### Phase 3: Learn UI, and Phase 4: Test UI

Independent of each other after Phase 2. Run them one after the other, or in parallel in separate worktrees (section 6.3). Before going parallel, freeze `src/ui`, `src/data/schema.ts`, and the root layout; neither branch may edit them.

**Gate (each):** all criteria in 4.2 or 4.3 pass; E2E flow covers start → finish → resume; no regressions in `bun run check`.

### Phase 4.5: Hardening

- Full responsive pass on the device matrix (section 7.4).
- Accessibility pass with a screen reader on one phone.
- Performance budgets (section 7.5) measured on the 5,000-card set.
- Export and import of all data as JSON (the user's backup).
- Error boundaries on every route; a corrupt session resets cleanly instead of crashing.
- `/security-review` and a final `/code-review`.

**Gate:** v1 is shippable. Tag it.

### Phase 5: Spaced repetition

Only after the Phase 4.5 gate. Add `srs_state` and `settings` with a migration, the `core/srs` wrapper with tests first, then the Flashcards study-method picker and rating UI.

**Gate:** all 4.5 criteria pass; SRS invariants pass; migration tested on a database created by v1.

### Phase 6 (optional): Distribution

Web hosting with the required headers; EAS builds for store testing; later, sync.

---

## 6. How Claude Code should work on this

### 6.1 Session discipline

- **One phase per session, fresh context each time.** Everything a session needs is in the repo: this plan, `CLAUDE.md`, and the code. Do not rely on memory of earlier sessions.
- **Start each phase in plan mode.** Produce a file-level plan for that phase, get it approved, then implement.
- **Tests first for `src/core`.** Write tests from the acceptance criteria, run them and see them fail, then implement until they pass. Do not edit a test to make it pass unless the criterion itself was wrong, and say so when that happens.
- **Small commits on a branch per phase,** one PR per phase, merged only when the gate passes.
- **Look things up.** Expo, Drizzle, and Reanimated APIs change between SDKs. Read the current docs for the installed version before using an API from memory.

Kickoff prompt for any phase:

> Read `CLAUDE.md` and `docs/build-plan.md`. Do Phase N only. Start in plan mode with a file-level plan. Write tests from the acceptance criteria before implementing. Finish by running the phase gate and reporting each gate item as pass or fail with evidence.

### 6.2 `CLAUDE.md` (create in Phase 0, keep under about 60 lines)

It should hold only what every session needs:

- The commands: `bun run check`, `bun run web`, `bun run android`, `bun run e2e:web`, `bun run e2e:android`.
- The four architecture rules from section 3.
- Definition of done: check is green, the change was exercised in the running app at phone and tablet widths, criteria ticked.
- Machine facts: Windows, no iOS simulator, Android emulator name.
- Package rules: Bun only (`bun install`, `bun add`, `bunx expo install`); never `npm` or `npx`, so there is one lockfile. Run tests with `bun run test`, never `bun test`. Node stays installed because the Expo CLI and Metro still execute on it.
- A pointer to this plan.

### 6.3 Subagents

Subagents start with no context and cost a full cold start, so use them where they pay for themselves:

| Use                  | When                                                                                                      | How                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parallel builders    | Phase 1 engines (grading, questions, Learn reducer, Test generator) after types are fixed; Phases 3 and 4 | One agent per module, each in its own git worktree, each given the exact spec section and the files it owns                                                |
| Independent reviewer | End of every phase                                                                                        | A fresh-context agent that gets only the diff and the spec section and reports mismatches. It has not seen the implementer's reasoning, which is the point |
| Verifier             | After any UI change                                                                                       | Runs the check command and drives the app, returns only failures, keeping logs out of the main context                                                     |
| Explore              | Any broad docs or code search                                                                             | Built-in read-only agent                                                                                                                                   |

Do not use subagents for small sequential edits, or for two tasks that touch the same files.

Define two project agents in `.claude/agents/`:

- **`spec-reviewer`** (read-only tools): "Compare the diff against the named section of `docs/build-plan.md`. List each acceptance criterion as met, unmet, or untested, with file and line."
- **`verifier`** (Bash and browser tools): "Run `bun run check`. Start the web app, exercise the named flow at 375×812 and 1024×768, read the console. Report only failures, with reproduction steps."

### 6.4 Skills

Built-in, used at fixed points:

- `/code-review` at the end of every phase.
- `/simplify` after a phase passes its gate, before the PR.
- `/security-review` in Phase 4.5.
- `/run` to launch the app when confirming a change.

One project skill, `.claude/skills/verify-app/SKILL.md`, written in Phase 0 once the steps are known to work on this machine: how to start the web server, how to boot the emulator and install the debug build, how to run the Maestro and Playwright suites, and what a pass looks like. This removes rediscovery from every later session.

### 6.5 Hooks and permissions (`.claude/settings.json`)

Hooks are run by the harness, so they hold even when the model forgets.

- **PostToolUse on `Edit|Write`:** run a small script (`scripts/hooks/format-changed.mjs`) with Bun that reads the hook's JSON from stdin, takes `tool_input.file_path`, and runs ESLint `--fix` and Prettier on that file. A script file avoids shell differences on Windows, and Bun starts it faster than Node.
- **Stop:** run `bun run typecheck`; on failure exit with code 2 so the errors go back to Claude and the turn continues. Check `stop_hook_active` in the input to avoid looping.
- **Permissions allowlist:** `bun run *`, `bun install`, `bunx expo *`, `bunx jest *`, `bunx playwright *`, `adb *`, `maestro *`, so routine verification does not stop for prompts.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "bun scripts/hooks/format-changed.mjs" }]
      }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "bun scripts/hooks/typecheck-gate.mjs" }] }
    ]
  }
}
```

### 6.6 Browser preview (Claude desktop app)

Add `.claude/launch.json` so the web app starts as a managed preview:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "web",
      "runtimeExecutable": "bunx",
      "runtimeArgs": ["expo", "start", "--web", "--port", "8081"],
      "port": 8081
    }
  ]
}
```

---

## 7. Testing strategy

### 7.1 Layers

| Layer                          | Tool                                          | Covers                                         | Runs                     |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------- | ------------------------ |
| Engine unit and property tests | Jest + fast-check                             | All of `src/core`                              | Every change, in seconds |
| Repository tests               | Jest against in-memory and a real SQLite file | Queries, migrations                            | Every change             |
| Component tests                | RNTL                                          | Screens wired to reducers with in-memory repos | Every change             |
| Web E2E                        | Playwright at phone and tablet viewports      | One happy path per mode, plus resume           | CI and phase gates       |
| Mobile E2E                     | Maestro on the Android emulator               | Same paths, plus gestures                      | Phase gates              |
| Manual                         | Expo Go on a real iPhone or iPad              | Feel, gestures, screen reader                  | Phase 4.5                |

Most confidence should come from the first row. It is the fastest and the one Claude can iterate against without a device.

### 7.2 Invariants (property tests)

**Grading**

- An answer always matches itself.
- Anything Strict accepts, Lenient accepts.

**Questions**

- Multiple choice has exactly one correct option and no duplicate option text.

**Learn reducer**

- A stage changes by at most one per answer and stays in 0–2.
- With all-correct answers, a set of N cards finishes in exactly 2N questions.
- A missed card is asked again in the same round, and not as the very next question when the round has other cards left.
- For any answer sequence the session never reaches a state with no current question unless it is finished.
- Serialise then deserialise gives an identical state.

**Test generator**

- Produces exactly the requested count, no card twice.
- Same seed and config give the same test.
- Grading a test answered entirely from the answer key scores 100%.

**Spaced repetition (Phase 5)**

- For the same card, next due is ordered Again ≤ Hard ≤ Good ≤ Easy.
- New cards introduced in a day never exceed the limit.
- A card is never in the queue before its due time.

### 7.3 Determinism

Fix seeds in tests. For any failing property test, commit the shrunk counter-example as a named regression test.

### 7.4 Device matrix

| Target                         | How                                                       |
| ------------------------------ | --------------------------------------------------------- |
| Small phone, 360×640           | Android emulator; Playwright viewport                     |
| Large phone                    | Android emulator                                          |
| Tablet, portrait and landscape | Android tablet emulator; Playwright 768×1024 and 1024×768 |
| Web desktop, 1280 wide         | Playwright; browser pane                                  |
| iPhone and iPad                | Expo Go on real devices, manual                           |

### 7.5 Performance budgets

| Measure                                       | Budget                                    |
| --------------------------------------------- | ----------------------------------------- |
| Cold start to library (emulator)              | under 2 s                                 |
| Import 2,000 cards                            | under 2 s                                 |
| Open a 5,000-card set                         | first rows visible under 500 ms           |
| Card flip and swipe                           | 60 fps, no dropped frames on the emulator |
| Generate a 100-question test from 5,000 cards | under 100 ms                              |
| Next Learn question                           | under 16 ms                               |

The engine budgets are asserted in Jest. The UI budgets are measured by hand in Phase 4.5 and recorded in the PR.

---

## 8. Open questions for the owner

None of these block Phase 0.

1. **Flutter instead of Expo?** Expo is chosen because the web target doubles as Claude's verification surface and TypeScript engines are trivially unit-testable. Say so before Phase 0 if you prefer Flutter.
2. **Accounts and cross-device sync** are left out of v1. If they are wanted soon, say so before Phase 1 so the schema carries what sync needs.
3. **Images or audio on cards** are out of scope. Adding them later touches the schema, import, and every question renderer.

---

## 9. Progress

- [x] Phase 0: Scaffold and harness
- [x] Phase 1: Core engines and data layer
- [x] Phase 2: Flashcards UI
- [x] Phase 3: Learn UI
- [x] Phase 4: Test UI
- [ ] Phase 4.5: Hardening (v1): partly done, see section 10
- [x] Phase 5: Spaced repetition
- [ ] Phase 6: Distribution (optional)

---

## 10. What was built (status on 2026-11-13)

Phases 1 to 5 were built in one pass on the `build/v1` branch. This section records what exists, how it was verified, and where it differs from the plan above. Where this section and an earlier one disagree, this one is current.

### Verified

| Check                               | Result                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check`                     | Pass: typecheck (app and e2e), lint, 159 unit tests                                                                                                                                           |
| Engine invariants (section 7.2)     | Pass: all listed invariants are property tests                                                                                                                                                |
| Repositories                        | Pass: 23 tests run the real SQL and the real migrations on an in-memory SQLite                                                                                                                |
| Upgrade from a v1 database          | Pass: tested in `sqliteRepos.test.ts`                                                                                                                                                         |
| Web end to end                      | Pass: 31 Playwright scenarios at phone (375×812) and tablet landscape (1024×768), 62 runs. The full suite passed three times in a row after a reload race was fixed                           |
| Visual check                        | Screenshots of every main screen at both sizes were read. Two bugs found and fixed (card faces overlapping; a button label wrapping mid-word)                                                 |
| Android (Expo Go, Pixel 9 emulator) | Partly: the app boots, the database opens and migrates, the library renders, navigation works. Typing and the study flows were **not** exercised: `adb` text input did not reach the emulator |

### Not verified or not done

- **iOS:** never run. There is no simulator on Windows.
- **Android study flows:** see above. Maestro is still not installed.
- **Native debug build:** still blocked by the Windows path limit (section 1).
- **UI performance budgets (section 7.5):** cold start, list scrolling, and animation frame rate were not measured. The engine budgets are asserted in Jest with looser limits than the table (500 ms for a 100-question test, 50 ms per Learn question, 2 s for a 2,000-card import) so that slow CI machines do not fail.
- **Screen-reader pass:** labels, roles, and hidden-face handling are in the code, but no screen reader was run.
- **Hardware-keyboard shortcuts** work on web only. Native builds have no global key events without an extra native module.
- **Leaving a test** is confirmed for the in-app back button and Android's back button. The browser's own back button and closing the tab are not intercepted.
- **Spaced-repetition stretch goals** (daily reminder, retention chart) were not built.
- **Timer auto-submit** is implemented but has no automated test.
- **CI** has not run on this branch.

### Differences from the plan

| Plan                                                | What was built                                                                                              | Why                                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle ORM queries                                 | Plain SQL in `src/data/sqliteRepos.ts`. Drizzle's schema file is kept only to generate migrations           | The sync-only Drizzle driver cannot be used on web (section 1); plain SQL over a five-method interface is also what lets Jest run the same queries on `node:sqlite` |
| In-memory repository for tests                      | Real repositories on an in-memory SQLite (`createTestRepos()`)                                              | Tests the actual SQL and migrations instead of a second implementation                                                                                              |
| Reanimated and Gesture Handler for the card         | React Native's built-in `Animated` (native driver) and the responder system                                 | Fewer moving parts; the flip is a two-property animation and the swipe is a threshold check. Both libraries remain installed for Expo Router                        |
| FlashList                                           | `FlatList`                                                                                                  | Virtualised and sufficient; not measured against the 5,000-card budget                                                                                              |
| `useReducer` for sessions                           | Learn uses `useState` plus the pure reducer, so each event can also trigger saving and logging in one place | Simpler than effects reacting to state                                                                                                                              |
| ts-fsrs 5.4.x                                       | 5.4.2, pinned with `~`                                                                                      | Version 6 replaced the API; 5.4 is the one the plan was written against                                                                                             |
| Typed routes                                        | Turned off                                                                                                  | The generated types only refresh while the dev server runs, which made type checks depend on local state                                                            |
| One phase per session, plan mode, subagent builders | One continuous session, no subagents                                                                        | The owner asked to build everything at once                                                                                                                         |

### Behaviour worth knowing

- **Learn** needs two right answers per card (recognition, then written), so a set of N cards takes at least 2N questions. "I was correct" is offered only for typed answers.
- **Learn on missed cards** (from a test result) is a separate, unsaved session and does not change the set's Learn progress.
- **Test** counts cards, not items: a matching block of five pairs is five questions. With fewer than two matching pairs allocated, that card goes to another type.
- **Spaced repetition** never shows a card before it is due, including cards rated "Again" a minute ago. The screen says when the next card comes back.
- **The daily new-card limit** is shared across all sets and counts cards first studied since local midnight.
- **Backup** is a full copy of every table as JSON. Restore replaces everything, inside one transaction, and refuses files that are not Quizr backups.
- **Sample data** buttons exist in Settings in development builds only.
- **Saving is immediate but not instant.** Every action starts its save in the same tick, and the write finishes a few milliseconds later. If the app or tab is killed inside that window, that one last action can be lost; nothing earlier is affected. On web the `<html>` element carries `data-quizr-busy` while any storage operation is running, which is what the end-to-end tests wait on before reloading.

---

## Sources

- [Expo SDK reference (v58)](https://docs.expo.dev/versions/latest/)
- [expo-sqlite, including web setup and limits](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo unit testing guide](https://docs.expo.dev/develop/unit-testing/)
- [Expo E2E tests with Maestro](https://docs.expo.dev/eas/workflows/examples/e2e-tests.md)
- [Maestro on Windows](https://docs.maestro.dev/getting-started/installing-maestro/windows)
- [Drizzle ORM live queries for Expo SQLite](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v0311)
- [ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs)
