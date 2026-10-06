/**
 * F3-13 · Rangos del selector global de Vista Cadena (D-F3-14), PURO.
 *
 * Sin `Date`, reloj ni zona horaria del proceso: "hoy" entra ya resuelto en la
 * zona de la cadena como `YYYY-MM-DD`. Hoy = 1 dia, Semana = ultimos 7 dias
 * incluido hoy, Mes = ultimos 30 dias incluido hoy (no el mes calendario),
 * Rango = desde/hasta validados con Zod. Cualquier entrada invalida cae a "hoy".
 */
import { z } from "zod";

export type RangePreset = "hoy" | "semana" | "mes" | "custom";

export interface ResolvedRange {
  preset: RangePreset;
  startsOn: string;
  endsOn: string;
  /** true si los params venian rotos y se uso "hoy". */
  fellBack: boolean;
}

/** Tope de un rango custom (dias): evita que un param convierta la pagina en un backfill. */
export const MAX_RANGE_DAYS = 366;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeParams = z.object({
  rango: z.enum(["hoy", "semana", "mes", "custom"]).default("hoy"),
  desde: isoDate.optional(),
  hasta: isoDate.optional(),
});

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function toDays(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDays(days: number): string {
  const z0 = days + 719468;
  const era = Math.floor(z0 / 146097);
  const doe = z0 - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Suma `n` dias (puede ser negativo) a una fecha `YYYY-MM-DD`; null si la fecha es invalida. */
export function addDays(date: string, n: number): string | null {
  const d = toDays(date);
  return d === null ? null : fromDays(d + n);
}

/** Todas las fechas del rango, inclusive, en orden. Vacio si el rango es invalido. */
export function eachDate(startsOn: string, endsOn: string): string[] {
  const a = toDays(startsOn);
  const b = toDays(endsOn);
  if (a === null || b === null || b < a) return [];
  const out: string[] = [];
  for (let d = a; d <= b; d += 1) out.push(fromDays(d));
  return out;
}

function todayRange(today: string, fellBack: boolean): ResolvedRange {
  return { preset: "hoy", startsOn: today, endsOn: today, fellBack };
}

/**
 * Resuelve los `searchParams` (`?rango=semana`, `?rango=custom&desde=..&hasta=..`)
 * a un rango concreto. `today` ya viene en la zona de la cadena. Un custom con
 * `hasta` futuro se topa en hoy; invertido, mas largo que MAX_RANGE_DAYS o con
 * fechas invalidas cae a "hoy" con `fellBack = true`.
 */
export function resolveRange(
  params: Record<string, string | string[] | undefined>,
  today: string,
): ResolvedRange {
  const todayDay = toDays(today);
  if (todayDay === null) throw new Error(`"hoy" invalido: ${today}`);

  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const parsed = rangeParams.safeParse({
    rango: first(params.rango),
    desde: first(params.desde),
    hasta: first(params.hasta),
  });
  if (!parsed.success) return todayRange(today, true);

  const { rango, desde, hasta } = parsed.data;
  if (rango === "hoy") return todayRange(today, false);
  if (rango === "semana") {
    return { preset: "semana", startsOn: fromDays(todayDay - 6), endsOn: today, fellBack: false };
  }
  if (rango === "mes") {
    return { preset: "mes", startsOn: fromDays(todayDay - 29), endsOn: today, fellBack: false };
  }

  if (!desde || !hasta) return todayRange(today, true);
  const a = toDays(desde);
  const bRaw = toDays(hasta);
  if (a === null || bRaw === null) return todayRange(today, true);
  const b = Math.min(bRaw, todayDay);
  if (b < a || b - a + 1 > MAX_RANGE_DAYS) return todayRange(today, true);
  return { preset: "custom", startsOn: desde, endsOn: fromDays(b), fellBack: false };
}

/** Query string canonica para un rango (la URL es compartible). */
export function rangeToQuery(range: Pick<ResolvedRange, "preset" | "startsOn" | "endsOn">): string {
  if (range.preset === "custom") return `rango=custom&desde=${range.startsOn}&hasta=${range.endsOn}`;
  return `rango=${range.preset}`;
}
