import { decimalStringFromCents } from "@/lib/actions/money-utils";

/**
 * F3-08 · CSV del Corte de Quincena: una fila por `payout_line`, con todas las
 * columnas del desglose. Es lo que reemplaza el Excel y lo que se le manda al
 * contador. Modulo PURO (sin db ni next).
 *
 * Decisiones (documentadas porque el CSV "se abre bien en Excel" depende de
 * ellas):
 *  - UTF-8 CON BOM: sin el, Excel (Windows) lee las tildes de "Bella Vista" o
 *    "Ángel" como mojibake.
 *  - Separador COMA y fin de linea CRLF: es lo que Excel espera en una
 *    configuracion regional dominicana/estadounidense (lista con coma, punto
 *    decimal). En una regional con coma decimal (p. ej. Espana) Excel usara
 *    `;` y los montos no se reconoceran: el mercado de Kortex es RD (BRAND-BRIEF).
 *  - Montos como NUMEROS: punto decimal, dos decimales, sin separador de miles
 *    ni simbolo ("1325.00", "-1325.00"). Nunca "RD$1,325.00" (eso es texto).
 *  - Los campos de texto se entrecomillan cuando hace falta ("" para comillas
 *    dobles) y se neutralizan contra inyeccion de formulas (un texto que empieza
 *    con = + - @ tab o CR se antepone con un apostrofo).
 *  - SIN fila de totales: quien sume la columna `neto` obtiene exactamente el
 *    total de la pantalla (una fila de totales lo duplicaria).
 */
export interface CsvPayoutLine {
  barberName: string;
  locationName: string;
  servicesCount: number;
  servicesRevenueCents: number;
  productRevenueCents: number;
  commissionCents: number;
  boothRentDeductedCents: number;
  tipsCents: number;
  adjustmentsCents: number;
  netPayableCents: number;
  notes: string | null;
}

export const CSV_HEADERS = [
  "quincena_inicio",
  "quincena_fin",
  "estado",
  "barbero",
  "sede",
  "servicios",
  "ingreso_servicios",
  "ingreso_productos",
  "comision",
  "alquiler_silla",
  "propinas",
  "ajustes",
  "neto",
  "nota",
] as const;

const STATUS_ES: Record<string, string> = {
  open: "abierto",
  calculated: "calculado",
  approved: "aprobado",
  paid: "pagado",
};

export function csvText(value: string): string {
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(value);
  const safe = needsFormulaGuard ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildPayoutCsv(input: {
  startsOn: string;
  endsOn: string;
  status: "open" | "calculated" | "approved" | "paid";
  lines: CsvPayoutLine[];
}): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const l of input.lines) {
    rows.push(
      [
        input.startsOn,
        input.endsOn,
        STATUS_ES[input.status] ?? input.status,
        csvText(l.barberName),
        csvText(l.locationName),
        String(l.servicesCount),
        decimalStringFromCents(l.servicesRevenueCents),
        decimalStringFromCents(l.productRevenueCents),
        decimalStringFromCents(l.commissionCents),
        decimalStringFromCents(l.boothRentDeductedCents),
        decimalStringFromCents(l.tipsCents),
        decimalStringFromCents(l.adjustmentsCents),
        decimalStringFromCents(l.netPayableCents),
        csvText(l.notes ?? ""),
      ].join(","),
    );
  }
  // BOM + CRLF (ver arriba).
  return `﻿${rows.join("\r\n")}\r\n`;
}
