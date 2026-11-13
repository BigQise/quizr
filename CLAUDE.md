# Quizr

A local-first study app (Flashcards, Learn, Test, later spaced repetition) for phones, tablets, and web. Expo SDK 58, React Native, TypeScript, Expo Router, SQLite through Drizzle.

The build plan, feature specs, and phase checklist are in `docs/build-plan.md`. Read the section for the phase you are working on before you start.

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

Install packages with `bunx expo install <pkg>` so versions match the SDK. Use `bun add` only for packages Expo does not version (drizzle-orm, fast-check, and similar).

## Architecture rules

```
src/app/        Expo Router routes. Thin: read params, render a feature screen.
src/core/       Pure TypeScript study engines. No React, React Native, Expo, or Drizzle.
src/data/       Schema, migrations, database access.
src/features/   Screens, components, and hooks, one folder per feature.
src/ui/         Theme tokens, primitives, responsive helpers.
```

1. **`src/core` is pure and deterministic.** Pass time and randomness in (`now`, `Rng` from `src/core/rng.ts`). Never call `Math.random()` or `Date.now()` there. ESLint enforces the import rule.
2. **Study modes are reducers:** `(state, event) => state`, with plain-JSON state so sessions can be saved and resumed.
3. **Features reach storage only through `src/data`.**
4. **Route files hold no logic.**
5. **SQLite is async only.** Use `db` and `getSqlite()` from `src/data/db.ts`. Never call `openDatabaseSync` or any `*Sync` SQLite method: they need SharedArrayBuffer on web and time out there. This is also why Drizzle's `useLiveQuery` and `useMigrations` are not used.
6. **Layout comes from the window, not the device.** Use `useWidthClass()` from `src/ui/layout.ts` (compact under 600, medium 600–839, expanded 840 and up).

## Working rules

- Write tests for `src/core` from the acceptance criteria before implementing. Do not weaken a test to make it pass.
- Split a screen into a container that loads data and a view that takes props, and test the view (see `src/features/sets`).
- Expo changes every SDK. Before using an Expo, Drizzle, or Reanimated API, read the docs for the installed version (`https://docs.expo.dev/versions/v58.0.0/`, index at `https://docs.expo.dev/llms.txt`). Do not rely on memory.
- `android/` and `ios/` are generated. Never edit them; change `app.json` or a config plugin.
- ESLint is pinned to 9. ESLint 10 breaks the React plugin that `eslint-config-expo` uses.

## Definition of done

1. `bun run check` passes.
2. The change was exercised in the running web app at 375×812 and 1024×768 (see the `verify-app` skill).
3. For anything touching data or sessions: `bun run build:web && bun run e2e:web` passes.
4. The acceptance criteria in `docs/build-plan.md` for the work are met, and any that are not are stated plainly.

## This machine

- Windows 11. There is no iOS simulator; iOS is checked with Expo Go on a real device.
- Android SDK, emulator, and Java 17 are installed. Emulators: `Pixel_9_API_35` (phone), `Resizable_Experimental` (tablet sizes).
- Android runs in Expo Go. A native debug build (`bun run android:build`) fails here: Windows long paths are off and the build exceeds the 260-character path limit. Do not retry it or change that setting; see the `verify-app` skill.
- Maestro is not installed, so `bun run e2e:android` cannot run yet.
- When inspecting the web app from the browser pane, do not dump the console. One stack trace from this app is tens of thousands of characters. Check state with `get_page_text` or a small `javascript_tool` expression.
