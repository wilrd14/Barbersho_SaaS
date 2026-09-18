"use server";

/**
 * F2-16 · Server Actions de La Fila (walk_in_queue).
 *
 * Patron obligatorio (regla dura #1): Zod -> guard de sede -> transaccion ->
 * `ActionResult`. `chainId` sale SIEMPRE de `requireLocationScope`, nunca del
 * input. Reutiliza `src/lib/queue` (puro) para la renumeracion FIFO (D-F2-6)
 * y el calculo de ETA (D-F2-7) — esta capa solo carga datos y persiste.
 *
 * Decisiones tecnicas tomadas aqui que el backlog no cerraba explicitamente
 * (documentadas tambien en el reporte de handback):
 *
 * 1. `joinQueue` siempre resuelve un `clients.id` (match por telefono dentro
 *    de la cadena, o crea uno nuevo), igual que D-F2-15 de la reserva
 *    publica. `walk_in_queue.client_name_temp`/`phone` se guardan ademas
 *    como snapshot de exhibicion (para no depender de un join en cada
 *    lectura), pero `client_id` nunca queda null. Esto es necesario porque
 *    `appointments.client_id` es NOT NULL y `startServing` (D-F2-8) crea una
 *    cita dentro de la misma transaccion — sin esto, un turno sin cuenta no
 *    podria pasar a "atendiendo".
 * 2. En `startServing`, si se elige un barbero distinto al preferido (o no
 *    habia preferido), `walk_in_queue.preferred_barber_id` se sobrescribe
 *    con el barbero que efectivamente atiende. Es la unica columna
 *    disponible para saber, sin la FK que D-F2-8 explicitamente no agrega,
 *    quien esta atendiendo cada turno "serving" (usado por la seccion
 *    "Atendiendo ahora").
 * 3. La duracion efectiva de un ticket para el calculo de ETA (D-F2-7) NO se
 *    congela en `joinQueue`: se resuelve en cada recalculo (`recalcQueueState`)
 *    a partir de `serviceId`/`preferredBarberId` vigentes, porque
 *    `walk_in_queue` no tiene columna de duracion y D-F2-1 no dice que deba
 *    congelarse para la fila (a diferencia del precio de una venta).
 */

import { z } from "zod";

import { zUuid } from "@/lib/validation/id";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { requireLocationScope } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/auth/audit";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";
import {
  barberLocations,
  barberServices,
  clients,
  locationServiceOverrides,
  locations,
  services,
  timeOff,
  users,
  walkInQueue,
  appointments,
  schedules,
} from "@/lib/db/schema";
import {
  isValidQueueTransition,
  recomputeEtasForQueue,
  renumberQueue,
  type AvailableBarber,
  type QueueTicket,
  type QueueTicketStatus,
} from "@/lib/queue";

type QueueTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | QueueTx;

// ---------------------------------------------------------------------------
// Helpers internos (no exportados) — resolucion de servicio y disponibilidad
// ---------------------------------------------------------------------------

class ServiceNotOfferedError extends Error {}

