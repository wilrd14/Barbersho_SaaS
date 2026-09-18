import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  bpsFromPercentString,
  boothRentForPeriod,
  computePayoutLines,
  netPayableCents,
  parseIsoDate,
  prorateDiscount,
  resolvePayoutRule,
  selectPayableSales,
  verifyPayoutInvariant,
  type PayoutAssignment,
  type PayoutInputs,
  type PayoutLine,
  type PayoutRule,
  type PayoutSale,
  type PayoutSaleItem,
} from "../index";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NACO = "loc-naco";
const BV = "loc-bella-vista";
const JANDY = "barber-jandy";
const PEDRO = "barber-pedro";
const LUIS = "barber-luis";

const LOCATIONS = [
  { id: NACO, name: "Naco" },
  { id: BV, name: "Bella Vista" },
];
const BARBERS = [
  { id: JANDY, name: "Jandy R." },
  { id: PEDRO, name: "Pedro R." },
  { id: LUIS, name: "Luis M." },
];

const rule = (over: Partial<PayoutRule> & Pick<PayoutRule, "id" | "type">): PayoutRule => ({
  name: over.id,
  serviceBps: null,
  productBps: null,
  boothRentCents: null,
  boothRentFrequency: null,
  tipHandling: "barber_keeps_all",
  appliesTo: "barber",
  ...over,
});

/** Regla default de la cadena: 50%. */
const CHAIN_50 = rule({ id: "r-chain", name: "Comision estandar 50%", type: "percentage", serviceBps: 5000, appliesTo: "chain" });
/** Silla fija RD$3,000 por lunes. */
const BOOTH_WEEKLY = rule({ id: "r-booth", name: "Silla fija semanal", type: "booth_rent", boothRentCents: 300000, boothRentFrequency: "weekly" });
/** 30% + RD$4,000/mes. */
const HYBRID = rule({ id: "r-hybrid", name: "Mixta", type: "hybrid", serviceBps: 3000, boothRentCents: 400000, boothRentFrequency: "monthly" });

let saleSeq = 0;
function item(barberId: string, lineTotalCents: number, over: Partial<PayoutSaleItem> = {}): PayoutSaleItem {
  saleSeq += 1;
  return { id: `item-${saleSeq}`, type: "service", quantity: 1, lineTotalCents, barberId, ...over };
}
function sale(over: Partial<PayoutSale> & { items: PayoutSaleItem[] }): PayoutSale {
  saleSeq += 1;
  const subtotal = over.items.reduce((s, i) => s + i.lineTotalCents, 0);
  return {
    id: `sale-${saleSeq}`,
    locationId: NACO,
    barberId: over.items[0]?.barberId ?? JANDY,
    localDate: "2026-09-05",
    status: "paid",
    subtotalCents: subtotal,
    discountCents: 0,
    tipCents: 0,
    ...over,
  };
}

function inputs(over: Partial<PayoutInputs>): PayoutInputs {
  return {
    periodStartsOn: "2026-09-01",
    periodEndsOn: "2026-09-15",
    barbers: BARBERS,
    locations: LOCATIONS,
    rules: [CHAIN_50],
    assignments: [],
    sales: [],
    ...over,
  };
}

function okLines(result: ReturnType<typeof computePayoutLines>): PayoutLine[] {
  if (!result.ok) throw new Error(`se esperaba ok, fallo: ${result.error}`);
  return result.lines;
}

