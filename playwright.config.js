import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 40000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /ios_webkit\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist'],
        },
      },
    },
    {
      // Safari engine — the closest automated proxy for iOS behaviour.
      // Run with:  npx playwright test --project=webkit
      name: 'webkit',
      testMatch: /ios_webkit\.spec\.js/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
