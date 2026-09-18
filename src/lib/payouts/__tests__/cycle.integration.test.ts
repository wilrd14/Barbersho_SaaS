import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { auditLog, payoutLines, payoutPeriods } from "@/lib/db/schema";
import {
  adjustLineInTx,
  approvePeriodInTx,
  calculatePeriodInTx,
  chainTodayIso,
  createPeriodInTx,
  markPeriodPaidInTx,
  loadStoredLines,
  type PayoutTx,
} from "@/lib/payouts/cycle";
import { previousQuincena, quincenaContaining, todayIsoInTimezone } from "@/lib/payouts/period";

import { IDS } from "./fixtures";

/**
 * F3-05 · Ciclo del periodo de pago contra el Supabase REAL. Todo corre DENTRO
 * de una `db.transaction` (regla dura §3.2: si algun helper del cierre usara el
 * `db` singleton en vez del `tx`, estos tests se colgarian; cada `it` lleva un
 * timeout explicito como red) y termina en rollback, salvo el test de
 * concurrencia, que necesita filas comprometidas y las borra por ID al final.
 *
 * Fixtures en marzo de 2020: sin datos reales, ya pasado (se puede aprobar) y
 * con valores calculados a mano (ver comentarios).
 */
const ROLLBACK = "__rollback__";
const TIMEOUT = 40_000;

