import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";

import {
  backfillLocationDailyMetrics,
  computeLocationDailyMetrics,
  getLocationDailyMetrics,
  recomputeLocationDailyMetrics,
} from "../daily";

/**
 * F3-12 · Agregacion diaria contra el Supabase REAL sembrado. Todo fixture va en
 * una transaccion que SIEMPRE termina en rollback. Los dias de fixture son del
 * ano 2000 (sin datos del seed) para que la suma manual sea exacta.
 */
const CHAIN = "00000000-0000-0000-0000-000000000001";
const NACO = "00000000-0000-0000-0000-000000000301";
const BARBER_1 = "00000000-0000-0000-0000-000000000101";
const ADMIN_NACO = "00000000-0000-0000-0000-000000000011";
const CLIENT = "00000000-0000-0000-0000-000000000701";
const ROLLBACK = "__rollback__";
const DAY = "2000-03-06"; // lunes
const NEXT_DAY = "2000-03-07";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function inRolledBackTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw new Error(ROLLBACK);
    });
  } catch (err) {
    if (!(err instanceof Error) || err.message !== ROLLBACK) throw err;
  }
  return result;
}

const sid = (n: number) => `99999999-0000-0000-0000-${String(n).padStart(12, "0")}`;

async function insertSale(
  tx: Tx,
  o: { n: number; createdAt: string; subtotal: string; status?: string; tip?: string },
) {
  const id = sid(o.n);
  await tx.execute(sql`
    insert into sales (id, chain_id, location_id, client_id, barber_id, subtotal, discount_amount, tip_amount, total,
                       payment_method, status, created_by, created_at)
    values (${id}, ${CHAIN}, ${NACO}, ${CLIENT}, ${BARBER_1}, ${o.subtotal}, '0', ${o.tip ?? "0"},
            ${o.subtotal}, 'cash', ${o.status ?? "paid"}, ${ADMIN_NACO}, ${o.createdAt}::timestamptz)`);
  await tx.execute(sql`
    insert into sale_items (id, sale_id, type, service_id, quantity, unit_price, line_total, barber_id)
    values (${id.replace(/^99999999/, "88888888")}, ${id}, 'service', '00000000-0000-0000-0000-000000000401', 1,
            ${o.subtotal}, ${o.subtotal}, ${BARBER_1})`);
}

async function storedRows(tx: Tx, date: string) {
  return tx.execute<{ revenue: string; services_count: number; avg_ticket: string | null }>(sql`
    select revenue::text, services_count, avg_ticket::text from location_daily_metrics
    where location_id = ${NACO} and date = ${date}::date`);
}

async function rangeFingerprint(tx: Tx) {
  const rows = await tx.execute<{ n: number; h: string }>(sql`
    select count(*)::int as n, md5(string_agg(t::text, '|' order by date)) as h
    from (select date, revenue, services_count, avg_ticket, chair_utilization_pct, barber_hours, new_clients, unique_clients, no_shows
          from location_daily_metrics
          where location_id = ${NACO} and date between ${DAY}::date and ${NEXT_DAY}::date) t`);
  return rows[0];
}

async function seedDay(tx: Tx) {
  await insertSale(tx, { n: 1, createdAt: `${DAY} 10:00:00-04`, subtotal: "100.00", tip: "10.00" });
  // 03:45 UTC del dia 7, pero sigue siendo el 6 en la zona de la sede.
  await insertSale(tx, { n: 2, createdAt: `${DAY} 23:45:00-04`, subtotal: "250.50" });
  await insertSale(tx, { n: 3, createdAt: `${DAY} 12:00:00-04`, subtotal: "999.00", status: "refunded" });
  await insertSale(tx, { n: 4, createdAt: `${NEXT_DAY} 00:15:00-04`, subtotal: "500.00" }); // dia siguiente
}

