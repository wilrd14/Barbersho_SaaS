import "server-only";

import { and, eq, gt, gte, lt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  appointments,
  barberLocations,
  clients,
  locationServiceOverrides,
  locations,
  schedules,
  services,
  users,
  walkInQueue,
} from "@/lib/db/schema";
import { resolveEffectiveService } from "@/lib/scheduling/effective-service";

/**
 * "Hoy" (o cualquier instante) resuelto en la timezone de la sede, como
 * "YYYY-MM-DD" (regla dura §3.9: el navegador no decide que dia es hoy).
 */
export function resolveDateInTimezone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * F2-05/F2-06 · Capa de lectura para "El Dia" y la rejilla de agenda: trae
 * las citas de una sede en un dia, y que barberos tienen turno ese dia (para
 * las columnas de la rejilla). No calcula disponibilidad (eso es F2-04); es
 * pura lectura para mostrar lo que ya existe.
 */

export interface AgendaAppointment {
  id: string;
  barberId: string;
  clientId: string;
  clientName: string;
  serviceId: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  source: "online" | "walk_in" | "phone" | "admin";
  priceAtBooking: string | null;
  notes: string | null;
  cancellationReason: string | null;
}

export interface AgendaBarber {
  id: string;
  name: string;
}

export interface LocationDayAgenda {
  location: { id: string; name: string; timezone: string; chairsCount: number };
  barbers: AgendaBarber[];
  appointments: AgendaAppointment[];
}

