import { defineConfig, devices } from "@playwright/test";

/**
 * Parcours critiques (TRD §9). Prérequis : base migrée + `pnpm db:seed`, app lancée.
 *   E2E_BASE_URL=http://localhost:3000 E2E_ADMIN_USER=gerant E2E_ADMIN_PASSWORD=... pnpm test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fr-FR",
    timezoneId: "Africa/Douala",
    trace: "retain-on-failure",
    ...(process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
});
