---
name: verify-app
description: How to launch Quizr and confirm a change works in the running app on this machine, on web (phone and tablet sizes) and on the Android emulator. Use before declaring any UI, data, or session change done.
---

# Verifying Quizr

Unit tests prove the engines. This skill proves the app. Web is the main surface because it can be driven directly; Android confirms it.

## 1. Always first

```bash
bun run check
```

Stop and fix if it fails.

## 2. Web, interactive (browser pane)

1. Start the dev server with `preview_start` using the name `web` (defined in `.claude/launch.json`; it runs `bun run web` on port 8081).
2. The first bundle takes 20–40 seconds. Poll `http://localhost:8081/` until it returns 200 before navigating; do not assume it is up.
3. Navigate to `http://localhost:8081/`.
4. Check at both sizes with `resize_window`:
   - phone: preset `mobile` (375×812)
   - tablet: width 1024, height 768
5. Reset with preset `desktop` when finished.

Reading the page:

- Use `get_page_text`, `find`, or a small `javascript_tool` expression. React Native Web renders `testID` as `data-testid`.
- **Do not call `read_console_messages` without a `pattern` and a `limit` of 2 or 3.** A single stack trace from the dev bundle is tens of thousands of characters, and the console buffer keeps errors from earlier page loads, so old errors reappear after they are fixed.
- Screenshots fail when the pane is hidden. Measure layout with `getBoundingClientRect()` instead.

Layout checks worth running at each size:

```js
(() => {
  const column = document.querySelector('[data-testid=home-screen]').firstElementChild;
  const rect = column.getBoundingClientRect();
  return {
    viewport: innerWidth,
    columnWidth: Math.round(rect.width),
    sidewaysScroll: document.documentElement.scrollWidth > innerWidth,
  };
})();
```

Expected: the column fills the width on a phone and stops at 720 px on a tablet; `sidewaysScroll` is false.

After changing `metro.config.js`, `babel.config.js`, or `app.json`, stop and restart the server. Hot reload does not pick those up.

## 3. Web, automated

```bash
bun run build:web
```

```bash
bun run e2e:web
```

Playwright serves `dist/` with `scripts/serve-dist.mjs` (a plain static server, no special headers) and runs every spec at phone and tablet-landscape sizes. Rebuild before rerunning: the tests run against `dist/`, not your working tree. A full run is about two minutes.

The database on web lives in the browser's origin private file system. Each Playwright test gets a fresh browser context, so each starts with an empty database.

## 3b. Look at it

Passing tests do not mean the screen looks right. Two visual bugs (overlapping card faces, a label wrapping mid-word) passed every behavioural test and were only caught in screenshots.

The browser pane cannot take screenshots while it is hidden, so use Playwright:

1. Write a temporary spec in `e2e/web/` (so it can import `./helpers`) that walks to the screens you changed and calls `page.screenshot({ path })`, saving into the scratchpad.
2. Run it with `bunx playwright test <name>`. It runs at both sizes; put `info.project.name` in the file name.
3. Read the PNG files and check them.
4. Delete the temporary spec.

Selectors: Expo Router keeps earlier screens mounted but hidden. An id that exists on more than one screen (`back-button`, `card-count`, `set-screen`) matches twice; use `shown(page, id)` from `e2e/web/helpers.ts`.

## 4. Android emulator

```bash
adb devices
```

If no device is listed, boot one in the background (this opens a window on the desktop):

```bash
"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd Pixel_9_API_35 -no-snapshot-save -no-boot-anim
```

Wait until `adb shell getprop sys.boot_completed` prints `1`.

The app runs in **Expo Go** on Android. Port 8081 must be free, so stop the `web` preview first. Then start the dev server and open the app, in the background, logging to a file:

```bash
CI=1 bunx expo start --go --android --port 8081 > expo-go.log 2>&1
```

- `CI=1` stops the CLI from waiting on prompts. It also turns off hot reload, so restart after code changes.
- The CLI installs or updates Expo Go on the emulator by itself.
- Wait for a line starting `Android Bundled` in the log before reading the screen.
- Put the log in the scratchpad, not the project.

Check what is on screen without a screenshot. In Git Bash, set `MSYS_NO_PATHCONV=1` first or `/sdcard/...` is rewritten into a Windows path:

```bash
MSYS_NO_PATHCONV=1 adb shell uiautomator dump /sdcard/ui.xml && MSYS_NO_PATHCONV=1 adb shell cat /sdcard/ui.xml
```

`testID` shows up as `resource-id`. If the output lists "Reload", "Go home", "Toggle element inspector", Expo Go's developer menu is covering the app: dismiss it with `adb shell input keyevent 4` and dump again.

To test a cold start with an existing database:

```bash
adb shell am force-stop host.exp.exponent
```

Then reopen with `adb shell am start -a android.intent.action.VIEW -d "exp://<host>:8081" host.exp.exponent`, using the `exp://` address printed in the log.

Things that went wrong here before:

- **Reopening the app by hand:** use `exp://10.0.2.2:8081` (the emulator's alias for this machine). The LAN address the CLI prints timed out from the emulator.
- **Expo Go's floating "Tools" button** sits over the top-right of the header in development and swallows taps aimed at header buttons. Tap near the top edge of the button, or open the app with the CLI's own URL, which disables it (`?__expo_disable_fab=1`).
- **`adb shell input text` did not reach text fields** on a freshly cold-booted emulator, so typing and anything after it could not be exercised with `adb`. Do not report those flows as verified on Android unless you saw them work.
- **A cold boot is slow.** "System UI isn't responding" dialogs appear for the first minute; tap Wait.
- Wrap `adb` calls in `timeout`: `screencap` and `uiautomator dump` can hang.

When finished, stop the dev server (find the process listening on 8081 and end it) and close the emulator with `adb emu kill`.

For tablet sizes use the `Resizable_Experimental` emulator.

### Why not a native debug build

`bun run android:build` (`expo run:android`) **fails on this machine**. The native build of react-native-reanimated creates object-file paths longer than 260 characters, Windows long paths are disabled, and the SDK's ninja (1.10.2) cannot handle them. The error is `ninja: error: mkdir(...): No such file or directory`, after about 20 minutes. Do not retry it unless the owner has enabled long paths or moved the project to a much shorter path. Do not change that Windows setting yourself.

## 5. Android, automated

```bash
bun run e2e:android
```

This runs the Maestro flows in `e2e/maestro`. Maestro is **not installed** on this machine and the flow has never been run. If `maestro --version` fails, say so instead of skipping silently.

## 6. iOS

There is no iOS simulator on Windows. iOS can only be checked by the owner with Expo Go on a real iPhone or iPad. Say plainly that iOS was not verified.

## Reporting

State what you ran and what you saw for each surface. Name any surface you did not verify. Never report a pass you did not observe.
