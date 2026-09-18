import { defineConfig, devices } from "@playwright/test";

/**
 * F2-25 · Configuracion minima de Playwright (se difirio en Sprint 1, PRD
 * §15). Cubre los 4 flujos criticos que exige el PRD §15: reservar, dar
 * turno, cobrar, cerrar caja — corridos contra el seed real
 * (`npm run db:seed`), NO contra datos mockeados.
 *
 * Por defecto `webServer` levanta `next dev` automaticamente para que
 * `npx playwright test` sea autocontenible; si ya hay un dev server corriendo
 * en el puerto 3000 (uso local), lo reutiliza (`reuseExistingServer`) en vez
 * de fallar con EADDRINUSE.
 *
 * `E2E_BASE_URL` (opcional): apunta la suite a un servidor YA levantado por
 * quien la invoca — p.ej. `wrangler dev` sobre el build de OpenNext
 * (`npm run preview`, http://127.0.0.1:8787) para verificar el flujo de dinero
 * en el runtime real de Cloudflare (workerd), o un `next dev` en otro puerto.
 * Si esta definida NO se lanza `webServer` y se usa ese baseURL. Sin ella, el
 * comportamiento es el de siempre.
 */
const externalBaseUrl = process.env.E2E_BASE_URL?.trim() || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // los 4 flujos tocan el mismo seed (misma sede/caja); en serie evita interferencia entre tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
