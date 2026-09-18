import { randomUUID } from "node:crypto";

import { test, expect } from "@playwright/test";
import { and, eq, inArray, sql } from "drizzle-orm";

import { loginAs, SEED } from "./helpers";
import { testDb, SEED_IDS } from "./db-helpers";
import { auditLog, payoutLines, payoutPeriods, sales } from "../src/lib/db/schema";
import { previousQuincena, quincenaContaining, todayIsoInTimezone, formatQuincenaLabel } from "../src/lib/payouts/period";

/**
 * F3-06 · El Corte de Quincena (flujo critico 4 del PRD §15, parte de la
 * pantalla): el superuser crea el corte de la quincena anterior, lo calcula,
 * ve el desglose, se topa con un bloqueador (descuento sin motivo que ESTE test
 * inserta, el seed no lo trae), lo resuelve desde el propio panel, recalcula,
 * cierra el corte con la confirmacion, y lo marca como pagado. Verifica en la
 * DB real que lo que se ve es lo que quedo (lineas, estado, aprobador,
 * audit_log) y que la suma de las lineas cuadra con las ventas.
 *
 * Limpieza: todo por ID (periodo -> lineas por cascade, audit_log del periodo y
 * de la venta, la venta con su linea). La BD queda identica a la linea base
 * (`scripts/db-baseline.ts`).
 */
const OWNER = "owner@donbigote.test";
const BARBER_1 = "barbero1@donbigote.test";

const today = todayIsoInTimezone(new Date(), "America/Santo_Domingo");
const range = previousQuincena(quincenaContaining(today)!)!;
const LABEL = formatQuincenaLabel(range.startsOn, range.endsOn);

const tempSaleId = randomUUID();
let periodId = "";

const money = (cents: number) =>
  new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

async function purgeTestPeriods() {
  const periods = await testDb
    .select({ id: payoutPeriods.id })
    .from(payoutPeriods)
    .where(and(eq(payoutPeriods.chainId, SEED_IDS.chainId), eq(payoutPeriods.startsOn, range.startsOn)));
  const ids = periods.map((p) => p.id);
  if (ids.length > 0) {
    const lines = await testDb.select({ id: payoutLines.id }).from(payoutLines).where(inArray(payoutLines.payoutPeriodId, ids));
    await testDb.delete(auditLog).where(inArray(auditLog.entityId, [...ids, ...lines.map((l) => l.id)]));
    await testDb.delete(payoutPeriods).where(inArray(payoutPeriods.id, ids)); // payout_lines: cascade
  }
  await testDb.delete(auditLog).where(eq(auditLog.entityId, tempSaleId));
  await testDb.delete(sales).where(eq(sales.id, tempSaleId)); // sale_items: cascade
}

test.beforeAll(async () => {
  await purgeTestPeriods();
});

test.afterAll(async () => {
  await purgeTestPeriods();
});

