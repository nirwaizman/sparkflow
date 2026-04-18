import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const PORT = 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  },
];

// Mobile Safari is only enabled locally (macOS). It's flaky on Linux CI.
if (!CI && process.platform === 'darwin') {
  projects.push({
    name: 'mobile-safari',
    use: { ...devices['iPhone 14'] },
  });
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: CI ? 2 : 0,
  fullyParallel: true,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects,
  webServer: {
    command: 'pnpm dev',
    port: PORT,
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
