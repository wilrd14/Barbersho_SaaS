"use server";

import { and, count, eq, gt, lt, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { appointments, chains, clients, locations } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/auth/audit";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";
import { getAvailability, resolveEffectiveServiceFor } from "@/lib/scheduling/availability";
import {
  getLocationCatalog,
  getLocationBarbers,
  findClientHistoryByPhone,
  RESERVED_CHAIN_SLUGS,
} from "@/lib/public/directory";
import { normalizeDominicanPhone } from "@/lib/public/coverage";
import { zonedTimeToUtc } from "@/lib/public/time";

/**
 * F2-12/F2-13 · Server Actions de la superficie publica de reserva.
 *
 * Regla dura §3.5: nunca `supabase-js` anonimo — todo Drizzle en servidor,
 * columnas en lista blanca. `chainId`/`locationId` siempre se resuelven
 * puertas adentro (por slug/uuid verificado contra la DB), nunca se confia
 * en un `chainId` que venga del cliente.
 */

const EXCLUSION_VIOLATION_CODE = "23P01";
const LEAD_TIME_MINUTES = 30; // D-F2-2, debe coincidir con availability.ts
const HORIZON_DAYS = 30; // D-F2-2
const MAX_ACTIVE_APPOINTMENTS_PER_PHONE = 3; // D-F2-17

function isPgErrorCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === code;
}

class SlotTakenError extends Error {}
class LimitReachedError extends Error {}

