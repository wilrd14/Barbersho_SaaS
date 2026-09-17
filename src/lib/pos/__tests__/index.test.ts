import { describe, expect, it } from "vitest";

import { computeSaleTotals, roundHalfToEven, type SaleLineInput } from "@/lib/pos";

const line = (overrides: Partial<SaleLineInput> = {}): SaleLineInput => ({
  serviceId: "svc-1",
  barberId: "barber-1",
  type: "service",
  quantity: 1,
  unitPriceCents: 73333, // RD$733.33
  ...overrides,
});

describe("roundHalfToEven", () => {
  it("redondea hacia abajo cuando el resto es menor a la mitad", () => {
    expect(roundHalfToEven(101, 100)).toBe(1);
  });

  it("redondea hacia arriba cuando el resto es mayor a la mitad", () => {
    expect(roundHalfToEven(199, 100)).toBe(2);
  });

  it("en un empate exacto redondea al par mas cercano (banker's rounding)", () => {
    // 150/100 = 1.5 exacto -> el par mas cercano es 2
    expect(roundHalfToEven(150, 100)).toBe(2);
    // 250/100 = 2.5 exacto -> el par mas cercano es 2
    expect(roundHalfToEven(250, 100)).toBe(2);
  });

  it("respeta el signo del numerador", () => {
    expect(roundHalfToEven(-199, 100)).toBe(-2);
  });

  it("rechaza entradas no enteras o denominador no positivo", () => {
    expect(() => roundHalfToEven(1.5, 100)).toThrow();
    expect(() => roundHalfToEven(100, 0)).toThrow();
  });
});

describe("computeSaleTotals", () => {
  it("calcula 15% de propina sobre RD$733.33 sin descuento", () => {
    const result = computeSaleTotals({
      lines: [line()],
      discount: { kind: "none" },
      tip: { kind: "percentage", pct: 15 },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subtotalCents).toBe(73333);
    expect(result.tipAmountCents).toBe(11000); // 733.33 * 0.15 = 109.9995 -> 110.00
    expect(result.totalCents).toBe(84333);
  });

  it("rechaza un descuento que excede el tope del barbero", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 100000 })],
      discount: { kind: "percentage", pct: 30, reason: "cliente frecuente" },
      tip: { kind: "none" },
      maxDiscountPct: 15,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/tope/i);
  });

  it("rechaza un descuento mayor que el subtotal", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "amount", amountCents: 20000, reason: "error" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/subtotal/i);
  });

  it("rechaza cualquier descuento si maxDiscountPct es null (sin tope configurado)", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "amount", amountCents: 100, reason: "motivo" },
      tip: { kind: "none" },
      maxDiscountPct: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/autorizado/i);
  });

  it("exige motivo cuando hay descuento > 0", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "amount", amountCents: 500, reason: "" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("propina 0 no cambia el total", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 50000 })],
      discount: { kind: "none" },
      tip: { kind: "percentage", pct: 0 },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tipAmountCents).toBe(0);
    expect(result.totalCents).toBe(50000);
  });

  it("ticket de 2 barberos: barber_id primario es la linea de mayor line_total", () => {
    const result = computeSaleTotals({
      lines: [
        line({ barberId: "barber-A", unitPriceCents: 30000, serviceId: "corte" }),
        line({ barberId: "barber-B", unitPriceCents: 50000, serviceId: "barba" }),
      ],
      discount: { kind: "none" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.primaryBarberId).toBe("barber-B");
    expect(result.subtotalCents).toBe(80000);
  });

  it("desempata por la primera linea creada cuando los totales son iguales", () => {
    const result = computeSaleTotals({
      lines: [
        line({ barberId: "barber-A", unitPriceCents: 40000, serviceId: "corte" }),
        line({ barberId: "barber-B", unitPriceCents: 40000, serviceId: "barba" }),
      ],
      discount: { kind: "none" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.primaryBarberId).toBe("barber-A");
  });

  it("descuento en monto valida el tope convertido a pct equivalente (redondeado hacia arriba)", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      // 1600/10000 = 16% exacto, tope 15% -> debe rechazar
      discount: { kind: "amount", amountCents: 1600, reason: "motivo" },
      tip: { kind: "none" },
      maxDiscountPct: 15,
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza cantidad invalida", () => {
    const result = computeSaleTotals({
      lines: [line({ quantity: 0 })],
      discount: { kind: "none" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza precio unitario invalido", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: -1 })],
      discount: { kind: "none" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza porcentaje de descuento fuera de rango", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "percentage", pct: 0, reason: "motivo" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza monto de descuento invalido (<=0)", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "amount", amountCents: 0, reason: "motivo" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza porcentaje de propina fuera de rango", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "none" },
      tip: { kind: "percentage", pct: 101 },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza monto de propina negativo", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "none" },
      tip: { kind: "amount", amountCents: -100 },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("acepta propina como monto fijo", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "none" },
      tip: { kind: "amount", amountCents: 500 },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tipAmountCents).toBe(500);
    expect(result.totalCents).toBe(10500);
  });

  it("acepta un descuento dentro del tope numerico del rol", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "percentage", pct: 10, reason: "motivo" },
      tip: { kind: "none" },
      maxDiscountPct: 15,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discountAmountCents).toBe(1000);
  });

  it("rechaza un subtotal de cero (todas las lineas a precio cero)", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 0 })],
      discount: { kind: "none" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("exige motivo en descuento por porcentaje", () => {
    const result = computeSaleTotals({
      lines: [line({ unitPriceCents: 10000 })],
      discount: { kind: "percentage", pct: 10, reason: "  " },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza una venta sin lineas", () => {
    const result = computeSaleTotals({
      lines: [],
      discount: { kind: "none" },
      tip: { kind: "none" },
      maxDiscountPct: "unlimited",
    });
    expect(result.ok).toBe(false);
  });

  it("nunca usa literales decimales de punto flotante para dinero (AC F2-19)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const codeOnly = fs
      .readFileSync(path.resolve(__dirname, "../index.ts"), "utf-8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
      .join("\n");
    // Ningun literal numerico con punto decimal (0.15, 1.5, etc) fuera de comentarios.
    expect(codeOnly).not.toMatch(/\b\d+\.\d+\b/);
  });
});
