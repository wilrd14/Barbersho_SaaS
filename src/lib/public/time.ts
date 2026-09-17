/**
 * Conversion de "fecha local de la sede + minutos desde medianoche" a un
 * instante UTC real, sin depender del reloj/zona del navegador (regla dura
 * §3.9: el navegador no convierte horas). Funcion pura, usable en Server
 * Actions.
 *
 * Tecnica: se interpreta `date+minutes` como si fuera UTC, se mide cuanto
 * "corre" ese mismo instante cuando se formatea en `timeZone`, y se resta la
 * diferencia — mismo patron ya usado en
 * `src/components/kortex/create-appointment-sheet.tsx` (fromDatetimeLocalParts),
 * aqui generalizado a minutos en vez de "HH:MM".
 */
export function zonedTimeToUtc(dateISO: string, minutesFromMidnight: number, timeZone: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const naive = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(naive);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const offsetMs =
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) -
    naive.getTime();

  return new Date(naive.getTime() - offsetMs);
}
