import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: '**/production.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  timeout: 40_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'node --experimental-strip-types scripts/test-gateway.mjs', url: 'http://127.0.0.1:3002/api/health', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev -- --mode test --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  ],
});