/** D-F2-1: precedencia de duracion y precio efectivos. */
async function resolveServiceEffective(
  tx: DbOrTx,
  params: { serviceId: string; locationId: string; barberId?: string | null },
) {
  const { serviceId, locationId, barberId } = params;

  const [service] = await tx
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!service) throw new ServiceNotOfferedError("Servicio no encontrado.");

  const [override] = await tx
    .select()
    .from(locationServiceOverrides)
    .where(
      and(
        eq(locationServiceOverrides.locationId, locationId),
        eq(locationServiceOverrides.serviceId, serviceId),
      ),
    )
    .limit(1);

  if (override && override.isActive === false) {
    throw new ServiceNotOfferedError("Este servicio no esta disponible en esta sede.");
  }

  let durationMinutes = override?.durationMinutes ?? service.defaultDurationMinutes;
  const price = override?.price ?? service.defaultPrice;

  if (barberId) {
    const [bs] = await tx
      .select()
      .from(barberServices)
      .where(and(eq(barberServices.userId, barberId), eq(barberServices.serviceId, serviceId)))
      .limit(1);
    if (bs?.customDuration) durationMinutes = bs.customDuration;
  }

  return { durationMinutes, price };
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** dia de semana (0=domingo) y minutos desde medianoche, en la tz de la sede. */
function getLocationLocalNow(timezone: string, now: Date) {
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayISO = dateFmt.format(now);
  const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayOfWeek = WEEKDAY_TO_INDEX[weekdayFmt.format(now)];

  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = timeFmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  const minute = Number(parts.find((p) => p.type === "minute")!.value);

  void todayISO;
  return { dayOfWeek, minutesSinceMidnight: hour * 60 + minute };
}

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** D-F2-7 `barberosDisponibles(sede, ahora)`. */
async function getAvailableBarbers(
  tx: DbOrTx,
  locationId: string,
  timezone: string,
  now: Date,
): Promise<AvailableBarber[]> {
  const activeBarberRows = await tx
    .select({ userId: barberLocations.userId })
    .from(barberLocations)
    .where(and(eq(barberLocations.locationId, locationId), eq(barberLocations.isActive, true)));

  if (activeBarberRows.length === 0) return [];
  const barberIds = activeBarberRows.map((r) => r.userId);

  const { dayOfWeek, minutesSinceMidnight } = getLocationLocalNow(timezone, now);

  const scheduleRows = await tx
    .select({ userId: schedules.userId, startTime: schedules.startTime, endTime: schedules.endTime })
    .from(schedules)
    .where(
      and(
        eq(schedules.locationId, locationId),
        eq(schedules.dayOfWeek, dayOfWeek),
        eq(schedules.isActive, true),
        inArray(schedules.userId, barberIds),
      ),
    );

  const scheduledNow = new Set(
    scheduleRows
      .filter((s) => {
        const start = parseTimeToMinutes(s.startTime);
        const end = parseTimeToMinutes(s.endTime);
        return start <= minutesSinceMidnight && minutesSinceMidnight < end;
      })
      .map((s) => s.userId),
  );

  if (scheduledNow.size === 0) return [];

  const timeOffRows = await tx
    .select({ userId: timeOff.userId })
    .from(timeOff)
    .where(
      and(
        eq(timeOff.status, "approved"),
        inArray(timeOff.userId, [...scheduledNow]),
        sql`${timeOff.startsAt} <= ${now}`,
        sql`${timeOff.endsAt} >= ${now}`,
      ),
    );
  const onTimeOff = new Set(timeOffRows.map((r) => r.userId));

  const availableBarberIds = [...scheduledNow].filter((id) => !onTimeOff.has(id));
  if (availableBarberIds.length === 0) return [];

  const inProgressRows = await tx
    .select({ barberId: appointments.barberId, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.locationId, locationId),
        eq(appointments.status, "in_progress"),
        inArray(appointments.barberId, availableBarberIds),
      ),
    );

  const remainingByBarber = new Map<string, number>();
  for (const row of inProgressRows) {
    const remaining = Math.max(0, Math.ceil((row.endsAt.getTime() - now.getTime()) / 60_000));
    const prev = remainingByBarber.get(row.barberId);
    if (prev === undefined || remaining > prev) remainingByBarber.set(row.barberId, remaining);
  }

  return availableBarberIds.map((barberId) => ({
    barberId,
    minutesRemainingCurrentService: remainingByBarber.get(barberId) ?? null,
  }));
}

/** Normalizacion minima de telefono para el match `(chain_id, phone)`. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  return digits;
}

async function resolveClientId(
  tx: DbOrTx,
  params: { chainId: string; clientId?: string | null; fullName?: string; phone?: string },
): Promise<string> {
  const { chainId, clientId, fullName, phone } = params;
  if (clientId) return clientId;

  const normalizedPhone = phone ? normalizePhone(phone) : null;

  if (normalizedPhone) {
    const [existing] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.chainId, chainId), eq(clients.phone, normalizedPhone)))
      .limit(1);
    if (existing) return existing.id;
  }

  const [created] = await tx
    .insert(clients)
    .values({
      chainId,
      fullName: fullName?.trim() || "Cliente sin nombre",
      phone: normalizedPhone,
    })
    .returning({ id: clients.id });

  return created.id;
}

/**
 * D-F2-6/D-F2-7 en bloque, dentro de la misma transaccion de cada escritura
 * de la fila: renumera `position` de los `waiting` y recalcula
 * `estimated_wait_minutes` de todos ellos.
 */
