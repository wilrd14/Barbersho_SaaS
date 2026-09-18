"use server";

/**
 * F3-04 · Reglas de Pago: CRUD de `commission_rules` y asignacion del override
 * por barbero y sede (`barber_locations.commission_rule_id`).
 *
 * Patron obligatorio: Zod (`zUuid`) -> guard -> transaccion con `tx` ->
 * `ActionResult` -> `writeAuditLog(..., tx)`. Solo el `superuser` escribe
 * (matriz §6.2): `requireChainScope` devuelve 403 a admin y barbero incluso por
 * llamada directa a la accion. `chain_id` sale SIEMPRE del guard.
 *
 * Alcance (D-F3-3/4/7): tipos `percentage`, `booth_rent`, `hybrid`;
 * `fixed_per_service` y `split_pct` NO existen aqui (el esquema no tiene
 * donde guardar el monto fijo ni el reparto); `applies_to = 'location'` no se
 * ofrece (el override por sede va en barber_locations). Las propinas son
 * siempre `barber_keeps_all`.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { writeAuditLog } from "@/lib/auth/audit";
import { requireChainScope } from "@/lib/auth/guards";
import { bpsFromPercentString } from "@/lib/commissions";
import { db } from "@/lib/db/client";
import { barberLocations, commissionRules, locations } from "@/lib/db/schema";
import { decimalStringFromCents } from "@/lib/actions/money-utils";
import { pgErrorInfo, UNIQUE_VIOLATION } from "@/lib/payouts/pg-errors";
import { zUuid } from "@/lib/validation/id";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";

const DUPLICATE_CHAIN_RULE_MESSAGE =
  "Ya existe la regla de pago por defecto de la cadena. Solo puede haber una: edita la que ya existe o crea esta como regla para barberos concretos.";

const percentField = z
  .string()
  .trim()
  .refine((v) => {
    try {
      bpsFromPercentString(v);
      return true;
    } catch {
      return false;
    }
  }, "El porcentaje debe estar entre 0 y 100, con hasta 2 decimales.");

const MAX_RENT_CENTS = 100_000_000; // RD$1,000,000: tope de cordura, no de negocio.

const ruleBodySchema = z
  .object({
    name: z.string().trim().min(1, "Ponle un nombre a la regla.").max(80, "El nombre no puede pasar de 80 caracteres."),
    type: z.enum(["percentage", "booth_rent", "hybrid"], {
      error: "Elige el tipo de regla: porcentaje, alquiler de silla o mixta.",
    }),
    serviceCommissionPct: percentField.nullish(),
    productCommissionPct: percentField.nullish(),
    boothRentCents: z.number().int().min(1, "El alquiler debe ser mayor que cero.").max(MAX_RENT_CENTS).nullish(),
    boothRentFrequency: z.enum(["weekly", "biweekly", "monthly"]).nullish(),
  })
  .superRefine((value, ctx) => {
    const needsPct = value.type === "percentage" || value.type === "hybrid";
    const needsRent = value.type === "booth_rent" || value.type === "hybrid";
    if (needsPct && !value.serviceCommissionPct) {
      ctx.addIssue({ code: "custom", path: ["serviceCommissionPct"], message: "Falta el porcentaje por servicio." });
    }
    if (needsRent && !value.boothRentCents) {
      ctx.addIssue({ code: "custom", path: ["boothRentCents"], message: "Falta el monto del alquiler de silla." });
    }
    if (needsRent && !value.boothRentFrequency) {
      ctx.addIssue({
        code: "custom",
        path: ["boothRentFrequency"],
        message: "Falta la frecuencia del alquiler: semanal, quincenal o mensual.",
      });
    }
  });

/** Columnas de la fila segun el tipo: lo que la regla no usa se guarda en null (nunca un 0 implicito). */
function columnsFor(body: z.infer<typeof ruleBodySchema>) {
  const usesPct = body.type === "percentage" || body.type === "hybrid";
  const usesRent = body.type === "booth_rent" || body.type === "hybrid";
  return {
    name: body.name,
    type: body.type,
    serviceCommissionPct: usesPct ? decimalStringFromCents(bpsFromPercentString(body.serviceCommissionPct!)) : null,
    productCommissionPct:
      usesPct && body.productCommissionPct ? decimalStringFromCents(bpsFromPercentString(body.productCommissionPct)) : null,
    boothRentAmount: usesRent ? decimalStringFromCents(body.boothRentCents!) : null,
    boothRentFrequency: usesRent ? body.boothRentFrequency! : null,
    tipHandling: "barber_keeps_all" as const,
  };
}

