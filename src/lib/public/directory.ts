import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  barberLocations,
  barberServices,
  chains,
  clients,
  appointments,
  locations,
  locationServiceOverrides,
  schedules,
  services,
  users,
} from "@/lib/db/schema";
import { resolveEffectiveService } from "@/lib/scheduling/effective-service";
import { formatWeekdayRanges } from "@/lib/public/coverage";

/**
 * F2-10/F2-11 · Lecturas publicas (Server Components), regla dura §3.5: la
 * superficie publica NUNCA usa `anon` de Supabase, se sirve con Drizzle desde
 * el servidor, seleccionando SIEMPRE listas blancas de columnas. Ningun
 * `select *` sobre `clients`/`users`/`sales` aqui.
 */

// Slugs reservados por el App Router / segmentos estaticos (D-F2-3): una
// cadena no puede llamarse asi. La validacion definitiva vive en el Zod del
// alta de cadena (onboarding, fuera de alcance de F2); esta lista es la
// defensa de lectura publica mientras tanto.
export const RESERVED_CHAIN_SLUGS = new Set([
  "book",
  "api",
  "login",
  "register",
  "sede",
  "admin",
  "_next",
]);

export interface PublicChain {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  allowCrossLocationBooking: boolean;
  cancellationHours: number | null;
}

export async function getChainBySlug(slug: string): Promise<PublicChain | null> {
  if (RESERVED_CHAIN_SLUGS.has(slug)) return null;

  const [row] = await db
    .select({
      id: chains.id,
      slug: chains.slug,
      name: chains.name,
      logoUrl: chains.logoUrl,
      primaryColor: chains.primaryColor,
      secondaryColor: chains.secondaryColor,
      allowCrossLocationBooking: chains.allowCrossLocationBooking,
      cancellationHours: chains.cancellationHours,
    })
    .from(chains)
    .where(eq(chains.slug, slug))
    .limit(1);

  return row ?? null;
}

export interface PublicLocationSummary {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  timezone: string;
  businessHours: unknown;
}

export async function getActiveLocationsForChain(
  chainId: string,
): Promise<PublicLocationSummary[]> {
  return db
    .select({
      id: locations.id,
      slug: locations.slug,
      name: locations.name,
      address: locations.address,
      city: locations.city,
      phone: locations.phone,
      timezone: locations.timezone,
      businessHours: locations.businessHours,
    })
    .from(locations)
    .where(and(eq(locations.chainId, chainId), eq(locations.isActive, true)));
}

export async function getActiveLocationBySlug(
  chainId: string,
  slug: string,
): Promise<PublicLocationSummary | null> {
  const [row] = await db
    .select({
      id: locations.id,
      slug: locations.slug,
      name: locations.name,
      address: locations.address,
      city: locations.city,
      phone: locations.phone,
      timezone: locations.timezone,
      businessHours: locations.businessHours,
    })
    .from(locations)
    .where(
      and(eq(locations.chainId, chainId), eq(locations.slug, slug), eq(locations.isActive, true)),
    )
    .limit(1);

  return row ?? null;
}

export interface PublicLocationService {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  price: number;
}

/** Catalogo con precio/duracion efectivos de ESA sede (D-F2-1, criterio 1.6). */
export async function getLocationCatalog(locationId: string): Promise<PublicLocationService[]> {
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      category: services.category,
      defaultDurationMinutes: services.defaultDurationMinutes,
      defaultPrice: services.defaultPrice,
      overrideDurationMinutes: locationServiceOverrides.durationMinutes,
      overridePrice: locationServiceOverrides.price,
      overrideIsActive: locationServiceOverrides.isActive,
    })
    .from(services)
    .leftJoin(
      locationServiceOverrides,
      and(
        eq(locationServiceOverrides.serviceId, services.id),
        eq(locationServiceOverrides.locationId, locationId),
      ),
    )
    .where(eq(services.isActive, true));

  const result: PublicLocationService[] = [];
  for (const row of rows) {
    const effective = resolveEffectiveService({
      defaultDurationMinutes: row.defaultDurationMinutes,
      defaultPrice: Number(row.defaultPrice),
      overrideDurationMinutes: row.overrideDurationMinutes,
      overridePrice: row.overridePrice ? Number(row.overridePrice) : null,
      overrideIsActive: row.overrideIsActive,
    });
    if (!effective) continue;
    result.push({ id: row.id, name: row.name, category: row.category, ...effective });
  }
  return result;
}

export interface PublicLocationBarber {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export async function getLocationBarbers(locationId: string): Promise<PublicLocationBarber[]> {
  const rows = await db
    .select({ id: barberLocations.userId, fullName: users.fullName, avatarUrl: users.avatarUrl })
    .from(barberLocations)
    .innerJoin(users, eq(users.id, barberLocations.userId))
    .where(and(eq(barberLocations.locationId, locationId), eq(barberLocations.isActive, true)));

