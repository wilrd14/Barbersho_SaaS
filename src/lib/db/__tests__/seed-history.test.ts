import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { centsFromDecimalString } from "@/lib/actions/money-utils";
import {
  HISTORY_CLIENT_COUNT,
  SEED_UUID_PREFIX,
  generateSeedHistory,
} from "../seed-history";

const NOW = new Date("2026-09-18T18:30:00.000Z"); // 14:30 en Santo Domingo (UTC-4)
const NACO = "00000000-0000-0000-0000-000000000301";
const BELLA_VISTA = "00000000-0000-0000-0000-000000000302";
const B3 = "00000000-0000-0000-0000-000000000103";

describe("generateSeedHistory (F3-01)", () => {
  const h = generateSeedHistory(NOW);

  it("es determinista: mismo `now` => mismas filas exactas", () => {
    expect(generateSeedHistory(NOW)).toEqual(h);
  });

  it("produce cientos de ventas y 24 clientes de historia con IDs y telefonos unicos", () => {
    expect(h.sales.length).toBeGreaterThan(400);
    expect(h.clients).toHaveLength(HISTORY_CLIENT_COUNT);
    expect(new Set(h.sales.map((s) => s.id)).size).toBe(h.sales.length);
    expect(new Set(h.items.map((i) => i.id)).size).toBe(h.items.length);
    expect(new Set(h.clients.map((c) => c.phone)).size).toBe(h.clients.length);
    for (const id of [...h.sales, ...h.items, ...h.clients].map((r) => r.id)) {
      expect(id.startsWith(SEED_UUID_PREFIX)).toBe(true);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it("cada venta cuadra: subtotal = suma de lineas y total = subtotal - descuento + propina (centavos)", () => {
    for (const sale of h.sales) {
      const lines = h.items.filter((i) => i.saleId === sale.id);
      expect(lines.length).toBeGreaterThan(0);
      const sum = lines.reduce((s, l) => s + centsFromDecimalString(l.lineTotal), 0);
      expect(centsFromDecimalString(sale.subtotal)).toBe(sum);
      expect(centsFromDecimalString(sale.total)).toBe(
        sum - centsFromDecimalString(sale.discountAmount) + centsFromDecimalString(sale.tipAmount),
      );
    }
  });

  it("cubre lo que exige F3-01: >=5 barberos, b3 en sus 2 sedes, 3 sedes, descuento con motivo, 1 refunded, tickets de 2 barberos", () => {
    const barbers = new Set(h.items.map((i) => i.barberId));
    expect(barbers.size).toBeGreaterThanOrEqual(5);

    const b3Locations = new Set(
      h.items.filter((i) => i.barberId === B3).map((i) => h.sales.find((s) => s.id === i.saleId)!.locationId),
    );
    expect(b3Locations).toEqual(new Set([NACO, BELLA_VISTA]));
    expect(new Set(h.sales.map((s) => s.locationId)).size).toBe(3);

    const discounted = h.sales.filter((s) => centsFromDecimalString(s.discountAmount) > 0);
    expect(discounted.length).toBeGreaterThan(0);
    expect(discounted.every((s) => (s.discountReason ?? "").trim().length > 0)).toBe(true);

    expect(h.sales.filter((s) => s.status === "refunded")).toHaveLength(1);

    const twoBarbers = h.sales.filter(
      (s) => new Set(h.items.filter((i) => i.saleId === s.id).map((i) => i.barberId)).size === 2,
    );
    expect(twoBarbers.length).toBeGreaterThan(5);
  });

  it("incluye el ticket de guion con residuo de 1 centavo (3 x RD$350 con RD$100.00 de descuento)", () => {
    const sale = h.sales.find((s) => s.discountReason?.includes("residuo de 1 centavo"))!;
    expect(sale.subtotal).toBe("1050.00");
    expect(sale.discountAmount).toBe("100.00");
    const lines = h.items.filter((i) => i.saleId === sale.id);
    expect(lines.map((l) => l.lineTotal)).toEqual(["350.00", "350.00", "350.00"]);
    expect(new Set(lines.map((l) => l.barberId)).size).toBe(2);
  });

  it("nunca hay ventas en el futuro ni de domingo (salvo hoy) y hoy tiene ventas en las 3 sedes", () => {
    for (const s of h.sales) expect(s.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    const localDay = (d: Date) => new Date(d.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
    const today = localDay(NOW);
    const todaySales = h.sales.filter((s) => localDay(s.createdAt) === today);
    expect(new Set(todaySales.map((s) => s.locationId)).size).toBe(3);
    for (const s of h.sales.filter((x) => localDay(x.createdAt) !== today)) {
      expect(new Date(s.createdAt.getTime() - 4 * 3_600_000).getUTCDay()).not.toBe(0);
    }
  });

  it("los clientes de una venta ya existian cuando se hizo la venta", () => {
    const byId = new Map(h.clients.map((c) => [c.id, c]));
    for (const s of h.sales) {
      expect(byId.get(s.clientId)!.createdAt.getTime()).toBeLessThanOrEqual(s.createdAt.getTime());
    }
  });

  it("funciona para cualquier dia de la semana como `now` (incluido domingo y dia 1/16)", () => {
    for (let d = 0; d < 14; d++) {
      const now = new Date(NOW.getTime() + d * 86_400_000);
      const gen = generateSeedHistory(now);
      expect(gen.sales.length).toBeGreaterThan(400);
    }
  });
});

describe("seed.ts — historia (F3-01)", () => {
  it("la historia se re-siembra con borrar+insertar en una transaccion y todo usa tx", async () => {
    const src = await readFile(new URL("../seed.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("async function seedSalesHistory"));
    const body = fn.slice(0, fn.indexOf("async function main"));
    expect(body).toContain("db.transaction");
    expect(body).toContain("tx.delete(sales)");
    expect(body).not.toMatch(/\bdb\s*\.(insert|delete|update|select)/);
  });
});