async function recalcQueueState(tx: DbOrTx, locationId: string, now: Date) {
  const [location] = await tx
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  const timezone = location?.timezone ?? "America/Santo_Domingo";

  const waitingRows = await tx
    .select({
      id: walkInQueue.id,
      joinedAt: walkInQueue.joinedAt,
      preferredBarberId: walkInQueue.preferredBarberId,
      serviceId: walkInQueue.serviceId,
    })
    .from(walkInQueue)
    .where(and(eq(walkInQueue.locationId, locationId), eq(walkInQueue.status, "waiting")))
    .orderBy(asc(walkInQueue.joinedAt));

  const durationCache = new Map<string, number>();
  const tickets: QueueTicket[] = [];
  for (const row of waitingRows) {
    const cacheKey = `${row.serviceId}:${row.preferredBarberId ?? ""}`;
    let duration = durationCache.get(cacheKey);
    if (duration === undefined) {
      try {
        const resolved = await resolveServiceEffective(tx, {
          serviceId: row.serviceId,
          locationId,
          barberId: row.preferredBarberId,
        });
        duration = resolved.durationMinutes;
      } catch {
        duration = 30; // fallback defensivo: no deja de renumerar la fila por un dato inconsistente.
      }
      durationCache.set(cacheKey, duration);
    }
    tickets.push({
      id: row.id,
      status: "waiting",
      joinedAt: row.joinedAt,
      preferredBarberId: row.preferredBarberId,
      serviceDurationMinutes: duration,
    });
  }

  const availableBarbers = await getAvailableBarbers(tx, locationId, timezone, now);
  const positions = renumberQueue(tickets);
  const etas = recomputeEtasForQueue({ waitingTickets: tickets, availableBarbers });

  const positionByTicket = new Map(positions.map((p) => [p.ticketId, p.position]));
  for (const ticket of tickets) {
    await tx
      .update(walkInQueue)
      .set({
        position: positionByTicket.get(ticket.id) ?? null,
        estimatedWaitMinutes: etas.get(ticket.id) ?? null,
      })
      .where(eq(walkInQueue.id, ticket.id));
  }
}

async function getTicketOrThrow(tx: DbOrTx, ticketId: string) {
  const [ticket] = await tx
    .select()
    .from(walkInQueue)
    .where(eq(walkInQueue.id, ticketId))
    .limit(1);
  if (!ticket) throw new Error("El turno no existe o ya fue eliminado.");
  return ticket;
}

function assertTransition(from: QueueTicketStatus, to: QueueTicketStatus) {
  if (!isValidQueueTransition(from, to)) {
    throw new Error(`No se puede pasar un turno de "${from}" a "${to}".`);
  }
}

// ---------------------------------------------------------------------------
// joinQueue — F2-16
// ---------------------------------------------------------------------------

const joinQueueSchema = z
  .object({
    locationId: zUuid,
    serviceId: zUuid,
    preferredBarberId: zUuid.optional(),
    clientId: zUuid.optional(),
    clientNameTemp: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(6).max(20).optional(),
  })
  .refine((v) => Boolean(v.clientId || v.clientNameTemp), {
    message: "Se necesita un cliente existente o un nombre para el walk-in.",
    path: ["clientNameTemp"],
  });

export async function joinQueue(
  input: unknown,
): Promise<ActionResult<{ ticketId: string }>> {
  const parsed = joinQueueSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }
  const data = parsed.data;

  const { chainId, locationId } = await requireLocationScope(data.locationId);

  try {
    const ticketId = await db.transaction(async (tx) => {
      // Re-verifica que el servicio se ofrezca en esta sede (D-F2-1) antes de crear el turno.
      await resolveServiceEffective(tx, {
        serviceId: data.serviceId,
        locationId,
        barberId: data.preferredBarberId ?? null,
      });

      const resolvedClientId = await resolveClientId(tx, {
        chainId,
        clientId: data.clientId,
        fullName: data.clientNameTemp,
        phone: data.phone,
      });

      const [inserted] = await tx
        .insert(walkInQueue)
        .values({
          locationId,
          clientId: resolvedClientId,
          clientNameTemp: data.clientNameTemp ?? null,
          phone: data.phone ? normalizePhone(data.phone) : null,
          serviceId: data.serviceId,
          preferredBarberId: data.preferredBarberId ?? null,
          status: "waiting",
        })
        .returning({ id: walkInQueue.id });

      await recalcQueueState(tx, locationId, new Date());

      return inserted.id;
    });

    return actionOk({ ticketId });
  } catch (error) {
    if (error instanceof ServiceNotOfferedError) return actionError(error.message);
    return actionError(
      error instanceof Error ? error.message : "No se pudo dar el turno. Intenta de nuevo.",
    );
  }
}

