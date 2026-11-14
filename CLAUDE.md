# Quizr

A local-first study app for phones, tablets, and web: Flashcards (browse, sort, spaced repetition), Learn, and Test. Expo SDK 58, React Native, TypeScript, Expo Router, SQLite.

The feature specs, decisions, and status are in `docs/build-plan.md`. Read the relevant section before changing a feature.

## Commands

Bun only. Never `npm` or `npx`: the project has one lockfile, `bun.lock`.

```bash
bun run check          # typecheck + lint + unit tests. This defines "green".
bun run test           # Jest. Never `bun test`: Bun's runner does not load jest-expo.
bun run web            # dev server for web on http://localhost:8081
bun run android        # open the app in Expo Go on the running emulator (port 8081 must be free)
bun run build:web      # export the production web build to dist/
bun run e2e:web        # Playwright against dist/ (run build:web first)
bun run e2e:android    # Maestro flows against Expo Go (Maestro is not installed yet)
bun run db:generate    # after editing src/data/schema.ts, generate a migration
```

Install packages with `bunx expo install <pkg>` so versions match the SDK. Use `bun add` only for packages Expo does not version (drizzle-orm, fast-check, ts-fsrs, and similar).

## Layout

```
src/app/        Expo Router routes. One line each: render a feature screen.
src/core/       Pure TypeScript study engines. No React, React Native, Expo, or storage.
  grading.ts      typed-answer grading (strict / lenient)
  questions.ts    multiple choice, true/false, written; distractor choice
  flashcards/     deck reducer (browse, sort)
  learn/          Learn session reducer (stages, rounds, streak)
  test/           test generator and grader
  srs/            spaced repetition; the only place that imports ts-fsrs
src/data/       Schema, migrations, and the repositories screens use for storage.
src/features/   Screens, one folder per feature (sets, flashcards, learn, test, settings).
src/ui/         Theme, text, buttons, dialogs, layout helpers.
e2e/web/        Playwright specs. e2e/maestro/ holds the Android flow.
```

## Rules

1. **`src/core` is pure and deterministic.** Pass time and randomness in (`now`, a seed, `Rng`). Never call `Math.random()` or `Date.now()` there. ESLint enforces the imports.
2. **Study modes are reducers** with plain-JSON state, so a session can be saved and resumed. A saved session is validated (`isValidLearnState`, `isValidDeckState`) and discarded if it does not fit the set any more.
3. **Screens reach storage only through `useRepos()`** (`src/data/ReposProvider.tsx`). The interface is `src/data/repos.ts`; the SQL is in `src/data/sqliteRepos.ts`.
4. **SQLite is async only.** Never call `openDatabaseSync` or any `*Sync` SQLite method: they need SharedArrayBuffer on web and time out there.
5. **`src/data/schema.ts` is only for generating migrations.** The app runs plain SQL. After changing the schema, run `bun run db:generate` and update `sqliteRepos.ts` and `BACKUP_TABLES` to match.
6. **Route files hold no logic,** and Jest ignores `src/app` (a route named `test.tsx` would otherwise be taken for a test).
7. **Layout comes from the window, not the device:** `useWidthClass()` in `src/ui/layout.ts` (compact under 600, medium 600–839, expanded 840 and up).
8. **React Compiler lint rules are on.** In components: no `Date.now()` (use `nowMs()` from `src/ui/clock.ts`), no reading refs during render, no reassigning variables inside render callbacks.
9. **Confirmations use `ConfirmDialog`,** never `Alert`: React Native's `Alert` does nothing on web.

## Testing

- **Engines:** write tests from the acceptance criteria before implementing. Use fast-check for invariants (`src/core/testing.ts` has card generators). Do not weaken a test to make it pass.
- **Repositories:** `createTestRepos()` in `src/data/testing/memoryDb.ts` gives real repositories on an in-memory SQLite (Node's `node:sqlite`) with the real migrations applied. Use it instead of mocking storage.
- **Screens:** covered end to end by Playwright at phone and tablet sizes. Expo Router keeps earlier screens mounted but hidden, so use `shown(page, id)` from `e2e/web/helpers.ts` for ids that exist on more than one screen.
- **Look at it.** Behavioural tests do not catch visual bugs. After a UI change, take Playwright screenshots at both sizes and read them (see the `verify-app` skill).

## Definition of done

1. `bun run check` passes.
2. `bun run build:web && bun run e2e:web` passes.
3. Changed screens were looked at in screenshots at 375×812 and 1024×768.
4. The acceptance criteria in `docs/build-plan.md` for the work are met, and any that are not are stated plainly.

## This machine

- Windows 11. There is no iOS simulator; iOS is checked with Expo Go on a real device.
- Android SDK, emulator, and Java 17 are installed. Emulators: `Pixel_9_API_35` (phone), `Resizable_Experimental` (tablet sizes).
- Android runs in Expo Go. A native debug build (`bun run android:build`) fails here: Windows long paths are off and the build exceeds the 260-character path limit. Do not retry it or change that setting; see the `verify-app` skill.
- Maestro is not installed, so `bun run e2e:android` cannot run yet.
- When inspecting the web app from the browser pane, do not dump the console. One stack trace from this app is tens of thousands of characters. Check state with `get_page_text` or a small `javascript_tool` expression.
- Do not put backticks or `${}` inside `node -e "..."` or unquoted heredocs in Bash: the shell expands them. Write a script file, or use a quoted heredoc (`<<'EOF'`).
- Expo ships breaking changes every SDK. Before using an Expo or React Native API you are unsure of, read the docs for the installed version (`https://docs.expo.dev/versions/v58.0.0/`).