function ruleSnapshot(row: typeof commissionRules.$inferSelect) {
  return {
    name: row.name,
    type: row.type,
    serviceCommissionPct: row.serviceCommissionPct,
    productCommissionPct: row.productCommissionPct,
    boothRentAmount: row.boothRentAmount,
    boothRentFrequency: row.boothRentFrequency,
    tipHandling: row.tipHandling,
    appliesTo: row.appliesTo,
  };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Datos invalidos.";
}

// ---------------------------------------------------------------------------
// createCommissionRuleAction
// ---------------------------------------------------------------------------

const createRuleSchema = ruleBodySchema.safeExtend({
  appliesTo: z.enum(["chain", "barber"], { error: "Elige a quien aplica la regla." }),
});

export async function createCommissionRuleAction(input: unknown): Promise<ActionResult<{ ruleId: string }>> {
  const parsed = createRuleSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const scope = await requireChainScope();

  try {
    const ruleId = await db.transaction(async (tx) => {
      if (parsed.data.appliesTo === "chain") {
        const [existing] = await tx
          .select({ id: commissionRules.id })
          .from(commissionRules)
          .where(and(eq(commissionRules.chainId, scope.chainId), eq(commissionRules.appliesTo, "chain")))
          .limit(1);
        if (existing) throw new RuleActionError(DUPLICATE_CHAIN_RULE_MESSAGE);
      }

      const [created] = await tx
        .insert(commissionRules)
        .values({ chainId: scope.chainId, appliesTo: parsed.data.appliesTo, ...columnsFor(parsed.data) })
        .returning();

      await writeAuditLog(
        {
          chainId: scope.chainId,
          actorUserId: scope.userId,
          action: "commission_rule.create",
          entity: "commission_rules",
          entityId: created!.id,
          before: null,
          after: ruleSnapshot(created!),
        },
        tx,
      );
      return created!.id;
    });
    return actionOk({ ruleId });
  } catch (err) {
    return actionError(ruleErrorMessage(err, "No se pudo guardar la regla."));
  }
}

// ---------------------------------------------------------------------------
// updateCommissionRuleAction — no cambia `applies_to` (la de cadena sigue siendo la de cadena)
// ---------------------------------------------------------------------------

const updateRuleSchema = ruleBodySchema.safeExtend({ ruleId: zUuid });

export async function updateCommissionRuleAction(input: unknown): Promise<ActionResult<{ ruleId: string }>> {
  const parsed = updateRuleSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const scope = await requireChainScope();

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(commissionRules)
        .where(and(eq(commissionRules.id, parsed.data.ruleId), eq(commissionRules.chainId, scope.chainId)))
        .for("update")
        .limit(1);
      if (!before) throw new RuleActionError("Esa regla no existe en tu cadena.");

      const [after] = await tx
        .update(commissionRules)
        .set(columnsFor(parsed.data))
        .where(eq(commissionRules.id, before.id))
        .returning();

      await writeAuditLog(
        {
          chainId: scope.chainId,
          actorUserId: scope.userId,
          action: "commission_rule.update",
          entity: "commission_rules",
          entityId: before.id,
          before: ruleSnapshot(before),
          after: ruleSnapshot(after!),
        },
        tx,
      );
    });
    return actionOk({ ruleId: parsed.data.ruleId });
  } catch (err) {
    return actionError(ruleErrorMessage(err, "No se pudo guardar la regla."));
  }
}

// ---------------------------------------------------------------------------
// deleteCommissionRuleAction
// ---------------------------------------------------------------------------

const deleteRuleSchema = z.object({ ruleId: zUuid });

