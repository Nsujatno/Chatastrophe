import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: '**/production.spec.ts',
  testIgnore: [],
  outputDir: 'test-results/production',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: { command: 'npm run preview -- --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
});
