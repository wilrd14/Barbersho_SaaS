/**
 * F2-19 · src/lib/pos — calculo de totales de una venta, puro.
 *
 * Modulo puro (regla dura §3.10 del BACKLOG-F2): no importa `db` ni `next/*`.
 * Recibe datos, devuelve datos. Toda entrada/salida de dinero va en
 * **centavos enteros** (regla dura §3.2) — nunca `Number` con decimales para
 * representar un monto. Los porcentajes (descuento, propina) son enteros
 * 0-100; si el negocio necesita fracciones de punto en el futuro, se escala
 * al PM antes de tocar este modulo (no se agregan decimales de pct aqui).
 *
 * Redondeo: banker's rounding (round-half-to-even) implementado a mano con
 * division entera (`roundHalfToEven`), para no depender de `Math.round` (que
 * redondea siempre hacia arriba en el empate) y para no introducir literales
 * decimales de punto flotante en ningun calculo de dinero.
 */

export type SaleLineInput = {
  serviceId: string;
  barberId: string;
  /** Siempre 'service' en F2 — D-F2-20: la venta de producto no tiene UI. */
  type: "service";
  quantity: number;
  unitPriceCents: number;
};

export type SaleLineResult = SaleLineInput & { lineTotalCents: number };

export type DiscountInput =
  | { kind: "none" }
  | { kind: "percentage"; pct: number; reason: string }
  | { kind: "amount"; amountCents: number; reason: string };

export type TipInput =
  | { kind: "none" }
  | { kind: "percentage"; pct: number }
  | { kind: "amount"; amountCents: number };

/**
 * D-F2-10: `barber` esta topado por `chains.max_barber_discount_pct`. Si esa
 * columna es null, el barbero NO puede descontar nada. `admin`/`superuser`
 * no tienen tope -> "unlimited".
 */
export type MaxDiscountPct = number | "unlimited" | null;

export type ComputeSaleTotalsInput = {
  lines: SaleLineInput[];
  discount: DiscountInput;
  tip: TipInput;
  maxDiscountPct: MaxDiscountPct;
};

export type ComputeSaleTotalsOk = {
  ok: true;
  lines: SaleLineResult[];
  subtotalCents: number;
  discountAmountCents: number;
  tipAmountCents: number;
  totalCents: number;
  /** barbero de la linea de servicio con mayor line_total (D-F2-12). */
  primaryBarberId: string;
};

export type ComputeSaleTotalsError = { ok: false; error: string };

export type ComputeSaleTotalsResult = ComputeSaleTotalsOk | ComputeSaleTotalsError;

/** Redondeo bancario (round-half-to-even) de numerator/denominator, solo enteros. */
export function roundHalfToEven(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error("roundHalfToEven solo acepta enteros");
  }
  if (denominator <= 0) {
    throw new Error("denominator debe ser positivo");
  }
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const quotient = Math.floor(n / denominator);
  const remainder = n - quotient * denominator;
  const twiceRemainder = remainder * 2;
  let rounded: number;
  if (twiceRemainder < denominator) {
    rounded = quotient;
  } else if (twiceRemainder > denominator) {
    rounded = quotient + 1;
  } else {
    rounded = quotient % 2 === 0 ? quotient : quotient + 1;
  }
  return sign * rounded;
}

/** amountCents * pct / 100, redondeado banker's. pct es entero 0-100. */
function pctOf(amountCents: number, pct: number): number {
  return roundHalfToEven(amountCents * pct, 100);
}

function err(error: string): ComputeSaleTotalsError {
  return { ok: false, error };
}

export function computeSaleTotals(input: ComputeSaleTotalsInput): ComputeSaleTotalsResult {
  const { lines, discount, tip, maxDiscountPct } = input;

  if (lines.length === 0) {
    return err("La venta necesita al menos una linea.");
  }

  const lineResults: SaleLineResult[] = [];
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return err(`Cantidad invalida para el servicio ${line.serviceId}.`);
    }
    if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
      return err(`Precio invalido para el servicio ${line.serviceId}.`);
    }
    lineResults.push({ ...line, lineTotalCents: line.quantity * line.unitPriceCents });
  }

  const subtotalCents = lineResults.reduce((sum, l) => sum + l.lineTotalCents, 0);
  if (subtotalCents <= 0) {
    return err("El subtotal debe ser mayor que cero.");
  }

  // --- Descuento -----------------------------------------------------------
  let discountAmountCents = 0;
  let discountPctEquivalent = 0;

  if (discount.kind === "percentage") {
    if (!Number.isInteger(discount.pct) || discount.pct <= 0 || discount.pct > 100) {
      return err("El porcentaje de descuento debe ser un entero entre 1 y 100.");
    }
    if (!discount.reason.trim()) {
      return err("Todo descuento requiere un motivo.");
    }
    discountAmountCents = pctOf(subtotalCents, discount.pct);
    discountPctEquivalent = discount.pct;
  } else if (discount.kind === "amount") {
    if (!Number.isInteger(discount.amountCents) || discount.amountCents <= 0) {
      return err("El monto de descuento debe ser un entero mayor que cero.");
    }
    if (!discount.reason.trim()) {
      return err("Todo descuento requiere un motivo.");
    }
    if (discount.amountCents > subtotalCents) {
      return err("El descuento no puede ser mayor que el subtotal.");
    }
    discountAmountCents = discount.amountCents;
    // Equivalente en pct, redondeado hacia arriba (peor caso) para no dejar
    // pasar un descuento en monto que en realidad excede el tope del rol.
    discountPctEquivalent = Math.ceil((discountAmountCents * 100) / subtotalCents);
  }

  if (discountAmountCents > 0) {
    if (maxDiscountPct === null) {
      return err("Este rol no esta autorizado para aplicar descuentos.");
    }
    if (maxDiscountPct !== "unlimited" && discountPctEquivalent > maxDiscountPct) {
      return err(
        `El descuento excede el tope permitido (${maxDiscountPct}%).`,
      );
    }
  }

  const afterDiscountCents = subtotalCents - discountAmountCents;

  // --- Propina — D-F2-11: sobre el subtotal DESPUES de descuento -----------
  let tipAmountCents = 0;
  if (tip.kind === "percentage") {
    if (!Number.isInteger(tip.pct) || tip.pct < 0 || tip.pct > 100) {
      return err("El porcentaje de propina debe ser un entero entre 0 y 100.");
    }
    tipAmountCents = pctOf(afterDiscountCents, tip.pct);
  } else if (tip.kind === "amount") {
    if (!Number.isInteger(tip.amountCents) || tip.amountCents < 0) {
      return err("El monto de propina debe ser un entero mayor o igual a cero.");
    }
    tipAmountCents = tip.amountCents;
  }

  const totalCents = afterDiscountCents + tipAmountCents;

  // --- D-F2-12: sales.barber_id = barbero de la linea de mayor line_total,
  // desempate por la primera linea creada (orden de `lines` de entrada).
  let primaryBarberId = lineResults[0].barberId;
  let maxLineTotal = lineResults[0].lineTotalCents;
  for (const line of lineResults.slice(1)) {
    if (line.lineTotalCents > maxLineTotal) {
      maxLineTotal = line.lineTotalCents;
      primaryBarberId = line.barberId;
    }
  }

  return {
    ok: true,
    lines: lineResults,
    subtotalCents,
    discountAmountCents,
    tipAmountCents,
    totalCents,
    primaryBarberId,
  };
}