  return rows.map((r) => ({ id: r.id, fullName: r.fullName ?? "Barbero", avatarUrl: r.avatarUrl }));
}

export interface PublicBarberProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  services: { id: string; name: string }[];
  coverage: { locationId: string; locationSlug: string; locationName: string; daysLabel: string }[];
}

/**
 * F2-11 · Perfil publico del barbero (D-F2-4: identificado por `users.id`,
 * sin columna de slug). 404 si no pertenece a la cadena o no tiene ninguna
 * asignacion activa (barbero inactivo/no existe en esta cadena).
 */
export async function getBarberPublicProfile(
  chainId: string,
  barberId: string,
): Promise<PublicBarberProfile | null> {
  const [barber] = await db
    .select({ id: users.id, fullName: users.fullName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, barberId))
    .limit(1);

  if (!barber) return null;

  const locationRows = await db
    .select({ locationId: barberLocations.locationId })
    .from(barberLocations)
    .where(and(eq(barberLocations.userId, barberId), eq(barberLocations.isActive, true)));

  if (locationRows.length === 0) return null;
  const locationIds = locationRows.map((r) => r.locationId);

  const scheduleRows = await db
    .select({
      locationId: schedules.locationId,
      locationSlug: locations.slug,
      locationName: locations.name,
      locationChainId: locations.chainId,
      locationIsActive: locations.isActive,
      dayOfWeek: schedules.dayOfWeek,
    })
    .from(schedules)
    .innerJoin(locations, eq(locations.id, schedules.locationId))
    .where(and(eq(schedules.userId, barberId), eq(schedules.isActive, true)));

  const chainScheduleRows = scheduleRows.filter(
    (r) => r.locationChainId === chainId && r.locationIsActive,
  );

  if (chainScheduleRows.length === 0) return null; // barbero de otra cadena o sin horario activo

  const daysByLocation = new Map<string, { name: string; slug: string; days: Set<number> }>();
  for (const row of chainScheduleRows) {
    if (!locationIds.includes(row.locationId)) continue;
    const entry = daysByLocation.get(row.locationId) ?? {
      name: row.locationName,
      slug: row.locationSlug,
      days: new Set<number>(),
    };
    entry.days.add(row.dayOfWeek);
    daysByLocation.set(row.locationId, entry);
  }

  const coverage = Array.from(daysByLocation.entries()).map(([locationId, entry]) => ({
    locationId,
    locationSlug: entry.slug,
    locationName: entry.name,
    daysLabel: formatWeekdayRanges(Array.from(entry.days)),
  }));

  const serviceRows = await db
    .select({ id: services.id, name: services.name })
    .from(barberServices)
    .innerJoin(services, eq(services.id, barberServices.serviceId))
    .where(and(eq(barberServices.userId, barberId), eq(services.isActive, true), eq(services.chainId, chainId)));

  return {
    id: barber.id,
    fullName: barber.fullName ?? "Barbero",
    avatarUrl: barber.avatarUrl,
    services: serviceRows,
    coverage,
  };
}

export interface ClientHistorySummary {
  clientId: string;
  fullName: string;
  lastVisitLabel: string | null;
}

/**
 * D-F2-15 · Match de cliente por telefono normalizado dentro de `(chain_id,
 * phone)`. Si hay match, arma el copy de historial breve ("Ultima visita:
 * hace 15 dias en Naco, Fade + barba") a partir de la ultima cita completada
 * o confirmada, cross-sede (D-F2-14: el historial nunca se oculta).
 */
export async function findClientHistoryByPhone(
  chainId: string,
  normalizedPhone: string,
): Promise<ClientHistorySummary | null> {
  const [client] = await db
    .select({ id: clients.id, fullName: clients.fullName })
    .from(clients)
    .where(and(eq(clients.chainId, chainId), eq(clients.phone, normalizedPhone)))
    .limit(1);

  if (!client) return null;

  const [lastVisit] = await db
    .select({
      startsAt: appointments.startsAt,
      locationName: locations.name,
      serviceName: services.name,
    })
    .from(appointments)
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(and(eq(appointments.clientId, client.id), eq(appointments.status, "completed")))
    .orderBy(desc(appointments.startsAt))
    .limit(1);

  let lastVisitLabel: string | null = null;
  if (lastVisit) {
    const daysAgo = Math.max(
      0,
      Math.round((Date.now() - lastVisit.startsAt.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const when = daysAgo === 0 ? "hoy" : daysAgo === 1 ? "hace 1 dia" : `hace ${daysAgo} dias`;
    lastVisitLabel = `Ultima visita: ${when} en ${lastVisit.locationName}, ${lastVisit.serviceName}`;
  }

  return { clientId: client.id, fullName: client.fullName, lastVisitLabel };
}
