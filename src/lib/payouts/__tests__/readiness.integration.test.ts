import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";

import { loadSqlBlockers } from "../blockers";
import { buildFreshLines, chainTodayIso, evaluatePeriodReadiness, loadStoredLines } from "../cycle";

/**
 * F3-20 · Las funciones de LECTURA del ciclo del periodo (bloqueadores, lineas
 * guardadas, calculo fresco, preparacion para aprobar) llamadas DESDE DENTRO de
 * `db.transaction` — regla dura §3.2 de BACKLOG-F3 y bug de clase de produccion
 * (pool max:1: una funcion que use el `db` singleton dentro de una transaccion
 * se cuelga para siempre y sin error). Solo lecturas + rollback. Quincena de 2020
 * (sin ventas) para no depender del seed vivo, y otra cadena para el aislamiento.
 */
const CHAIN = "00000000-0000-0000-0000-000000000001";
const OTHER_CHAIN = "00000000-0000-0000-0000-00000000dead";
const NO_PERIOD = "00000000-0000-0000-0000-00000000beef";
const ROLLBACK = "__rollback__";

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

describe("lecturas del ciclo del periodo desde dentro de una transaccion (F3-20, DB real)", () => {
  it("chainTodayIso, loadSqlBlockers, loadStoredLines, buildFreshLines y evaluatePeriodReadiness resuelven con `tx` y no se cuelgan", async () => {
    const started = Date.now();
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql`select 1`);

      const today = await chainTodayIso(tx, CHAIN);
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const params = { chainId: CHAIN, startsOn: "2020-05-01", endsOn: "2020-05-15" };
      expect(await loadSqlBlockers(params, tx)).toEqual([]);

      const stored = await loadStoredLines(tx, NO_PERIOD);
      expect(stored).toEqual([]);

      const fresh = await buildFreshLines(tx, { ...params, stored });
      expect(fresh).toEqual({ ok: true, lines: [] });

      const readiness = await evaluatePeriodReadiness(
        tx,
        { id: NO_PERIOD, ...params, status: "open" },
        "2020-06-01",
      );
      expect(readiness.blockers).toEqual([]);
      expect(readiness.notEnded).toBeNull();
      expect(readiness.computeError).toBeNull();

      await tx.execute(sql`select 1`);
    });
    expect(Date.now() - started).toBeLessThan(30000);
  }, 40000);

  it("una quincena que aun no termino se reporta como notEnded desde dentro de una transaccion", async () => {
    await inRolledBackTx(async (tx) => {
      const readiness = await evaluatePeriodReadiness(
        tx,
        { id: NO_PERIOD, chainId: CHAIN, startsOn: "2099-01-01", endsOn: "2099-01-15", status: "calculated" },
        "2098-12-31",
      );
      expect(readiness.notEnded).toEqual({ endsOn: "2099-01-15", today: "2098-12-31" });
    });
  }, 30000);

  it("aislamiento: otra cadena no ve bloqueadores ni lineas, aunque el rango tenga ventas en la cadena del seed", async () => {
    const params = { chainId: OTHER_CHAIN, startsOn: "2026-01-01", endsOn: "2026-12-31" };
    expect(await loadSqlBlockers(params, db)).toEqual([]);
    const fresh = await buildFreshLines(db, { ...params, stored: [] });
    expect(fresh).toEqual({ ok: true, lines: [] });
  }, 30000);
});