// ---------------------------------------------------------------------------
// callTicket — F2-16
// ---------------------------------------------------------------------------

const ticketIdSchema = z.object({ ticketId: zUuid });

export async function callTicket(input: unknown): Promise<ActionResult<{ ticketId: string }>> {
  const parsed = ticketIdSchema.safeParse(input);
  if (!parsed.success) return actionError("Turno invalido.");

  try {
    const ticketId = await db.transaction(async (tx) => {
      const ticket = await getTicketOrThrow(tx, parsed.data.ticketId);
      await requireLocationScope(ticket.locationId);
      assertTransition(ticket.status, "called");

      await tx
        .update(walkInQueue)
        .set({ status: "called", calledAt: new Date() })
        .where(eq(walkInQueue.id, ticket.id));

      await recalcQueueState(tx, ticket.locationId, new Date());
      return ticket.id;
    });

    return actionOk({ ticketId });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudo llamar el turno.");
  }
}

// ---------------------------------------------------------------------------
// startServing — F2-16 + D-F2-8 (crea la cita)
// ---------------------------------------------------------------------------

const startServingSchema = z.object({
  ticketId: zUuid,
  barberId: zUuid.optional(),
});

export async function startServing(
  input: unknown,
): Promise<ActionResult<{ ticketId: string; appointmentId: string }>> {
  const parsed = startServingSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos invalidos.");

  try {
    const result = await db.transaction(async (tx) => {
      const ticket = await getTicketOrThrow(tx, parsed.data.ticketId);
      const { chainId, locationId } = await requireLocationScope(ticket.locationId);
      assertTransition(ticket.status, "serving");

      const barberId = parsed.data.barberId ?? ticket.preferredBarberId;
      if (!barberId) {
        throw new Error("Selecciona un barbero para atender este turno.");
      }
      if (!ticket.clientId) {
        // No deberia ocurrir tras la decision de joinQueue (siempre resuelve
        // client_id), pero se deja el mensaje explicito por si el dato es
        // legado de antes de esta decision.
        throw new Error("Este turno no tiene un cliente asociado.");
      }

      const { durationMinutes, price } = await resolveServiceEffective(tx, {
        serviceId: ticket.serviceId,
        locationId,
        barberId,
      });

      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

      let appointmentId: string;
      try {
        const [appointment] = await tx
          .insert(appointments)
          .values({
            chainId,
            locationId,
            clientId: ticket.clientId,
            barberId,
            serviceId: ticket.serviceId,
            startsAt,
            endsAt,
            status: "in_progress",
            source: "walk_in",
            priceAtBooking: price,
          })
          .returning({ id: appointments.id });
        appointmentId = appointment.id;
      } catch {
        // El EXCLUDE constraint (F2-01) rechaza solapamientos del mismo
        // barbero — nunca se expone el stack trace crudo (regla dura §3.7c).
        throw new Error(
          "Ese barbero tiene una cita reservada en este momento — elige otro barbero o cierra la cita en curso.",
        );
      }

      await tx
        .update(walkInQueue)
        .set({ status: "serving", preferredBarberId: barberId })
        .where(eq(walkInQueue.id, ticket.id));

      await writeAuditLog({
        chainId,
        locationId,
        actorUserId: null,
        action: "queue.serve",
        entity: "appointments",
        entityId: appointmentId,
        after: { ticketId: ticket.id, barberId, startsAt, endsAt },
      }, tx);

      await recalcQueueState(tx, locationId, new Date());

      return { ticketId: ticket.id, appointmentId };
    });

    return actionOk(result);
  } catch (error) {
    return actionError(
      error instanceof Error ? error.message : "No se pudo iniciar la atencion del turno.",
    );
  }
}

