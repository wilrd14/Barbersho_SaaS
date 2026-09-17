import "server-only";

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  barberLocations,
  barberServices,
  locations,
  locationServiceOverrides,
  schedules,
  services,
  timeOff,
  users,
  appointments,
} from "@/lib/db/schema";
import {
  WEEKDAY_KEYS,
  getAvailableSlots,
  type BusinessHours,
  type BusinessHoursDay,
} from "@/lib/scheduling/index";
import { resolveEffectiveService } from "@/lib/scheduling/effective-service";

/**
 * F2-04 · Capa de lectura de disponibilidad (con acceso a DB), separada del
 * nucleo puro (F2-03, `lib/scheduling/index.ts`). Carga lo minimo necesario
 * y delega el calculo de slots al modulo puro — esta capa NO calcula
 * disponibilidad por si misma.
 */

const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed", "in_progress"] as const;
const LEAD_TIME_MINUTES = 30; // D-F2-2
const GRANULARITY_MINUTES = 15; // D-F2-1

type RawBusinessHoursDay = { opens_at: string | null; closes_at: string | null; closed: boolean };
type RawBusinessHours = Record<string, RawBusinessHoursDay>;

function toBusinessHours(raw: unknown): BusinessHours {
  const parsed = (raw ?? {}) as Partial<RawBusinessHours>;
  const day = (key: string): BusinessHoursDay => {
    const d = parsed[key];
    if (!d) return { opensAt: null, closesAt: null, closed: true };
    return { opensAt: d.opens_at, closesAt: d.closes_at, closed: d.closed };
  };
  return {
    sun: day("sun"),
    mon: day("mon"),
    tue: day("tue"),
    wed: day("wed"),
    thu: day("thu"),
    fri: day("fri"),
    sat: day("sat"),
  };
}

function dateToWeekdayKey(dateISO: string): keyof BusinessHours {
  const [y, m, d] = dateISO.split("-").map(Number);
  // 0 = domingo, coincide con dayOfWeek de `schedules` y con WEEKDAY_KEYS.
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAY_KEYS[weekday];
}

