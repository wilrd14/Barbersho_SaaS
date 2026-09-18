import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Red de seguridad estatica: en un modulo "use server" TODA funcion exportada
 * es un endpoint invocable por cualquiera desde el cliente (incluso sin sesion),
 * con los argumentos que el atacante quiera. Un guard solo en la pagina que la
 * llama no protege nada. Este test falla si una funcion exportada de un archivo
 * "use server" no llama a un guard de ambito/sesion, salvo las publicas por
 * diseno listadas abajo (cada entrada es una decision consciente y revisable).
 *
 * Origen: se encontraron 5 funciones de lectura exportadas sin guard
 * (loadCashRegisterState, loadCheckoutCatalog, loadAppointmentForCheckout,
 * loadQueueSnapshot, loadAttendingNow) que exponian datos de cualquier sede.
 */
const SRC = join(process.cwd(), "src");

const GUARD = /\b(require(Location|Chain|Barber|Client)Scope|getSessionContext)\s*\(/;

/** Publicas por diseno: reserva anonima (F2-13) y flujos de autenticacion (S1-11). */
const PUBLIC_BY_DESIGN: Record<string, string[]> = {
  "src/lib/actions/public-booking.ts": [
    "getLocationCatalogAction",
    "getLocationBarbersAction",
    "getBookingAvailabilityAction",
    "lookupClientHistoryAction",
    "createPublicBookingAction",
  ],
  "src/lib/auth/actions.ts": [
    "registerAction",
    "loginAction",
    "logoutAction",
    "forgotPasswordAction",
    "resetPasswordAction",
  ],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function isUseServerFile(source: string): boolean {
  const firstCode = source
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "" && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
  return firstCode === '"use server";' || firstCode === '"use server"';
}

function exportedAsyncFunctions(source: string): { name: string; body: string }[] {
  const re = /^export async function (\w+)\s*\(/gm;
  const matches = [...source.matchAll(re)];
  return matches.map((m) => {
    const start = m.index ?? 0;
    const nextExport = source.indexOf("\nexport ", start + 1);
    const end = nextExport === -1 ? source.length : nextExport;
    return { name: m[1]!, body: source.slice(start, end) };
  });
}

describe('funciones exportadas de modulos "use server"', () => {
  const files = walk(SRC).filter((f) => isUseServerFile(readFileSync(f, "utf8")));

  it("hay archivos use server que revisar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = relative(process.cwd(), file).replaceAll("\\", "/");
    const source = readFileSync(file, "utf8");
    const allowed = new Set(PUBLIC_BY_DESIGN[rel] ?? []);

    for (const fn of exportedAsyncFunctions(source)) {
      if (allowed.has(fn.name)) continue;
      it(`${rel} :: ${fn.name} llama a un guard`, () => {
        expect(
          GUARD.test(fn.body),
          `${fn.name} es un endpoint invocable sin sesion ni ambito: agrega requireLocationScope/requireChainScope/... dentro de la funcion (o, si es publica por diseno, anadela a PUBLIC_BY_DESIGN con justificacion).`,
        ).toBe(true);
      });
    }
  }
});
