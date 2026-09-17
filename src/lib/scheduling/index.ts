/**
 * F2-03 · src/lib/scheduling — motor de disponibilidad, puro.
 *
 * Modulo puro (regla dura §3.10): no importa `db` ni `next/*`. Recibe datos
 * ya cargados por la capa de lectura (F2-04) y devuelve los slots libres.
 *
 * Resolucion de disponibilidad (D-F2-1, regla dura §3.9):
 *   bloques de `schedules` del barbero en esa sede y dia
 *     -> restar `time_off` aprobado
 *     -> restar citas activas existentes
 *     -> intersectar con `locations.business_hours`
 *     -> cortar en rejilla de 15 min
 *     -> descartar slots que no caben para la duracion efectiva del servicio
 *     -> aplicar lead time y horizonte (D-F2-2)
 *
 * Todo el calculo de minutos-de-dia ocurre en la timezone de la sede. Los
 * campos `timestamptz` (citas, time_off, "ahora") se convierten a "minutos
 * desde la medianoche local del dia consultado" con `zonedMinutesSinceMidnight`,
 * que puede devolver valores <0 o >=1440 cuando el instante cae en el dia
 * local anterior/siguiente (cruce de medianoche).
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Rango en minutos, relativo a la medianoche local del dia consultado. */
export type MinuteRange = { start: number; end: number };

export type BusinessHoursDay = {
  opensAt: string | null; // "HH:MM"
  closesAt: string | null; // "HH:MM"
  closed: boolean;
};

export type BusinessHours = {
  mon: BusinessHoursDay;
  tue: BusinessHoursDay;
  wed: BusinessHoursDay;
  thu: BusinessHoursDay;
  fri: BusinessHoursDay;
  sat: BusinessHoursDay;
  sun: BusinessHoursDay;
};

export const WEEKDAY_KEYS: (keyof BusinessHours)[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

// ---------------------------------------------------------------------------
// Conversion de instantes (timestamptz) a minutos locales del dia consultado
// ---------------------------------------------------------------------------

function getZonedDateParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  // Las 5 partes pedidas (year/month/day/hour/minute) siempre estan en el
  // resultado de formatToParts para este set de opciones; no hace falta un
  // fallback defensivo que nunca se ejercita.
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // hourCycle: "h23" garantiza 0-23 (nunca "24" como con h24), no hace
    // falta normalizar.
    hour: get("hour"),
    minute: get("minute"),
  };
}