// ---------------------------------------------------------------------------
// markDone — F2-16
// ---------------------------------------------------------------------------

export async function markDone(input: unknown): Promise<ActionResult<{ ticketId: string }>> {
  const parsed = ticketIdSchema.safeParse(input);
  if (!parsed.success) return actionError("Turno invalido.");

  try {
    const ticketId = await db.transaction(async (tx) => {
      const ticket = await getTicketOrThrow(tx, parsed.data.ticketId);
      await requireLocationScope(ticket.locationId);
      assertTransition(ticket.status, "done");

      await tx.update(walkInQueue).set({ status: "done" }).where(eq(walkInQueue.id, ticket.id));
      await recalcQueueState(tx, ticket.locationId, new Date());
      return ticket.id;
    });

    return actionOk({ ticketId });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudo cerrar el turno.");
  }
}

// ---------------------------------------------------------------------------
// markLeft — F2-16 (intervencion manual -> audit_log)
// ---------------------------------------------------------------------------

const markLeftSchema = z.object({
  ticketId: zUuid,
  reason: z.string().trim().max(280).optional(),
});

export async function markLeft(input: unknown): Promise<ActionResult<{ ticketId: string }>> {
  const parsed = markLeftSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos invalidos.");

  try {
    const ticketId = await db.transaction(async (tx) => {
      const ticket = await getTicketOrThrow(tx, parsed.data.ticketId);
      const { chainId, locationId, userId } = await requireLocationScope(ticket.locationId);
      assertTransition(ticket.status, "left");

      const before = { status: ticket.status };
      await tx.update(walkInQueue).set({ status: "left" }).where(eq(walkInQueue.id, ticket.id));

      await writeAuditLog({
        chainId,
        locationId,
        actorUserId: userId,
        action: "queue.leave",
        entity: "walk_in_queue",
        entityId: ticket.id,
        before,
        after: { status: "left", reason: parsed.data.reason ?? null },
      }, tx);

      await recalcQueueState(tx, locationId, new Date());
      return ticket.id;
    });

    return actionOk({ ticketId });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudo marcar el turno.");
  }
}

// ---------------------------------------------------------------------------
// reassignBarber — F2-16 (intervencion manual -> audit_log)
// ---------------------------------------------------------------------------

const reassignBarberSchema = z.object({
  ticketId: zUuid,
  barberId: zUuid,
});

export async function reassignBarber(
  input: unknown,
): Promise<ActionResult<{ ticketId: string }>> {
  const parsed = reassignBarberSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos invalidos.");

  try {
    const ticketId = await db.transaction(async (tx) => {
      const ticket = await getTicketOrThrow(tx, parsed.data.ticketId);
      const { chainId, locationId, userId } = await requireLocationScope(ticket.locationId);

      if (ticket.status !== "waiting" && ticket.status !== "called") {
        throw new Error("Solo se puede reasignar barbero a un turno en espera o llamado.");
      }

      const before = { preferredBarberId: ticket.preferredBarberId };
      await tx
        .update(walkInQueue)
        .set({ preferredBarberId: parsed.data.barberId })
        .where(eq(walkInQueue.id, ticket.id));

      await writeAuditLog({
        chainId,
        locationId,
        actorUserId: userId,
        action: "queue.reassign_barber",
        entity: "walk_in_queue",
        entityId: ticket.id,
        before,
        after: { preferredBarberId: parsed.data.barberId },
      }, tx);

      await recalcQueueState(tx, locationId, new Date());
      return ticket.id;
    });

    return actionOk({ ticketId });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudo reasignar el barbero.");
  }
}

// ---------------------------------------------------------------------------
// Lectura — usada por el Server Component inicial y por el refetch de
// Realtime en el cliente (F2-17, riesgo D: refetch completo al reconectar).
// ---------------------------------------------------------------------------

export type QueueDisplayTicket = {
  id: string;
  status: "waiting" | "called" | "serving";
  position: number | null;
  joinedAt: string;
  estimatedWaitMinutes: number | null;
  clientName: string;
  serviceName: string;
  preferredBarberId: string | null;
  preferredBarberName: string | null;
};