export async function deleteCommissionRuleAction(input: unknown): Promise<ActionResult<{ ruleId: string }>> {
  const parsed = deleteRuleSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const scope = await requireChainScope();

  try {
    await db.transaction(async (tx) => {
      const [rule] = await tx
        .select()
        .from(commissionRules)
        .where(and(eq(commissionRules.id, parsed.data.ruleId), eq(commissionRules.chainId, scope.chainId)))
        .for("update")
        .limit(1);
      if (!rule) throw new RuleActionError("Esa regla no existe en tu cadena.");
      if (rule.appliesTo === "chain") {
        throw new RuleActionError(
          "La regla por defecto de la cadena no se elimina: sin ella, los barberos sin regla propia no se pueden calcular. Editala si cambio.",
        );
      }

      // Borrar una regla asignada dejaria a esos barberos con la regla de la
      // cadena sin avisar (FK `on delete set null`): se rechaza y se nombra a quienes la usan.
      const users = await tx.execute<{ barber_name: string | null; location_name: string }>(sql`
        select u.full_name as barber_name, l.name as location_name
        from barber_locations bl
        join users u on u.id = bl.user_id
        join locations l on l.id = bl.location_id
        where bl.commission_rule_id = ${rule.id} and l.chain_id = ${scope.chainId}
        order by l.name, u.full_name
      `);
      if (users.length > 0) {
        const who = users.map((r) => `${r.barber_name ?? "Barbero sin nombre"} (${r.location_name})`).join(", ");
        throw new RuleActionError(
          `No se puede eliminar "${rule.name}": la usan ${who}. Asignales otra regla primero.`,
        );
      }

      await tx.delete(commissionRules).where(eq(commissionRules.id, rule.id));

      await writeAuditLog(
        {
          chainId: scope.chainId,
          actorUserId: scope.userId,
          action: "commission_rule.delete",
          entity: "commission_rules",
          entityId: rule.id,
          before: ruleSnapshot(rule),
          after: null,
        },
        tx,
      );
    });
    return actionOk({ ruleId: parsed.data.ruleId });
  } catch (err) {
    return actionError(ruleErrorMessage(err, "No se pudo eliminar la regla."));
  }
}

// ---------------------------------------------------------------------------
// assignBarberLocationRuleAction — override por barbero y sede (D-F3-3)
// ---------------------------------------------------------------------------

const assignRuleSchema = z.object({
  barberId: zUuid,
  locationId: zUuid,
  /** null = "usar la regla por defecto de la cadena". */
  ruleId: zUuid.nullable(),
});

export async function assignBarberLocationRuleAction(
  input: unknown,
): Promise<ActionResult<{ barberLocationId: string }>> {
  const parsed = assignRuleSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const scope = await requireChainScope();

  try {
    const barberLocationId = await db.transaction(async (tx) => {
      // La sede tiene que ser de la cadena del guard (nunca de la del cliente).
      const [assignment] = await tx
        .select({
          id: barberLocations.id,
          commissionRuleId: barberLocations.commissionRuleId,
          locationName: locations.name,
        })
        .from(barberLocations)
        .innerJoin(locations, eq(locations.id, barberLocations.locationId))
        .where(
          and(
            eq(barberLocations.userId, parsed.data.barberId),
            eq(barberLocations.locationId, parsed.data.locationId),
            eq(locations.chainId, scope.chainId),
          ),
        )
        .for("update", { of: barberLocations })
        .limit(1);
      if (!assignment) throw new RuleActionError("Ese barbero no trabaja en esa sede de tu cadena.");

      if (parsed.data.ruleId) {
        const [rule] = await tx
          .select({ id: commissionRules.id })
          .from(commissionRules)
          .where(and(eq(commissionRules.id, parsed.data.ruleId), eq(commissionRules.chainId, scope.chainId)))
          .limit(1);
        if (!rule) throw new RuleActionError("Esa regla no existe en tu cadena.");
      }

      await tx
        .update(barberLocations)
        .set({ commissionRuleId: parsed.data.ruleId })
        .where(eq(barberLocations.id, assignment.id));

      await writeAuditLog(
        {
          chainId: scope.chainId,
          locationId: parsed.data.locationId,
          actorUserId: scope.userId,
          action: "barber_location.assign_rule",
          entity: "barber_locations",
          entityId: assignment.id,
          before: { barberId: parsed.data.barberId, commissionRuleId: assignment.commissionRuleId },
          after: { barberId: parsed.data.barberId, commissionRuleId: parsed.data.ruleId },
        },
        tx,
      );
      return assignment.id;
    });
    return actionOk({ barberLocationId });
  } catch (err) {
    return actionError(ruleErrorMessage(err, "No se pudo asignar la regla."));
  }
}

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

/** Error de negocio con mensaje ya legible para el gerente (no un error crudo de Postgres). */
class RuleActionError extends Error {}

function ruleErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof RuleActionError) return err.message;
  const { code, constraint } = pgErrorInfo(err);
  if (code === UNIQUE_VIOLATION && constraint === "commission_rules_chain_default_uq") {
    return DUPLICATE_CHAIN_RULE_MESSAGE;
  }
  return fallback;
}
