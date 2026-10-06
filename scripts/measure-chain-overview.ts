/**
 * F3-20 · Mide el P95 de Vista Cadena (PRD §15: < 2 s con la tabla materializada).
 *
 *   npm run metrics:measure -- [--chain=don-bigote] [--runs=30] [--limit-ms=2000] [--skip-backfill]
 *   DEBUG_DB_ROUNDTRIPS=1 npm run metrics:measure -- --runs=1     # round-trips de una sola corrida
 *
 * 1) Materializa los ultimos 35 dias cerrados (backfill idempotente) salvo --skip-backfill.
 * 2) Corre `loadChainOverview` para hoy / semana / mes N veces cada uno (descarta 1 corrida de
 *    calentamiento por rango) e imprime p50 / p95 / max.
 * 3) Sale con codigo 1 si el P95 de algun rango >= --limit-ms.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chains } from "@/lib/db/schema";
import { backfillLocationDailyMetrics } from "@/lib/metrics/daily";
import { loadChainOverview, loadChainTimezone, todayInTimezone } from "@/lib/metrics/chain-overview";
import { addDays, resolveRange } from "@/lib/metrics/ranges";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function main() {
  const slug = arg("chain") ?? "don-bigote";
  const runs = Number(arg("runs") ?? "30");
  const limitMs = Number(arg("limit-ms") ?? "2000");
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs debe ser un entero >= 1");
  if (!Number.isFinite(limitMs) || limitMs <= 0) throw new Error("--limit-ms debe ser > 0");

  const chain = (await db.select({ id: chains.id }).from(chains).where(eq(chains.slug, slug)))[0];
  if (!chain) throw new Error(`No existe la cadena con slug "${slug}"`);

  const timezone = await loadChainTimezone(chain.id, db);
  const today = todayInTimezone(timezone);

  if (!process.argv.includes("--skip-backfill")) {
    const from = addDays(today, -35);
    if (!from) throw new Error(`No se pudo calcular el inicio del backfill desde ${today}`);
    const summary = await backfillLocationDailyMetrics({ from, to: today }, db);
    console.log(
      `Backfill ${from}..${today}: ${summary.daysPersisted} dias persistidos, ${summary.skippedOpenDays} omitidos (no cerrados).`,
    );
  }

  let failed = false;
  for (const rango of ["hoy", "semana", "mes"] as const) {
    const range = resolveRange({ rango }, today);
    const samples: number[] = [];
    // Corrida 0 = calentamiento (conexion, tipos de postgres.js); no entra en las muestras.
    for (let i = 0; i <= runs; i++) {
      const started = performance.now();
      await loadChainOverview({ chainId: chain.id, range, today }, db);
      const elapsed = performance.now() - started;
      if (i > 0) samples.push(elapsed);
    }
    samples.sort((a, b) => a - b);
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const max = samples[samples.length - 1];
    const ok = p95 < limitMs;
    if (!ok) failed = true;
    console.log(
      `${rango.padEnd(6)} ${range.startsOn}..${range.endsOn}  n=${samples.length}  p50=${p50.toFixed(0)} ms  p95=${p95.toFixed(0)} ms  max=${max.toFixed(0)} ms  ${ok ? "OK" : `FALLA (>= ${limitMs} ms)`}`,
    );
  }

  if (failed) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error en metrics:measure:", err);
    process.exit(1);
  });
