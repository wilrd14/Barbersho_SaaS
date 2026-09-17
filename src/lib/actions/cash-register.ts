"use server";

/**
 * F2-20/F2-23 · Apertura de caja y cierre de caja diario.
 *
 * Mismo patron obligatorio que checkout.ts: Zod -> guard de sede -> rol de
 * gerente (D-F2-9: el barbero no abre ni cierra caja, matriz §6.2 del PRD)
 * -> transaccion -> `ActionResult` -> `audit_log`.
 */

import { z } from "zod";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { cashSessions, sales, users } from "@/lib/db/schema";
import { requireLocationScope } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/auth/audit";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";
import { assertManagerRole, centsFromDecimalString, decimalStringFromCents } from "@/lib/actions/checkout";

const UNIQUE_VIOLATION_CODE = "23505";

function isPgErrorCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === code;
}

// ---------------------------------------------------------------------------
// Lectura de estado — usada por register/page.tsx y checkout/page.tsx (para
// bloquear el cobro si no hay caja abierta, D-F2-9).
// ---------------------------------------------------------------------------

export type CashRegisterState = {
  openSession: {
    id: string;
    openedAt: string;
    openedByName: string;
    openingAmountCents: number;
  } | null;
  lastClosedSession: {
    id: string;
    closedAt: string;
    openingAmountCents: number;
    expectedCashCents: number;
    countedCashCents: number;
    differenceCents: number;
    notes: string | null;
  } | null;
};

export async function loadCashRegisterState(locationId: string): Promise<CashRegisterState> {
  const [openRow] = await db
    .select({
      id: cashSessions.id,
      openedAt: cashSessions.openedAt,
      openedBy: cashSessions.openedBy,
      openingAmount: cashSessions.openingAmount,
    })
    .from(cashSessions)
    .where(and(eq(cashSessions.locationId, locationId), isNull(cashSessions.closedAt)))
    .limit(1);

  let openSession: CashRegisterState["openSession"] = null;
  if (openRow) {
    const [opener] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, openRow.openedBy))
      .limit(1);
    openSession = {
      id: openRow.id,
      openedAt: openRow.openedAt.toISOString(),
      openedByName: opener?.fullName ?? "—",
      openingAmountCents: centsFromDecimalString(openRow.openingAmount),
    };
  }

  const [lastClosedRow] = await db
    .select({
      id: cashSessions.id,
      closedAt: cashSessions.closedAt,
      openingAmount: cashSessions.openingAmount,
      expectedCash: cashSessions.expectedCash,
      countedCash: cashSessions.countedCash,
      difference: cashSessions.difference,
      notes: cashSessions.notes,
    })
    .from(cashSessions)
    .where(and(eq(cashSessions.locationId, locationId), isNotNull(cashSessions.closedAt)))
    .orderBy(desc(cashSessions.closedAt))
    .limit(1);

  const lastClosedSession = lastClosedRow
    ? {
        id: lastClosedRow.id,
        closedAt: lastClosedRow.closedAt!.toISOString(),
        openingAmountCents: centsFromDecimalString(lastClosedRow.openingAmount),
        expectedCashCents: centsFromDecimalString(lastClosedRow.expectedCash ?? "0"),
        countedCashCents: centsFromDecimalString(lastClosedRow.countedCash ?? "0"),
        differenceCents: centsFromDecimalString(lastClosedRow.difference ?? "0"),
        notes: lastClosedRow.notes,
      }
    : null;

  return { openSession, lastClosedSession };
}

// ---------------------------------------------------------------------------
// openCashSessionAction — F2-20
// ---------------------------------------------------------------------------

const openCashSessionSchema = z.object({
  locationId: z.string().uuid(),
  openingAmountCents: z.number().int().min(0),
});

export async function openCashSessionAction(
  input: unknown,
): Promise<ActionResult<{ cashSessionId: string }>> {
  const parsed = openCashSessionSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");

  const scope = await requireLocationScope(parsed.data.locationId);

  try {
    assertManagerRole(scope);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "No autorizado.");
  }

  try {
    const cashSessionId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(cashSessions)
        .values({
          locationId: scope.locationId,
          openedBy: scope.userId,
          openingAmount: decimalStringFromCents(parsed.data.openingAmountCents),
        })
        .returning({ id: cashSessions.id });

      await writeAuditLog({
        chainId: scope.chainId,
        locationId: scope.locationId,
        actorUserId: scope.userId,
        action: "cash.open",
        entity: "cash_sessions",
        entityId: created!.id,
        after: { openingAmountCents: parsed.data.openingAmountCents },
      });

      return created!.id;
    });

    return actionOk({ cashSessionId });
  } catch (err) {
    if (isPgErrorCode(err, UNIQUE_VIOLATION_CODE)) {
      return actionError("Ya hay una caja abierta en esta sede. Cerrala antes de abrir otra.");
    }
    return actionError(err instanceof Error ? err.message : "No se pudo abrir la caja.");
  }
}

