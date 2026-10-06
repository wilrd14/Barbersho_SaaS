import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Los tests de integracion comparten UNA base Supabase real (y el pool es max:1): en serie evita que un
    // archivo cambie filas del seed (overrides de reglas, cajas) mientras otro las lee.
    fileParallelism: false,
    // Los tests de integracion hablan con Supabase remoto (~0.4 s por consulta): 5 s por defecto no alcanza.
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // `npm run test:coverage`: F3 exige 100% en lib/commissions (PRD §15, BACKLOG-F3 §3.11).
    coverage: {
      provider: "v8",
      include: ["src/lib/commissions/index.ts"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