function dayRangeUTC(dateISO: string) {
  const start = new Date(`${dateISO}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 25 * 60 * 60 * 1000); // colchon de 1h por cruce de tz
  return { start, end };
}

function dateToWeekdayIndex(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Trae la agenda de UNA sede para UN dia (calendario de la sede, D-S1-1 /
 * regla dura §3.9: el dia se define en la timezone de la sede — el llamador
 * debe pasar `dateISO` ya resuelto en esa tz, no en la del servidor).
 */
export async function getLocationDayAgenda(
  locationId: string,
  dateISO: string,
): Promise<LocationDayAgenda | null> {
  const [location] = await db
    .select({
      id: locations.id,
      name: locations.name,
      timezone: locations.timezone,
      chairsCount: locations.chairsCount,
    })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);

  if (!location) return null;

  const dayOfWeek = dateToWeekdayIndex(dateISO);
  const { start, end } = dayRangeUTC(dateISO);

  const [scheduledBarbers, appointmentRows] = await Promise.all([
    db
      .selectDistinct({ id: barberLocations.userId, name: users.fullName })
      .from(barberLocations)
      .innerJoin(users, eq(users.id, barberLocations.userId))
      .innerJoin(
        schedules,
        and(
          eq(schedules.userId, barberLocations.userId),
          eq(schedules.locationId, barberLocations.locationId),
          eq(schedules.dayOfWeek, dayOfWeek),
          eq(schedules.isActive, true),
        ),
      )
      .where(and(eq(barberLocations.locationId, locationId), eq(barberLocations.isActive, true))),
    db
      .select({
        id: appointments.id,
        barberId: appointments.barberId,
        clientId: appointments.clientId,
        clientName: clients.fullName,
        serviceId: appointments.serviceId,
        serviceName: services.name,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        source: appointments.source,
        priceAtBooking: appointments.priceAtBooking,
        notes: appointments.notes,
        cancellationReason: appointments.cancellationReason,
      })
      .from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(
        and(
          eq(appointments.locationId, locationId),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
        ),
      ),
  ]);

  return {
    location,
    barbers: scheduledBarbers.map((b) => ({ id: b.id, name: b.name ?? "Barbero" })),
    appointments: appointmentRows,
  };
}

export interface LocationDayKpis {
  revenueToday: number;
  servicesCompletedToday: number;
  chairsOccupiedNow: number;
  chairsCount: number;
  queueWaitingCount: number;
}

/**
 * KPI compacto de "El Dia" (F2-05): ingreso de hoy, servicios completados,
 * sillas ocupadas ahora. Ingreso e "completados" se leen de `sales`/
 * `appointments`; F3 es el unico lugar donde esto se agrega a nivel cadena.
 */
export async function getLocationDayKpis(
  locationId: string,
  dateISO: string,
  now: Date,
): Promise<LocationDayKpis> {
  const { start, end } = dayRangeUTC(dateISO);

  const [completedRows, inProgressRows, queueRows, location] = await Promise.all([
    db
      .select({
        id: appointments.id,
        priceAtBooking: appointments.priceAtBooking,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.locationId, locationId),
          eq(appointments.status, "completed"),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
        ),
      ),
    db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.locationId, locationId),
          eq(appointments.status, "in_progress"),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
          // "Ocupada ahora" (D-F2, UX-BRIEF §4.2): solo cuenta si `now` cae
          // dentro del rango real de la cita, no solo "esta en curso hoy".
          lt(appointments.startsAt, now),
          gt(appointments.endsAt, now),
        ),
      ),
    db
      .select({ id: walkInQueue.id })
      .from(walkInQueue)
      .where(and(eq(walkInQueue.locationId, locationId), eq(walkInQueue.status, "waiting"))),
    db
      .select({ chairsCount: locations.chairsCount })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1),
  ]);

  const revenueToday = completedRows.reduce(
    (sum, r) => sum + (r.priceAtBooking ? Number(r.priceAtBooking) : 0),
    0,
  );

  return {
    revenueToday,
    servicesCompletedToday: completedRows.length,
    chairsOccupiedNow: inProgressRows.length,
    chairsCount: location[0]?.chairsCount ?? 0,
    queueWaitingCount: queueRows.length,
  };
}

export interface BarberWeekDay {
  date: string;
  dayOfWeek: number;
  locationId: string | null;
  locationName: string | null;
}

/**
 * F2-06 · Vista semana filtrada por un barbero: en que sede esta cada dia
 * (PRD §5.2). Se basa en `schedules` (donde tiene bloque activo ese dia),
 * no en citas — un barbero puede no tener citas y aun asi "estar" en una
 * sede ese dia.
 */
export async function getBarberWeekLocations(
  barberId: string,
  fromDateISO: string,
  toDateISO: string,
): Promise<BarberWeekDay[]> {
  const barberSchedules = await db
    .select({
      dayOfWeek: schedules.dayOfWeek,
      locationId: schedules.locationId,
      locationName: locations.name,
    })
    .from(schedules)
    .innerJoin(locations, eq(locations.id, schedules.locationId))
    .where(and(eq(schedules.userId, barberId), eq(schedules.isActive, true)));

  const dates: string[] = [];
  const [fy, fm, fd] = fromDateISO.split("-").map(Number);
  const [ty, tm, td] = toDateISO.split("-").map(Number);
  for (
    let t = Date.UTC(fy, fm - 1, fd);
    t <= Date.UTC(ty, tm - 1, td);
    t += 86_400_000
  ) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }

  return dates.map((date) => {
    const dayOfWeek = dateToWeekdayIndex(date);
    const match = barberSchedules.find((s) => s.dayOfWeek === dayOfWeek);
    return {
      date,
      dayOfWeek,
      locationId: match?.locationId ?? null,
      locationName: match?.locationName ?? null,
    };
  });
}

/** Citas de UN barbero en UNA sede, UN dia — usado por la vista semana (F2-06). */
export async function getBarberDayAppointments(
  barberId: string,
  locationId: string,
  dateISO: string,
): Promise<AgendaAppointment[]> {
  const { start, end } = dayRangeUTC(dateISO);

  return db
    .select({
      id: appointments.id,
      barberId: appointments.barberId,
      clientId: appointments.clientId,
      clientName: clients.fullName,
      serviceId: appointments.serviceId,
      serviceName: services.name,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      source: appointments.source,
      priceAtBooking: appointments.priceAtBooking,
      notes: appointments.notes,
      cancellationReason: appointments.cancellationReason,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.barberId, barberId),
        eq(appointments.locationId, locationId),
        gte(appointments.startsAt, start),
        lt(appointments.startsAt, end),
      ),
    );
}

/** Barberos activos asignados a una sede (para el selector del sheet de crear cita). */
export async function getLocationBarbers(locationId: string): Promise<AgendaBarber[]> {
  const rows = await db
    .select({ id: barberLocations.userId, name: users.fullName })
    .from(barberLocations)
    .innerJoin(users, eq(users.id, barberLocations.userId))
    .where(and(eq(barberLocations.locationId, locationId), eq(barberLocations.isActive, true)));
  return rows.map((r) => ({ id: r.id, name: r.name ?? "Barbero" }));
}

export interface LocationActiveService {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
}

/** Servicios ofrecidos en esta sede con su duracion/precio efectivos (D-F2-1). */
export async function getLocationActiveServices(
  locationId: string,
): Promise<LocationActiveService[]> {
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
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

  const result: LocationActiveService[] = [];
  for (const row of rows) {
    const effective = resolveEffectiveService({
      defaultDurationMinutes: row.defaultDurationMinutes,
      defaultPrice: Number(row.defaultPrice),
      overrideDurationMinutes: row.overrideDurationMinutes,
      overridePrice: row.overridePrice ? Number(row.overridePrice) : null,
      overrideIsActive: row.overrideIsActive,
    });
    if (!effective) continue;
    result.push({ id: row.id, name: row.name, ...effective });
  }
  return result;
}