test.describe.serial("Corte de Quincena", () => {
  test("el superuser crea el corte, lo calcula, resuelve un bloqueador, lo cierra y lo marca pagado", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAs(page, OWNER);

    // --- Crear -----------------------------------------------------------
    await page.goto("/commissions");
    await expect(page.getByRole("heading", { name: "El Corte", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Ver los cortes" }).click();
    await expect(page.getByRole("heading", { name: "Cortes de quincena" })).toBeVisible();

    await page.getByRole("combobox", { name: "Crear el corte de" }).click();
    await page.getByRole("option", { name: LABEL }).click();
    await page.getByRole("button", { name: "Crear corte" }).click();
    await page.waitForURL(/\/commissions\/periods\/[0-9a-f-]{36}$/);
    periodId = page.url().split("/").pop()!;

    await expect(page.getByRole("heading", { name: `El Corte — ${LABEL}` })).toBeVisible();
    await expect(page.getByText("Sin calcular todavía.")).toBeVisible();
    // Estado visible en el header; "Cerrar el corte" deshabilitado PERO con el motivo escrito.
    await expect(page.getByRole("listitem").filter({ hasText: "Abierto" }).first()).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("button", { name: "Cerrar el corte" })).toBeDisabled();
    await expect(page.locator("#close-blocked-reasons")).toContainText("todavía no se calculó");

    // --- Calcular y comprobar contra la DB ------------------------------------
    await page.getByRole("button", { name: "Calcular el corte" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Corte calculado." })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Calculado" }).first()).toHaveAttribute("aria-current", "step");

    const lines = await testDb.select().from(payoutLines).where(eq(payoutLines.payoutPeriodId, periodId));
    expect(lines.length).toBeGreaterThan(3);
    const netCents = lines.reduce((s, l) => s + Math.round(Number(l.netPayable) * 100), 0);
    const barbers = new Set(lines.map((l) => l.barberId)).size;
    const summary = page.getByTestId("period-summary");
    await expect(summary).toContainText(`${barbers} barberos`);
    await expect(summary).toContainText(`RD$ ${money(netCents)}`);
    // Una fila por barbero y sede en la tabla (+ encabezado).
    await expect(page.getByRole("row")).toHaveCount(lines.length + 1);

    // Cuadre con las ventas (SQL independiente, al centavo): ingreso y propinas por sede.
    const expected = await testDb.execute<{ revenue: string; tips: string }>(sql`
      select coalesce(sum(round((s.subtotal - s.discount_amount) * 100)), 0)::text as revenue,
             coalesce(sum(round(s.tip_amount * 100)), 0)::text as tips
      from sales s join locations l on l.id = s.location_id
      where s.chain_id = ${SEED_IDS.chainId} and s.status = 'paid'
        and (s.created_at at time zone l.timezone)::date between ${range.startsOn}::date and ${range.endsOn}::date`);
    expect(lines.reduce((s, l) => s + Math.round(Number(l.servicesRevenue) * 100), 0)).toBe(Number(expected[0]!.revenue));
    expect(lines.reduce((s, l) => s + Math.round(Number(l.tipsAmount) * 100), 0)).toBe(Number(expected[0]!.tips));

    // Sin bloqueadores todavia: el boton ya se puede usar.
    await expect(page.getByText("Nada pendiente. El corte se puede cerrar.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar el corte" })).toBeEnabled();

    // --- Un bloqueador real: descuento sin motivo (se inserta aqui) -------------
    const saleDay = range.startsOn; // mediodia hora de Santo Domingo del primer dia de la quincena
    await testDb.execute(sql`
      insert into sales (id, chain_id, location_id, client_id, barber_id, subtotal, discount_amount, discount_reason, tip_amount, total,
                         payment_method, status, created_by, created_at)
      values (${tempSaleId}, ${SEED_IDS.chainId}, ${SEED_IDS.naco}, '00000000-0000-0000-0000-000000000701', ${SEED_IDS.barbero1Id},
              '300.00', '50.00', null, '0', '250.00', 'cash', 'paid', ${SEED_IDS.adminNacoId}, (${saleDay}::text || ' 12:00:00-04')::timestamptz)`);
    await testDb.execute(sql`
      insert into sale_items (id, sale_id, type, service_id, quantity, unit_price, line_total, barber_id)
      values (${randomUUID()}, ${tempSaleId}, 'service', ${SEED_IDS.serviceCorte}, 1, '300.00', '300.00', ${SEED_IDS.barbero1Id})`);

    await page.reload();
    const blocker = page.locator('[data-blocker="discount_without_reason"]');
    await expect(blocker).toBeVisible();
    await expect(blocker).toContainText("Descuentos sin motivo");
    await expect(blocker).toContainText("descuento de RD$50.00");
    await expect(page.getByRole("button", { name: "Cerrar el corte" })).toBeDisabled();
    await expect(page.locator("#close-blocked-reasons")).toContainText("Descuentos sin motivo");
    // El corte tambien quedo desactualizado (la venta nueva ya es pagable): lo dice.
    await expect(page.getByText("cambiaron después del último cálculo")).toBeVisible();

    // Se resuelve desde el propio panel.
    await page.getByLabel("Motivo del descuento 1").fill("Cliente frecuente (E2E)");
    await page.getByRole("button", { name: "Guardar motivo" }).click();
    await expect(blocker).toHaveCount(0, { timeout: 30_000 });
    const [reasonRow] = await testDb.select({ reason: sales.discountReason }).from(sales).where(eq(sales.id, tempSaleId));
    expect(reasonRow?.reason).toBe("Cliente frecuente (E2E)");
    const reasonAudit = await testDb
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, tempSaleId), eq(auditLog.action, "sale.discount_reason_set")));
    expect(reasonAudit).toHaveLength(1);

    // Recalcular (incluye la venta nueva) y se limpia el aviso de desactualizado.
    await page.getByRole("button", { name: "Recalcular" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Corte calculado." })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Nada pendiente. El corte se puede cerrar.")).toBeVisible({ timeout: 30_000 });

    // --- Recibo del barbero multi-sede: DOS sedes que suman su total ------------------
    await page.getByRole("button", { name: /Ver recibo de Barbero Tres .* en Naco/ }).click();
    const receipt = page.getByRole("dialog");
    await expect(receipt.getByRole("article", { name: /Recibo de Barbero Tres/ })).toBeVisible();
    await expect(receipt.getByText("Total de las 2 sedes")).toBeVisible();
    await expect(receipt.getByRole("region", { name: /Barbero Tres .* en Naco/ })).toBeVisible();
    await expect(receipt.getByRole("region", { name: /Barbero Tres .* en Bella Vista/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // --- Cerrar el corte: confirmacion con el resumen exacto ---------------------
    const freshLines = await testDb.select().from(payoutLines).where(eq(payoutLines.payoutPeriodId, periodId));
    const freshNet = freshLines.reduce((s, l) => s + Math.round(Number(l.netPayable) * 100), 0);
    await page.getByRole("button", { name: "Cerrar el corte" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("approve-summary")).toContainText(`RD$${money(freshNet)} a pagar`);
    await expect(dialog).toContainText("después no se puede editar");
    await dialog.getByRole("button", { name: "Cerrar el corte" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Quincena cerrada." })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("img", { name: "Sello: corte cerrado" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Aprobado" }).first()).toHaveAttribute("aria-current", "step");
    // Solo lectura: ya no se ofrece recalcular ni cerrar.
    await expect(page.getByRole("button", { name: "Recalcular" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cerrar el corte" })).toHaveCount(0);

    const [approved] = await testDb.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
    expect(approved?.status).toBe("approved");
    expect(approved?.approvedBy).toBe("00000000-0000-0000-0000-000000000010");

    // El recibo de un corte cerrado no ofrece ajustes.
    await page.getByRole("button", { name: /Ver recibo de Barbero Uno/ }).first().click();
    await expect(page.getByRole("dialog").getByText("Ajuste manual")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // --- Marcar como pagado: acto separado ---------------------------------------
    await page.getByRole("button", { name: "Marcar como pagado" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Marcar como pagado" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Corte marcado como pagado." })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("img", { name: "Sello: corte pagado" })).toBeVisible();

    const [paid] = await testDb.select().from(payoutPeriods).where(eq(payoutPeriods.id, periodId));
    expect(paid?.status).toBe("paid");
    const audits = await testDb
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, periodId))
      .orderBy(auditLog.createdAt);
    expect(audits.map((a) => a.action)).toEqual([
      "payout.create",
      "payout.calculate",
      "payout.calculate",
      "payout.approve",
      "payout.mark_paid",
    ]);

    // El historial lo muestra pagado, con su total.
    await page.goto("/commissions/periods");
    const row = page.getByRole("row").filter({ hasText: LABEL });
    await expect(row).toContainText("Pagado");
    await expect(row).toContainText(`RD$ ${money(freshNet)}`);
  });

  test("un admin y un barbero reciben 403 en (chain)/commissions, incluido el corte por URL directa", async ({ page }) => {
    for (const email of [SEED.adminNaco, BARBER_1]) {
      await loginAs(page, email);
      for (const path of ["/commissions", "/commissions/rules", "/commissions/periods", `/commissions/periods/${periodId}`]) {
        const response = await page.goto(path);
        expect(response?.status(), `${email} en ${path}`).toBe(403);
      }
      await page.context().clearCookies();
    }
  });
});