function listDatesBetween(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  for (let t = start; t <= end; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

export interface GetAvailabilityParams {
  locationId: string;
  serviceId: string;
  barberId?: string;
  /** "YYYY-MM-DD", inclusive, en el calendario de la sede. */
  fromDate: string;
  toDate: string;
  now?: Date;
}

export interface AvailabilityDaySlots {
  date: string;
  barberId: string;
  barberName: string;
  price: number;
  durationMinutes: number;
  /** Minutos desde medianoche local, inicio del slot. */
  slotStartMinutes: number[];
}

export interface AvailabilityResult {
  days: AvailabilityDaySlots[];
}

/**
 * Carga en el minimo de queries: sede (tz + business_hours), barberos
 * activos de la sede (o uno solo si `barberId`), sus bloques de `schedules`
 * en esa sede, `time_off` aprobado, citas activas del rango (de ese barbero
 * en CUALQUIER sede — el mismo barbero no puede solaparse entre sedes,
 * D-F2-5/§16.2), y la resolucion de precio/duracion efectivos (D-F2-1).
 * Delega el calculo puro a `getAvailableSlots` (F2-03).
 */
export async function getAvailability(
  params: GetAvailabilityParams,
): Promise<AvailabilityResult> {
  const { locationId, serviceId, barberId, fromDate, toDate } = params;
  const now = params.now ?? new Date();

  const [location] = await db
    .select({
      id: locations.id,
      timezone: locations.timezone,
      businessHours: locations.businessHours,
    })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);

  if (!location) return { days: [] };

  const businessHours = toBusinessHours(location.businessHours);

  const barberRows = await db
    .select({
      userId: barberLocations.userId,
      fullName: users.fullName,
    })
    .from(barberLocations)
    .innerJoin(users, eq(users.id, barberLocations.userId))
    .where(
      and(
        eq(barberLocations.locationId, locationId),
        eq(barberLocations.isActive, true),
        barberId ? eq(barberLocations.userId, barberId) : undefined,
      ),
    );

  if (barberRows.length === 0) return { days: [] };
  const barberIds = barberRows.map((b) => b.userId);

  const [serviceRow] = await db
    .select({
      id: services.id,
      defaultDurationMinutes: services.defaultDurationMinutes,
      defaultPrice: services.defaultPrice,
    })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);

  if (!serviceRow) return { days: [] };

  const [overrideRow, scheduleRows, barberServiceRows, timeOffRows, appointmentRows] =
    await Promise.all([
      db
        .select({
          price: locationServiceOverrides.price,
          durationMinutes: locationServiceOverrides.durationMinutes,
          isActive: locationServiceOverrides.isActive,
        })
        .from(locationServiceOverrides)
        .where(
          and(
            eq(locationServiceOverrides.locationId, locationId),
            eq(locationServiceOverrides.serviceId, serviceId),
          ),
        )
        .limit(1),
      db
        .select({
          userId: schedules.userId,
          dayOfWeek: schedules.dayOfWeek,
          startTime: schedules.startTime,
          endTime: schedules.endTime,
        })
        .from(schedules)
        .where(
          and(
            eq(schedules.locationId, locationId),
            inArray(schedules.userId, barberIds),
            eq(schedules.isActive, true),
          ),
        ),
      db
        .select({ userId: barberServices.userId, customDuration: barberServices.customDuration })
        .from(barberServices)
        .where(
          and(eq(barberServices.serviceId, serviceId), inArray(barberServices.userId, barberIds)),
        ),
      db
        .select({ userId: timeOff.userId, startsAt: timeOff.startsAt, endsAt: timeOff.endsAt })
        .from(timeOff)
        .where(
          and(
            inArray(timeOff.userId, barberIds),
            eq(timeOff.status, "approved"),
            lte(timeOff.startsAt, new Date(`${toDate}T23:59:59.999Z`)),
            gte(timeOff.endsAt, new Date(`${fromDate}T00:00:00.000Z`)),
          ),
        ),
      // Citas activas del barbero en CUALQUIER sede de la cadena (D-F2-5).
      db
        .select({
          barberId: appointments.barberId,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        })
        .from(appointments)
        .where(
          and(
            inArray(appointments.barberId, barberIds),
            inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
            lte(appointments.startsAt, new Date(`${toDate}T23:59:59.999Z`)),
            gte(appointments.endsAt, new Date(`${fromDate}T00:00:00.000Z`)),
          ),
        ),
    ]);

  const override = overrideRow[0] ?? null;
  const customDurationByBarber = new Map(
    barberServiceRows.map((r) => [r.userId, r.customDuration]),
  );
  const barberNameById = new Map(barberRows.map((b) => [b.userId, b.fullName ?? "Barbero"]));

  const dates = listDatesBetween(fromDate, toDate);
  const days: AvailabilityDaySlots[] = [];

  for (const barberIdIter of barberIds) {
    const effective = resolveEffectiveService({
      defaultDurationMinutes: serviceRow.defaultDurationMinutes,
      defaultPrice: Number(serviceRow.defaultPrice),
      overrideDurationMinutes: override?.durationMinutes ?? null,
      overridePrice: override ? Number(override.price ?? "") || null : null,
      overrideIsActive: override?.isActive ?? true,
      customDurationMinutes: customDurationByBarber.get(barberIdIter) ?? null,
    });
    if (!effective) continue; // servicio no ofrecido en esta sede

    const barberSchedules = scheduleRows.filter((s) => s.userId === barberIdIter);
    const barberTimeOff = timeOffRows
      .filter((t) => t.userId === barberIdIter)
      .map((t) => ({ start: t.startsAt, end: t.endsAt }));
    const barberAppointments = appointmentRows
      .filter((a) => a.barberId === barberIdIter)
      .map((a) => ({ start: a.startsAt, end: a.endsAt }));

    for (const date of dates) {
      const dayKey = dateToWeekdayKey(date);
      const dayOfWeekIndex = WEEKDAY_KEYS.indexOf(dayKey);
      const scheduleBlocks = barberSchedules
        .filter((s) => s.dayOfWeek === dayOfWeekIndex)
        .map((s) => ({
          start: parseHHMMSS(s.startTime),
          end: parseHHMMSS(s.endTime),
        }));

      if (scheduleBlocks.length === 0) continue;

      const slotStartMinutes = getAvailableSlots({
        date,
        timezone: location.timezone,
        businessHoursForDay: businessHours[dayKey],
        scheduleBlocks,
        timeOffRanges: barberTimeOff,
        existingAppointments: barberAppointments,
        serviceDurationMinutes: effective.durationMinutes,
        now,
        leadTimeMinutes: LEAD_TIME_MINUTES,
        granularityMinutes: GRANULARITY_MINUTES,
      });

      if (slotStartMinutes.length === 0) continue;

      days.push({
        date,
        barberId: barberIdIter,
        barberName: barberNameById.get(barberIdIter) ?? "Barbero",
        price: effective.price,
        durationMinutes: effective.durationMinutes,
        slotStartMinutes,
      });
    }
  }

  return { days };
}

function parseHHMMSS(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Version ligera de la resolucion de precio/duracion efectivos para UNA
 * combinacion sede+servicio+barbero (F2-08/F2-09: crear o reprogramar una
 * cita desde la consola no necesita la rejilla completa de slots).
 */
export async function resolveEffectiveServiceFor(
  locationId: string,
  serviceId: string,
  barberId: string,
) {
  const [serviceRow] = await db
    .select({
      defaultDurationMinutes: services.defaultDurationMinutes,
      defaultPrice: services.defaultPrice,
    })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);

  if (!serviceRow) return null;

  const [overrideRow] = await db
    .select({
      price: locationServiceOverrides.price,
      durationMinutes: locationServiceOverrides.durationMinutes,
      isActive: locationServiceOverrides.isActive,
    })
    .from(locationServiceOverrides)
    .where(
      and(
        eq(locationServiceOverrides.locationId, locationId),
        eq(locationServiceOverrides.serviceId, serviceId),
      ),
    )
    .limit(1);

  const [barberServiceRow] = await db
    .select({ customDuration: barberServices.customDuration })
    .from(barberServices)
    .where(and(eq(barberServices.userId, barberId), eq(barberServices.serviceId, serviceId)))
    .limit(1);

  return resolveEffectiveService({
    defaultDurationMinutes: serviceRow.defaultDurationMinutes,
    defaultPrice: Number(serviceRow.defaultPrice),
    overrideDurationMinutes: overrideRow?.durationMinutes ?? null,
    overridePrice: overrideRow ? Number(overrideRow.price ?? "") || null : null,
    overrideIsActive: overrideRow?.isActive ?? true,
    customDurationMinutes: barberServiceRow?.customDuration ?? null,
  });
}
