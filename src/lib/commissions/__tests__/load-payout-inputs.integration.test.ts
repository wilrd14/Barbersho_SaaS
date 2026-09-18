import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { centsFromDecimalString } from "@/lib/actions/money-utils";
import { db } from "@/lib/db/client";

import { computePayoutLines, verifyPayoutInvariant } from "../index";
import { loadPayoutInputs } from "../load-payout-inputs";

/**
 * F3-03 · Capa de lectura contra el Supabase REAL sembrado (`npm run db:seed`).
 *
 * Todo lo que escribe un caso (ventas de fixture) va en una transaccion que
 * SIEMPRE termina en rollback. Las fechas de fixture son de 2099 para no rozar
 * nunca datos reales ni el seed.
 */
const CHAIN = "00000000-0000-0000-0000-000000000001";
const NACO = "00000000-0000-0000-0000-000000000301";
const BELLA_VISTA = "00000000-0000-0000-0000-000000000302";
const BARBER_1 = "00000000-0000-0000-0000-000000000101";
const B3 = "00000000-0000-0000-0000-000000000103";
const ADMIN_NACO = "00000000-0000-0000-0000-000000000011";
const CLIENT = "00000000-0000-0000-0000-000000000701";
const ROLLBACK = "__rollback__";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function inRolledBackTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw new Error(ROLLBACK);
    });
  } catch (err) {
    if (!(err instanceof Error) || err.message !== ROLLBACK) throw err;
  }
  return result;
}

/** Una quincena calendario completa dentro de los ultimos 35 dias de historia del seed (usa Date solo en el test). */
async function lastFullQuincena(): Promise<{ startsOn: string; endsOn: string }> {
  const rows = await db.execute<{ today: string }>(
    sql`select ((now() at time zone 'America/Santo_Domingo')::date)::text as today`,
  );
  const [y, m, d] = rows[0].today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  // Candidatas: la quincena anterior a la que esta en curso hoy.
  if (d >= 16) return { startsOn: `${y}-${pad(m)}-01`, endsOn: `${y}-${pad(m)}-15` };
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return { startsOn: `${py}-${pad(pm)}-16`, endsOn: `${py}-${pad(pm)}-${lastDay(py, pm)}` };
}

async function insertSale(
  tx: Tx,
  o: { id: string; locationId: string; createdAt: string; barberId?: string; subtotal?: string; status?: string; tip?: string },
) {
  const barber = o.barberId ?? BARBER_1;
  await tx.execute(sql`
    insert into sales (id, chain_id, location_id, client_id, barber_id, subtotal, discount_amount, tip_amount, total,
                       payment_method, status, created_by, created_at)
    values (${o.id}, ${CHAIN}, ${o.locationId}, ${CLIENT}, ${barber}, ${o.subtotal ?? "100.00"}, '0', ${o.tip ?? "0"},
            ${o.subtotal ?? "100.00"}, 'cash', ${o.status ?? "paid"}, ${ADMIN_NACO}, ${o.createdAt}::timestamptz)`);
  await tx.execute(sql`
    insert into sale_items (id, sale_id, type, service_id, quantity, unit_price, line_total, barber_id)
    values (${o.id.replace(/^99999999/, "88888888")},
            ${o.id}, 'service', '00000000-0000-0000-0000-000000000401', 1, ${o.subtotal ?? "100.00"},
            ${o.subtotal ?? "100.00"}, ${barber})`);
}

const sid = (n: number) => `99999999-0000-0000-0000-${String(n).padStart(12, "0")}`;

