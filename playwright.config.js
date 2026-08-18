import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 40000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist']
    }
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