// ---------------------------------------------------------------------------
// closeCashSessionAction — F2-23
// ---------------------------------------------------------------------------

const closeCashSessionSchema = z.object({
  locationId: z.string().uuid(),
  cashSessionId: z.string().uuid(),
  countedCashCents: z.number().int().min(0),
  notes: z.string().trim().max(500).optional(),
});

export type CloseCashSessionResult = {
  expectedCashCents: number;
  countedCashCents: number;
  differenceCents: number;
  cardTotalCents: number;
  transferTotalCents: number;
};

export async function closeCashSessionAction(
  input: unknown,
): Promise<ActionResult<CloseCashSessionResult>> {
  const parsed = closeCashSessionSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");

  const scope = await requireLocationScope(parsed.data.locationId);

  try {
    assertManagerRole(scope);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "No autorizado.");
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(cashSessions)
        .where(eq(cashSessions.id, parsed.data.cashSessionId))
        .limit(1);

      if (!session || session.locationId !== scope.locationId) {
        throw new Error("Esa caja no pertenece a esta sede.");
      }
      if (session.closedAt) {
        throw new Error("Esa caja ya esta cerrada.");
      }

      // No se puede cerrar con ventas 'open' (F2-23 AC) — en el flujo de
      // F2-21 toda venta se crea directamente como 'paid' (no hay paso
      // intermedio de "ticket abierto" en el checkout de un solo paso), asi
      // que en operacion normal esta lista siempre esta vacia. El chequeo se
      // deja como red de seguridad explicita, tal como pide el backlog.
      const openSalesRows = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(and(eq(sales.cashSessionId, session.id), eq(sales.status, "open")));

      if (openSalesRows.length > 0) {
        throw new Error(
          `Hay ${openSalesRows.length} venta(s) sin cerrar en esta caja. Completalas o anulalas antes de cerrar.`,
        );
      }

      const saleRows = await tx
        .select({ paymentMethod: sales.paymentMethod, total: sales.total, status: sales.status })
        .from(sales)
        .where(eq(sales.cashSessionId, session.id));

      let cashTotalCents = 0;
      let cardTotalCents = 0;
      let transferTotalCents = 0;
      for (const row of saleRows) {
        if (row.status === "refunded") continue;
        const cents = centsFromDecimalString(row.total);
        if (row.paymentMethod === "cash") cashTotalCents += cents;
        else if (row.paymentMethod === "card") cardTotalCents += cents;
        else if (row.paymentMethod === "transfer") transferTotalCents += cents;
      }

      const openingCents = centsFromDecimalString(session.openingAmount);
      const expectedCashCents = openingCents + cashTotalCents;
      const differenceCents = parsed.data.countedCashCents - expectedCashCents;

      await tx
        .update(cashSessions)
        .set({
          closedBy: scope.userId,
          closedAt: new Date(),
          expectedCash: decimalStringFromCents(expectedCashCents),
          countedCash: decimalStringFromCents(parsed.data.countedCashCents),
          difference: decimalStringFromCents(differenceCents),
          notes: parsed.data.notes ?? null,
        })
        .where(eq(cashSessions.id, session.id));

      await writeAuditLog({
        chainId: scope.chainId,
        locationId: scope.locationId,
        actorUserId: scope.userId,
        action: "cash.close",
        entity: "cash_sessions",
        entityId: session.id,
        before: { openingAmountCents: openingCents },
        after: {
          expectedCashCents,
          countedCashCents: parsed.data.countedCashCents,
          differenceCents,
          cardTotalCents,
          transferTotalCents,
          notes: parsed.data.notes ?? null,
        },
      });

      return { expectedCashCents, countedCashCents: parsed.data.countedCashCents, differenceCents, cardTotalCents, transferTotalCents };
    });

    return actionOk(result);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "No se pudo cerrar la caja.");
  }
}
