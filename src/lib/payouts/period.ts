/**
 * F3-05/F3-06 · Utilidades PURAS del periodo de pago (quincena calendario,
 * D-F3-2): sin `db`, sin `next/*`, sin depender de la zona horaria del proceso.
 * Las fechas viajan como strings `YYYY-MM-DD` y se manipulan como enteros de
 * calendario civil.
 */
import { parseIsoDate } from "@/lib/commissions";

export interface DateRange {
  startsOn: string;
  endsOn: string;
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function lastDayOfMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Fecha de hoy (YYYY-MM-DD) en una zona horaria IANA, sin depender de la zona del proceso. */
export function todayIsoInTimezone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** La quincena calendario (1-15 o 16-fin de mes) que contiene la fecha, o null si la fecha es invalida. */
export function quincenaContaining(dateIso: string): DateRange | null {
  const d = parseIsoDate(dateIso);
  if (!d) return null;
  if (d.day <= 15) return { startsOn: iso(d.year, d.month, 1), endsOn: iso(d.year, d.month, 15) };
  return { startsOn: iso(d.year, d.month, 16), endsOn: iso(d.year, d.month, lastDayOfMonth(d.year, d.month)) };
}

/** Quincena inmediatamente anterior a la dada (que debe ser una quincena calendario valida). */
export function previousQuincena(range: DateRange): DateRange | null {
  const start = parseIsoDate(range.startsOn);
  if (!start || !isCalendarQuincena(range.startsOn, range.endsOn)) return null;
  if (start.day === 16) return { startsOn: iso(start.year, start.month, 1), endsOn: iso(start.year, start.month, 15) };
  const year = start.month === 1 ? start.year - 1 : start.year;
  const month = start.month === 1 ? 12 : start.month - 1;
  return { startsOn: iso(year, month, 16), endsOn: iso(year, month, lastDayOfMonth(year, month)) };
}

/** Quincena inmediatamente posterior a la dada. */
export function nextQuincena(range: DateRange): DateRange | null {
  const start = parseIsoDate(range.startsOn);
  if (!start || !isCalendarQuincena(range.startsOn, range.endsOn)) return null;
  if (start.day === 1) {
    return { startsOn: iso(start.year, start.month, 16), endsOn: iso(start.year, start.month, lastDayOfMonth(start.year, start.month)) };
  }
  const year = start.month === 12 ? start.year + 1 : start.year;
  const month = start.month === 12 ? 1 : start.month + 1;
  return { startsOn: iso(year, month, 1), endsOn: iso(year, month, 15) };
}

/** true si el rango es exactamente 1-15 o 16-fin de mes del mismo mes (D-F3-2). */
export function isCalendarQuincena(startsOn: string, endsOn: string): boolean {
  const start = parseIsoDate(startsOn);
  const end = parseIsoDate(endsOn);
  if (!start || !end || start.year !== end.year || start.month !== end.month) return false;
  if (start.day === 1) return end.day === 15;
  if (start.day === 16) return end.day === lastDayOfMonth(end.year, end.month);
  return false;
}

/** "15 sep 2026". */
export function formatDateEs(dateIso: string): string {
  const d = parseIsoDate(dateIso);
  if (!d) return dateIso;
  return `${d.day} ${MONTHS_ES[d.month - 1]} ${d.year}`;
}

/** "Quincena 1–15 sep 2026"; si el rango no es una quincena calendario, "1 sep – 20 oct 2026". */
export function formatQuincenaLabel(startsOn: string, endsOn: string): string {
  const start = parseIsoDate(startsOn);
  const end = parseIsoDate(endsOn);
  if (!start || !end) return `${startsOn} a ${endsOn}`;
  if (isCalendarQuincena(startsOn, endsOn)) {
    return `Quincena ${start.day}–${end.day} ${MONTHS_ES[end.month - 1]} ${end.year}`;
  }
  return `${formatDateEs(startsOn)} – ${formatDateEs(endsOn)}`;
}

/** Los estados del ciclo, en orden. */
export const PERIOD_STATUS_ORDER = ["open", "calculated", "approved", "paid"] as const;
export type PeriodStatusValue = (typeof PERIOD_STATUS_ORDER)[number];

/** Estado en el vocabulario del componente Badge (DESIGN-SYSTEM §4.3). */
export function badgeStatusOf(status: PeriodStatusValue): "abierto" | "calculado" | "aprobado" | "pagado" {
  return status === "open" ? "abierto" : status === "calculated" ? "calculado" : status === "approved" ? "aprobado" : "pagado";
}

/** Un periodo `approved` o `paid` es inmutable (regla dura §3.10). */
export function isPeriodFrozen(status: PeriodStatusValue): boolean {
  return status === "approved" || status === "paid";
}