async function inRolledBackTx<T>(fn: (tx: PayoutTx) => Promise<T>): Promise<T> {
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

const Q2020 = { startsOn: "2020-03-01", endsOn: "2020-03-15" };
const TODAY = todayIsoInTimezone(new Date(), "America/Santo_Domingo");

async function insertSale(
  tx: PayoutTx,
  o: {
    locationId: string;
    createdAt: string;
    barberId: string;
    items: { barberId: string; cents: number }[];
    discountCents?: number;
    reason?: string | null;
    tipCents?: number;
    status?: "paid" | "open" | "refunded";
  },
): Promise<string> {
  const id = randomUUID();
  const subtotal = o.items.reduce((s, i) => s + i.cents, 0);
  const discount = o.discountCents ?? 0;
  const tip = o.tipCents ?? 0;
  const dec = (c: number) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
  await tx.execute(sql`
    insert into sales (id, chain_id, location_id, client_id, barber_id, subtotal, discount_amount, discount_reason, tip_amount, total,
                       payment_method, status, created_by, created_at)
    values (${id}, ${IDS.chain}, ${o.locationId}, ${IDS.client}, ${o.barberId}, ${dec(subtotal)}, ${dec(discount)},
            ${o.reason === undefined ? (discount > 0 ? "promo" : null) : o.reason}, ${dec(tip)}, ${dec(subtotal - discount + tip)},
            'cash', ${o.status ?? "paid"}, ${IDS.adminNaco}, ${o.createdAt}::timestamptz)`);
  for (const item of o.items) {
    await tx.execute(sql`
      insert into sale_items (id, sale_id, type, service_id, quantity, unit_price, line_total, barber_id)
      values (${randomUUID()}, ${id}, 'service', ${IDS.serviceCorte}, 1, ${dec(item.cents)}, ${dec(item.cents)}, ${item.barberId})`);
  }
  return id;
}

/** Overrides explicitos (no dependen de lo que otro test haya dejado): b1 -> cadena, b3 Naco -> mixta, b3 Bella Vista -> silla fija. */
async function pinRules(tx: PayoutTx) {
  await tx.execute(sql`update barber_locations set commission_rule_id = null where user_id = ${IDS.b1}`);
  await tx.execute(
    sql`update barber_locations set commission_rule_id = ${IDS.ruleHybrid} where user_id = ${IDS.b3} and location_id = ${IDS.naco}`,
  );
  await tx.execute(
    sql`update barber_locations set commission_rule_id = ${IDS.ruleBooth} where user_id = ${IDS.b3} and location_id = ${IDS.bellaVista}`,
  );
}

/**
 * Cuatro ventas de marzo 2020 con numeros calculados a mano (centavos):
 *  s1 Naco  b1        35000, propina 3500
 *  s2 Naco  b1        [b1 50000, b3 25000], descuento 10001 -> bases 43333 / 21666 (suman 64999)
 *  s3 Naco  b3        10000, propina 2000
 *  s4 BV    b3        20000, propina 1000
 * Reglas: b1 = cadena 50%; b3 Naco = mixta 30% + RD$4,000/mes (1a quincena: 200000);
 * b3 BV = silla fija RD$3,000/semana (2 lunes en 1-15 mar 2020: 2 y 9 -> 600000).
 *  b1 Naco: 2 serv, ingreso 78333, comision 39166 (half-even de 39166.5), propinas 3500, neto 42666
 *  b3 Naco: 2 serv, ingreso 31666, comision 9500, renta 200000, propinas 2000, neto -188500
 *  b3 BV:   1 serv, ingreso 20000, comision 20000, renta 600000, propinas 1000, neto -579000
 */
async function seedFixtureSales(tx: PayoutTx) {
  await pinRules(tx);
  await insertSale(tx, { locationId: IDS.naco, createdAt: "2020-03-03 10:00:00-04", barberId: IDS.b1, items: [{ barberId: IDS.b1, cents: 35000 }], tipCents: 3500 });
  await insertSale(tx, {
    locationId: IDS.naco,
    createdAt: "2020-03-05 15:00:00-04",
    barberId: IDS.b1,
    items: [
      { barberId: IDS.b1, cents: 50000 },
      { barberId: IDS.b3, cents: 25000 },
    ],
    discountCents: 10001,
  });
  await insertSale(tx, { locationId: IDS.naco, createdAt: "2020-03-10 12:00:00-04", barberId: IDS.b3, items: [{ barberId: IDS.b3, cents: 10000 }], tipCents: 2000 });
  await insertSale(tx, { locationId: IDS.bellaVista, createdAt: "2020-03-12 12:00:00-04", barberId: IDS.b3, items: [{ barberId: IDS.b3, cents: 20000 }], tipCents: 1000 });
}

const scopeArgs = { chainId: IDS.chain, actorUserId: IDS.owner };

function expectOk<T>(result: { ok: boolean; data?: T; error?: string }): T {
  expect(result.ok, result.error).toBe(true);
  return result.data as T;
}

async function auditActions(tx: PayoutTx, entityId: string) {
  const rows = await tx.select({ action: auditLog.action, before: auditLog.before, after: auditLog.after }).from(auditLog).where(eq(auditLog.entityId, entityId));
  return rows;
}

describe("createPeriodInTx (F3-05)", () => {
  it("crea un periodo open con audit_log; rechaza solapes con un mensaje legible y rangos que no son quincena", async () => {
    await inRolledBackTx(async (tx) => {
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));
      const [row] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
      expect(row).toMatchObject({ status: "open", startsOn: "2020-03-01", endsOn: "2020-03-15", calculatedAt: null, approvedBy: null });
      const audits = await auditActions(tx, periodId);
      expect(audits).toEqual([{ action: "payout.create", before: null, after: { status: "open", startsOn: "2020-03-01", endsOn: "2020-03-15" } }]);

      const overlap = await createPeriodInTx(tx, { ...scopeArgs, startsOn: "2020-03-01", endsOn: "2020-03-15" });
      expect(overlap).toEqual({ ok: false, error: expect.stringContaining("Ya existe un corte que se cruza con esas fechas: Quincena 1–15 mar 2020") });

      const notQuincena = await createPeriodInTx(tx, { ...scopeArgs, startsOn: "2020-03-01", endsOn: "2020-03-20" });
      expect(notQuincena).toEqual({ ok: false, error: expect.stringContaining("quincena calendario") });

      // Adyacente si se permite.
      expectOk(await createPeriodInTx(tx, { ...scopeArgs, startsOn: "2020-03-16", endsOn: "2020-03-31" }));
    });
  }, TIMEOUT);
});

