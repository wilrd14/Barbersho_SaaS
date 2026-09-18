import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { blockersFromProblems } from "@/lib/payouts/blockers";
import { formatCentsRd } from "@/lib/payouts/format";
import { normalizePercentInput, parseMoneyInputToCents } from "@/lib/payouts/money-input";
import {
  badgeStatusOf,
  formatDateEs,
  formatQuincenaLabel,
  isCalendarQuincena,
  isPeriodFrozen,
  nextQuincena,
  previousQuincena,
  quincenaContaining,
  todayIsoInTimezone,
} from "@/lib/payouts/period";

describe("quincenas calendario", () => {
  it("la quincena que contiene una fecha (incluye febrero bisiesto y no bisiesto)", () => {
    expect(quincenaContaining("2026-09-15")).toEqual({ startsOn: "2026-09-01", endsOn: "2026-09-15" });
    expect(quincenaContaining("2026-09-16")).toEqual({ startsOn: "2026-09-16", endsOn: "2026-09-30" });
    expect(quincenaContaining("2026-12-31")).toEqual({ startsOn: "2026-12-16", endsOn: "2026-12-31" });
    expect(quincenaContaining("2026-02-20")).toEqual({ startsOn: "2026-02-16", endsOn: "2026-02-28" });
    expect(quincenaContaining("2024-02-20")).toEqual({ startsOn: "2024-02-16", endsOn: "2024-02-29" });
    expect(quincenaContaining("2026-02-30")).toBeNull();
    expect(quincenaContaining("no")).toBeNull();
  });

  it("anterior y siguiente, cruzando mes y anio", () => {
    expect(previousQuincena({ startsOn: "2026-09-16", endsOn: "2026-09-30" })).toEqual({ startsOn: "2026-09-01", endsOn: "2026-09-15" });
    expect(previousQuincena({ startsOn: "2026-09-01", endsOn: "2026-09-15" })).toEqual({ startsOn: "2026-08-16", endsOn: "2026-08-31" });
    expect(previousQuincena({ startsOn: "2026-01-01", endsOn: "2026-01-15" })).toEqual({ startsOn: "2025-12-16", endsOn: "2025-12-31" });
    expect(nextQuincena({ startsOn: "2026-09-01", endsOn: "2026-09-15" })).toEqual({ startsOn: "2026-09-16", endsOn: "2026-09-30" });
    expect(nextQuincena({ startsOn: "2026-12-16", endsOn: "2026-12-31" })).toEqual({ startsOn: "2027-01-01", endsOn: "2027-01-15" });
    expect(nextQuincena({ startsOn: "2026-09-02", endsOn: "2026-09-15" })).toBeNull();
    expect(previousQuincena({ startsOn: "2026-09-02", endsOn: "2026-09-15" })).toBeNull();
  });

  it("isCalendarQuincena solo acepta 1-15 y 16-fin de mes del mismo mes", () => {
    expect(isCalendarQuincena("2026-09-01", "2026-09-15")).toBe(true);
    expect(isCalendarQuincena("2026-02-16", "2026-02-28")).toBe(true);
    expect(isCalendarQuincena("2026-02-16", "2026-02-29")).toBe(false);
    expect(isCalendarQuincena("2026-09-01", "2026-09-20")).toBe(false);
    expect(isCalendarQuincena("2026-09-01", "2026-10-15")).toBe(false);
    expect(isCalendarQuincena("2026-09-05", "2026-09-15")).toBe(false);
    expect(isCalendarQuincena("x", "y")).toBe(false);
  });

  it("etiquetas en espanol", () => {
    expect(formatQuincenaLabel("2026-09-01", "2026-09-15")).toBe("Quincena 1–15 sep 2026");
    expect(formatQuincenaLabel("2026-09-16", "2026-09-30")).toBe("Quincena 16–30 sep 2026");
    expect(formatQuincenaLabel("2026-09-01", "2026-10-20")).toBe("1 sep 2026 – 20 oct 2026");
    expect(formatQuincenaLabel("basura", "2026-10-20")).toBe("basura a 2026-10-20");
    expect(formatDateEs("2026-01-05")).toBe("5 ene 2026");
    expect(formatDateEs("basura")).toBe("basura");
  });

  it("hoy en la zona de la cadena, no en la del proceso (23:30 en RD sigue siendo el dia anterior en UTC+)", () => {
    // 2026-09-16 03:30 UTC = 2026-09-15 23:30 en Santo Domingo (UTC-4).
    const instant = new Date("2026-09-16T03:30:00Z");
    expect(todayIsoInTimezone(instant, "America/Santo_Domingo")).toBe("2026-09-15");
    expect(todayIsoInTimezone(instant, "UTC")).toBe("2026-09-16");
  });

  it("estados: vocabulario del Badge e inmutabilidad", () => {
    expect(badgeStatusOf("open")).toBe("abierto");
    expect(badgeStatusOf("calculated")).toBe("calculado");
    expect(badgeStatusOf("approved")).toBe("aprobado");
    expect(badgeStatusOf("paid")).toBe("pagado");
    expect(isPeriodFrozen("calculated")).toBe(false);
    expect(isPeriodFrozen("approved")).toBe(true);
    expect(isPeriodFrozen("paid")).toBe(true);
  });
});

