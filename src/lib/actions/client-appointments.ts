"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { appointments, chains, clients, locations, services, users } from "@/lib/db/schema";
import { requireClientScope } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/auth/audit";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";

/**
 * F2-14 · `(client)/appointments` — historial cross-sede del cliente
 * autenticado (guard `requireClientScope`, D-F2-16: gestion posterior de la
 * reserva solo disponible para el cliente con cuenta).
 */

export interface ClientAppointmentRow {
  id: string;
  locationName: string;
  serviceName: string;
  barberName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  source: string;
  priceAtBooking: string | null;
  chainCancellationHours: number | null;
}

/**
 * Trae TODAS las citas (pasadas y futuras) del `client` ligado al `user_id`
 * de la sesion, cruzando TODAS las cadenas donde exista (criterio §16.5: el
 * historial cross-sede nunca se oculta). Solo columnas necesarias para la
 * pantalla — nunca `select *` sobre `clients`.
 */
export async function getMyAppointments(): Promise<ClientAppointmentRow[]> {
  const scope = await requireClientScope();

  const myClients = await db
    .select({ id: clients.id, chainId: clients.chainId })
    .from(clients)
    .where(eq(clients.userId, scope.userId));

  if (myClients.length === 0) return [];
  const clientIds = myClients.map((c) => c.id);
  const chainIds = Array.from(new Set(myClients.map((c) => c.chainId)));

  const chainRows = await db
    .select({ id: chains.id, cancellationHours: chains.cancellationHours })
    .from(chains)
    .where(inArray(chains.id, chainIds));
  const chainCancellationByChain = new Map(chainRows.map((r) => [r.id, r.cancellationHours]));

  const rows = await db
    .select({
      id: appointments.id,
      chainId: appointments.chainId,
      clientId: appointments.clientId,
      locationName: locations.name,
      serviceName: services.name,
      barberName: users.fullName,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      source: appointments.source,
      priceAtBooking: appointments.priceAtBooking,
    })
    .from(appointments)
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(users, eq(users.id, appointments.barberId))
    .where(inArray(appointments.clientId, clientIds))
    .orderBy(desc(appointments.startsAt));

  return rows.map((r) => ({
      id: r.id,
      locationName: r.locationName,
      serviceName: r.serviceName,
      barberName: r.barberName ?? "Barbero",
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      status: r.status,
      source: r.source,
      priceAtBooking: r.priceAtBooking,
      chainCancellationHours: chainCancellationByChain.get(r.chainId) ?? null,
    }));
}

const cancelSchema = z.object({ appointmentId: z.string().uuid() });

export async function cancelMyAppointmentAction(
  input: unknown,
): Promise<ActionResult<{ status: string }>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos invalidos.");

  const scope = await requireClientScope();

  try {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: appointments.id,
          chainId: appointments.chainId,
          locationId: appointments.locationId,
          clientId: appointments.clientId,
          status: appointments.status,
          startsAt: appointments.startsAt,
        })
        .from(appointments)
        .where(eq(appointments.id, parsed.data.appointmentId))
        .limit(1);

      if (!current) throw new Error("La cita no existe.");

      const [owningClient] = await tx
        .select({ id: clients.id, userId: clients.userId })
        .from(clients)
        .where(eq(clients.id, current.clientId))
        .limit(1);

      if (!owningClient || owningClient.userId !== scope.userId) {
        throw new Error("Esta cita no te pertenece.");
      }

      if (current.status !== "pending" && current.status !== "confirmed") {
        throw new Error("Esta cita ya no se puede cancelar.");
      }

      const [chain] = await tx
        .select({ cancellationHours: chains.cancellationHours })
        .from(chains)
        .where(eq(chains.id, current.chainId))
        .limit(1);

      const cancellationHours = chain?.cancellationHours ?? 2; // D-F2-2: default 2h si es null
      const hoursUntilStart = (current.startsAt.getTime() - Date.now()) / (1000 * 60 * 60);

      if (hoursUntilStart < cancellationHours) {
        throw new Error(
          `Faltan ${hoursUntilStart.toFixed(1)} h; esta cadena permite cancelar hasta ${cancellationHours} h antes.`,
        );
      }

      await tx
        .update(appointments)
        .set({ status: "cancelled", cancellationReason: "Cancelada por el cliente", updatedAt: new Date() })
        .where(eq(appointments.id, current.id));

      await writeAuditLog({
        chainId: current.chainId,
        locationId: current.locationId,
        actorUserId: scope.userId,
        action: "appointment.cancel_client",
        entity: "appointments",
        entityId: current.id,
        before: { status: current.status },
        after: { status: "cancelled" },
      });

      return { status: "cancelled" };
    });

    return actionOk(result);
  } catch (err) {
    if (err instanceof Error) return actionError(err.message);
    return actionError("No se pudo cancelar la cita.");
  }
}