export type QueueSnapshot = {
  waiting: QueueDisplayTicket[];
  called: QueueDisplayTicket[];
  serving: QueueDisplayTicket[];
  activeBarbers: { id: string; fullName: string }[];
};

export async function loadQueueSnapshot(locationId: string): Promise<QueueSnapshot> {
  const rows = await db
    .select({
      id: walkInQueue.id,
      status: walkInQueue.status,
      position: walkInQueue.position,
      joinedAt: walkInQueue.joinedAt,
      estimatedWaitMinutes: walkInQueue.estimatedWaitMinutes,
      clientNameTemp: walkInQueue.clientNameTemp,
      clientId: walkInQueue.clientId,
      preferredBarberId: walkInQueue.preferredBarberId,
      serviceId: walkInQueue.serviceId,
    })
    .from(walkInQueue)
    .where(
      and(eq(walkInQueue.locationId, locationId), inArray(walkInQueue.status, ["waiting", "called", "serving"])),
    )
    .orderBy(asc(walkInQueue.joinedAt));

  const clientIds = [...new Set(rows.map((r) => r.clientId).filter((v): v is string => Boolean(v)))];
  const barberIds = [
    ...new Set(rows.map((r) => r.preferredBarberId).filter((v): v is string => Boolean(v))),
  ];
  const serviceIds = [...new Set(rows.map((r) => r.serviceId))];

  const [clientRows, barberRows, serviceRows, activeBarberRows] = await Promise.all([
    clientIds.length
      ? db.select({ id: clients.id, fullName: clients.fullName }).from(clients).where(inArray(clients.id, clientIds))
      : Promise.resolve([]),
    barberIds.length
      ? db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, barberIds))
      : Promise.resolve([]),
    serviceIds.length
      ? db.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, serviceIds))
      : Promise.resolve([]),
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(barberLocations)
      .innerJoin(users, eq(users.id, barberLocations.userId))
      .where(and(eq(barberLocations.locationId, locationId), eq(barberLocations.isActive, true))),
  ]);

  const clientNameById = new Map(clientRows.map((c) => [c.id, c.fullName]));
  const barberNameById = new Map(barberRows.map((b) => [b.id, b.fullName ?? "Sin nombre"]));
  const serviceNameById = new Map(serviceRows.map((s) => [s.id, s.name]));

  const toDisplay = (row: (typeof rows)[number]): QueueDisplayTicket => ({
    id: row.id,
    status: row.status as "waiting" | "called" | "serving",
    position: row.position,
    joinedAt: row.joinedAt.toISOString(),
    estimatedWaitMinutes: row.estimatedWaitMinutes,
    clientName:
      (row.clientId ? clientNameById.get(row.clientId) : null) ?? row.clientNameTemp ?? "Cliente",
    serviceName: serviceNameById.get(row.serviceId) ?? "Servicio",
    preferredBarberId: row.preferredBarberId,
    preferredBarberName: row.preferredBarberId
      ? barberNameById.get(row.preferredBarberId) ?? null
      : null,
  });

  return {
    waiting: rows.filter((r) => r.status === "waiting").map(toDisplay),
    called: rows.filter((r) => r.status === "called").map(toDisplay),
    serving: rows.filter((r) => r.status === "serving").map(toDisplay),
    activeBarbers: activeBarberRows.map((b) => ({ id: b.id, fullName: b.fullName ?? "Sin nombre" })),
  };
}

const locationIdSchema = z.object({ locationId: zUuid });

/**
 * Wrapper con guard, pensado para llamarse desde el cliente (carga inicial
 * ya la hace el Server Component directo; esta version la usa
 * `QueueRealtimeList` para el refetch completo al reconectar / tras cada
 * evento de Realtime).
 */
export async function getQueueSnapshotAction(
  input: unknown,
): Promise<ActionResult<QueueSnapshot>> {
  const parsed = locationIdSchema.safeParse(input);
  if (!parsed.success) return actionError("Sede invalida.");

  const { locationId } = await requireLocationScope(parsed.data.locationId);
  const snapshot = await loadQueueSnapshot(locationId);
  return actionOk(snapshot);
}