describe("entrada de montos y porcentajes", () => {
  it("monto a centavos sin floats", () => {
    expect(parseMoneyInputToCents("3000")).toBe(300000);
    expect(parseMoneyInputToCents("3,000.5")).toBe(300050);
    expect(parseMoneyInputToCents("RD$ 1,325.00")).toBe(132500);
    expect(parseMoneyInputToCents("0.07")).toBe(7);
    expect(parseMoneyInputToCents("12.345")).toBeNull();
    expect(parseMoneyInputToCents("abc")).toBeNull();
    expect(parseMoneyInputToCents("")).toBeNull();
  });

  it("porcentaje normalizado a numeric(5,2)", () => {
    expect(normalizePercentInput("57.5")).toBe("57.50");
    expect(normalizePercentInput("50%")).toBe("50.00");
    expect(normalizePercentInput("0")).toBe("0.00");
    expect(normalizePercentInput("100")).toBe("100.00");
    expect(normalizePercentInput("100.01")).toBeNull();
    expect(normalizePercentInput("")).toBeNull();
    expect(normalizePercentInput("x")).toBeNull();
  });

  it("formatCentsRd, incluidos negativos", () => {
    expect(formatCentsRd(132500)).toBe("RD$1,325.00");
    expect(formatCentsRd(-132500)).toBe("-RD$1,325.00");
    expect(formatCentsRd(5)).toBe("RD$0.05");
  });
});

describe("blockersFromProblems (bloqueador 4: sin regla de pago)", () => {
  it("agrupa los problemas de regla y deja fuera los que no lo son", () => {
    const blockers = blockersFromProblems([
      { code: "no_rule", message: "Jandy R. no tiene regla de pago en Bella Vista.", barberId: "b", locationId: "l" },
      { code: "unsupported_rule_type", message: "La regla X no esta soportada.", barberId: "b2", locationId: "l" },
      { code: "invalid_input", message: "La venta Z no se puede calcular." },
    ]);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatchObject({ code: "missing_rule", count: 2, href: "/commissions/rules" });
    expect(blockers[0]!.items.map((i) => i.label)).toEqual(["Jandy R. no tiene regla de pago en Bella Vista.", "La regla X no esta soportada."]);
    expect(blockersFromProblems([{ code: "invalid_input", message: "x" }])).toEqual([]);
    expect(blockersFromProblems([])).toEqual([]);
  });
});

describe("guardas estaticas de F3 bloque B (reglas duras)", () => {
  const roots = ["src/lib/payouts", "src/lib/actions"];
  const files: string[] = [];
  for (const root of roots) {
    for (const name of readdirSync(join(process.cwd(), root))) {
      if (/^(cycle|blockers|queries.*|payout-periods|commission-rules|sale-discount-reason)\.ts$/.test(name)) {
        files.push(join(root, name));
      }
    }
  }

  it("hay archivos que revisar", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    it(`${file}: sin Promise.all, sin parseFloat/toFixed y sin Date crudo dentro de plantillas sql`, () => {
      expect(source).not.toMatch(/Promise\.all/);
      expect(source).not.toMatch(/parseFloat|\.toFixed\(/);
      // `sql\`...${algo}\``: nunca interpolar una variable llamada *Date / `new Date` directamente.
      expect(source).not.toMatch(/sql`[^`]*\$\{\s*new Date/);
    });
  }
});