/** PRNG con semilla para los tests de propiedades (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// parseIsoDate / bpsFromPercentString / netPayableCents
// ---------------------------------------------------------------------------

describe("parseIsoDate", () => {
  it("acepta fechas reales y rechaza formato o calendario invalido", () => {
    expect(parseIsoDate("2026-09-15")).toEqual({ year: 2026, month: 9, day: 15 });
    expect(parseIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 }); // bisiesto
    expect(parseIsoDate("2100-02-29")).toBeNull(); // 2100 no es bisiesto
    expect(parseIsoDate("2000-02-29")).not.toBeNull(); // 2000 si
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2026-04-31")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-00-10")).toBeNull();
    expect(parseIsoDate("2026-09-00")).toBeNull();
    expect(parseIsoDate("2026-9-1")).toBeNull();
    expect(parseIsoDate("no-es-fecha")).toBeNull();
    expect(parseIsoDate("2026-01-31")).not.toBeNull();
    expect(parseIsoDate("2026-06-30")).not.toBeNull();
    expect(parseIsoDate("2026-11-30")).not.toBeNull();
    expect(parseIsoDate("2026-11-31")).toBeNull();
  });
});

describe("bpsFromPercentString", () => {
  it("convierte numeric(5,2) a puntos basicos enteros sin float", () => {
    expect(bpsFromPercentString("57.50")).toBe(5750);
    expect(bpsFromPercentString("50")).toBe(5000);
    expect(bpsFromPercentString("50.00")).toBe(5000);
    expect(bpsFromPercentString("0.5")).toBe(50);
    expect(bpsFromPercentString("7.5")).toBe(750);
    expect(bpsFromPercentString("0")).toBe(0);
    expect(bpsFromPercentString("100")).toBe(10000);
    expect(bpsFromPercentString("100.00")).toBe(10000);
    expect(bpsFromPercentString(" 12.34 ")).toBe(1234);
    expect(bpsFromPercentString("0.07")).toBe(7);
  });

  it("lanza con basura, negativos, mas de 2 decimales o fuera de 0-100", () => {
    for (const bad of ["", "abc", "-5", "1.234", "100.01", "101", "1000", "5,5"]) {
      expect(() => bpsFromPercentString(bad), bad).toThrow();
    }
  });
});

describe("netPayableCents (D-F3-6)", () => {
  it("comision + propinas + ajustes - alquiler, y puede ser negativo (no se trunca)", () => {
    expect(netPayableCents({ commissionCents: 100000, tipsCents: 5000, adjustmentsCents: -2500, boothRentDeductedCents: 30000 })).toBe(72500);
    expect(netPayableCents({ commissionCents: 100000, tipsCents: 0, adjustmentsCents: 0, boothRentDeductedCents: 300000 })).toBe(-200000);
  });
});

// ---------------------------------------------------------------------------
// D-F3-5 · prorrateo del descuento
// ---------------------------------------------------------------------------

describe("prorateDiscount (D-F3-5)", () => {
  it("sin descuento, las bases son los line_total", () => {
    expect(prorateDiscount([35000, 25000], 0)).toEqual([35000, 25000]);
    expect(prorateDiscount([], 0)).toEqual([]);
  });

  it("descuento proporcional exacto: 10% de 500+250", () => {
    expect(prorateDiscount([50000, 25000], 7500)).toEqual([45000, 22500]);
  });

  it("residuo impar de 1 centavo: 3 lineas de RD$350 con RD$100.00 => 33.33 c/u, el centavo va a la PRIMERA linea", () => {
    const bases = prorateDiscount([35000, 35000, 35000], 10000);
    expect(bases).toEqual([31666, 31667, 31667]);
    expect(bases.reduce((s, b) => s + b, 0)).toBe(105000 - 10000);
  });

  it("el residuo cae en la linea de MAYOR line_total aunque no sea la primera", () => {
    // 2 x RD$250 y 1 x RD$500, RD$0.01 de descuento: todas redondean a 0 => residuo 1 a la de 500.
    expect(prorateDiscount([25000, 25000, 50000], 1)).toEqual([25000, 25000, 49999]);
    expect(prorateDiscount([25000, 50000, 25000], 1)).toEqual([25000, 49999, 25000]);
  });

  it("residuo NEGATIVO: los descuentos prorrateados redondean hacia arriba y sobran centavos", () => {
    // 999 * 500/1000 = 499.5 -> 500 (par); 999 * 250/1000 = 249.75 -> 250; suma 1000, sobra 1.
    const bases = prorateDiscount([500, 250, 250], 999);
    expect(bases).toEqual([1, 0, 0]);
    expect(bases.reduce((s, b) => s + b, 0)).toBe(1000 - 999);
  });

  it("empate exacto entre lineas: gana la primera por orden de creacion", () => {
    // 1 * 100/200 = 0.5 -> banker's a 0 en ambas; residuo 1 a la primera.
    expect(prorateDiscount([100, 100], 1)).toEqual([99, 100]);
  });

  it("ticket de 2 barberos con descuento impar (seed): RD$500 + RD$250, descuento RD$100.01", () => {
    // 10001*50000/75000 = 6667.33 -> 6667; 10001*25000/75000 = 3333.67 -> 3334; suma exacta.
    const bases = prorateDiscount([50000, 25000], 10001);
    expect(bases).toEqual([43333, 21666]);
    expect(bases[0] + bases[1]).toBe(75000 - 10001);
  });

  it("descuento del 100%: todas las bases en cero", () => {
    expect(prorateDiscount([35000, 25000], 60000)).toEqual([0, 0]);
  });

  it("propiedad (3000 tickets aleatorios): suma de bases = subtotal - descuento, ninguna base negativa, todo entero", () => {
    const next = rng(42);
    for (let n = 0; n < 3000; n++) {
      const lineCount = 1 + Math.floor(next() * 5);
      const lines = Array.from({ length: lineCount }, () => 1 + Math.floor(next() * 200000));
      const subtotal = lines.reduce((s, l) => s + l, 0);
      const discount = Math.floor(next() * (subtotal + 1));
      const bases = prorateDiscount(lines, discount);
      expect(bases.reduce((s, b) => s + b, 0)).toBe(subtotal - discount);
      for (const b of bases) {
        expect(Number.isInteger(b)).toBe(true);
        expect(b).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// D-F3-8 · alquiler de silla
// ---------------------------------------------------------------------------

/** Oraculo independiente (usa Date, solo en el test): lunes en [a, b]. */
function mondaysOracle(a: string, b: string): number {
  let count = 0;
  for (let t = Date.parse(`${a}T00:00:00Z`); t <= Date.parse(`${b}T00:00:00Z`); t += 86_400_000) {
    if (new Date(t).getUTCDay() === 1) count++;
  }
  return count;
}

function quincenasOf(year: number): { startsOn: string; endsOn: string }[] {
  const out: { startsOn: string; endsOn: string }[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    out.push({ startsOn: `${year}-${mm}-01`, endsOn: `${year}-${mm}-15` });
    out.push({ startsOn: `${year}-${mm}-16`, endsOn: `${year}-${mm}-${last}` });
  }
  return out;
}

