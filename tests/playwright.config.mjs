// Serves the repo root (the site has no build step) and runs the e2e suite.
// Locally it drives the installed Google Chrome: on this machine Little Snitch
// silently drops Playwright's bundled Chromium, even for localhost. CI uses
// the bundled browser.
import { defineConfig, devices } from '@playwright/test';

const PORT = 8790;
const browser = process.env.CI ? {} : { channel: 'chrome' };

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...browser,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...browser, viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], ...browser } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory ..`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
