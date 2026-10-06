/**
 * F3-11 · src/lib/metrics — metricas derivadas de la Tabla de Posiciones, PURO.
 *
 * Mismo patron que `lib/commissions`: sin `db`, `next/*`, `Date`, reloj ni
 * zona horaria del proceso. Las fechas son strings `YYYY-MM-DD` y se manipulan
 * con calendario civil en enteros. Dinero en **centavos enteros**; porcentajes
 * en **puntos basicos enteros** (78% -> 7800). Toda division usa
 * `roundHalfToEven` de `@/lib/pos` (D-F3-20). Sin floats sobre montos.
 *
 * Definiciones: BACKLOG-F3 D-F3-13. Este modulo NO calcula las cifras de un
 * dia (eso es F3-12, sobre `sales`); agrega filas diarias ya calculadas y
 * deriva totales, RD$/silla, RD$/barbero-hora, delta, ranking y desviacion.
 *
 * Datos que `location_daily_metrics` no guarda y el llamador (F3-12) debe
 * aportar en cada fila porque sin ellos no se puede agregar un rango sin
 * promediar promedios: `salesCount` (para el ticket promedio) y
 * `terminalAppointments` (denominador de la tasa de no-show). Para filas ya
 * persistidas, `salesCount` se recupera como revenue / avg_ticket.
 */
import { roundHalfToEven } from "@/lib/pos";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Una fila diaria de una sede, ya en enteros. */
export interface DailyMetricsRow {
  locationId: string;
  /** `YYYY-MM-DD` en la zona de la sede. */
  date: string;
  revenueCents: number;
  servicesCount: number;
  /** Ventas `paid` del dia (denominador del ticket promedio). */
  salesCount: number;
  newClients: number;
  /** Clientes distintos con al menos una venta `paid` ese dia (D-F3-13). */
  uniqueClients: number;
  noShows: number;
  /** completed + no_show + cancelled del dia (denominador de la tasa de no-show). */
  terminalAppointments: number;
  /** Ocupacion del dia en puntos basicos ya topada a 10000, o null si no se pudo calcular. */
  utilizationBps: number | null;
  /** Horas-barbero del dia x 100 (numeric(8,2) sin decimales). */
  barberHoursX100: number;
}

export interface LocationInfo {
  id: string;
  name: string;
  chairsCount: number;
}

export interface LocationPeriodTotals {
  locationId: string;
  name: string;
  revenueCents: number;
  servicesCount: number;
  salesCount: number;
  /** revenue / ventas; null si no hubo ventas. */
  avgTicketCents: number | null;
  /** Promedio de los dias con dato (sin ponderar); null si ninguno. */
  occupancyBps: number | null;
  noShows: number;
  /** noShows / terminalAppointments; null si no hubo citas terminales. */
  noShowBps: number | null;
  newClients: number;
  /**
   * Suma de `uniqueClients` de cada dia (visitas-cliente por dia): un cliente que
   * viene dos dias cuenta dos veces. Los clientes distintos de un rango no se
   * pueden derivar de filas diarias sin duplicar.
   */
  uniqueClients: number;
  barberHoursX100: number;
  /** Ingreso del periodo / sillas; null si chairsCount <= 0. */
  revenuePerChairCents: number | null;
  /** Ingreso del periodo / horas-barbero; null si no hay horas. */
  revenuePerBarberHourCents: number | null;
}

export interface ChainPeriodTotals {
  revenueCents: number;
  servicesCount: number;
  salesCount: number;
  avgTicketCents: number | null;
  occupancyBps: number | null;
  noShowBps: number | null;
  newClients: number;
  /** Suma de visitas-cliente por dia de las sedes (ver `LocationPeriodTotals.uniqueClients`). */
  uniqueClients: number;
}

export interface CivilRange {
  startsOn: string;
  endsOn: string;
}

