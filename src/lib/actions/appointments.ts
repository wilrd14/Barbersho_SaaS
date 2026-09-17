"use server";

import { and, eq, gt, ilike, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { appointments, clients } from "@/lib/db/schema";
import { requireLocationScope, type LocationScopeContext } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/auth/audit";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";
import { resolveEffectiveServiceFor } from "@/lib/scheduling/availability";
import {
  resolveAppointmentTransition,
  type AppointmentStatus,
} from "@/lib/scheduling/appointment-state";

/**
 * F2-07/F2-08/F2-09 · Server Actions de agenda de consola.
 *
 * Patron obligatorio (regla dura §3.1, ActionResult §2): Zod -> guard de
 * ambito (con `locationId` verificado, NUNCA confiado del input) ->
 * transaccion -> ActionResult -> auditoria cuando aplica.
 *
 * El anti doble-booking definitivo es el `EXCLUDE` constraint de Postgres
 * (0002_f2_integrity.sql, `appointments_no_overlap_per_barber`). Aqui se
 * re-verifica disponibilidad DENTRO de la transaccion (capa 2 de 3, regla
 * dura §3.7) y, si aun asi el constraint dispara (carrera real), se traduce
 * el error a espanol legible en vez de dejar pasar el stack trace de
 * Postgres.
 */

const EXCLUSION_VIOLATION_CODE = "23P01";
const UNIQUE_VIOLATION_CODE = "23505";

function isPgErrorCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === code;
}

function slotTakenError(): never {
  throw new SlotTakenError();
}

class SlotTakenError extends Error {}

/** Un barbero solo puede operar sus propias citas; admin/superuser, las de su sede (matriz §6.2). */
function assertCanActOnBarber(scope: LocationScopeContext, barberId: string) {
  if (scope.effectiveRole === "barber_assigned" && scope.userId !== barberId) {
    throw new Error("Solo podes operar tus propias citas.");
  }
}

// ---------------------------------------------------------------------------
// F2-07 · Transiciones de estado
// ---------------------------------------------------------------------------

const transitionSchema = z.object({
  locationId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  action: z.enum(["confirm", "start", "complete", "no_show", "cancel"]),
  cancellationReason: z.string().trim().min(1).max(500).optional(),
});

export async function transitionAppointmentAction(
  input: unknown,
): Promise<ActionResult<{ status: string }>> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }
  const { locationId, appointmentId, action, cancellationReason } = parsed.data;

  const scope = await requireLocationScope(locationId);

  if (action === "cancel" && !cancellationReason) {
    return actionError("Cancelar una cita exige un motivo.");
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: appointments.id,
          locationId: appointments.locationId,
          chainId: appointments.chainId,
          barberId: appointments.barberId,
          clientId: appointments.clientId,
          status: appointments.status,
        })
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .limit(1);

      if (!current || current.locationId !== scope.locationId) {
        throw new Error("La cita no pertenece a esta sede.");
      }

      assertCanActOnBarber(scope, current.barberId);

      const nextStatus = resolveAppointmentTransition(current.status as AppointmentStatus, action);

      if (!nextStatus) {
        throw new Error(
          `No se puede pasar una cita en estado "${current.status}" a "${action}".`,
        );
      }

      await tx
        .update(appointments)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
          cancellationReason: action === "cancel" ? cancellationReason : undefined,
        })
        .where(eq(appointments.id, appointmentId));

      if (action === "no_show") {
        await tx
          .update(clients)
          .set({ noShowCount: sql`${clients.noShowCount} + 1` })
          .where(eq(clients.id, current.clientId));
      }

      await writeAuditLog({
        chainId: current.chainId,
        locationId: scope.locationId,
        actorUserId: scope.userId,
        action: `appointment.${action}`,
        entity: "appointments",
        entityId: appointmentId,
        before: { status: current.status },
        after: { status: nextStatus, cancellationReason: cancellationReason ?? null },
      });

      return { status: nextStatus };
    });

    return actionOk(result);
  } catch (err) {
    if (err instanceof Error) return actionError(err.message);
    return actionError("No se pudo actualizar la cita.");
  }
}

