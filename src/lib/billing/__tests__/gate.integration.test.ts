import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";

import { assertAreaAllowed, loadChainAccess } from "../gate";

/**
 * F3-18/F3-20 · El gate de suscripcion contra el Supabase REAL. Los cambios de
 * estado de la suscripcion del seed se hacen SIEMPRE dentro de una transaccion
 * que termina en rollback: el gate lee con el `tx`, asi que ve el cambio sin
 * dejar residuo. Tambien prueba el bug de clase de §3.2 (llamada desde dentro
 * de una transaccion) y el aislamiento (otra cadena no ve la suscripcion ajena).
 */
const CHAIN = "00000000-0000-0000-0000-000000000001";
const OTHER_CHAIN = "00000000-0000-0000-0000-00000000dead";
const ROLLBACK = "__rollback__";
const DAY_MS = 24 * 60 * 60 * 1000;

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

describe("gate de suscripcion (F3-18, DB real)", () => {
  it("loadChainAccess y assertAreaAllowed DESDE DENTRO de db.transaction resuelven y no se cuelgan", async () => {
    const started = Date.now();
    await inRolledBackTx(async (tx) => {
      const access = await loadChainAccess(CHAIN, tx);
      expect(access.status).not.toBeNull();
      const gate = await assertAreaAllowed(CHAIN, "operation", tx);
      expect(gate.ok).toBe(true);
    });
    expect(Date.now() - started).toBeLessThan(15000);
  }, 20000);

  it("otra cadena no ve la suscripcion ajena: sin fila no se bloquea y no hay estado", async () => {
    const access = await loadChainAccess(OTHER_CHAIN, db);
    expect(access).toMatchObject({ access: "acceso_normal", status: null, trialDaysLeft: null });
  });

  it("prueba vencida ayer -> restringido: analitica bloqueada, operacion permitida", async () => {
    await inRolledBackTx(async (tx) => {
      const now = Date.now();
      await tx
        .update(subscriptions)
        .set({ status: "trialing", trialEndsAt: new Date(now - DAY_MS) })
        .where(eq(subscriptions.chainId, CHAIN));
      const access = await loadChainAccess(CHAIN, tx, now);
      expect(access.access).toBe("restringido");
      expect((await assertAreaAllowed(CHAIN, "analytics", tx, undefined, now)).ok).toBe(false);
      expect((await assertAreaAllowed(CHAIN, "operation", tx, undefined, now)).ok).toBe(true);
    });
  }, 20000);

  it("vencida hace 8 dias -> bloqueado, pero cerrar una caja abierta y cobrar una venta en curso SIEMPRE se permiten", async () => {
    await inRolledBackTx(async (tx) => {
      const now = Date.now();
      await tx
        .update(subscriptions)
        .set({ status: "trialing", trialEndsAt: new Date(now - 8 * DAY_MS) })
        .where(eq(subscriptions.chainId, CHAIN));
      const access = await loadChainAccess(CHAIN, tx, now);
      expect(access.access).toBe("bloqueado");
      expect((await assertAreaAllowed(CHAIN, "operation", tx, undefined, now)).ok).toBe(false);
      expect((await assertAreaAllowed(CHAIN, "operation", tx, "close_open_cash_session", now)).ok).toBe(true);
      expect((await assertAreaAllowed(CHAIN, "operation", tx, "charge_open_sale", now)).ok).toBe(true);
      expect((await assertAreaAllowed(CHAIN, "billing", tx, undefined, now)).ok).toBe(true);
    });
  }, 20000);

  it("cancelled -> bloqueado de inmediato", async () => {
    await inRolledBackTx(async (tx) => {
      await tx.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.chainId, CHAIN));
      expect((await loadChainAccess(CHAIN, tx)).access).toBe("bloqueado");
    });
  }, 20000);

  it("el rollback no deja residuo: la suscripcion del seed sigue como estaba", async () => {
    const [before] = await db.select().from(subscriptions).where(eq(subscriptions.chainId, CHAIN));
    await inRolledBackTx(async (tx) => {
      await tx.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.chainId, CHAIN));
    });
    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.chainId, CHAIN));
    expect(after).toEqual(before);
  }, 20000);
});