describe("location_daily_metrics (F3-12, DB real)", () => {
  it("revenue de un dia = suma manual al centavo (sin propina, sin refunded, fecha local de la sede)", async () => {
    await inRolledBackTx(async (tx) => {
      await seedDay(tx);
      const row = await computeLocationDailyMetrics(NACO, DAY, tx);
      expect(row.revenueCents).toBe(10000 + 25050);
      expect(row.salesCount).toBe(2);
      expect(row.uniqueClients).toBe(1); // las 2 ventas pagadas son del mismo cliente
      expect(row.servicesCount).toBe(2);
      expect(row.noShows).toBe(0);
      expect(row.barberHoursX100).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(row.revenueCents)).toBe(true);
    });
  });

  it("dia cerrado: la 1a lectura calcula y persiste, la 2a lee de la tabla con los mismos numeros", async () => {
    await inRolledBackTx(async (tx) => {
      await seedDay(tx);
      expect(await storedRows(tx, DAY)).toHaveLength(0);
      const first = await getLocationDailyMetrics(NACO, DAY, tx);
      expect(first.fromTable).toBe(false);
      expect(first.persisted).toBe(true);
      const stored = await storedRows(tx, DAY);
      expect(stored).toHaveLength(1);
      expect(stored[0].revenue).toBe("350.50");
      expect(stored[0].avg_ticket).toBe("175.25");

      const second = await getLocationDailyMetrics(NACO, DAY, tx);
      expect(second.fromTable).toBe(true);
      expect(second.row.revenueCents).toBe(first.row.revenueCents);
      expect(second.row.salesCount).toBe(first.row.salesCount); // recuperado de revenue / avg_ticket
      expect(second.row.servicesCount).toBe(first.row.servicesCount);
      expect(second.row.uniqueClients).toBe(first.row.uniqueClients);
      expect(second.row.terminalAppointments).toBe(first.row.terminalAppointments);
    });
  });

  it("backfill dos veces = exactamente los mismos numeros y sin duplicar filas", async () => {
    await inRolledBackTx(async (tx) => {
      await seedDay(tx);
      const a = await backfillLocationDailyMetrics({ from: DAY, to: NEXT_DAY, locationId: NACO }, tx);
      const afterFirst = await rangeFingerprint(tx);
      const b = await backfillLocationDailyMetrics({ from: DAY, to: NEXT_DAY, locationId: NACO }, tx);
      const afterSecond = await rangeFingerprint(tx);
      expect(a).toEqual({ locations: 1, daysPersisted: 2, skippedOpenDays: 0 });
      expect(b).toEqual(a);
      expect(afterFirst.n).toBe(2);
      expect(afterSecond).toEqual(afterFirst);
    });
  });

  it("recompute repara un dia cerrado ya persistido", async () => {
    await inRolledBackTx(async (tx) => {
      await seedDay(tx);
      await getLocationDailyMetrics(NACO, DAY, tx);
      await insertSale(tx, { n: 5, createdAt: `${DAY} 15:00:00-04`, subtotal: "49.50" }); // escritura retroactiva
      expect((await getLocationDailyMetrics(NACO, DAY, tx)).row.revenueCents).toBe(35050); // tabla desactualizada
      const fixed = await recomputeLocationDailyMetrics(NACO, DAY, tx);
      expect(fixed.row.revenueCents).toBe(40000);
      expect((await getLocationDailyMetrics(NACO, DAY, tx)).row.revenueCents).toBe(40000);
    });
  });

  it("el dia en curso se calcula en vivo, cambia tras cobrar y NO se persiste", async () => {
    await inRolledBackTx(async (tx) => {
      const [{ today }] = await tx.execute<{ today: string }>(
        sql`select ((now() at time zone 'America/Santo_Domingo')::date)::text as today`,
      );
      const before = await getLocationDailyMetrics(NACO, today, tx);
      await insertSale(tx, { n: 6, createdAt: new Date().toISOString(), subtotal: "123.45" });
      const after = await getLocationDailyMetrics(NACO, today, tx);
      expect(after.row.revenueCents).toBe(before.row.revenueCents + 12345);
      expect(after.persisted).toBe(false);
      expect(after.fromTable).toBe(false);
      expect(await storedRows(tx, today)).toHaveLength(0);
      const rec = await recomputeLocationDailyMetrics(NACO, today, tx);
      expect(rec.persisted).toBe(false);
      expect(await storedRows(tx, today)).toHaveLength(0);
    });
  });

  it("llamado desde dentro de db.transaction resuelve y no se cuelga", async () => {
    const started = Date.now();
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql`select 1`);
      await getLocationDailyMetrics(NACO, DAY, tx);
      await computeLocationDailyMetrics(NACO, DAY, tx);
      await recomputeLocationDailyMetrics(NACO, DAY, tx);
      await tx.execute(sql`select 1`);
    });
    expect(Date.now() - started).toBeLessThan(15000);
  }, 20000);

  it("rechaza fechas invalidas y sedes inexistentes antes de escribir", async () => {
    await expect(computeLocationDailyMetrics(NACO, "2000-02-30", db)).rejects.toThrow(/Fecha invalida/);
    await expect(
      computeLocationDailyMetrics("00000000-0000-0000-0000-00000000dead", DAY, db),
    ).rejects.toThrow(/Sede inexistente/);
  });
});
