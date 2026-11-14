import { defineConfig, devices } from '@playwright/test';

/**
 * Web end-to-end tests. They run against the exported production web build
 * (dist/), served as a static single-page app, at phone and tablet sizes.
 *
 *   bun run build:web && bun run e2e:web
 */
const PORT = 4173;

export default defineConfig({
  testDir: './e2e/web',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // The first page load compiles SQLite's WebAssembly. With several browsers
  // starting at once that can take longer than Playwright's default 5 seconds.
  expect: { timeout: 15_000 },
  // The longest scenarios reload the app several times and run about 15
  // seconds alone; in a full parallel run they can pass the default 30.
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'tablet-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
  ],
  webServer: {
    command: `bun scripts/serve-dist.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
