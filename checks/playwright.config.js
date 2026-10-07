import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser',
  outputDir: '../output/playwright',
  use: { baseURL: 'http://sketchlet.test', browserName: 'chromium' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