describe("calculatePeriodInTx (F3-05)", () => {
  it("calcula con los numeros hechos a mano, es idempotente y el multi-sede produce dos lineas que suman su total", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));

      const first = expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      expect(first).toMatchObject({ periodId, recalculated: false, lineCount: 3, totalNetCents: 42666 - 188500 - 579000 });

      const lines = await loadStoredLines(tx, periodId);
      const byKey = new Map(lines.map((l) => [`${l.barberId}|${l.locationId}`, l]));
      expect(byKey.get(`${IDS.b1}|${IDS.naco}`)).toMatchObject({
        servicesCount: 2, servicesRevenueCents: 78333, commissionCents: 39166, boothRentDeductedCents: 0, tipsCents: 3500, adjustmentsCents: 0, netPayableCents: 42666,
      });
      expect(byKey.get(`${IDS.b3}|${IDS.naco}`)).toMatchObject({
        servicesCount: 2, servicesRevenueCents: 31666, commissionCents: 9500, boothRentDeductedCents: 200000, tipsCents: 2000, netPayableCents: -188500,
      });
      expect(byKey.get(`${IDS.b3}|${IDS.bellaVista}`)).toMatchObject({
        servicesCount: 1, servicesRevenueCents: 20000, commissionCents: 20000, boothRentDeductedCents: 600000, tipsCents: 1000, netPayableCents: -579000,
      });
      // Barbero multi-sede: DOS lineas, suman su total.
      const b3Lines = lines.filter((l) => l.barberId === IDS.b3);
      expect(b3Lines).toHaveLength(2);
      expect(b3Lines.reduce((s, l) => s + l.netPayableCents, 0)).toBe(-767500);

      const [period] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
      expect(period!.status).toBe("calculated");
      expect(period!.calculatedAt).toBeInstanceOf(Date);

      // Calcular dos veces seguidas: lineas IDENTICAS y sin duplicar.
      const second = expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      expect(second).toMatchObject({ recalculated: true, lineCount: 3 });
      const again = await loadStoredLines(tx, periodId);
      const strip = (ls: typeof lines) => ls.map(({ id: _id, ...rest }) => rest);
      expect(strip(again)).toEqual(strip(lines));
      const count = await tx.select({ n: sql<number>`count(*)::int` }).from(payoutLines).where(eq(payoutLines.payoutPeriodId, periodId));
      expect(count[0]!.n).toBe(3);

      // Cada calculo (incluido el recalculo) deja su fila en audit_log, con before/after.
      const audits = (await auditActions(tx, periodId)).filter((a) => a.action === "payout.calculate");
      expect(audits).toHaveLength(2);
      expect(audits[0]!.after).toMatchObject({ status: "calculated", recalculation: false, lineCount: 3, totalNetCents: -724834 });
      expect(audits[1]!.before).toMatchObject({ status: "calculated", lineCount: 3 });
      expect(audits[1]!.after).toMatchObject({ recalculation: true });
    });
  }, TIMEOUT);

  it("excluye las ventas anuladas (refunded) al recalcular: anular una venta baja el corte", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      // Se anula la venta s4 (Bella Vista de b3).
      await tx.execute(sql`update sales set status = 'refunded' where location_id = ${IDS.bellaVista} and created_at = '2020-03-12 12:00:00-04'::timestamptz`);
      const recalculated = expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      expect(recalculated).toMatchObject({ lineCount: 2, totalNetCents: 42666 - 188500 });
      const lines = await loadStoredLines(tx, periodId);
      expect(lines.some((l) => l.locationId === IDS.bellaVista)).toBe(false);
    });
  }, TIMEOUT);

  it("un periodo sin ventas se calcula con cero lineas (no es un error)", async () => {
    await inRolledBackTx(async (tx) => {
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, startsOn: "2020-04-01", endsOn: "2020-04-15" }));
      expect(expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }))).toMatchObject({ lineCount: 0, totalNetCents: 0 });
    });
  }, TIMEOUT);

  it("sin regla resoluble: falla nombrando al barbero y la sede, audita calculate_failed y NO cambia el estado ni pierde las lineas previas", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));

      // Periodo open: un fallo lo deja open y sin lineas.
      await tx.execute(sql`update commission_rules set applies_to = 'barber' where id = ${IDS.ruleDefault}`);
      const failed = await calculatePeriodInTx(tx, { ...scopeArgs, periodId });
      expect(failed).toEqual({ ok: false, error: expect.stringContaining("Barbero Uno no tiene regla de pago en Naco") });
      const [stillOpen] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
      expect(stillOpen!.status).toBe("open");
      expect(await loadStoredLines(tx, periodId)).toHaveLength(0);
      const failAudit = (await auditActions(tx, periodId)).find((a) => a.action === "payout.calculate_failed");
      expect(failAudit!.after).toMatchObject({ reason: "problems", problems: [expect.objectContaining({ code: "no_rule" })] });

      // Periodo ya calculado: un recalculo fallido conserva las lineas y el estado.
      await tx.execute(sql`update commission_rules set applies_to = 'chain' where id = ${IDS.ruleDefault}`);
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      const before = await loadStoredLines(tx, periodId);
      await tx.execute(sql`update commission_rules set applies_to = 'barber' where id = ${IDS.ruleDefault}`);
      const failedAgain = await calculatePeriodInTx(tx, { ...scopeArgs, periodId });
      expect(failedAgain.ok).toBe(false);
      const [stillCalculated] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
      expect(stillCalculated!.status).toBe("calculated");
      expect(await loadStoredLines(tx, periodId)).toEqual(before);
    });
  }, TIMEOUT);

  it("sobre los datos reales del seed (quincena anterior): cuadra al centavo con SQL independiente y cada barbero multi-sede tiene una linea por sede", async () => {
    await inRolledBackTx(async (tx) => {
      const today = await chainTodayIso(tx, IDS.chain);
      const range = previousQuincena(quincenaContaining(today)!)!;
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...range }));
      const calc = expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      expect(calc.lineCount).toBeGreaterThan(3);

      const lines = await loadStoredLines(tx, periodId);
      const perLocation = new Map<string, { revenue: number; tips: number }>();
      for (const l of lines) {
        const acc = perLocation.get(l.locationId) ?? { revenue: 0, tips: 0 };
        acc.revenue += l.servicesRevenueCents + l.productRevenueCents;
        acc.tips += l.tipsCents;
        perLocation.set(l.locationId, acc);
      }
      const expected = await tx.execute<{ location_id: string; revenue: string; tips: string }>(sql`
        select s.location_id,
               sum(round((s.subtotal - s.discount_amount) * 100))::text as revenue,
               sum(round(s.tip_amount * 100))::text as tips
        from sales s join locations l on l.id = s.location_id
        where s.chain_id = ${IDS.chain} and s.status = 'paid'
          and (s.created_at at time zone l.timezone)::date between ${range.startsOn}::date and ${range.endsOn}::date
        group by s.location_id`);
      expect(expected.length).toBe(perLocation.size);
      for (const row of expected) {
        expect(perLocation.get(row.location_id)).toEqual({ revenue: Number(row.revenue), tips: Number(row.tips) });
      }
      // Multi-sede: b3 vende en Naco y en Bella Vista todas las quincenas.
      expect(lines.filter((l) => l.barberId === IDS.b3).map((l) => l.locationId).sort()).toEqual([IDS.naco, IDS.bellaVista].sort());
    });
  }, TIMEOUT);
});

