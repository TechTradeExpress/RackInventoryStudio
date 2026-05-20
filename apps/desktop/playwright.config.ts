import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  expect: { timeout: 6_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:1421",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: {
    command: "node_modules/.bin/vite --config vite.config.e2e.ts",
    url: "http://localhost:1421",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