// ---------------------------------------------------------------------------
// F2-08 · Crear cita desde la consola
// ---------------------------------------------------------------------------

const createAppointmentSchema = z.object({
  locationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  barberId: z.string().uuid(),
  startsAt: z.string().datetime(),
  source: z.enum(["admin", "phone"]).default("admin"),
  notes: z.string().trim().max(500).optional(),
  existingClientId: z.string().uuid().optional(),
  newClient: z
    .object({
      fullName: z.string().trim().min(2, "El nombre es obligatorio."),
      phone: z.string().trim().min(6, "El telefono es obligatorio."),
    })
    .optional(),
});

export async function createAppointmentAction(
  input: unknown,
): Promise<ActionResult<{ appointmentId: string }>> {
  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }
  const data = parsed.data;

  if (!data.existingClientId && !data.newClient) {
    return actionError("Elegi un cliente existente o completa nombre y telefono.");
  }

  const scope = await requireLocationScope(data.locationId);
  assertCanActOnBarber(scope, data.barberId);

  const effective = await resolveEffectiveServiceFor(scope.locationId, data.serviceId, data.barberId);
  if (!effective) {
    return actionError("Ese servicio no esta disponible en esta sede.");
  }

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(startsAt.getTime() + effective.durationMinutes * 60_000);

  try {
    const appointmentId = await db.transaction(async (tx) => {
      let clientId = data.existingClientId ?? null;

      if (!clientId && data.newClient) {
        const [existingByPhone] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.chainId, scope.chainId), eq(clients.phone, data.newClient.phone)))
          .limit(1);

        if (existingByPhone) {
          clientId = existingByPhone.id;
        } else {
          const [created] = await tx
            .insert(clients)
            .values({
              chainId: scope.chainId,
              fullName: data.newClient.fullName,
              phone: data.newClient.phone,
            })
            .returning({ id: clients.id });
          clientId = created!.id;
        }
      }

      if (!clientId) {
        throw new Error("No se pudo resolver el cliente.");
      }

      // Capa 2 de 3 (regla dura §3.7): re-verificacion en aplicacion, dentro
      // de la transaccion. La autoridad final es el EXCLUDE constraint.
      const [conflict] = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.barberId, data.barberId),
            or(
              eq(appointments.status, "pending"),
              eq(appointments.status, "confirmed"),
              eq(appointments.status, "in_progress"),
            ),
            lt(appointments.startsAt, endsAt),
            gt(appointments.endsAt, startsAt),
          ),
        )
        .limit(1);

      if (conflict) {
        slotTakenError();
      }

      const [created] = await tx
        .insert(appointments)
        .values({
          chainId: scope.chainId,
          locationId: scope.locationId,
          clientId,
          barberId: data.barberId,
          serviceId: data.serviceId,
          startsAt,
          endsAt,
          status: "confirmed",
          source: data.source,
          priceAtBooking: String(effective.price),
          notes: data.notes,
        })
        .returning({ id: appointments.id });

      await writeAuditLog({
        chainId: scope.chainId,
        locationId: scope.locationId,
        actorUserId: scope.userId,
        action: "appointment.create_console",
        entity: "appointments",
        entityId: created!.id,
        after: {
          clientId,
          barberId: data.barberId,
          serviceId: data.serviceId,
          startsAt,
          endsAt,
          source: data.source,
        },
      });

      return created!.id;
    });

    return actionOk({ appointmentId });
  } catch (err) {
    if (err instanceof SlotTakenError || isPgErrorCode(err, EXCLUSION_VIOLATION_CODE)) {
      return actionError("Ese horario acaba de ocuparse por ese barbero. Elegi otro horario.");
    }
    if (isPgErrorCode(err, UNIQUE_VIOLATION_CODE)) {
      return actionError("Ya existe un cliente con ese telefono en esta cadena.");
    }
    if (err instanceof Error) return actionError(err.message);
    return actionError("No se pudo crear la cita.");
  }
}

// ---------------------------------------------------------------------------
// F2-09 · Reprogramar y reasignar (sheet, P0 — drag-and-drop es P1 y no se
// implementa en este alcance, D-F2-19)
// ---------------------------------------------------------------------------

