import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * Test de idempotencia del seed (S1-16). Este sandbox no tiene un proyecto
 * Supabase real disponible para correr el seed end-to-end, asi que se
 * verifica estaticamente la propiedad que hace idempotente a
 * src/lib/db/seed.ts: todo `db.insert(...).values(...)` debe resolverse con
 * `onConflictDoUpdate` u `onConflictDoNothing` antes del siguiente statement.
 * Esto complementa, no reemplaza, la verificacion manual real ("correr el
 * seed dos veces no duplica filas ni falla") contra un Supabase real.
 */
describe("seed — idempotencia (S1-15)", () => {
  it("cada insert usa onConflictDoUpdate/onConflictDoNothing", async () => {
    const seedSource = await readFile(
      new URL("../seed.ts", import.meta.url),
      "utf8",
    );

    const insertBlocks = seedSource.match(/db\s*\.insert\([\s\S]*?;/g) ?? [];
    expect(insertBlocks.length).toBeGreaterThan(0);

    // `schedules` no tiene constraint unico natural (no forma parte de §4:
    // el backlog no pide uno para day_of_week+user+location), asi que su
    // idempotencia se resuelve con un chequeo previo en aplicacion
    // (ver seedSchedules) en vez de onConflict*. Se excluye de este check
    // estatico y se documenta explicitamente aqui.
    const blocksRequiringOnConflict = insertBlocks.filter(
      (block) => !block.includes("insert(schedules)"),
    );
    expect(blocksRequiringOnConflict.length).toBeGreaterThan(0);

    for (const block of blocksRequiringOnConflict) {
      const isProtected =
        block.includes("onConflictDoUpdate") || block.includes("onConflictDoNothing");
      expect(isProtected, `Bloque sin proteccion de idempotencia:\n${block}`).toBe(true);
    }
  });

  it("las citas de hoy se re-siembran con delete+insert en una transaccion (EXCLUDE no diferido)", async () => {
    const seedSource = await readFile(new URL("../seed.ts", import.meta.url), "utf8");
    const fn = seedSource.slice(seedSource.indexOf("async function seedTodayAppointments"));
    const body = fn.slice(0, fn.indexOf("async function seedQueue"));
    expect(body).toContain("db.transaction");
    expect(body).toContain("tx.delete(appointments)");
    expect(body).not.toContain(".onConflictDoUpdate(");
  });
});
