import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";

/**
 * F3-00 · Integridad de dinero (0004_f3_money_integrity.sql), contra el
 * Supabase REAL. Cada caso corre en una transaccion que SIEMPRE termina en
 * rollback (se lanza ROLLBACK_SENTINEL), asi que no deja ninguna fila. Usa
 * fechas del ano 2099 para no chocar jamas con un periodo real.
 */
const CHAIN = "00000000-0000-0000-0000-000000000001";
const BARBER = "00000000-0000-0000-0000-000000000101";
const NACO = "00000000-0000-0000-0000-000000000301";
const ROLLBACK_SENTINEL = "__rollback__";

/** Ejecuta `fn` en una transaccion y la revierte; devuelve el SQLSTATE si `fn` fallo, o null. */
async function sqlStateOf(fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Error(ROLLBACK_SENTINEL);
    });
  } catch (err) {
    if (err instanceof Error && err.message === ROLLBACK_SENTINEL) return null;
    const cause = (err as { cause?: { code?: string; constraint_name?: string } }).cause;
    return { code: cause?.code, constraint: cause?.constraint_name };
  }
  return null;
}

describe("0004_f3_money_integrity (DB real)", () => {
  it("rechaza dos periodos solapados de la misma cadena (EXCLUDE)", async () => {
    const result = await sqlStateOf(async (tx) => {
      await tx.execute(sql`insert into payout_periods (chain_id, starts_on, ends_on) values (${CHAIN}, '2099-01-01', '2099-01-15')`);
      await tx.execute(sql`insert into payout_periods (chain_id, starts_on, ends_on) values (${CHAIN}, '2099-01-15', '2099-01-31')`);
    });
    expect(result).toEqual({ code: "23P01", constraint: "payout_periods_no_overlap_per_chain" });
  });

  it("acepta quincenas adyacentes (1-15 y 16-31)", async () => {
    const result = await sqlStateOf(async (tx) => {
      await tx.execute(sql`insert into payout_periods (chain_id, starts_on, ends_on) values (${CHAIN}, '2099-03-01', '2099-03-15')`);
      await tx.execute(sql`insert into payout_periods (chain_id, starts_on, ends_on) values (${CHAIN}, '2099-03-16', '2099-03-31')`);
    });
    expect(result).toBeNull();
  });

  it("rechaza dos payout_lines del mismo (periodo, barbero, sede)", async () => {
    const result = await sqlStateOf(async (tx) => {
      const rows = await tx.execute<{ id: string }>(
        sql`insert into payout_periods (chain_id, starts_on, ends_on) values (${CHAIN}, '2099-02-01', '2099-02-15') returning id`,
      );
      const periodId = rows[0].id;
      await tx.execute(sql`insert into payout_lines (payout_period_id, barber_id, location_id) values (${periodId}, ${BARBER}, ${NACO})`);
      await tx.execute(sql`insert into payout_lines (payout_period_id, barber_id, location_id) values (${periodId}, ${BARBER}, ${NACO})`);
    });
    expect(result).toEqual({ code: "23505", constraint: "payout_lines_period_barber_location_uq" });
  });

  it("rechaza una segunda regla applies_to='chain' pero acepta una 'barber'", async () => {
    const dup = await sqlStateOf(async (tx) => {
      await tx.execute(sql`insert into commission_rules (chain_id, name, type, service_commission_pct, applies_to) values (${CHAIN}, 'dup', 'percentage', 40, 'chain')`);
    });
    expect(dup).toEqual({ code: "23505", constraint: "commission_rules_chain_default_uq" });

    const ok = await sqlStateOf(async (tx) => {
      await tx.execute(sql`insert into commission_rules (chain_id, name, type, service_commission_pct, applies_to) values (${CHAIN}, 'override', 'percentage', 40, 'barber')`);
    });
    expect(ok).toBeNull();
  });

  it("los 6 indices de F3 y las 5 policies de tenant existen", async () => {
    const idx = await db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where schemaname = 'public' and indexname in (
        'payout_lines_period_barber_location_uq', 'commission_rules_chain_default_uq',
        'sale_items_barber_id_idx', 'sales_location_status_created_idx',
        'payout_lines_barber_id_idx', 'payout_lines_payout_period_id_idx')`,
    );
    expect(idx.length).toBe(6);

    const pol = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_policies where schemaname = 'public' and tablename in (
        'commission_rules', 'payout_periods', 'payout_lines', 'location_daily_metrics', 'subscriptions')`,
    );
    expect(new Set(pol.map((p) => p.tablename)).size).toBe(5);
  });
});