// ---------------------------------------------------------------------------
// "Atendiendo ahora" — F2-18. Barberos activos de la sede y, si estan
// atendiendo, la cita `in_progress` que los ocupa ahora mismo (con rango
// horario). No se limita a citas creadas por la fila (D-F2-8): cualquier
// cita `in_progress` de esa sede cuenta, sea `source = 'walk_in'` o una cita
// reservada que el gerente marco "iniciar" desde la agenda (Bloque B).
// ---------------------------------------------------------------------------

export type AttendingNowEntry = {
  barberId: string;
  barberName: string;
  appointmentId: string | null;
  clientName: string | null;
  serviceName: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export async function loadAttendingNow(locationId: string): Promise<AttendingNowEntry[]> {
  const [activeBarberRows, inProgressRows] = await Promise.all([
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(barberLocations)
      .innerJoin(users, eq(users.id, barberLocations.userId))
      .where(and(eq(barberLocations.locationId, locationId), eq(barberLocations.isActive, true))),
    db
      .select({
        appointmentId: appointments.id,
        barberId: appointments.barberId,
        clientId: appointments.clientId,
        serviceId: appointments.serviceId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
      })
      .from(appointments)
      .where(and(eq(appointments.locationId, locationId), eq(appointments.status, "in_progress"))),
  ]);

  const clientIds = [...new Set(inProgressRows.map((r) => r.clientId))];
  const serviceIds = [...new Set(inProgressRows.map((r) => r.serviceId))];

  const [clientRows, serviceRows] = await Promise.all([
    clientIds.length
      ? db.select({ id: clients.id, fullName: clients.fullName }).from(clients).where(inArray(clients.id, clientIds))
      : Promise.resolve([]),
    serviceIds.length
      ? db.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, serviceIds))
      : Promise.resolve([]),
  ]);
  const clientNameById = new Map(clientRows.map((c) => [c.id, c.fullName]));
  const serviceNameById = new Map(serviceRows.map((s) => [s.id, s.name]));
  const byBarber = new Map(inProgressRows.map((r) => [r.barberId, r]));

  return activeBarberRows.map((barber) => {
    const row = byBarber.get(barber.id);
    return {
      barberId: barber.id,
      barberName: barber.fullName ?? "Sin nombre",
      appointmentId: row?.appointmentId ?? null,
      clientName: row ? clientNameById.get(row.clientId) ?? "Cliente" : null,
      serviceName: row ? serviceNameById.get(row.serviceId) ?? null : null,
      startsAt: row ? row.startsAt.toISOString() : null,
      endsAt: row ? row.endsAt.toISOString() : null,
    };
  });
}

export async function getAttendingNowAction(
  input: unknown,
): Promise<ActionResult<AttendingNowEntry[]>> {
  const parsed = locationIdSchema.safeParse(input);
  if (!parsed.success) return actionError("Sede invalida.");

  const { locationId } = await requireLocationScope(parsed.data.locationId);
  const entries = await loadAttendingNow(locationId);
  return actionOk(entries);
}

/** Catalogo de servicios y barberos activos de la sede, para el formulario "Dar turno". */
export async function getQueueIntakeOptionsAction(
  input: unknown,
): Promise<ActionResult<{ services: { id: string; name: string }[]; barbers: { id: string; fullName: string }[] }>> {
  const parsed = locationIdSchema.safeParse(input);
  if (!parsed.success) return actionError("Sede invalida.");

  const { locationId } = await requireLocationScope(parsed.data.locationId);

  const [serviceRows, barberRows] = await Promise.all([
    db
      .select({ id: services.id, name: services.name, overrideActive: locationServiceOverrides.isActive })
      .from(services)
      .leftJoin(
        locationServiceOverrides,
        and(
          eq(locationServiceOverrides.serviceId, services.id),
          eq(locationServiceOverrides.locationId, locationId),
        ),
      )
      .where(eq(services.isActive, true)),
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(barberLocations)
      .innerJoin(users, eq(users.id, barberLocations.userId))
      .where(and(eq(barberLocations.locationId, locationId), eq(barberLocations.isActive, true))),
  ]);

  return actionOk({
    services: serviceRows
      .filter((s) => s.overrideActive !== false)
      .map((s) => ({ id: s.id, name: s.name })),
    barbers: barberRows.map((b) => ({ id: b.id, fullName: b.fullName ?? "Sin nombre" })),
  });
}