describe("loadPayoutInputs (F3-03, DB real)", () => {
  it("devuelve datos coherentes con las ventas sembradas (conteos y sumas al centavo contra SQL independiente)", async () => {
    const { startsOn, endsOn } = await lastFullQuincena();
    const data = await loadPayoutInputs({ chainId: CHAIN, startsOn, endsOn }, db);

    expect(data.periodStartsOn).toBe(startsOn);
    expect(data.periodEndsOn).toBe(endsOn);
    expect(data.locations).toHaveLength(3);
    expect(data.rules.map((r) => r.type).sort()).toEqual(["booth_rent", "hybrid", "percentage"]);
    expect(data.rules.filter((r) => r.appliesTo === "chain")).toHaveLength(1);
    expect(data.barbers.find((b) => b.id === B3)?.name).toContain("Barbero Tres");

    // Overrides del seed: b3 tiene una regla distinta en cada una de sus dos sedes.
    const b3 = data.assignments.filter((a) => a.barberId === B3);
    expect(b3.map((a) => a.locationId).sort()).toEqual([NACO, BELLA_VISTA].sort());
    expect(new Set(b3.map((a) => a.commissionRuleId)).size).toBe(2);
    expect(b3.every((a) => a.commissionRuleId !== null)).toBe(true);

    // Independiente del loader: conteo y ventas por SQL directo con la fecha local de cada sede.
    const check = await db.execute<{ n: number; revenue: string }>(sql`
      select count(*)::int as n, coalesce(sum(s.subtotal - s.discount_amount), 0)::text as revenue
      from sales s join locations l on l.id = s.location_id
      where s.chain_id = ${CHAIN} and s.status = 'paid'
        and (s.created_at at time zone l.timezone)::date between ${startsOn}::date and ${endsOn}::date`);
    expect(data.sales).toHaveLength(check[0].n);
    expect(data.sales.length).toBeGreaterThan(100);
    const revenueCents = data.sales.reduce((s, x) => s + x.subtotalCents - x.discountCents, 0);
    expect(revenueCents).toBe(centsFromDecimalString(check[0].revenue));

    // Todo entero, todo `paid`, todo dentro del rango, cada venta cuadra con sus lineas.
    for (const s of data.sales) {
      expect(s.status).toBe("paid");
      expect(s.localDate >= startsOn && s.localDate <= endsOn).toBe(true);
      expect(Number.isInteger(s.subtotalCents) && Number.isInteger(s.tipCents)).toBe(true);
      expect(s.items.reduce((a, i) => a + i.lineTotalCents, 0)).toBe(s.subtotalCents);
    }
    // La venta refunded del seed (guion) no esta.
    expect(data.sales.every((s) => s.status === "paid")).toBe(true);
  });

  it("el motor puro sobre los datos reales del seed: sin problemas y el invariante cuadra al centavo", async () => {
    const { startsOn, endsOn } = await lastFullQuincena();
    const data = await loadPayoutInputs({ chainId: CHAIN, startsOn, endsOn }, db);
    const result = computePayoutLines(data);
    if (!result.ok) throw new Error(result.error);

    const pairs = new Set(result.lines.map((l) => `${l.barberId}|${l.locationId}`));
    expect(result.lines.length).toBe(pairs.size); // una linea por (barbero, sede)
    // b3 aparece con dos lineas (Naco y Bella Vista), reglas distintas.
    const b3Lines = result.lines.filter((l) => l.barberId === B3);
    expect(b3Lines).toHaveLength(2);
    expect(new Set(b3Lines.map((l) => l.ruleType)).size).toBe(2);

    const invariant = verifyPayoutInvariant({
      lines: result.lines,
      sales: data.sales,
      periodStartsOn: startsOn,
      periodEndsOn: endsOn,
      locations: data.locations,
    });
    expect(invariant.ok).toBe(true);
  });

  it("la pertenencia al periodo se resuelve en la tz de la sede: 23:45 del ultimo dia entra, 00:15 del siguiente no", async () => {
    const data = await inRolledBackTx(async (tx) => {
      await insertSale(tx, { id: sid(1), locationId: NACO, createdAt: "2099-01-31 23:45:00-04" }); // 03:45 UTC del 1-feb
      await insertSale(tx, { id: sid(2), locationId: NACO, createdAt: "2099-02-01 00:15:00-04" }); // fuera (dia siguiente)
      await insertSale(tx, { id: sid(3), locationId: NACO, createdAt: "2099-01-15 23:59:00-04" }); // fuera (quincena anterior)
      await insertSale(tx, { id: sid(4), locationId: NACO, createdAt: "2099-01-16 00:00:30-04" }); // dentro (1er segundo)
      return loadPayoutInputs({ chainId: CHAIN, startsOn: "2099-01-16", endsOn: "2099-01-31" }, tx);
    });
    expect(data.sales.map((s) => [s.id, s.localDate]).sort()).toEqual([
      [sid(1), "2099-01-31"],
      [sid(4), "2099-01-16"],
    ]);
    expect(data.sales.every((s) => s.items.length === 1)).toBe(true);
  });

  it("usa la zona de LA SEDE, no la de la cadena ni la del servidor (sede en Auckland, UTC+13)", async () => {
    const data = await inRolledBackTx(async (tx) => {
      await tx.execute(sql`update locations set timezone = 'Pacific/Auckland' where id = ${BELLA_VISTA}`);
      // 2099-06-15 20:00 UTC = 2099-06-16 08:00 en Auckland (UTC+12 en invierno austral): dia LOCAL 16.
      await insertSale(tx, { id: sid(11), locationId: BELLA_VISTA, createdAt: "2099-06-15 20:00:00+00" });
      // Misma hora UTC en Naco (UTC-4): dia local 15.
      await insertSale(tx, { id: sid(12), locationId: NACO, createdAt: "2099-06-15 20:00:00+00" });
      const second = await loadPayoutInputs({ chainId: CHAIN, startsOn: "2099-06-16", endsOn: "2099-06-30" }, tx);
      const first = await loadPayoutInputs({ chainId: CHAIN, startsOn: "2099-06-01", endsOn: "2099-06-15" }, tx);
      return { first: first.sales.map((s) => s.id), second: second.sales.map((s) => s.id) };
    });
    expect(data.second).toEqual([sid(11)]); // Auckland: ya es 16
    expect(data.first).toEqual([sid(12)]); // Naco: todavia 15
  });

  it("excluye ventas refunded y open aunque esten en el rango", async () => {
    const data = await inRolledBackTx(async (tx) => {
      await insertSale(tx, { id: sid(21), locationId: NACO, createdAt: "2099-03-05 12:00:00-04" });
      await insertSale(tx, { id: sid(22), locationId: NACO, createdAt: "2099-03-05 12:05:00-04", status: "refunded" });
      await insertSale(tx, { id: sid(23), locationId: NACO, createdAt: "2099-03-05 12:10:00-04", status: "open" });
      return loadPayoutInputs({ chainId: CHAIN, startsOn: "2099-03-01", endsOn: "2099-03-15" }, tx);
    });
    expect(data.sales.map((s) => s.id)).toEqual([sid(21)]);
  });

  it("DESDE DENTRO de una transaccion resuelve en < 2s y no se cuelga (bug de clase: pool max:1)", async () => {
    const { startsOn, endsOn } = await lastFullQuincena();
    const started = Date.now();
    const data = await db.transaction(async (tx) => {
      // Mezcla deliberada: una consulta previa y posterior con `tx` alrededor del loader.
      await tx.execute(sql`select 1`);
      const loaded = await loadPayoutInputs({ chainId: CHAIN, startsOn, endsOn }, tx);
      await tx.execute(sql`select 1`);
      return loaded;
    });
    const elapsed = Date.now() - started;
    expect(data.sales.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000);
  }, 10_000);

  it("es determinista: dos llamadas seguidas devuelven exactamente lo mismo", async () => {
    const { startsOn, endsOn } = await lastFullQuincena();
    const a = await loadPayoutInputs({ chainId: CHAIN, startsOn, endsOn }, db);
    const b = await loadPayoutInputs({ chainId: CHAIN, startsOn, endsOn }, db);
    expect(b).toEqual(a);
  });

  it("otra cadena no ve nada: ni ventas, ni reglas, ni sedes, ni personas", async () => {
    const { startsOn, endsOn } = await lastFullQuincena();
    const data = await loadPayoutInputs(
      { chainId: "11111111-1111-1111-1111-111111111111", startsOn, endsOn },
      db,
    );
    expect(data).toMatchObject({ sales: [], rules: [], locations: [], assignments: [], barbers: [] });
  });

  it("guarda estatica: sin Promise.all, sin Date crudo y sin importar el singleton db como valor", () => {
    const src = readFileSync(new URL("../load-payout-inputs.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(src).not.toContain("Promise.all"); // consultas concurrentes colgaron el pool max:1 (CHANGELOG F3-03)
    expect(src).not.toMatch(/\bDate\b/); // regla dura 3.3
    expect(src).toContain("import type { db }"); // el ejecutor llega por parametro; db solo como tipo
  });

  it("rechaza periodos invalidos antes de tocar la DB", async () => {
    const bad: [string, string][] = [["2026-02-30", "2026-03-15"], ["2026-09-01", "x"], ["2026-09-15", "2026-09-01"]];
    for (const [startsOn, endsOn] of bad) {
      await expect(loadPayoutInputs({ chainId: CHAIN, startsOn, endsOn }, db)).rejects.toThrow("Periodo invalido");
    }
  });
});
