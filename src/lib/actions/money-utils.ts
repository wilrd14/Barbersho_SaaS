import type { LocationScopeContext } from "@/lib/auth/guards";

/**
 * Utilidades puras compartidas por checkout.ts y cash-register.ts.
 *
 * IMPORTANTE: este archivo NO lleva "use server". Next.js exige que toda
 * funcion exportada de un modulo "use server" sea async (se trata como
 * Server Action); estas son funciones sincronas puras, asi que viven
 * separadas para no romper `next build` (bug real encontrado: estas tres
 * funciones estaban originalmente en checkout.ts con "use server" y
 * reventaban el build de produccion, aunque typecheck/lint/test no lo
 * detectan).
 */

// ---------------------------------------------------------------------------
// Conversion numeric(12,2) <-> centavos enteros, sin operar floats sobre
// montos (regla dura §3.2). Solo manipulacion de strings/enteros.
// ---------------------------------------------------------------------------

export function centsFromDecimalString(value: string): number {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw.replace(/\D/g, "") || "0";
  const fracPart = (fracPartRaw.replace(/\D/g, "") + "00").slice(0, 2);
  const cents = Number(intPart) * 100 + Number(fracPart || "0");
  return negative ? -cents : cents;
}

export function decimalStringFromCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const intPart = Math.floor(abs / 100);
  const fracPart = abs % 100;
  return `${negative ? "-" : ""}${intPart}.${String(fracPart).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Rol de gerente (D-F2-9/matriz §6.2): superuser/admin, nunca barbero.
// Compartido entre checkout.ts y cash-register.ts (apertura/cierre de caja).
// ---------------------------------------------------------------------------

export function assertManagerRole(scope: LocationScopeContext) {
  if (scope.effectiveRole !== "superuser" && scope.effectiveRole !== "admin") {
    throw new Error("Esta accion es solo para el gerente de la sede.");
  }
}
