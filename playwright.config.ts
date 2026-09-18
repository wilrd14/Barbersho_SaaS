import { defineConfig, devices } from "@playwright/test";

/**
 * F2-25 · Configuracion minima de Playwright (se difirio en Sprint 1, PRD
 * §15). Cubre los 4 flujos criticos que exige el PRD §15: reservar, dar
 * turno, cobrar, cerrar caja — corridos contra el seed real
 * (`npm run db:seed`), NO contra datos mockeados.
 *
 * `webServer` levanta `next dev` automaticamente para que
 * `npx playwright test` sea autocontenible; si ya hay un dev server corriendo
 * en el puerto 3000 (uso local), lo reutiliza (`reuseExistingServer`) en vez
 * de fallar con EADDRINUSE.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // los 4 flujos tocan el mismo seed (misma sede/caja); en serie evita interferencia entre tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
