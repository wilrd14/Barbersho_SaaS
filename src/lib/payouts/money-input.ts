/**
 * Conversion de lo que el usuario teclea a centavos enteros / puntos basicos,
 * solo con strings y enteros (regla dura §3.1: nada de parseFloat ni
 * `Number(x) * 100` sobre dinero). Modulo puro, usable desde componentes
 * cliente.
 */
import { bpsFromPercentString } from "@/lib/commissions";
import { centsFromDecimalString } from "@/lib/actions/money-utils";

/** "3000", "3,000", "3,000.50", "RD$ 3,000.5" -> centavos; null si no es un monto valido (max. 2 decimales). */
export function parseMoneyInputToCents(raw: string): number | null {
  const cleaned = raw.replace(/RD\$/gi, "").replace(/[\s,]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return centsFromDecimalString(cleaned);
}

/** "57.5" -> "57.50" (numeric(5,2)); null si no es un porcentaje 0-100 con max. 2 decimales. */
export function normalizePercentInput(raw: string): string | null {
  const cleaned = raw.replace(/%/g, "").trim();
  if (cleaned === "") return null;
  try {
    const bps = bpsFromPercentString(cleaned);
    const whole = Math.floor(bps / 100);
    const frac = String(bps % 100).padStart(2, "0");
    return `${whole}.${frac}`;
  } catch {
    return null;
  }
}