describe("approvePeriodInTx / markPeriodPaidInTx (F3-05)", () => {
  it("ciclo completo: calculated -> approved -> paid, y desde approved nada se puede modificar (recalculo, ajuste, re-aprobar)", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));

      // Aprobar un periodo `open` (sin calcular) esta bloqueado.
      expect(await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY })).toEqual({
        ok: false,
        error: expect.stringContaining("todavía no se calculó"),
      });
      // Marcar pagado sin aprobar tambien.
      expect(await markPeriodPaidInTx(tx, { ...scopeArgs, periodId })).toEqual({ ok: false, error: expect.stringContaining("Aprueba el corte primero") });

      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      const approved = expectOk(await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY }));
      expect(approved).toMatchObject({ periodId, lineCount: 3, totalNetCents: -724834 });
      const [row] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
      expect(row).toMatchObject({ status: "approved", approvedBy: IDS.owner });

      // Inmutabilidad (§3.10): recalcular, ajustar y re-aprobar se rechazan y no tocan las lineas.
      const linesBefore = await loadStoredLines(tx, periodId);
      const immutable = { ok: false, error: expect.stringContaining("ya está aprobado") };
      expect(await calculatePeriodInTx(tx, { ...scopeArgs, periodId })).toEqual(immutable);
      expect(
        await adjustLineInTx(tx, { ...scopeArgs, periodId, lineId: linesBefore[0]!.id, amountCents: 5000, note: "intento de cambio" }),
      ).toEqual(immutable);
      expect(await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY })).toEqual(immutable);
      expect(await loadStoredLines(tx, periodId)).toEqual(linesBefore);

      // Aunque cambien las ventas, el periodo aprobado no se recalcula.
      await tx.execute(sql`update sales set status = 'refunded' where location_id = ${IDS.bellaVista} and created_at = '2020-03-12 12:00:00-04'::timestamptz`);
      expect(await calculatePeriodInTx(tx, { ...scopeArgs, periodId })).toEqual(immutable);
      expect(await loadStoredLines(tx, periodId)).toEqual(linesBefore);

      // Marcar pagado: acto separado; deja el sello en audit_log (sin columna paid_at).
      expectOk(await markPeriodPaidInTx(tx, { ...scopeArgs, periodId }));
      const [paid] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
      expect(paid!.status).toBe("paid");
      expect(await markPeriodPaidInTx(tx, { ...scopeArgs, periodId })).toEqual({ ok: false, error: expect.stringContaining("ya está marcado como pagado") });
      const paidImmutable = { ok: false, error: expect.stringContaining("ya está aprobado") };
      expect(await calculatePeriodInTx(tx, { ...scopeArgs, periodId })).toEqual(paidImmutable);
      expect(await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY })).toEqual({ ok: false, error: expect.stringContaining("ya está pagado") });

      const actions = (await auditActions(tx, periodId)).map((a) => a.action);
      expect(actions).toEqual(["payout.create", "payout.calculate", "payout.approve", "payout.mark_paid"]);
      const approveAudit = (await auditActions(tx, periodId)).find((a) => a.action === "payout.approve")!;
      expect(approveAudit.before).toEqual({ status: "calculated", approvedBy: null });
      expect(approveAudit.after).toMatchObject({ status: "approved", approvedBy: IDS.owner, totalNetCents: -724834 });
    });
  }, TIMEOUT);

  it("no se aprueba una quincena que todavia esta corriendo (ends_on futuro), con el motivo escrito", async () => {
    await inRolledBackTx(async (tx) => {
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, startsOn: "2099-01-16", endsOn: "2099-01-31" }));
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId })); // calcular como vista previa SI se permite
      const result = await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("La quincena termina el 31 ene 2099 y todavía está corriendo") });
      const [row] = await tx.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
      expect(row!.status).toBe("calculated");
    });
  }, TIMEOUT);

  it("con una caja abierta dentro del rango, aprobar esta bloqueado y el mensaje nombra la caja", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      await tx.execute(sql`
        insert into cash_sessions (id, location_id, opened_by, opened_at, opening_amount)
        values (${randomUUID()}, ${IDS.bellaVista}, ${IDS.adminBv}, '2020-03-14 09:00:00-04'::timestamptz, '1000.00')`);
      const result = await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Cajas sin cuadrar");
        expect(result.error).toContain("Caja de Bella Vista abierta el");
        expect(result.error).toContain("abierta por Admin Bella Vista");
      }
      // Cerrada la caja, el mismo periodo si se aprueba.
      await tx.execute(sql`update cash_sessions set closed_at = now(), expected_cash = '1000.00', counted_cash = '1000.00', difference = '0.00', closed_by = ${IDS.adminBv} where location_id = ${IDS.bellaVista} and opened_at = '2020-03-14 09:00:00-04'::timestamptz`);
      expectOk(await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY }));
    });
  }, TIMEOUT);

  it("descuento sin motivo y venta abierta bloquean, y el mensaje dice cual (los cuatro bloqueadores son una lista cerrada)", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));

      // Descuento SIN motivo (el seed no lo trae: se inserta aqui y se revierte).
      const noReasonSale = await insertSale(tx, {
        locationId: IDS.naco,
        createdAt: "2020-03-08 11:00:00-04",
        barberId: IDS.b1,
        items: [{ barberId: IDS.b1, cents: 30000 }],
        discountCents: 5000,
        reason: null,
      });
      // Y una venta abierta.
      await insertSale(tx, { locationId: IDS.naco, createdAt: "2020-03-09 11:00:00-04", barberId: IDS.b1, items: [{ barberId: IDS.b1, cents: 10000 }], status: "open" });

      const blocked = await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.error).toContain("Ventas sin cerrar");
        expect(blocked.error).toContain("Descuentos sin motivo");
        expect(blocked.error).toContain("descuento de RD$50.00");
        // Ademas el corte quedo desactualizado (la venta con descuento sin motivo ya es pagable): tambien lo dice.
        expect(blocked.error).toContain("cambiaron desde el último cálculo");
      }

      // Un motivo en blanco ("  ") sigue contando como sin motivo.
      await tx.execute(sql`update sales set discount_reason = '   ' where id = ${noReasonSale}`);
      const stillBlocked = await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY });
      expect(stillBlocked.ok === false && stillBlocked.error.includes("Descuentos sin motivo")).toBe(true);

      // Se resuelven (motivo + cobrar la abierta) y se recalcula: ahora si se aprueba.
      await tx.execute(sql`update sales set discount_reason = 'Cliente frecuente' where id = ${noReasonSale}`);
      await tx.execute(sql`update sales set status = 'paid' where status = 'open' and created_at = '2020-03-09 11:00:00-04'::timestamptz`);
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      expectOk(await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY }));
    });
  }, TIMEOUT);

  it("un barbero sin regla de pago es bloqueador de aprobacion y nombra al barbero y la sede", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      await tx.execute(sql`update commission_rules set applies_to = 'barber' where id = ${IDS.ruleDefault}`);
      const result = await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Barberos sin regla de pago");
        expect(result.error).toContain("Barbero Uno no tiene regla de pago en Naco");
      }
    });
  }, TIMEOUT);

  it("un corte desactualizado (cambio una venta despues de calcular) no se aprueba hasta recalcular", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      await tx.execute(sql`update sales set status = 'refunded' where location_id = ${IDS.bellaVista} and created_at = '2020-03-12 12:00:00-04'::timestamptz`);
      const stale = await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY });
      expect(stale.ok === false && stale.error.includes("recalcula el corte antes de cerrarlo")).toBe(true);
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      expectOk(await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY }));
    });
  }, TIMEOUT);
});

