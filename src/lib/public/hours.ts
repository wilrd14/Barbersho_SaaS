import { WEEKDAY_KEYS, type BusinessHours, type BusinessHoursDay } from "@/lib/scheduling/index";

/**
 * F2-10 · "Abierto ahora" para la tarjeta de sede publica. Reutiliza el tipo
 * `BusinessHours` de `lib/scheduling` (F2-03) sin modificarlo. Pura: recibe
 * el JSON crudo y "ahora", devuelve boolean.
 */
type RawDay = { opens_at: string | null; closes_at: string | null; closed: boolean };

function toBusinessHours(raw: unknown): BusinessHours {
  const parsed = (raw ?? {}) as Partial<Record<string, RawDay>>;
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

export function isLocationOpenNow(businessHoursRaw: unknown, timeZone: string, now = new Date()): boolean {
  const businessHours = toBusinessHours(businessHoursRaw);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(now);
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const shortToKey: Record<string, keyof BusinessHours> = {
    Sun: "sun",
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
    Sat: "sat",
  };
  const key = shortToKey[weekdayShort] ?? WEEKDAY_KEYS[now.getUTCDay()];
  const day = businessHours[key];
  if (day.closed || !day.opensAt || !day.closesAt) return false;

  const nowMinutes = hour * 60 + minute;
  const [openH, openM] = day.opensAt.split(":").map(Number);
  const [closeH, closeM] = day.closesAt.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}
