import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

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
 * Carga la disponibilidad en 3 round-trips a la DB (AC de F2-04), sin
 * depender de `Promise.all` (que no reduce round-trips, solo los solapa):
 *
 *  1. sede (tz + business_hours) LEFT JOIN servicio LEFT JOIN override de
 *     precio/duracion de esa sede -> una fila.
 *  2. barberos activos de la sede JOIN users LEFT JOIN `schedules` (bloques
 *     activos en esa sede) LEFT JOIN `barber_services` (duracion custom) ->
 *     una fila por (barbero x bloque de horario). `barber_services` tiene
 *     indice unico (user, service), asi que no multiplica filas.
 *  3. `time_off` aprobado UNION ALL citas activas del rango, ambos filtrados
 *     por el subquery de barberos activos de la sede (no hace falta conocer
 *     los ids de antemano). Las citas son las del barbero en CUALQUIER sede
 *     (D-F2-5/§16.2): el mismo barbero no puede solaparse entre sedes.
 *
 * Delega el calculo puro a `getAvailableSlots` (F2-03). Contrato publico sin
 * cambios respecto a la version de 8 queries.
 */
export async function getAvailability(
  params: GetAvailabilityParams,
): Promise<AvailabilityResult> {
  const { locationId, serviceId, barberId, fromDate, toDate } = params;
  const now = params.now ?? new Date();

  // Round-trip 1: sede + servicio + override.
  const [head] = await db
    .select({
      timezone: locations.timezone,
      businessHours: locations.businessHours,
      serviceId: services.id,
      defaultDurationMinutes: services.defaultDurationMinutes,
      defaultPrice: services.defaultPrice,
      overrideId: locationServiceOverrides.id,
      overridePrice: locationServiceOverrides.price,
      overrideDurationMinutes: locationServiceOverrides.durationMinutes,
      overrideIsActive: locationServiceOverrides.isActive,
    })
    .from(locations)
    .leftJoin(services, eq(services.id, serviceId))
    .leftJoin(
      locationServiceOverrides,
      and(
        eq(locationServiceOverrides.locationId, locations.id),
        eq(locationServiceOverrides.serviceId, serviceId),
      ),
    )
    .where(eq(locations.id, locationId))
    .limit(1);

  // Sede inexistente, o servicio inexistente (el LEFT JOIN de servicio no
  // encontro fila): sin disponibilidad.
  if (!head || head.serviceId === null) return { days: [] };

  const location = { timezone: head.timezone };
  const businessHours = toBusinessHours(head.businessHours);
  const serviceRow = {
    defaultDurationMinutes: head.defaultDurationMinutes!,
    defaultPrice: head.defaultPrice!,
  };
  const override =
    head.overrideId === null
      ? null
      : {
          price: head.overridePrice,
          durationMinutes: head.overrideDurationMinutes,
          isActive: head.overrideIsActive!,
        };

  // Barberos activos de la sede (o uno solo si `barberId`), reutilizado como
  // subquery en el round-trip 3.
  const barberFilter = and(
    eq(barberLocations.locationId, locationId),
    eq(barberLocations.isActive, true),
    barberId ? eq(barberLocations.userId, barberId) : undefined,
  );
  const activeBarberIds = db
    .select({ userId: barberLocations.userId })
    .from(barberLocations)
    .where(barberFilter);

  // Round-trip 2: barberos + nombre + bloques de horario + duracion custom.
  const barberScheduleRows = await db
    .select({
      userId: barberLocations.userId,
      fullName: users.fullName,
      customDuration: barberServices.customDuration,
      dayOfWeek: schedules.dayOfWeek,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
    })
    .from(barberLocations)
    .innerJoin(users, eq(users.id, barberLocations.userId))
    .leftJoin(
      schedules,
      and(
        eq(schedules.userId, barberLocations.userId),
        eq(schedules.locationId, locationId),
        eq(schedules.isActive, true),
      ),
    )
    .leftJoin(
      barberServices,
      and(
        eq(barberServices.userId, barberLocations.userId),
        eq(barberServices.serviceId, serviceId),
      ),
    )
    .where(barberFilter);

  if (barberScheduleRows.length === 0) return { days: [] };

  // Round-trip 3: time_off aprobado UNION ALL citas activas del rango.
  // Los limites del rango van como Date en los operadores tipados de Drizzle
  // (lte/gte los serializan bien; la regla de .toISOString() aplica solo a
  // interpolaciones crudas dentro de un template `sql`).
  const rangeStart = new Date(`${fromDate}T00:00:00.000Z`);
  const rangeEnd = new Date(`${toDate}T23:59:59.999Z`);
  const blockRows = await db
    .select({
      kind: sql<string>`'time_off'`,
      userId: timeOff.userId,
      startsAt: timeOff.startsAt,
      endsAt: timeOff.endsAt,
    })
    .from(timeOff)
    .where(
      and(
        inArray(timeOff.userId, activeBarberIds),
        eq(timeOff.status, "approved"),
        lte(timeOff.startsAt, rangeEnd),
        gte(timeOff.endsAt, rangeStart),
      ),
    )
    .unionAll(
      db
        .select({
          kind: sql<string>`'appointment'`,
          userId: appointments.barberId,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        })
        .from(appointments)
        .where(
          and(
            inArray(appointments.barberId, activeBarberIds),
            inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
            lte(appointments.startsAt, rangeEnd),
            gte(appointments.endsAt, rangeStart),
          ),
        ),
    );

  const timeOffRows = blockRows.filter((r) => r.kind === "time_off");
  const appointmentRows = blockRows
    .filter((r) => r.kind === "appointment")
    .map((r) => ({ barberId: r.userId, startsAt: r.startsAt, endsAt: r.endsAt }));

  // Reagrupa las filas (barbero x bloque) del round-trip 2 por barbero,
  // conservando el orden de aparicion.
  const barberIds: string[] = [];
  const barberNameById = new Map<string, string>();
  const customDurationByBarber = new Map<string, number | null>();
  const scheduleRows: { userId: string; dayOfWeek: number; startTime: string; endTime: string }[] =
    [];
  for (const r of barberScheduleRows) {
    if (!barberNameById.has(r.userId)) {
      barberIds.push(r.userId);
      barberNameById.set(r.userId, r.fullName ?? "Barbero");
      customDurationByBarber.set(r.userId, r.customDuration ?? null);
    }
    if (r.dayOfWeek !== null && r.startTime !== null && r.endTime !== null) {
      scheduleRows.push({
        userId: r.userId,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
      });
    }
  }

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
 * Ejecutor Drizzle: el cliente normal (`db`) o una transaccion abierta con
 * `db.transaction(async (tx) => ...)`. Mismo patron que `writeAuditLog`
 * (`src/lib/auth/audit.ts`) — solo necesitamos el metodo `select`.
 */
type DbExecutor = Pick<typeof db, "select">;

/**
 * Version ligera de la resolucion de precio/duracion efectivos para UNA
 * combinacion sede+servicio+barbero (F2-08/F2-09: crear o reprogramar una
 * cita desde la consola no necesita la rejilla completa de slots).
 *
 * Bug real encontrado en la auditoria post-F2-25 (mismo patron que el
 * deadlock de `writeAuditLog` ya corregido): `rescheduleAppointmentAction`
 * (F2-09) llama a esta funcion DENTRO de `db.transaction(async (tx) => ...)`,
 * pero esta funcion siempre usaba el cliente `db` singleton (pool `max: 1`).
 * La transaccion en curso ya tenia reservada la unica conexion del pool, asi
 * que el primer `select` de aqui esperaba para siempre una conexion libre
 * que la propia transaccion nunca iba a soltar — colgado silencioso, sin
 * error, reproducido con un test de integracion que llama
 * `rescheduleAppointmentAction` directo (sin UI) y expira a los 30s.
 * `createAppointmentAction` (F2-08) y `createPublicBookingAction` (F2-13)
 * llaman a esta misma funcion pero ANTES de abrir su transaccion, asi que
 * a ellos nunca les tocaba este bug — solo a F2-09. Ahora acepta el
 * ejecutor (`tx` o `db`) como parametro opcional; el unico llamador dentro
 * de una transaccion (`rescheduleAppointmentAction`) le pasa `tx`
 * explicitamente.
 */
export async function resolveEffectiveServiceFor(
  locationId: string,
  serviceId: string,
  barberId: string,
  executor: DbExecutor = db,
) {
  const [serviceRow] = await executor
    .select({
      defaultDurationMinutes: services.defaultDurationMinutes,
      defaultPrice: services.defaultPrice,
    })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);

  if (!serviceRow) return null;

  const [overrideRow] = await executor
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

  const [barberServiceRow] = await executor
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
