import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";

import { loadChainOverview, loadChainPositions, loadChainTimezone } from "../chain-overview";
import { backfillLocationDailyMetrics } from "../daily";

/**
 * F3-20 · Vista Cadena y backfill contra el Supabase REAL, en las dos condiciones
 * que el backlog exige y que ningun otro test ejercita:
 *  - llamadas DESDE DENTRO de `db.transaction` (pool max:1: regla dura §3.2, el
 *    bug de clase que ya colgo produccion dos veces) con timeout como red;
 *  - aislamiento de tenant: otra cadena no ve ni un numero.
 * Toda escritura va en una transaccion que termina en rollback (fechas del 2000).
 */
const CHAIN = "00000000-0000-0000-0000-000000000001";
const OTHER_CHAIN = "00000000-0000-0000-0000-00000000dead";
const NACO = "00000000-0000-0000-0000-000000000301";
const ROLLBACK = "__rollback__";
const RANGE = { startsOn: "2000-03-06", endsOn: "2000-03-12" };
const TODAY = "2000-06-01";

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

describe("Vista Cadena (F3-13/F3-20, DB real)", () => {
  it("loadChainPositions, loadChainOverview y loadChainTimezone DESDE DENTRO de db.transaction resuelven y no se cuelgan", async () => {
    const started = Date.now();
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql`select 1`);
      const tz = await loadChainTimezone(CHAIN, tx);
      expect(tz).toBe("America/Santo_Domingo");
      const positions = await loadChainPositions({ chainId: CHAIN, range: RANGE, today: TODAY }, tx);
      expect(positions.positions.length).toBeGreaterThanOrEqual(3);
      const overview = await loadChainOverview({ chainId: CHAIN, range: RANGE, today: TODAY }, tx);
      expect(overview.positions.length).toBe(positions.positions.length);
      await tx.execute(sql`select 1`);
    });
    expect(Date.now() - started).toBeLessThan(30000);
  }, 40000);

  it("es determinista: dos llamadas seguidas devuelven exactamente lo mismo", async () => {
    const params = { chainId: CHAIN, range: RANGE, today: TODAY };
    const a = await loadChainOverview(params, db);
    const b = await loadChainOverview(params, db);
    expect(b).toEqual(a);
  }, 40000);

  it("otra cadena no ve nada: cero sedes, cero ingreso, sin top barberos ni servicios", async () => {
    const overview = await loadChainOverview({ chainId: OTHER_CHAIN, range: RANGE, today: TODAY }, db);
    expect(overview.positions).toEqual([]);
    expect(overview.chain.revenueCents).toBe(0);
    expect(overview.chain.salesCount).toBe(0);
    expect(overview.topBarbers).toEqual([]);
    expect(overview.topServices).toEqual([]);
    const positions = await loadChainPositions({ chainId: OTHER_CHAIN, range: RANGE, today: TODAY }, db);
    expect(positions.positions).toEqual([]);
  }, 30000);

  it("el ingreso de la cadena es la suma de sus sedes (no se mezcla con otra cadena)", async () => {
    const range = { startsOn: "2026-01-01", endsOn: "2026-01-07" };
    const o = await loadChainOverview({ chainId: CHAIN, range, today: TODAY }, db);
    const sum = o.positions.reduce((acc, p) => acc + p.revenueCents, 0);
    expect(o.chain.revenueCents).toBe(sum);
  }, 40000);
});

describe("backfill (F3-12/F3-20, DB real)", () => {
  it("backfillLocationDailyMetrics DESDE DENTRO de db.transaction no se cuelga y es idempotente (dos corridas = mismas filas)", async () => {
    const started = Date.now();
    await inRolledBackTx(async (tx) => {
      const params = { from: "2000-03-06", to: "2000-03-08", locationId: NACO };
      const count = () =>
        tx.execute<{ n: number }>(
          sql`select count(*)::int as n from location_daily_metrics where location_id = ${NACO} and date between '2000-03-06' and '2000-03-08'`,
        );
      await backfillLocationDailyMetrics(params, tx);
      const first = await count();
      await backfillLocationDailyMetrics(params, tx);
      const second = await count();
      expect(second[0]!.n).toBe(first[0]!.n);
      expect(first[0]!.n).toBe(3);
    });
    expect(Date.now() - started).toBeLessThan(30000);
  }, 40000);

  it("rechaza rangos invertidos y mayores al tope antes de escribir", async () => {
    await expect(backfillLocationDailyMetrics({ from: "2000-03-08", to: "2000-03-06" }, db)).rejects.toThrow(/Rango invalido/);
    await expect(backfillLocationDailyMetrics({ from: "1990-01-01", to: "2020-01-01" }, db)).rejects.toThrow(/demasiado grande/);
  });
});