function dayIndex(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Minutos desde la medianoche local de `referenceDateISO` ("YYYY-MM-DD",
 * calendario de la sede) hasta `instant`, evaluando `instant` en `timeZone`.
 * Puede ser negativo (instante es del dia local anterior) o >= 1440
 * (instante es del dia local siguiente) — asi se modela el cruce de
 * medianoche sin perder informacion.
 */
export function zonedMinutesSinceMidnight(
  instant: Date,
  timeZone: string,
  referenceDateISO: string,
): number {
  const [refYear, refMonth, refDay] = referenceDateISO.split("-").map(Number);
  const refDayIndex = dayIndex(refYear, refMonth, refDay);

  const zoned = getZonedDateParts(instant, timeZone);
  const instantDayIndex = dayIndex(zoned.year, zoned.month, zoned.day);

  return (instantDayIndex - refDayIndex) * 1440 + zoned.hour * 60 + zoned.minute;
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// Aritmetica de rangos (minutos)
// ---------------------------------------------------------------------------

/** Intersecta un rango base contra una ventana [windowStart, windowEnd). */
export function clampRange(range: MinuteRange, window: MinuteRange): MinuteRange | null {
  const start = Math.max(range.start, window.start);
  const end = Math.min(range.end, window.end);
  return start < end ? { start, end } : null;
}

/** Resta una lista de rangos "ocupados" de una lista de rangos "libres". */
export function subtractRanges(free: MinuteRange[], busy: MinuteRange[]): MinuteRange[] {
  let result = free.slice();
  for (const block of busy) {
    const next: MinuteRange[] = [];
    for (const range of result) {
      if (block.end <= range.start || block.start >= range.end) {
        // sin solape
        next.push(range);
        continue;
      }
      if (block.start > range.start) {
        next.push({ start: range.start, end: Math.min(block.start, range.end) });
      }
      if (block.end < range.end) {
        next.push({ start: Math.max(block.end, range.start), end: range.end });
      }
    }
    result = next;
  }
  return result.filter((r) => r.end > r.start);
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/**
 * Genera los inicios de slot validos (grid de `granularityMinutes`) dentro de
 * `ranges` para un servicio de `durationMinutes`. Un slot solo se ofrece si
 * cabe completo antes del fin del rango libre (no se corta el cierre).
 */
export function generateSlotStarts(params: {
  ranges: MinuteRange[];
  durationMinutes: number;
  granularityMinutes: number;
}): number[] {
  const { ranges, durationMinutes, granularityMinutes } = params;
  const starts: number[] = [];
  for (const range of ranges) {
    const firstGridPoint =
      Math.ceil(range.start / granularityMinutes) * granularityMinutes;
    for (
      let start = firstGridPoint;
      start + durationMinutes <= range.end;
      start += granularityMinutes
    ) {
      starts.push(start);
    }
  }
  return starts;
}

export type GetAvailableSlotsParams = {
  /** "YYYY-MM-DD" en el calendario de la sede. */
  date: string;
  timezone: string;
  businessHoursForDay: BusinessHoursDay;
  /** Bloques de `schedules` del barbero ese dia, ya en minutos locales (sin tz: son horas de pared). */
  scheduleBlocks: MinuteRange[];
  /** `time_off` aprobado del barbero (instantes absolutos). */
  timeOffRanges: { start: Date; end: Date }[];
  /** Citas activas del barbero ese dia (instantes absolutos). */
  existingAppointments: { start: Date; end: Date }[];
  serviceDurationMinutes: number;
  /** "ahora" (instante absoluto). */
  now: Date;
  leadTimeMinutes: number;
  granularityMinutes: number;
};

/** Slots libres (inicio en minutos locales del dia) para un barbero/servicio/dia. */
export function getAvailableSlots(params: GetAvailableSlotsParams): number[] {
  const {
    date,
    timezone,
    businessHoursForDay,
    scheduleBlocks,
    timeOffRanges,
    existingAppointments,
    serviceDurationMinutes,
    now,
    leadTimeMinutes,
    granularityMinutes,
  } = params;

  if (businessHoursForDay.closed || !businessHoursForDay.opensAt || !businessHoursForDay.closesAt) {
    return [];
  }
  const businessWindow: MinuteRange = {
    start: parseHHMM(businessHoursForDay.opensAt),
    end: parseHHMM(businessHoursForDay.closesAt),
  };

  const withinBusinessHours = scheduleBlocks
    .map((b) => clampRange(b, businessWindow))
    .filter((r): r is MinuteRange => r !== null);

  if (withinBusinessHours.length === 0) return [];

  const timeOffMinutes = timeOffRanges.map((t) => ({
    start: zonedMinutesSinceMidnight(t.start, timezone, date),
    end: zonedMinutesSinceMidnight(t.end, timezone, date),
  }));
  const appointmentMinutes = existingAppointments.map((a) => ({
    start: zonedMinutesSinceMidnight(a.start, timezone, date),
    end: zonedMinutesSinceMidnight(a.end, timezone, date),
  }));

  let free = subtractRanges(withinBusinessHours, timeOffMinutes);
  free = subtractRanges(free, appointmentMinutes);

  // Lead time (D-F2-2): nada antes de "ahora + leadTimeMinutes" es reservable.
  const nowMinutes = zonedMinutesSinceMidnight(now, timezone, date);
  const cutoff = nowMinutes + leadTimeMinutes;
  free = subtractRanges(free, [{ start: Number.NEGATIVE_INFINITY, end: cutoff }]);

  return generateSlotStarts({
    ranges: free,
    durationMinutes: serviceDurationMinutes,
    granularityMinutes,
  });
}

// ---------------------------------------------------------------------------
// Solapamiento del mismo barbero entre sedes (PRD 1.4 / §16.2)
// ---------------------------------------------------------------------------

export type ScheduleBlockAtLocation = {
  locationId: string;
  dayOfWeek: number; // 0-6, 0 = domingo
  startMinutes: number;
  endMinutes: number;
};

/**
 * `true` si el bloque propuesto se solapa con algun otro bloque del mismo
 * barbero en OTRA sede, el mismo dia de la semana. No compara contra bloques
 * de la misma sede (eso es edicion normal de horario).
 */
export function hasBarberScheduleOverlapAcrossLocations(params: {
  proposed: ScheduleBlockAtLocation;
  existingBlocks: ScheduleBlockAtLocation[];
}): boolean {
  const { proposed, existingBlocks } = params;
  return existingBlocks.some((block) => {
    if (block.locationId === proposed.locationId) return false;
    if (block.dayOfWeek !== proposed.dayOfWeek) return false;
    return block.startMinutes < proposed.endMinutes && proposed.startMinutes < block.endMinutes;
  });
}