describe("adjustLineInTx (F3-05, P1)", () => {
  it("ajusta con nota obligatoria, recalcula el neto, audita before/after y el ajuste sobrevive a un recalculo", async () => {
    await inRolledBackTx(async (tx) => {
      await seedFixtureSales(tx);
      const { periodId } = expectOk(await createPeriodInTx(tx, { ...scopeArgs, ...Q2020 }));

      // Solo sobre un periodo calculado.
      expect(await adjustLineInTx(tx, { ...scopeArgs, periodId, lineId: randomUUID(), amountCents: 100, note: "abc" })).toEqual({
        ok: false,
        error: expect.stringContaining("Calcula el corte primero"),
      });

      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      const line = (await loadStoredLines(tx, periodId)).find((l) => l.barberId === IDS.b1)!;

      expect(await adjustLineInTx(tx, { ...scopeArgs, periodId, lineId: line.id, amountCents: 5000, note: " " })).toEqual({
        ok: false,
        error: expect.stringContaining("exige una nota"),
      });
      expect(await adjustLineInTx(tx, { ...scopeArgs, periodId, lineId: randomUUID(), amountCents: 5000, note: "Bono" })).toEqual({
        ok: false,
        error: expect.stringContaining("no pertenece"),
      });

      const adjusted = expectOk(await adjustLineInTx(tx, { ...scopeArgs, periodId, lineId: line.id, amountCents: -1500, note: "Adelanto de la quincena pasada" }));
      expect(adjusted).toEqual({ lineId: line.id, adjustmentsCents: -1500, netPayableCents: line.netPayableCents - 1500 });
      const audit = (await auditActions(tx, line.id)).find((a) => a.action === "payout.adjust")!;
      expect(audit.before).toMatchObject({ adjustmentsCents: 0, netPayableCents: line.netPayableCents });
      expect(audit.after).toMatchObject({ adjustmentsCents: -1500, netPayableCents: line.netPayableCents - 1500, notes: "Adelanto de la quincena pasada" });

      // Recalcular reaplica el ajuste (decision del Bloque A, punto 6) y el neto lo incluye.
      expectOk(await calculatePeriodInTx(tx, { ...scopeArgs, periodId }));
      const after = (await loadStoredLines(tx, periodId)).find((l) => l.barberId === IDS.b1)!;
      expect(after).toMatchObject({ adjustmentsCents: -1500, netPayableCents: line.netPayableCents - 1500, notes: "Adelanto de la quincena pasada" });

      // Y un corte con ajuste aprobado: sigue aprobable (los ajustes no cuentan como "desactualizado").
      expectOk(await approvePeriodInTx(tx, { ...scopeArgs, periodId, todayIso: TODAY }));
      // Aprobado: ajustar ya no se puede.
      expect(await adjustLineInTx(tx, { ...scopeArgs, periodId, lineId: line.id, amountCents: 0, note: "" })).toEqual({
        ok: false,
        error: expect.stringContaining("ya está aprobado"),
      });
    });
  }, TIMEOUT);
});