const rescheduleSchema = z.object({
  locationId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  newStartsAt: z.string().datetime(),
  newBarberId: z.string().uuid().optional(),
});

export async function rescheduleAppointmentAction(
  input: unknown,
): Promise<ActionResult<{ startsAt: string; endsAt: string; barberId: string }>> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }
  const { locationId, appointmentId, newStartsAt, newBarberId } = parsed.data;

  const scope = await requireLocationScope(locationId);

  try {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: appointments.id,
          locationId: appointments.locationId,
          chainId: appointments.chainId,
          barberId: appointments.barberId,
          serviceId: appointments.serviceId,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          status: appointments.status,
        })
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .limit(1);

      if (!current || current.locationId !== scope.locationId) {
        throw new Error("La cita no pertenece a esta sede.");
      }
      if (current.status === "completed" || current.status === "cancelled" || current.status === "no_show") {
        throw new Error("No se puede reprogramar una cita ya cerrada.");
      }

      assertCanActOnBarber(scope, current.barberId);
      const targetBarberId = newBarberId ?? current.barberId;
      if (targetBarberId !== current.barberId && scope.effectiveRole === "barber_assigned") {
        throw new Error("Solo un admin puede reasignar la cita a otro barbero.");
      }

      const effective = await resolveEffectiveServiceFor(scope.locationId, current.serviceId, targetBarberId);
      if (!effective) {
        throw new Error("Ese servicio no esta disponible en esta sede para ese barbero.");
      }

      const startsAt = new Date(newStartsAt);
      const endsAt = new Date(startsAt.getTime() + effective.durationMinutes * 60_000);

      const [conflict] = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.barberId, targetBarberId),
            ne(appointments.id, appointmentId),
            or(
              eq(appointments.status, "pending"),
              eq(appointments.status, "confirmed"),
              eq(appointments.status, "in_progress"),
            ),
            lt(appointments.startsAt, endsAt),
            gt(appointments.endsAt, startsAt),
          ),
        )
        .limit(1);

      if (conflict) {
        slotTakenError();
      }

      await tx
        .update(appointments)
        .set({ startsAt, endsAt, barberId: targetBarberId, updatedAt: new Date() })
        .where(eq(appointments.id, appointmentId));

      await writeAuditLog({
        chainId: current.chainId,
        locationId: scope.locationId,
        actorUserId: scope.userId,
        action: "appointment.reschedule",
        entity: "appointments",
        entityId: appointmentId,
        before: { startsAt: current.startsAt, endsAt: current.endsAt, barberId: current.barberId },
        after: { startsAt, endsAt, barberId: targetBarberId },
      });

      return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), barberId: targetBarberId };
    });

    return actionOk(result);
  } catch (err) {
    if (err instanceof SlotTakenError || isPgErrorCode(err, EXCLUSION_VIOLATION_CODE)) {
      return actionError(
        "Ese horario se acaba de ocupar. La cita se quedo donde estaba — elegi otro horario.",
      );
    }
    if (err instanceof Error) return actionError(err.message);
    return actionError("No se pudo reprogramar la cita.");
  }
}

// ---------------------------------------------------------------------------
// Busqueda de clientes para el paso "elegir cliente existente" de F2-08.
// ---------------------------------------------------------------------------

const searchClientsSchema = z.object({
  locationId: z.string().uuid(),
  query: z.string().trim().min(2).max(120),
});

export async function searchClientsAction(
  input: unknown,
): Promise<ActionResult<{ id: string; fullName: string; phone: string | null }[]>> {
  const parsed = searchClientsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }
  const scope = await requireLocationScope(parsed.data.locationId);

  const q = `%${parsed.data.query}%`;
  const rows = await db
    .select({ id: clients.id, fullName: clients.fullName, phone: clients.phone })
    .from(clients)
    .where(
      and(
        eq(clients.chainId, scope.chainId),
        or(ilike(clients.fullName, q), ilike(clients.phone, q)),
      ),
    )
    .limit(10);

  return actionOk(rows);
}
