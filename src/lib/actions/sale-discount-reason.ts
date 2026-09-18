"use server";

/**
 * F3-06 · Registrar el motivo de un descuento que se cobro sin motivo. Es la
 * forma de resolver el bloqueador "Descuentos sin motivo" (D-F3-10.3) desde el
 * propio Corte: sin esta accion no existiria ningun camino de UI para
 * corregirlo (el checkout ya no deja cobrar un descuento sin motivo, pero el
 * dato historico puede venir de antes) y la quincena quedaria bloqueada para
 * siempre.
 *
 * Solo gerente (superuser o admin de esa sede, `requireLocationScope` +
 * `assertManagerRole`). Solo escribe el TEXTO del motivo: no cambia ningun
 * monto, asi que no altera lo que ya se pago ni el calculo del corte. Deja
 * `audit_log` con before/after.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { assertManagerRole } from "@/lib/actions/money-utils";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireLocationScope } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { sales } from "@/lib/db/schema";
import { zUuid } from "@/lib/validation/id";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";

const schema = z.object({
  locationId: zUuid,
  saleId: zUuid,
  reason: z.string().trim().min(3, "Escribe el motivo del descuento (mínimo 3 caracteres).").max(200, "El motivo no puede pasar de 200 caracteres."),
});

export async function setSaleDiscountReasonAction(input: unknown): Promise<ActionResult<{ saleId: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");

  const scope = await requireLocationScope(parsed.data.locationId);
  try {
    assertManagerRole(scope);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "No autorizado.");
  }

  try {
    await db.transaction(async (tx) => {
      const [sale] = await tx
        .select({
          id: sales.id,
          chainId: sales.chainId,
          locationId: sales.locationId,
          status: sales.status,
          discountAmount: sales.discountAmount,
          discountReason: sales.discountReason,
        })
        .from(sales)
        .where(and(eq(sales.id, parsed.data.saleId), eq(sales.locationId, scope.locationId), eq(sales.chainId, scope.chainId)))
        .for("update")
        .limit(1);
      if (!sale) throw new DiscountReasonError("Esa venta no pertenece a esta sede.");
      if (sale.status === "refunded") throw new DiscountReasonError("Esa venta está anulada: no cuenta para el corte.");
      if (sale.discountAmount === "0.00" || sale.discountAmount === "0") {
        throw new DiscountReasonError("Esa venta no tiene descuento.");
      }

      await tx.update(sales).set({ discountReason: parsed.data.reason }).where(eq(sales.id, sale.id));

      await writeAuditLog(
        {
          chainId: scope.chainId,
          locationId: scope.locationId,
          actorUserId: scope.userId,
          action: "sale.discount_reason_set",
          entity: "sales",
          entityId: sale.id,
          before: { discountReason: sale.discountReason },
          after: { discountReason: parsed.data.reason },
        },
        tx,
      );
    });
    return actionOk({ saleId: parsed.data.saleId });
  } catch (err) {
    if (err instanceof DiscountReasonError) return actionError(err.message);
    return actionError("No se pudo guardar el motivo. No se guardó ningún cambio; puedes reintentar.");
  }
}

class DiscountReasonError extends Error {}
