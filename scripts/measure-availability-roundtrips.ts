import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * F2-25: mide el AC de F2-04 ("la consulta de un dia completo no supera 3
 * round-trips a la DB, verificado con log"). Corre getAvailability contra la
 * sede Naco del seed con DEBUG_DB_ROUNDTRIPS=1 (ver src/lib/db/client.ts) y
 * cuenta las lineas de log que produce cada query real hacia Postgres.
 *
 * Uso: npx tsx --require ./scripts/stub-server-only.cjs scripts/measure-availability-roundtrips.ts
 *
 * Historial (contra el proyecto Supabase real):
 *  - 2026-09-18 (F2-25): 8 round-trips (sede, barberos, servicio, override,
 *    schedules, barber_services, time_off, citas). Incumplia el AC de <=3.
 *  - 2026-09-18 (deuda saldada): 3 round-trips (sede+servicio+override en un
 *    join; barberos+schedules+barber_services en un join; time_off UNION ALL
 *    citas con subquery de barberos). Cumple el AC de F2-04.
 * (La linea de `pg_type` que aparece al principio es la carga unica de OIDs
 * de postgres.js al abrir la conexion, no es parte de getAvailability.)
 */
async function main() {
  process.env.DEBUG_DB_ROUNDTRIPS = "1";

  const { db } = await import("../src/lib/db/client");
  const { getAvailability } = await import("../src/lib/scheduling/availability");
  const { services } = await import("../src/lib/db/schema");

  const NACO = "00000000-0000-0000-0000-000000000301";
  const [svc] = await db.select({ id: services.id }).from(services).limit(1);
  if (!svc) throw new Error("No hay servicios sembrados; corre npm run db:seed primero.");

  let queryCount = 0;
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[db round-trip]")) {
      queryCount += 1;
    }
    originalLog(...args);
  };

  const today = new Date().toISOString().slice(0, 10);
  await getAvailability({
    locationId: NACO,
    serviceId: svc.id,
    fromDate: today,
    toDate: today,
  });

  console.log = originalLog;
  console.log(`\n=== Total de round-trips a la DB en getAvailability: ${queryCount} ===`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
