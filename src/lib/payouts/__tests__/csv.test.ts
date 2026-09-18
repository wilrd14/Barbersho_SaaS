import { describe, expect, it } from "vitest";

import { buildPayoutCsv, csvText, CSV_HEADERS, type CsvPayoutLine } from "@/lib/payouts/csv";

const line = (over: Partial<CsvPayoutLine> = {}): CsvPayoutLine => ({
  barberName: "Barbero Uno",
  locationName: "Naco",
  servicesCount: 75,
  servicesRevenueCents: 2936000,
  productRevenueCents: 0,
  commissionCents: 1468000,
  boothRentDeductedCents: 0,
  tipsCents: 191650,
  adjustmentsCents: 0,
  netPayableCents: 1659650,
  notes: null,
  ...over,
});

describe("buildPayoutCsv (F3-08)", () => {
  it("BOM UTF-8, CRLF, encabezado y una fila por linea con montos numericos (punto decimal, sin simbolo ni miles)", () => {
    const csv = buildPayoutCsv({ startsOn: "2026-09-01", endsOn: "2026-09-15", status: "approved", lines: [line(), line({ barberName: "Ángel Ñ.", locationName: "Bella Vista", netPayableCents: -132500 })] });
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = csv.slice(1).split("\r\n");
    expect(rows.at(-1)).toBe(""); // termina con CRLF
    expect(rows[0]).toBe(CSV_HEADERS.join(","));
    expect(rows[1]).toBe("2026-09-01,2026-09-15,aprobado,Barbero Uno,Naco,75,29360.00,0.00,14680.00,0.00,1916.50,0.00,16596.50,");
    expect(rows[2]).toContain("Ángel Ñ.,Bella Vista");
    expect(rows[2]).toContain(",-1325.00,");
    // Ningun monto lleva "RD$" ni separador de miles: Excel los lee como numeros.
    for (const row of rows.slice(1, 3)) expect(row).not.toMatch(/RD\$|\d,\d{3}\./);
  });

  it("la suma de la columna neto es exactamente el total (sin fila de totales)", () => {
    const lines = [line({ netPayableCents: 1659650 }), line({ barberName: "B", netPayableCents: 1397624 }), line({ barberName: "C", netPayableCents: -132500 })];
    const csv = buildPayoutCsv({ startsOn: "2026-09-01", endsOn: "2026-09-15", status: "calculated", lines });
    const rows = csv.slice(1).trim().split("\r\n");
    const netIndex = CSV_HEADERS.indexOf("neto");
    expect(rows).toHaveLength(1 + lines.length);
    const sumCents = rows.slice(1).reduce((s, r) => s + Math.round(Number(r.split(",")[netIndex]) * 100), 0);
    expect(sumCents).toBe(lines.reduce((s, l) => s + l.netPayableCents, 0));
  });

  it("entrecomilla comas, comillas y saltos de linea, y neutraliza formulas", () => {
    expect(csvText("Pérez, Juan")).toBe('"Pérez, Juan"');
    expect(csvText('El "Rey"')).toBe('"El ""Rey"""');
    expect(csvText("línea1\nlínea2")).toBe('"línea1\nlínea2"');
    expect(csvText("=SUMA(A1:A2)")).toBe("'=SUMA(A1:A2)");
    expect(csvText("+18095550100")).toBe("'+18095550100");
    expect(csvText("-x")).toBe("'-x");
    expect(csvText("@cmd")).toBe("'@cmd");
    expect(csvText("Naco")).toBe("Naco");
  });

  it("sin lineas: solo el encabezado", () => {
    expect(buildPayoutCsv({ startsOn: "2026-09-01", endsOn: "2026-09-15", status: "open", lines: [] })).toBe(`﻿${CSV_HEADERS.join(",")}\r\n`);
  });

  it("incluye la nota del ajuste", () => {
    const csv = buildPayoutCsv({ startsOn: "2026-09-01", endsOn: "2026-09-15", status: "calculated", lines: [line({ adjustmentsCents: -1500, notes: "Adelanto, quincena pasada" })] });
    expect(csv).toContain(',-15.00,');
    expect(csv).toContain('"Adelanto, quincena pasada"');
  });
});
