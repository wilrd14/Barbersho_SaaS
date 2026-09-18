import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
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