async function resolveChainIdBySlug(slug: string): Promise<string | null> {
  if (RESERVED_CHAIN_SLUGS.has(slug)) return null;
  const [row] = await db.select({ id: chains.id }).from(chains).where(eq(chains.slug, slug)).limit(1);
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// Lecturas (llamadas desde el wizard cliente a medida que avanza de paso)
// ---------------------------------------------------------------------------

const catalogSchema = z.object({ locationId: z.string().uuid() });

export async function getLocationCatalogAction(
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof getLocationCatalog>>>> {
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos invalidos.");
  const rows = await getLocationCatalog(parsed.data.locationId);
  return actionOk(rows);
}

export async function getLocationBarbersAction(
  input: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof getLocationBarbers>>>> {
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos invalidos.");
  const rows = await getLocationBarbers(parsed.data.locationId);
  return actionOk(rows);
}

const availabilitySchema = z.object({
  locationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  barberId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface BookingSlot {
  slotStartMinutes: number;
  barberId: string;
  barberName: string;
}

export interface BookingAvailabilityResult {
  price: number;
  durationMinutes: number;
  /** Slots por barbero especifico (para cuando el cliente elige uno). */
  byBarber: { barberId: string; barberName: string; slotStartMinutes: number[] }[];
  /** Union de slots libres con "cualquier barbero", desempatado por nombre. */
  anyBarber: BookingSlot[];
}

export async function getBookingAvailabilityAction(
  input: unknown,
): Promise<ActionResult<BookingAvailabilityResult>> {
  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) return actionError("Datos invalidos.");
  const { locationId, serviceId, barberId, date } = parsed.data;

  const result = await getAvailability({
    locationId,
    serviceId,
    barberId,
    fromDate: date,
    toDate: date,
  });

  const dayEntries = result.days.filter((d) => d.date === date);
  if (dayEntries.length === 0) {
    return actionOk({ price: 0, durationMinutes: 0, byBarber: [], anyBarber: [] });
  }

  const byBarber = dayEntries
    .map((d) => ({ barberId: d.barberId, barberName: d.barberName, slotStartMinutes: d.slotStartMinutes }))
    .sort((a, b) => a.barberName.localeCompare(b.barberName));

  const anyByMinute = new Map<number, BookingSlot>();
  for (const entry of byBarber) {
    for (const minute of entry.slotStartMinutes) {
      if (!anyByMinute.has(minute)) {
        anyByMinute.set(minute, { slotStartMinutes: minute, barberId: entry.barberId, barberName: entry.barberName });
      }
    }
  }
  const anyBarber = Array.from(anyByMinute.values()).sort((a, b) => a.slotStartMinutes - b.slotStartMinutes);

  return actionOk({
    price: dayEntries[0]!.price,
    durationMinutes: dayEntries[0]!.durationMinutes,
    byBarber,
    anyBarber,
  });
}

const phoneLookupSchema = z.object({
  chainSlug: z.string().trim().min(1),
  phone: z.string().trim().min(6),
});

export interface ClientHistoryResult {
  found: boolean;
  fullName: string | null;
  lastVisitLabel: string | null;
}

/** Paso 4 del wizard: si el telefono coincide con un cliente de la cadena, muestra su historial breve (D-F2-15). */
export async function lookupClientHistoryAction(
  input: unknown,
): Promise<ActionResult<ClientHistoryResult>> {
  const parsed = phoneLookupSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos invalidos.");

  const chainId = await resolveChainIdBySlug(parsed.data.chainSlug);
  if (!chainId) return actionError("Cadena no encontrada.");

  const normalized = normalizeDominicanPhone(parsed.data.phone);
  if (!normalized) return actionOk({ found: false, fullName: null, lastVisitLabel: null });

  const history = await findClientHistoryByPhone(chainId, normalized);
  if (!history) return actionOk({ found: false, fullName: null, lastVisitLabel: null });

  return actionOk({ found: true, fullName: history.fullName, lastVisitLabel: history.lastVisitLabel });
}

// ---------------------------------------------------------------------------
// F2-13 · Escritura: crear la reserva publica
// ---------------------------------------------------------------------------

const createBookingSchema = z.object({
  chainSlug: z.string().trim().min(1),
  locationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  barberId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotStartMinutes: z.number().int().min(0).max(24 * 60 - 1),
  fullName: z.string().trim().min(2, "El nombre es obligatorio."),
  phone: z.string().trim().min(6, "El telefono es obligatorio."),
  email: z.string().trim().email("Correo invalido.").optional().or(z.literal("")),
});

export interface CreatePublicBookingResult {
  appointmentId: string;
  code: string;
  startsAt: string;
  endsAt: string;
}

export async function createPublicBookingAction(
  input: unknown,
): Promise<ActionResult<CreatePublicBookingResult>> {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }
  const data = parsed.data;

  const chainId = await resolveChainIdBySlug(data.chainSlug);
  if (!chainId) return actionError("Cadena no encontrada.");

  const [locationWithChain] = await db
    .select({ id: locations.id, chainId: locations.chainId, timezone: locations.timezone, isActive: locations.isActive })
    .from(locations)
    .where(eq(locations.id, data.locationId))
    .limit(1);

  if (!locationWithChain || locationWithChain.chainId !== chainId || !locationWithChain.isActive) {
    return actionError("Esa sede no esta disponible para reservar.");
  }

  const normalizedPhone = normalizeDominicanPhone(data.phone);
  if (!normalizedPhone) {
    return actionError("Telefono invalido. Formato RD: 809/829/849 seguido de 7 digitos.");
  }

  const effective = await resolveEffectiveServiceFor(data.locationId, data.serviceId, data.barberId);
  if (!effective) {
    return actionError("Ese servicio no esta disponible en esta sede.");
  }

  const startsAt = zonedTimeToUtc(data.date, data.slotStartMinutes, locationWithChain.timezone);
  const endsAt = new Date(startsAt.getTime() + effective.durationMinutes * 60_000);
  const now = new Date();

  // Re-verificacion de ventana (D-F2-2), defensa en servidor aunque el
  // wizard ya no ofrezca estos horarios en la UI (regla dura §3.7a/b).
  const minutesUntilStart = (startsAt.getTime() - now.getTime()) / 60_000;
  if (minutesUntilStart < LEAD_TIME_MINUTES) {
    return actionError("Ese horario ya esta muy cerca. Elegi uno con al menos 30 minutos de anticipacion.");
  }
  const daysUntilStart = minutesUntilStart / (60 * 24);
  if (daysUntilStart > HORIZON_DAYS) {
    return actionError("Esa fecha esta fuera del horizonte de reserva (30 dias).");
  }

  try {
    const result = await db.transaction(async (tx) => {
      // D-F2-15: match/creacion de cliente por (chain_id, phone).
      const [existingClient] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.chainId, chainId), eq(clients.phone, normalizedPhone)))
        .limit(1);

      let clientId = existingClient?.id ?? null;
      if (!clientId) {
        const [created] = await tx
          .insert(clients)
          .values({
            chainId,
            fullName: data.fullName,
            phone: normalizedPhone,
            email: data.email && data.email.length > 0 ? data.email : null,
          })
          .returning({ id: clients.id });
        clientId = created!.id;
      }

      // D-F2-17: maximo 3 citas activas futuras por telefono y por cadena.
      const [activeCount] = await tx
        .select({ value: count() })
        .from(appointments)
        .where(
          and(
            eq(appointments.chainId, chainId),
            eq(appointments.clientId, clientId),
            or(
              eq(appointments.status, "pending"),
              eq(appointments.status, "confirmed"),
              eq(appointments.status, "in_progress"),
            ),
            gt(appointments.startsAt, now),
          ),
        );

      if ((activeCount?.value ?? 0) >= MAX_ACTIVE_APPOINTMENTS_PER_PHONE) {
        throw new LimitReachedError();
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
        throw new SlotTakenError();
      }

      const [created] = await tx
        .insert(appointments)
        .values({
          chainId,
          locationId: data.locationId,
          clientId,
          barberId: data.barberId,
          serviceId: data.serviceId,
          startsAt,
          endsAt,
          status: "confirmed",
          source: "online",
          priceAtBooking: String(effective.price),
        })
        .returning({ id: appointments.id });

      await writeAuditLog({
        chainId,
        locationId: data.locationId,
        actorUserId: null,
        action: "appointment.book_public",
        entity: "appointments",
        entityId: created!.id,
        after: { clientId, barberId: data.barberId, serviceId: data.serviceId, startsAt, endsAt },
      });

      return {
        appointmentId: created!.id,
        code: created!.id.slice(0, 8).toUpperCase(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };
    });

    return actionOk(result);
  } catch (err) {
    if (err instanceof SlotTakenError || isPgErrorCode(err, EXCLUSION_VIOLATION_CODE)) {
      return actionError("Ese horario acaba de ocuparse. Elegi otro horario.");
    }
    if (err instanceof LimitReachedError) {
      return actionError(
        "Ya tenes 3 citas activas con este telefono en esta cadena. Cancela una antes de reservar otra.",
      );
    }
    if (err instanceof Error) return actionError(err.message);
    return actionError("No se pudo crear la reserva.");
  }
}