// ---------------------------------------------------------------------------
// Calendario civil (solo enteros)
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseIso(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Dias desde 1970-01-01 (Hinnant). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function isoFromDays(days: number): string {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * D-F3-13 (delta): el bloque inmediatamente anterior del mismo numero de dias.
 * hoy -> ayer; 7 dias -> los 7 previos; 12 dias -> los 12 previos.
 * Devuelve null si el rango es invalido.
 */
export function previousRange(range: CivilRange): CivilRange | null {
  const start = parseIso(range.startsOn);
  const end = parseIso(range.endsOn);
  if (!start || !end) return null;
  const startDay = daysFromCivil(start.year, start.month, start.day);
  const endDay = daysFromCivil(end.year, end.month, end.day);
  if (endDay < startDay) return null;
  const length = endDay - startDay + 1;
  return { startsOn: isoFromDays(startDay - length), endsOn: isoFromDays(startDay - 1) };
}

// ---------------------------------------------------------------------------
// Ocupacion
// ---------------------------------------------------------------------------

/**
 * D-F3-13: minutos atendidos / (sillas x minutos de apertura), topado a 100%.
 * `anomalous` = el valor crudo paso de 100 (mas barberos que sillas u horario
 * mal configurado); el llamador lo registra en el log. Capacidad 0 -> null.
 */
export function utilizationBps(
  servedMinutes: number,
  chairsCount: number,
  openMinutes: number,
): { bps: number; anomalous: boolean } | null {
  const capacity = chairsCount * openMinutes;
  if (capacity <= 0) return null;
  const raw = roundHalfToEven(servedMinutes * 10000, capacity);
  return raw > 10000 ? { bps: 10000, anomalous: true } : { bps: raw, anomalous: false };
}

// ---------------------------------------------------------------------------
// Agregacion
// ---------------------------------------------------------------------------

function meanBps(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return roundHalfToEven(sum, values.length);
}

/** Agrega las filas diarias de UNA sede (se ignoran filas de otras sedes) en el total del periodo. */
export function aggregateLocation(rows: DailyMetricsRow[], location: LocationInfo): LocationPeriodTotals {
  const own = rows.filter((r) => r.locationId === location.id);
  const sum = (pick: (r: DailyMetricsRow) => number) => own.reduce((acc, r) => acc + pick(r), 0);

  const revenueCents = sum((r) => r.revenueCents);
  const salesCount = sum((r) => r.salesCount);
  const noShows = sum((r) => r.noShows);
  const terminal = sum((r) => r.terminalAppointments);
  const barberHoursX100 = sum((r) => r.barberHoursX100);

  return {
    locationId: location.id,
    name: location.name,
    revenueCents,
    servicesCount: sum((r) => r.servicesCount),
    salesCount,
    avgTicketCents: salesCount > 0 ? roundHalfToEven(revenueCents, salesCount) : null,
    occupancyBps: meanBps(own.flatMap((r) => (r.utilizationBps === null ? [] : [r.utilizationBps]))),
    noShows,
    noShowBps: terminal > 0 ? roundHalfToEven(noShows * 10000, terminal) : null,
    newClients: sum((r) => r.newClients),
    uniqueClients: sum((r) => r.uniqueClients),
    barberHoursX100,
    revenuePerChairCents: location.chairsCount > 0 ? roundHalfToEven(revenueCents, location.chairsCount) : null,
    revenuePerBarberHourCents:
      barberHoursX100 > 0 ? roundHalfToEven(revenueCents * 100, barberHoursX100) : null,
  };
}

/** Totales de cadena a partir de los totales por sede (ticket y no-show ponderados, no promedio de promedios). */
export function aggregateChain(
  locations: LocationPeriodTotals[],
  rows: DailyMetricsRow[],
): ChainPeriodTotals {
  const ids = new Set(locations.map((l) => l.locationId));
  const own = rows.filter((r) => ids.has(r.locationId));
  const revenueCents = locations.reduce((acc, l) => acc + l.revenueCents, 0);
  const salesCount = locations.reduce((acc, l) => acc + l.salesCount, 0);
  const noShows = locations.reduce((acc, l) => acc + l.noShows, 0);
  const terminal = own.reduce((acc, r) => acc + r.terminalAppointments, 0);

  return {
    revenueCents,
    servicesCount: locations.reduce((acc, l) => acc + l.servicesCount, 0),
    salesCount,
    avgTicketCents: salesCount > 0 ? roundHalfToEven(revenueCents, salesCount) : null,
    occupancyBps: meanBps(own.flatMap((r) => (r.utilizationBps === null ? [] : [r.utilizationBps]))),
    noShowBps: terminal > 0 ? roundHalfToEven(noShows * 10000, terminal) : null,
    newClients: locations.reduce((acc, l) => acc + l.newClients, 0),
    uniqueClients: locations.reduce((acc, l) => acc + l.uniqueClients, 0),
  };
}

// ---------------------------------------------------------------------------
// Delta, ranking y desviacion
// ---------------------------------------------------------------------------

/**
 * D-F3-13: (actual - anterior) / anterior en puntos basicos. Si el periodo
 * anterior es 0 (o negativo) devuelve null: la UI muestra "—", nunca "+∞%".
 */
export function deltaBps(currentCents: number, previousCents: number): number | null {
  if (previousCents <= 0) return null;
  return roundHalfToEven((currentCents - previousCents) * 10000, previousCents);
}

export type RankMetric =
  | "revenueCents"
  | "revenuePerChairCents"
  | "revenuePerBarberHourCents"
  | "avgTicketCents"
  | "occupancyBps"
  | "servicesCount";

/**
 * Ranking descendente por una metrica (1 = mejor). Las sedes sin valor (null)
 * van al final. Empates: mismo valor -> mismo orden por nombre y luego por id,
 * y el puesto es el de la posicion en la lista (determinista, sin empates de
 * puesto). Devuelve una lista nueva, no muta la entrada.
 */
export function rankLocations(
  locations: LocationPeriodTotals[],
  metric: RankMetric = "revenueCents",
): Array<LocationPeriodTotals & { rank: number }> {
  const sorted = [...locations].sort((a, b) => {
    const av = a[metric];
    const bv = b[metric];
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    if (av !== null && bv !== null && av !== bv) return bv - av;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0;
  });
  return sorted.map((l, i) => ({ ...l, rank: i + 1 }));
}

/**
 * D-F3-13 (semaforo): true si el ingreso de la sede esta MAS de 10% por debajo
 * del promedio de las sedes de la cadena. Aritmetica entera:
 * revenue * 10 * n < total * 9. Con menos de 2 sedes no hay con que comparar.
 */
export function flagsDeviation(locations: LocationPeriodTotals[]): Map<string, boolean> {
  const flags = new Map<string, boolean>();
  const n = locations.length;
  const total = locations.reduce((acc, l) => acc + l.revenueCents, 0);
  for (const l of locations) {
    flags.set(l.locationId, n >= 2 && l.revenueCents * 10 * n < total * 9);
  }
  return flags;
}
