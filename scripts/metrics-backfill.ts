/**
 * F3-12 · Siembra o repara location_daily_metrics para un rango.
 *
 *   npm run metrics:backfill -- --from=2026-08-15 [--to=2026-09-17] [--location=<uuid>]
 *
 * Idempotente (upsert por (location_id, date)). Los dias no cerrados en la zona
 * de cada sede (hoy y futuro) se omiten: el dia en curso nunca se persiste.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db/client";
import { backfillLocationDailyMetrics } from "@/lib/metrics/daily";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const from = arg("from");
  if (!from) throw new Error("Falta --from=YYYY-MM-DD");
  const to = arg("to") ?? new Date().toISOString().slice(0, 10);
  const summary = await backfillLocationDailyMetrics({ from, to, locationId: arg("location") }, db);
  console.log(
    `Backfill ${from}..${to}: ${summary.locations} sedes, ${summary.daysPersisted} dias persistidos, ${summary.skippedOpenDays} omitidos (no cerrados).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error en metrics:backfill:", err);
    process.exit(1);
  });