describe("concurrencia y bloqueo del periodo (F3-05, regla dura §3.6)", () => {
  const createdPeriodIds: string[] = [];
  let secondary: ReturnType<typeof postgres> | null = null;

  afterAll(async () => {
    if (createdPeriodIds.length > 0) {
      await db.delete(auditLog).where(inArray(auditLog.entityId, createdPeriodIds));
      await db.delete(payoutPeriods).where(inArray(payoutPeriods.id, createdPeriodIds)); // payout_lines: cascade
    }
    await secondary?.end({ timeout: 5 });
  });

  it("dos calculos simultaneos del mismo periodo: uno espera al otro (select for update), no se duplican lineas y el resultado es uno solo", async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta DATABASE_URL");
    secondary = postgres(url, { prepare: false, max: 1 });
    const db2 = drizzle(secondary, { schema });

    const today = await chainTodayIso(db, IDS.chain);
    const range = previousQuincena(quincenaContaining(today)!)!;
    const created = await db.transaction((tx) => createPeriodInTx(tx, { ...scopeArgs, ...range }));
    const periodId = expectOk(created).periodId;
    createdPeriodIds.push(periodId);

    // 1) Prueba de bloqueo determinista: A retiene el lock 1.5 s; B (otra conexion) no puede terminar antes.
    let releasedAt = 0;
    let bFinishedAt = 0;
    const holdA = db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from payout_periods where id = ${periodId} for update`);
      await new Promise((r) => setTimeout(r, 1500));
      releasedAt = Date.now();
    });
    await new Promise((r) => setTimeout(r, 300)); // A ya tiene el lock
    const calcB = db2
      .transaction((tx) => calculatePeriodInTx(tx as unknown as PayoutTx, { ...scopeArgs, periodId }))
      .then((r) => {
        bFinishedAt = Date.now();
        return r;
      });
    await holdA;
    const bResult = await calcB;
    expect(bResult.ok).toBe(true);
    expect(bFinishedAt).toBeGreaterThanOrEqual(releasedAt);

    // 2) Dos calculos realmente simultaneos (conexiones distintas): ambos ok, sin duplicados.
    const [r1, r2] = await Promise.all([
      db.transaction((tx) => calculatePeriodInTx(tx, { ...scopeArgs, periodId })),
      db2.transaction((tx) => calculatePeriodInTx(tx as unknown as PayoutTx, { ...scopeArgs, periodId })),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    const lines = await db.select().from(payoutLines).where(eq(payoutLines.payoutPeriodId, periodId));
    const keys = lines.map((l) => `${l.barberId}|${l.locationId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(lines.length).toBe(expectOk(r1).lineCount);
    expect(expectOk(r1)).toMatchObject({ lineCount: expectOk(r2).lineCount, totalNetCents: expectOk(r2).totalNetCents });

    const [period] = await db.select().from(payoutPeriods).where(and(eq(payoutPeriods.id, periodId)));
    expect(period!.status).toBe("calculated");
    const calcs = await db.select({ a: auditLog.action }).from(auditLog).where(and(eq(auditLog.entityId, periodId), eq(auditLog.action, "payout.calculate")));
    expect(calcs).toHaveLength(3);
  }, 60_000);
});