describe("boothRentForPeriod (D-F3-8)", () => {
  const rent = (frequency: "weekly" | "biweekly" | "monthly", amountCents: number, startsOn: string, endsOn: string) =>
    boothRentForPeriod({ amountCents, frequency, startsOn, endsOn });

  it("biweekly: integro, una vez por periodo", () => {
    expect(rent("biweekly", 250000, "2026-09-01", "2026-09-15")).toEqual({ ok: true, cents: 250000 });
    expect(rent("biweekly", 250000, "2026-09-16", "2026-09-30")).toEqual({ ok: true, cents: 250000 });
  });

  it("monthly: la mitad en cada quincena", () => {
    expect(rent("monthly", 400000, "2026-09-01", "2026-09-15")).toEqual({ ok: true, cents: 200000 });
    expect(rent("monthly", 400000, "2026-09-16", "2026-09-30")).toEqual({ ok: true, cents: 200000 });
  });

  it("monthly con monto impar: el centavo residual va en la SEGUNDA quincena y las dos mitades suman el total", () => {
    const first = rent("monthly", 300001, "2026-09-01", "2026-09-15");
    const second = rent("monthly", 300001, "2026-09-16", "2026-09-30");
    expect(first).toEqual({ ok: true, cents: 150000 });
    expect(second).toEqual({ ok: true, cents: 150001 });
    expect(150000 + 150001).toBe(300001);
  });

  it("monthly: la segunda quincena llega al ultimo dia real del mes (feb 28, feb bisiesto 29, mes de 31)", () => {
    expect(rent("monthly", 1000, "2027-02-16", "2027-02-28")).toEqual({ ok: true, cents: 500 });
    expect(rent("monthly", 1000, "2028-02-16", "2028-02-29")).toEqual({ ok: true, cents: 500 });
    expect(rent("monthly", 1000, "2026-10-16", "2026-10-31")).toEqual({ ok: true, cents: 500 });
    // 16-28 en un febrero bisiesto NO es la quincena completa.
    expect(rent("monthly", 1000, "2028-02-16", "2028-02-28").ok).toBe(false);
  });

  it("monthly rechaza periodos que no son una quincena calendario", () => {
    for (const [a, b] of [
      ["2026-09-01", "2026-09-30"],
      ["2026-09-01", "2026-09-14"],
      ["2026-09-02", "2026-09-15"],
      ["2026-09-10", "2026-09-20"],
      ["2026-08-16", "2026-09-15"], // cruza de mes
      ["2025-09-01", "2026-09-15"], // cruza de ano
    ]) {
      const result = rent("monthly", 400000, a, b);
      expect(result.ok, `${a}..${b}`).toBe(false);
      if (!result.ok) expect(result.error).toContain("quincena calendario");
    }
  });

  it("weekly: monto x lunes del periodo — 2 lunes en sep 1-15 y 3 lunes en jun 1-15 de 2026", () => {
    // Lunes de sep 2026: 7, 14, 21, 28. Lunes de jun 2026: 1, 8, 15, 22, 29.
    expect(rent("weekly", 300000, "2026-09-01", "2026-09-15")).toEqual({ ok: true, cents: 600000 });
    expect(rent("weekly", 300000, "2026-09-16", "2026-09-30")).toEqual({ ok: true, cents: 600000 });
    expect(rent("weekly", 300000, "2026-06-01", "2026-06-15")).toEqual({ ok: true, cents: 900000 });
    expect(rent("weekly", 300000, "2026-06-16", "2026-06-30")).toEqual({ ok: true, cents: 600000 });
  });

  it("weekly: un periodo de un solo dia cuenta 1 si es lunes y 0 si no", () => {
    expect(rent("weekly", 100, "2026-09-07", "2026-09-07")).toEqual({ ok: true, cents: 100 });
    expect(rent("weekly", 100, "2026-09-08", "2026-09-08")).toEqual({ ok: true, cents: 0 });
  });

  it("weekly: el conteo de lunes coincide con un oraculo con Date para TODAS las quincenas de 2024-2032", () => {
    for (let year = 2024; year <= 2032; year++) {
      let yearMondays = 0;
      for (const q of quincenasOf(year)) {
        const expected = mondaysOracle(q.startsOn, q.endsOn);
        expect(rent("weekly", 1, q.startsOn, q.endsOn), `${q.startsOn}`).toEqual({ ok: true, cents: expected });
        expect([1, 2, 3]).toContain(expected); // feb 16-28 puede tener solo 1
        yearMondays += expected;
      }
      expect(yearMondays).toBe(mondaysOracle(`${year}-01-01`, `${year}-12-31`)); // 52 o 53
    }
    // 2026: exactamente 52 semanas (las 24 quincenas suman 52 lunes).
    const total2026 = quincenasOf(2026).reduce((s, q) => {
      const r = rent("weekly", 1, q.startsOn, q.endsOn);
      return s + (r.ok ? r.cents : 0);
    }, 0);
    expect(total2026).toBe(52);
  });

  it("weekly tambien cuenta bien cruzando el ano (dic 2025 - ene 2026) y fechas pre-1970", () => {
    expect(rent("weekly", 1, "2025-12-16", "2026-01-15")).toEqual({ ok: true, cents: mondaysOracle("2025-12-16", "2026-01-15") });
    expect(rent("weekly", 1, "1969-12-01", "1970-01-31")).toEqual({ ok: true, cents: mondaysOracle("1969-12-01", "1970-01-31") });
    expect(rent("weekly", 1, "1900-03-01", "1900-03-31")).toEqual({ ok: true, cents: mondaysOracle("1900-03-01", "1900-03-31") });
  });

  it("rechaza fechas invalidas o fin anterior al inicio, en cualquier frecuencia", () => {
    for (const frequency of ["weekly", "biweekly", "monthly"] as const) {
      expect(rent(frequency, 100, "2026-02-30", "2026-03-15").ok).toBe(false);
      expect(rent(frequency, 100, "2026-03-01", "2026-13-15").ok).toBe(false);
      expect(rent(frequency, 100, "2026-09-15", "2026-09-01").ok).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// D-F3-3 · resolucion de la regla
// ---------------------------------------------------------------------------

describe("resolvePayoutRule (D-F3-3)", () => {
  const base = { barbers: BARBERS, locations: LOCATIONS };

  it("el override de barber_locations gana sobre la regla de la cadena", () => {
    const r = resolvePayoutRule({
      ...base,
      barberId: JANDY,
      locationId: NACO,
      rules: [CHAIN_50, HYBRID],
      assignments: [{ barberId: JANDY, locationId: NACO, commissionRuleId: HYBRID.id }],
    });
    expect(r).toEqual({ ok: true, rule: HYBRID });
  });

  it("sin override (o override null) usa la regla default de la cadena", () => {
    const none = resolvePayoutRule({ ...base, barberId: JANDY, locationId: NACO, rules: [CHAIN_50, HYBRID], assignments: [] });
    const nullOverride = resolvePayoutRule({
      ...base,
      barberId: JANDY,
      locationId: NACO,
      rules: [CHAIN_50, HYBRID],
      assignments: [{ barberId: JANDY, locationId: NACO, commissionRuleId: null }],
    });
    expect(none).toEqual({ ok: true, rule: CHAIN_50 });
    expect(nullOverride).toEqual({ ok: true, rule: CHAIN_50 });
  });

  it("el override es por par exacto: el de Naco no aplica en Bella Vista", () => {
    const r = resolvePayoutRule({
      ...base,
      barberId: JANDY,
      locationId: BV,
      rules: [CHAIN_50, HYBRID],
      assignments: [{ barberId: JANDY, locationId: NACO, commissionRuleId: HYBRID.id }],
    });
    expect(r).toEqual({ ok: true, rule: CHAIN_50 });
  });

  it("sin override ni regla de cadena: error que nombra al barbero y la sede (nada de 0% ni 50% por defecto)", () => {
    const r = resolvePayoutRule({ ...base, barberId: JANDY, locationId: BV, rules: [HYBRID], assignments: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.message).toBe("Jandy R. no tiene regla de pago en Bella Vista.");
      expect(r.problem).toMatchObject({ code: "no_rule", barberId: JANDY, locationId: BV });
    }
  });

  it("override que apunta a una regla inexistente: error explicito (no cae silenciosamente a la de cadena)", () => {
    const r = resolvePayoutRule({
      ...base,
      barberId: PEDRO,
      locationId: NACO,
      rules: [CHAIN_50],
      assignments: [{ barberId: PEDRO, locationId: NACO, commissionRuleId: "regla-borrada" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem.message).toContain("Pedro R. tiene asignada en Naco una regla de pago que ya no existe");
  });

  it("si el barbero o la sede no vienen en las listas, el mensaje usa su id en vez de romper", () => {
    const r = resolvePayoutRule({ barbers: [], locations: [], barberId: "b-x", locationId: "l-y", rules: [], assignments: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem.message).toBe("b-x no tiene regla de pago en l-y.");
  });
});

// ---------------------------------------------------------------------------
// selectPayableSales
// ---------------------------------------------------------------------------

describe("selectPayableSales (D-F3-1)", () => {
  it("solo `paid` dentro del rango inclusive; excluye refunded, open y fechas fuera", () => {
    const paid = (d: string) => sale({ localDate: d, items: [item(JANDY, 1000)] });
    const list: PayoutSale[] = [
      paid("2026-09-01"), // borde inicial: entra
      paid("2026-09-15"), // borde final: entra
      paid("2026-08-31"), // fuera
      paid("2026-09-16"), // fuera
      sale({ status: "refunded", items: [item(JANDY, 1000)] }),
      sale({ status: "open", items: [item(JANDY, 1000)] }),
    ];
    const picked = selectPayableSales(list, "2026-09-01", "2026-09-15");
    expect(picked.map((s) => s.localDate)).toEqual(["2026-09-01", "2026-09-15"]);
  });
});

// ---------------------------------------------------------------------------
// computePayoutLines
// ---------------------------------------------------------------------------

describe("computePayoutLines — caso base y periodo vacio", () => {
  it("periodo sin ventas => cero lineas, no error", () => {
    expect(computePayoutLines(inputs({}))).toEqual({ ok: true, lines: [] });
  });

  it("periodo con ventas solo refunded/open/fuera de rango => cero lineas", () => {
    const result = computePayoutLines(
      inputs({
        sales: [
          sale({ status: "refunded", tipCents: 1000, items: [item(JANDY, 35000)] }),
          sale({ status: "open", items: [item(JANDY, 35000)] }),
          sale({ localDate: "2026-08-31", items: [item(JANDY, 35000)] }),
        ],
      }),
    );
    expect(result).toEqual({ ok: true, lines: [] });
  });

  it("barbero de una sola sede con la regla de la cadena (50%): montos exactos", () => {
    // Venta A: corte RD$350 + propina RD$35. Venta B: fade RD$500 con RD$50 de descuento.
    const lines = okLines(
      computePayoutLines(
        inputs({
          sales: [
            sale({ tipCents: 3500, items: [item(JANDY, 35000)] }),
            sale({ discountCents: 5000, items: [item(JANDY, 50000)] }),
          ],
        }),
      ),
    );
    expect(lines).toEqual([
      {
        barberId: JANDY,
        locationId: NACO,
        ruleId: "r-chain",
        ruleType: "percentage",
        servicesCount: 2,
        servicesRevenueCents: 80000, // 350 + (500 - 50)
        productRevenueCents: 0,
        commissionCents: 40000, // 50% de 800
        boothRentDeductedCents: 0,
        tipsCents: 3500,
        adjustmentsCents: 0,
        netPayableCents: 43500,
      },
    ]);
  });

  it("aplica banker's rounding sobre el ingreso agregado: 57.50% de RD$1.01 => 58 centavos (par)", () => {
    // 101 * 5750 / 10000 = 58.075 -> 58 ; 33 * 5750/10000 = 18.975 -> 19
    const r = rule({ id: "r-57", type: "percentage", serviceBps: 5750, appliesTo: "chain" });
    const one = okLines(computePayoutLines(inputs({ rules: [r], sales: [sale({ items: [item(JANDY, 101)] })] })));
    expect(one[0].commissionCents).toBe(58);
    const two = okLines(computePayoutLines(inputs({ rules: [r], sales: [sale({ items: [item(JANDY, 33)] })] })));
    expect(two[0].commissionCents).toBe(19);
    // empate exacto: 50% de 1 centavo = 0.5 -> 0 (par); 50% de 3 centavos = 1.5 -> 2 (par)
    expect(okLines(computePayoutLines(inputs({ sales: [sale({ items: [item(JANDY, 1)] })] })))[0].commissionCents).toBe(0);
    expect(okLines(computePayoutLines(inputs({ sales: [sale({ items: [item(JANDY, 3)] })] })))[0].commissionCents).toBe(2);
  });
});

describe("computePayoutLines — multi-sede y atribucion por linea", () => {
  it("barbero multi-sede con override distinto por sede => DOS lineas con montos distintos que suman su total", () => {
    // Luis: Naco = mixta (30% + RD$4,000/mes), Bella Vista = silla fija semanal (RD$3,000 x lunes).
    // Periodo sep 1-15 2026: 2 lunes => renta BV 6,000; renta Naco = mitad de 4,000 = 2,000.
    const assignments: PayoutAssignment[] = [
      { barberId: LUIS, locationId: NACO, commissionRuleId: HYBRID.id },
      { barberId: LUIS, locationId: BV, commissionRuleId: BOOTH_WEEKLY.id },
    ];
    const lines = okLines(
      computePayoutLines(
        inputs({
          rules: [CHAIN_50, BOOTH_WEEKLY, HYBRID],
          assignments,
          sales: [
            sale({ locationId: NACO, tipCents: 2000, items: [item(LUIS, 1_000_000)] }), // RD$10,000
            sale({ locationId: BV, tipCents: 3000, items: [item(LUIS, 900_000)] }), // RD$9,000
          ],
        }),
      ),
    );
    expect(lines).toHaveLength(2);
    const bv = lines.find((l) => l.locationId === BV)!;
    const naco = lines.find((l) => l.locationId === NACO)!;

    // Naco (mixta): comision 30% de 10,000 = 3,000; renta 2,000; propina 20 => neto 1,020.
    expect(naco).toMatchObject({
      ruleId: "r-hybrid",
      servicesRevenueCents: 1_000_000,
      commissionCents: 300_000,
      boothRentDeductedCents: 200_000,
      tipsCents: 2000,
      netPayableCents: 302_000 - 200_000 + 0,
    });
    expect(naco.netPayableCents).toBe(102_000);
    // Bella Vista (silla fija): comision = 100% de 9,000; renta 6,000; propina 30 => neto 3,030.
    expect(bv).toMatchObject({
      ruleId: "r-booth",
      commissionCents: 900_000,
      boothRentDeductedCents: 600_000,
      tipsCents: 3000,
    });
    expect(bv.netPayableCents).toBe(303_000);
    // El total del barbero es la suma de sus dos lineas.
    expect(naco.netPayableCents + bv.netPayableCents).toBe(405_000);
  });

  it("mismo barbero, misma cadena, porcentaje distinto por sede (50% cadena vs 60% override)", () => {
    const sixty = rule({ id: "r-60", type: "percentage", serviceBps: 6000 });
    const lines = okLines(
      computePayoutLines(
        inputs({
          rules: [CHAIN_50, sixty],
          assignments: [{ barberId: LUIS, locationId: BV, commissionRuleId: "r-60" }],
          sales: [
            sale({ locationId: NACO, items: [item(LUIS, 100_000)] }),
            sale({ locationId: BV, items: [item(LUIS, 100_000)] }),
          ],
        }),
      ),
    );
    expect(lines.find((l) => l.locationId === NACO)!.commissionCents).toBe(50_000);
    expect(lines.find((l) => l.locationId === BV)!.commissionCents).toBe(60_000);
  });

  it("ticket de 2 barberos con descuento: bases prorrateadas (suma exacta subtotal - descuento), propina al barbero de la venta", () => {
    // Fade (Jandy) RD$500 + barba (Pedro) RD$250 = 750, descuento RD$100.01, propina RD$50 a Jandy.
    const s = sale({
      barberId: JANDY,
      discountCents: 10001,
      tipCents: 5000,
      items: [item(JANDY, 50000), item(PEDRO, 25000)],
    });
    const lines = okLines(computePayoutLines(inputs({ sales: [s] })));
    const jandy = lines.find((l) => l.barberId === JANDY)!;
    const pedro = lines.find((l) => l.barberId === PEDRO)!;
    expect(jandy.servicesRevenueCents).toBe(43333);
    expect(pedro.servicesRevenueCents).toBe(21666);
    expect(jandy.servicesRevenueCents + pedro.servicesRevenueCents).toBe(75000 - 10001);
    // 50% de 433.33 = 216.665 -> 216.66 (par, banker's); 50% de 216.66 = 108.33
    expect(jandy.commissionCents).toBe(21666);
    expect(pedro.commissionCents).toBe(10833);
    expect(jandy.tipsCents).toBe(5000);
    expect(pedro.tipsCents).toBe(0);
    expect(jandy.netPayableCents).toBe(26666);
  });

  it("descuento con residuo de 1 centavo entre 3 lineas (b1, b2, b1): el centavo va a la primera linea", () => {
    const s = sale({
      barberId: JANDY,
      discountCents: 10000,
      items: [item(JANDY, 35000), item(PEDRO, 35000), item(JANDY, 35000)],
    });
    const lines = okLines(computePayoutLines(inputs({ sales: [s] })));
    expect(lines.find((l) => l.barberId === JANDY)!.servicesRevenueCents).toBe(31666 + 31667);
    expect(lines.find((l) => l.barberId === PEDRO)!.servicesRevenueCents).toBe(31667);
    expect(lines.find((l) => l.barberId === JANDY)!.servicesCount).toBe(2);
  });

  it("services_count suma `quantity` de las lineas de servicio", () => {
    const lines = okLines(
      computePayoutLines(inputs({ sales: [sale({ items: [item(JANDY, 70000, { quantity: 2 }), item(JANDY, 25000, { quantity: 1 })] })] })),
    );
    expect(lines[0].servicesCount).toBe(3);
  });

  it("propina de una venta cuyo barbero no tiene lineas propias: linea con propina y cero servicios", () => {
    const s = sale({ barberId: PEDRO, tipCents: 1500, items: [item(JANDY, 35000)] });
    const lines = okLines(computePayoutLines(inputs({ sales: [s] })));
    const pedro = lines.find((l) => l.barberId === PEDRO)!;
    expect(pedro).toMatchObject({ servicesCount: 0, servicesRevenueCents: 0, commissionCents: 0, tipsCents: 1500, netPayableCents: 1500 });
  });

  it("la salida es determinista: independiente del orden de las ventas y ordenada por sede y barbero", () => {
    const sales = [
      sale({ locationId: BV, items: [item(PEDRO, 10000)] }),
      sale({ locationId: NACO, items: [item(LUIS, 20000)] }),
      sale({ locationId: NACO, items: [item(JANDY, 30000)] }),
      sale({ locationId: BV, items: [item(JANDY, 40000)] }),
    ];
    const a = okLines(computePayoutLines(inputs({ sales })));
    const b = okLines(computePayoutLines(inputs({ sales: [...sales].reverse() })));
    expect(a).toEqual(b);
    const keys = a.map((l) => `${l.locationId}|${l.barberId}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("computePayoutLines — tipos de regla", () => {
  it("silla fija con neto NEGATIVO: se guarda negativo, no se trunca a cero (D-F3-6)", () => {
    // Produjo RD$1,000; renta semanal RD$3,000 x 2 lunes = RD$6,000 => -RD$5,000.
    const lines = okLines(
      computePayoutLines(
        inputs({
          rules: [CHAIN_50, BOOTH_WEEKLY],
          assignments: [{ barberId: PEDRO, locationId: NACO, commissionRuleId: BOOTH_WEEKLY.id }],
          sales: [sale({ items: [item(PEDRO, 100000)] })],
        }),
      ),
    );
    expect(lines[0]).toMatchObject({
      ruleType: "booth_rent",
      commissionCents: 100000,
      boothRentDeductedCents: 600000,
      netPayableCents: -500000,
    });
  });

  it("hybrid: comision de porcentaje + alquiler; renta weekly en quincena de 3 lunes vs 2 lunes", () => {
    const hybridWeekly = rule({ id: "r-hw", type: "hybrid", serviceBps: 4000, boothRentCents: 100000, boothRentFrequency: "weekly" });
    const make = (startsOn: string, endsOn: string, localDate: string) =>
      okLines(
        computePayoutLines(
          inputs({
            periodStartsOn: startsOn,
            periodEndsOn: endsOn,
            rules: [CHAIN_50, hybridWeekly],
            assignments: [{ barberId: JANDY, locationId: NACO, commissionRuleId: "r-hw" }],
            sales: [sale({ localDate, items: [item(JANDY, 500000)] })],
          }),
        ),
      )[0];
    const threeMondays = make("2026-06-01", "2026-06-15", "2026-06-10"); // lunes 1, 8, 15
    const twoMondays = make("2026-09-01", "2026-09-15", "2026-09-10"); // lunes 7, 14
    expect(threeMondays).toMatchObject({ commissionCents: 200000, boothRentDeductedCents: 300000, netPayableCents: -100000 });
    expect(twoMondays).toMatchObject({ commissionCents: 200000, boothRentDeductedCents: 200000, netPayableCents: 0 });
  });

  it("hybrid mensual con monto impar: 1a quincena floor(mitad), 2a quincena el resto; suman el total", () => {
    const odd = rule({ id: "r-odd", type: "hybrid", serviceBps: 1000, boothRentCents: 300001, boothRentFrequency: "monthly" });
    const assign: PayoutAssignment[] = [{ barberId: JANDY, locationId: NACO, commissionRuleId: "r-odd" }];
    const q = (startsOn: string, endsOn: string, localDate: string) =>
      okLines(
        computePayoutLines(inputs({ periodStartsOn: startsOn, periodEndsOn: endsOn, rules: [CHAIN_50, odd], assignments: assign, sales: [sale({ localDate, items: [item(JANDY, 100000)] })] })),
      )[0].boothRentDeductedCents;
    const first = q("2026-09-01", "2026-09-15", "2026-09-02");
    const second = q("2026-09-16", "2026-09-30", "2026-09-20");
    expect(first).toBe(150000);
    expect(second).toBe(150001);
    expect(first + second).toBe(300001);
  });

  it("biweekly: la renta integra una vez por periodo", () => {
    const bw = rule({ id: "r-bw", type: "booth_rent", boothRentCents: 250000, boothRentFrequency: "biweekly" });
    const lines = okLines(
      computePayoutLines(
        inputs({
          rules: [CHAIN_50, bw],
          assignments: [{ barberId: JANDY, locationId: NACO, commissionRuleId: "r-bw" }],
          sales: [sale({ items: [item(JANDY, 400000)] }), sale({ items: [item(JANDY, 100000)] })],
        }),
      ),
    );
    expect(lines[0]).toMatchObject({ boothRentDeductedCents: 250000, commissionCents: 500000, netPayableCents: 250000 });
  });

  it("lineas de producto: descuento prorrateado entre servicio y producto; comision por porcentaje de producto", () => {
    // Servicio RD$300 (x2 => qty 2) + producto RD$100, descuento RD$40: 30 al servicio... => bases 270 + 90.
    const withProducts = rule({ id: "r-p", type: "percentage", serviceBps: 5000, productBps: 1000, appliesTo: "chain" });
    const s = sale({
      discountCents: 4000,
      items: [item(JANDY, 30000, { quantity: 2 }), item(JANDY, 10000, { type: "product" })],
    });
    const lines = okLines(computePayoutLines(inputs({ rules: [withProducts], sales: [s] })));
    expect(lines[0]).toMatchObject({
      servicesCount: 2,
      servicesRevenueCents: 27000,
      productRevenueCents: 9000,
      commissionCents: 13500 + 900,
    });
    // Invariante de cuadre: servicios + producto = subtotal - descuento.
    const check = verifyPayoutInvariant({ lines, sales: [s], periodStartsOn: "2026-09-01", periodEndsOn: "2026-09-15", locations: LOCATIONS });
    expect(check.ok).toBe(true);
  });

  it("booth_rent no paga porcentaje sobre producto (solo se queda con su ingreso de servicios)", () => {
    const booth = rule({ id: "r-b", type: "booth_rent", boothRentCents: 0, boothRentFrequency: "biweekly", appliesTo: "chain" });
    const s = sale({ items: [item(JANDY, 30000), item(JANDY, 10000, { type: "product" })] });
    const lines = okLines(computePayoutLines(inputs({ rules: [booth], sales: [s] })));
    expect(lines[0]).toMatchObject({ commissionCents: 30000, productRevenueCents: 10000, boothRentDeductedCents: 0 });
  });

  it("percentage sin productBps pero SIN ingreso de producto no es problema", () => {
    const lines = okLines(computePayoutLines(inputs({ sales: [sale({ items: [item(JANDY, 10000)] })] })));
    expect(lines[0].productRevenueCents).toBe(0);
  });
});

describe("computePayoutLines — errores (nombran barbero y sede, se acumulan)", () => {
  it("fixed_per_service es rechazado con mensaje explicito (D-F3-4)", () => {
    const fixed = rule({ id: "r-fx", name: "Fijo por corte", type: "fixed_per_service", appliesTo: "chain" });
    const result = computePayoutLines(inputs({ rules: [fixed], sales: [sale({ items: [item(JANDY, 35000)] })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]).toMatchObject({ code: "unsupported_rule_type", barberId: JANDY, locationId: NACO });
      expect(result.error).toContain('"Fijo por corte"');
      expect(result.error).toContain("monto fijo por servicio");
      expect(result.error).toContain("Jandy R. en Naco");
    }
  });

  it("barbero sin regla resoluble: 'Jandy R. no tiene regla de pago en Bella Vista.'", () => {
    const result = computePayoutLines(
      inputs({ rules: [], sales: [sale({ locationId: BV, items: [item(JANDY, 35000)] })] }),
    );
    expect(result).toMatchObject({ ok: false, error: "Jandy R. no tiene regla de pago en Bella Vista." });
  });

  it("acumula TODOS los problemas de una pasada (dos barberos sin regla) y no devuelve lineas parciales", () => {
    const result = computePayoutLines(
      inputs({
        rules: [],
        sales: [
          sale({ items: [item(JANDY, 35000)] }),
          sale({ locationId: BV, items: [item(PEDRO, 35000)] }),
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.map((p) => p.barberId).sort()).toEqual([JANDY, PEDRO].sort());
      expect(result.error).toContain("Jandy R. no tiene regla de pago en Naco.");
      expect(result.error).toContain("Pedro R. no tiene regla de pago en Bella Vista.");
    }
  });

  it("un barbero con problema no oculta a los que si calculan: falla todo el periodo (no queda 'calculated' a medias)", () => {
    const result = computePayoutLines(
      inputs({
        rules: [CHAIN_50],
        assignments: [{ barberId: PEDRO, locationId: NACO, commissionRuleId: "no-existe" }],
        sales: [sale({ items: [item(JANDY, 35000)] }), sale({ items: [item(PEDRO, 35000)] })],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("reglas mal configuradas: cada campo faltante da su propio mensaje con barbero y sede", () => {
    const cases: { r: PayoutRule; text: string }[] = [
      { r: rule({ id: "x1", name: "Sin pct", type: "percentage", appliesTo: "chain" }), text: "no define el porcentaje por servicio" },
      { r: rule({ id: "x2", name: "Hibrida sin pct", type: "hybrid", boothRentCents: 100, boothRentFrequency: "weekly", appliesTo: "chain" }), text: "no define el porcentaje por servicio" },
      { r: rule({ id: "x3", name: "Silla sin monto", type: "booth_rent", boothRentFrequency: "weekly", appliesTo: "chain" }), text: "no define el monto del alquiler" },
      { r: rule({ id: "x4", name: "Silla sin frecuencia", type: "booth_rent", boothRentCents: 100, appliesTo: "chain" }), text: "no define la frecuencia del alquiler" },
      { r: rule({ id: "x5", name: "Hibrida sin frecuencia", type: "hybrid", serviceBps: 3000, boothRentCents: 100, appliesTo: "chain" }), text: "no define la frecuencia del alquiler" },
    ];
    for (const { r, text } of cases) {
      const result = computePayoutLines(inputs({ rules: [r], sales: [sale({ items: [item(JANDY, 35000)] })] }));
      expect(result.ok, r.id).toBe(false);
      if (!result.ok) {
        expect(result.problems[0]).toMatchObject({ code: "invalid_rule", barberId: JANDY, locationId: NACO });
        expect(result.error).toContain(text);
        expect(result.error).toContain("Jandy R. en Naco");
      }
    }
  });

  it("ingreso de producto con regla sin porcentaje de producto: error (no se asume 0%)", () => {
    const result = computePayoutLines(
      inputs({ sales: [sale({ items: [item(JANDY, 30000), item(JANDY, 10000, { type: "product" })] })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no define el porcentaje por producto");
  });

  it("propinas por porcentaje (split_pct) no soportadas: error explicito (D-F3-7)", () => {
    const split = rule({ id: "r-sp", name: "Propina repartida", type: "percentage", serviceBps: 5000, tipHandling: "split_pct", appliesTo: "chain" });
    const result = computePayoutLines(inputs({ rules: [split], sales: [sale({ items: [item(JANDY, 35000)] })] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0].code).toBe("unsupported_tip_handling");
      expect(result.error).toContain("Propina repartida");
    }
  });

  it("tip_handling null se asume barber_keeps_all", () => {
    const nullTip = rule({ id: "r-nt", type: "percentage", serviceBps: 5000, tipHandling: null, appliesTo: "chain" });
    const lines = okLines(computePayoutLines(inputs({ rules: [nullTip], sales: [sale({ tipCents: 700, items: [item(JANDY, 10000)] })] })));
    expect(lines[0].tipsCents).toBe(700);
  });

  it("alquiler mensual en un periodo que no es quincena calendario: problema de periodo con nombres", () => {
    const result = computePayoutLines(
      inputs({
        periodStartsOn: "2026-09-01",
        periodEndsOn: "2026-09-30",
        rules: [CHAIN_50, HYBRID],
        assignments: [{ barberId: LUIS, locationId: NACO, commissionRuleId: HYBRID.id }],
        sales: [sale({ items: [item(LUIS, 100000)] })],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems[0]).toMatchObject({ code: "invalid_period", barberId: LUIS, locationId: NACO });
      expect(result.error).toContain("Luis M. en Naco");
    }
  });

  it("periodo invalido (fecha imposible, fin < inicio): problema de periodo", () => {
    for (const [a, b] of [["2026-02-30", "2026-03-15"], ["2026-09-01", "no"], ["2026-09-15", "2026-09-01"]]) {
      const result = computePayoutLines(inputs({ periodStartsOn: a, periodEndsOn: b }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problems[0].code).toBe("invalid_period");
    }
  });

  it("mas de una regla default de cadena: entrada invalida (el indice unico de la DB lo impide)", () => {
    const result = computePayoutLines(inputs({ rules: [CHAIN_50, { ...CHAIN_50, id: "r-chain-2" }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0].code).toBe("invalid_input");
  });

  it("ventas con datos inconsistentes se reportan por id (no se calculan a ciegas)", () => {
    const good = (over: Partial<PayoutSale>) => sale({ items: [item(JANDY, 10000)], ...over });
    const cases: { s: PayoutSale; text: string }[] = [
      { s: good({ localDate: "2026-09-10 " }), text: "fecha operativa invalida" },
      { s: good({ subtotalCents: 10000.5 }), text: "montos invalidos" },
      { s: good({ tipCents: -1 }), text: "montos invalidos" },
      { s: good({ discountCents: -1 }), text: "montos invalidos" },
      { s: good({ subtotalCents: -5 }), text: "montos invalidos" },
      { s: good({ discountCents: 20000 }), text: "el descuento excede el subtotal" },
      { s: good({ items: [item(JANDY, 10000, { quantity: 0 })] }), text: "cantidad invalida" },
      { s: good({ items: [item(JANDY, 10000, { quantity: 1.5 })] }), text: "cantidad invalida" },
      { s: good({ items: [item(JANDY, -10000)], subtotalCents: 0 }), text: "monto invalido en la linea" },
      { s: good({ items: [item(JANDY, 10000.5)], subtotalCents: 10000 }), text: "monto invalido en la linea" },
      { s: good({ subtotalCents: 12000 }), text: "no coincide con la suma de sus lineas" },
      { s: good({ items: [], subtotalCents: 10000 }), text: "no coincide con la suma de sus lineas" },
    ];
    for (const { s, text } of cases) {
      const result = computePayoutLines(inputs({ sales: [s] }));
      expect(result.ok, text).toBe(false);
      if (!result.ok) {
        expect(result.problems[0].code).toBe("invalid_input");
        expect(result.error).toContain(s.id);
        expect(result.error).toContain(text);
      }
    }
  });

  it("una venta sin lineas y de subtotal 0 es valida y no genera linea de servicios (solo propina)", () => {
    const empty = sale({ items: [item(JANDY, 0)], subtotalCents: 0, tipCents: 500 });
    const lines = okLines(computePayoutLines(inputs({ sales: [empty] })));
    expect(lines[0]).toMatchObject({ servicesRevenueCents: 0, tipsCents: 500, netPayableCents: 500 });
  });
});

// ---------------------------------------------------------------------------
// D-F3-11 · invariante de cuadre
// ---------------------------------------------------------------------------

describe("verifyPayoutInvariant (D-F3-11)", () => {
  const period = { periodStartsOn: "2026-09-01", periodEndsOn: "2026-09-15", locations: LOCATIONS };

  function scenario() {
    const sales = [
      sale({ locationId: NACO, tipCents: 3500, items: [item(JANDY, 35000)] }),
      sale({ locationId: NACO, discountCents: 10001, tipCents: 5000, items: [item(JANDY, 50000), item(PEDRO, 25000)] }),
      sale({ locationId: BV, tipCents: 100, items: [item(LUIS, 45000)] }),
      sale({ status: "refunded", tipCents: 9999, items: [item(JANDY, 99900)] }), // se excluye
    ];
    const lines = okLines(computePayoutLines(inputs({ sales })));
    return { sales, lines };
  }

  it("cuadra: las cifras esperadas salen de los totales de la venta y coinciden con las lineas", () => {
    const { sales, lines } = scenario();
    const check = verifyPayoutInvariant({ lines, sales, ...period });
    expect(check.ok).toBe(true);
    // Naco: 350 + (750 - 100.01) = 999.99 ; propinas 35 + 50 = 85. Bella Vista: 450 y 1.
    expect(check.figures).toEqual([
      { locationId: BV, expectedRevenueCents: 45000, actualRevenueCents: 45000, expectedTipsCents: 100, actualTipsCents: 100 },
      { locationId: NACO, expectedRevenueCents: 99999, actualRevenueCents: 99999, expectedTipsCents: 8500, actualTipsCents: 8500 },
    ]);
  });

  it("periodo sin ventas ni lineas: cuadra con cero cifras", () => {
    expect(verifyPayoutInvariant({ lines: [], sales: [], ...period })).toEqual({ ok: true, figures: [] });
  });

  it("un centavo de mas en ingreso => NO cuadra y reporta las cifras de la sede", () => {
    const { sales, lines } = scenario();
    const tampered = lines.map((l) => (l.locationId === NACO && l.barberId === JANDY ? { ...l, servicesRevenueCents: l.servicesRevenueCents + 1 } : l));
    const check = verifyPayoutInvariant({ lines: tampered, sales, ...period });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.mismatches).toHaveLength(1);
      expect(check.mismatches[0]).toMatchObject({ locationId: NACO, expectedRevenueCents: 99999, actualRevenueCents: 100000 });
      expect(check.error).toContain("Naco: ingreso esperado 99999 vs calculado 100000 centavos");
      expect(check.error).toContain("propinas esperadas 8500 vs calculadas 8500");
    }
  });

  it("un centavo de menos en propinas => NO cuadra", () => {
    const { sales, lines } = scenario();
    const tampered = lines.map((l) => (l.locationId === BV ? { ...l, tipsCents: l.tipsCents - 1 } : l));
    const check = verifyPayoutInvariant({ lines: tampered, sales, ...period });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.mismatches.map((m) => m.locationId)).toEqual([BV]);
  });

  it("producto + servicio cuentan juntos como ingreso de la linea", () => {
    const s = sale({ items: [item(JANDY, 10000), item(JANDY, 5000, { type: "product" })] });
    const lines = [{ ...okLines(computePayoutLines(inputs({ rules: [{ ...CHAIN_50, productBps: 0 }], sales: [s] })))[0] }];
    expect(verifyPayoutInvariant({ lines, sales: [s], ...period }).ok).toBe(true);
  });

  it("una linea en una sede sin ventas (o una venta sin lineas) tambien es discrepancia; usa el id si no hay nombre", () => {
    const { sales, lines } = scenario();
    const ghost: PayoutLine = { ...lines[0], locationId: "loc-fantasma", servicesRevenueCents: 100, productRevenueCents: 0, tipsCents: 0 };
    const check = verifyPayoutInvariant({ lines: [...lines, ghost], sales, ...period });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toContain("loc-fantasma: ingreso esperado 0 vs calculado 100");
  });

  it("propiedad (300 periodos aleatorios): lo que calcula computePayoutLines siempre cuadra con verifyPayoutInvariant", () => {
    const next = rng(7);
    const barbers = [JANDY, PEDRO, LUIS];
    const locs = [NACO, BV];
    const services = [25000, 35000, 45000, 50000, 65000, 80000];
    for (let n = 0; n < 300; n++) {
      const sales: PayoutSale[] = [];
      const count = Math.floor(next() * 40);
      for (let i = 0; i < count; i++) {
        const lineCount = 1 + Math.floor(next() * 3);
        const items = Array.from({ length: lineCount }, () =>
          item(barbers[Math.floor(next() * 3)], services[Math.floor(next() * services.length)]),
        );
        const subtotal = items.reduce((s, it) => s + it.lineTotalCents, 0);
        const day = 1 + Math.floor(next() * 17); // 1..17: algunas caen fuera del periodo
        sales.push({
          id: `p-${n}-${i}`,
          locationId: locs[Math.floor(next() * 2)],
          barberId: items[0].barberId,
          localDate: `2026-09-${String(day).padStart(2, "0")}`,
          status: next() < 0.1 ? "refunded" : "paid",
          subtotalCents: subtotal,
          discountCents: next() < 0.2 ? Math.floor(next() * (subtotal + 1)) : 0,
          tipCents: next() < 0.5 ? Math.floor(next() * 20000) : 0,
          items,
        });
      }
      const result = computePayoutLines(
        inputs({
          rules: [CHAIN_50, BOOTH_WEEKLY, HYBRID],
          assignments: [
            { barberId: LUIS, locationId: NACO, commissionRuleId: HYBRID.id },
            { barberId: LUIS, locationId: BV, commissionRuleId: BOOTH_WEEKLY.id },
            { barberId: PEDRO, locationId: BV, commissionRuleId: HYBRID.id },
          ],
          sales,
        }),
      );
      const lines = okLines(result);
      const check = verifyPayoutInvariant({ lines, sales, ...period });
      expect(check.ok, `caso ${n}`).toBe(true);
      for (const l of lines) {
        for (const v of [l.servicesRevenueCents, l.commissionCents, l.boothRentDeductedCents, l.tipsCents, l.netPayableCents]) {
          expect(Number.isInteger(v)).toBe(true);
        }
        expect(l.netPayableCents).toBe(l.commissionCents + l.tipsCents - l.boothRentDeductedCents);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Pureza del modulo (regla dura §3.1 y §3.11): verificable con grep
// ---------------------------------------------------------------------------

describe("pureza del modulo", () => {
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  // Sin comentarios ni literales de texto: solo el codigo ejecutable.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`[^`]*`/g, "``")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/\/\^[^\n]*\/\.exec/g, "/re/.exec");

  it("no usa float, Date, reloj ni azar en el codigo", () => {
    for (const forbidden of [/parseFloat/, /toFixed/, /toPrecision/, /Number\([^)]*\)\s*\*\s*100/, /\bnew Date\b/, /Date\.(now|UTC|parse)/, /Math\.random/, /\b\d+\.\d+\b/, /Intl\./]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("solo importa roundHalfToEven de @/lib/pos (sin db, next, ni server-only)", () => {
    const imports = [...source.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);
    expect(imports).toEqual(["@/lib/pos"]);
    expect(source).toMatch(/import \{ roundHalfToEven \} from "@\/lib\/pos";/);
  });
});
