/**
 * F3-02 · src/lib/commissions — motor de comisiones, PURO.
 *
 * Regla dura §3.11 de BACKLOG-F3: no importa `db`, ni `next/*`, ni `Date`, ni
 * el reloj, ni la zona horaria del proceso. Recibe datos ya cargados (F3-03
 * los lee de la DB y los normaliza) y devuelve datos. Las fechas entran como
 * strings `YYYY-MM-DD` ya resueltas en la zona de la sede (D-F3-2) y aqui solo
 * se manipulan con aritmetica de enteros (calendario civil), sin `Date`.
 *
 * Dinero (regla dura §3.1): TODO monto entra y sale en **centavos enteros**;
 * los porcentajes entran como **puntos basicos enteros** (57.50% -> 5750,
 * `bpsFromPercentString`). Toda division usa `roundHalfToEven` de `@/lib/pos`
 * (D-F3-20: importado, no duplicado). No hay `parseFloat`, ni `toFixed`, ni
 * multiplicaciones por decimales en este archivo (verificable con grep, y hay
 * un test que lo hace).
 *
 * Contrato de errores: como `lib/pos`, las funciones "de negocio" devuelven
 * `{ ok: false, error, problems }` en vez de lanzar. Los `problems` nombran al
 * barbero y a la sede (D-F3-3: "Jandy R. no tiene regla de pago en Bella
 * Vista") y se acumulan todos en una pasada, para que el gerente resuelva la
 * lista completa de una vez. Solo `bpsFromPercentString` lanza (entrada
 * corrupta de la DB = bug, no dato de usuario).
 */
import { roundHalfToEven } from "@/lib/pos";

// ---------------------------------------------------------------------------
// Tipos de entrada (ya normalizados por la capa de lectura, F3-03)
// ---------------------------------------------------------------------------

export type PayoutRuleType = "percentage" | "fixed_per_service" | "booth_rent" | "hybrid";
export type BoothRentFrequency = "weekly" | "biweekly" | "monthly";

/** Una fila de `commission_rules`, con montos en centavos y porcentajes en puntos basicos. */
export interface PayoutRule {
  id: string;
  name: string;
  type: PayoutRuleType;
  /** service_commission_pct x 100 (57.50% -> 5750). */
  serviceBps: number | null;
  /** product_commission_pct x 100. */
  productBps: number | null;
  boothRentCents: number | null;
  boothRentFrequency: BoothRentFrequency | null;
  /** D-F3-7: solo `barber_keeps_all` (o null, que se asume igual) esta soportado en F3. */
  tipHandling: "barber_keeps_all" | "split_pct" | null;
  appliesTo: "chain" | "location" | "barber";
}

export interface PayoutBarber {
  id: string;
  name: string;
}

export interface PayoutLocation {
  id: string;
  name: string;
}

/** Una fila de `barber_locations`: `commissionRuleId` es el override por sede (D-F3-3), null = regla de cadena. */
export interface PayoutAssignment {
  barberId: string;
  locationId: string;
  commissionRuleId: string | null;
}

/** Una fila de `sale_items`. El orden del arreglo es el orden de creacion (desempate de D-F3-5). */
export interface PayoutSaleItem {
  id: string;
  type: "service" | "product";
  quantity: number;
  lineTotalCents: number;
  /** `sale_items.barber_id`: la atribucion es por LINEA, nunca por `sales.barber_id` (D-F3-1). */
  barberId: string;
}

export interface PayoutSale {
  id: string;
  locationId: string;
  /** `sales.barber_id`: solo se usa para atribuir la propina (D-F3-7). */
  barberId: string;
  /** Fecha operativa YYYY-MM-DD ya convertida a la zona de la sede (D-F3-2). */
  localDate: string;
  status: "open" | "paid" | "refunded";
  subtotalCents: number;
  discountCents: number;
  tipCents: number;
  items: PayoutSaleItem[];
}

export interface PayoutInputs {
  /** Inclusive, YYYY-MM-DD. */
  periodStartsOn: string;
  /** Inclusive, YYYY-MM-DD. */
  periodEndsOn: string;
  barbers: PayoutBarber[];
  locations: PayoutLocation[];
  rules: PayoutRule[];
  assignments: PayoutAssignment[];
  sales: PayoutSale[];
}

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export type PayoutProblemCode =
  | "invalid_period"
  | "invalid_input"
  | "no_rule"
  | "invalid_rule"
  | "unsupported_rule_type"
  | "unsupported_tip_handling";

export interface PayoutProblem {
  code: PayoutProblemCode;
  message: string;
  barberId?: string;
  locationId?: string;
}

/** Una fila de `payout_lines` (montos en centavos). */
export interface PayoutLine {
  barberId: string;
  locationId: string;
  /** Regla efectivamente aplicada (para auditoria y recibo). */
  ruleId: string;
  ruleType: PayoutRuleType;
  servicesCount: number;
  servicesRevenueCents: number;
  productRevenueCents: number;
  commissionCents: number;
  boothRentDeductedCents: number;
  tipsCents: number;
  adjustmentsCents: number;
  netPayableCents: number;
}

export type ComputePayoutResult =
  | { ok: true; lines: PayoutLine[] }
  | { ok: false; error: string; problems: PayoutProblem[] };

// ---------------------------------------------------------------------------
// Fechas civiles YYYY-MM-DD sin `Date` (aritmetica de enteros)
// ---------------------------------------------------------------------------

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Parsea `YYYY-MM-DD` estricto y valida que sea una fecha de calendario real; si no, null. */
export function parseIsoDate(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Dias desde 1970-01-01 (algoritmo de calendario civil de H. Hinnant, solo enteros). */
function daysFromCivil({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** El dia 4 desde 1970-01-01 (jueves) fue el primer lunes: lunes <=> (n - 4) multiplo de 7. */
function mondaysUpTo(dayNumber: number): number {
  return Math.floor((dayNumber - 4) / 7);
}

/** Cantidad de lunes en [startsOn, endsOn] (ambos inclusive). Fechas ya validadas. */
function countMondays(start: CivilDate, end: CivilDate): number {
  return mondaysUpTo(daysFromCivil(end)) - mondaysUpTo(daysFromCivil(start) - 1);
}

/** 1 = primera quincena (1-15), 2 = segunda (16-fin de mes), null = no es una quincena calendario. */
function quincenaOf(start: CivilDate, end: CivilDate): 1 | 2 | null {
  if (start.year !== end.year || start.month !== end.month) return null;
  if (start.day === 1 && end.day === 15) return 1;
  if (start.day === 16 && end.day === daysInMonth(end.year, end.month)) return 2;
  return null;
}

// ---------------------------------------------------------------------------
// Porcentajes -> puntos basicos (D-F3-20)
// ---------------------------------------------------------------------------

/**
 * `numeric(5,2)` como string -> puntos basicos enteros, sin pasar por float:
 * "57.50" -> 5750, "50" -> 5000, "0.5" -> 50. Lanza si el valor no es un
 * porcentaje 0-100 con a lo sumo 2 decimales (dato corrupto, no de usuario).
 */
export function bpsFromPercentString(value: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Porcentaje invalido: "${value}"`);
  const wholePercent = Number(match[1]);
  const hundredths = Number((match[2] ?? "").padEnd(2, "0"));
  const bps = wholePercent * 100 + hundredths;
  if (bps > 10000) throw new Error(`Porcentaje fuera de rango (0-100): "${value}"`);
  return bps;
}

// ---------------------------------------------------------------------------
// D-F3-5 · prorrateo del descuento de la venta entre sus lineas
// ---------------------------------------------------------------------------

/**
 * Bases de comision por linea (`lineTotal - descuento prorrateado`), en
 * centavos.
 *
 *   descuentoLinea = roundHalfToEven(descuento * lineTotal, subtotal)
 *
 * El residuo (descuento de la venta menos la suma de los descuentos
 * prorrateados, puede ser positivo o negativo) se asigna INTEGRO a la linea de
 * mayor `lineTotal`; en empate, a la primera por orden de creacion (indice
 * menor). Asi la suma de las bases es EXACTAMENTE `subtotal - descuento`.
 *
 * Precondicion (la valida `computePayoutLines`): enteros, 0 <= descuento <=
 * subtotal = suma de `lineTotals`.
 */
export function prorateDiscount(lineTotalsCents: number[], discountCents: number): number[] {
  if (discountCents === 0) return [...lineTotalsCents];

  const subtotalCents = lineTotalsCents.reduce((sum, t) => sum + t, 0);
  const shares = lineTotalsCents.map((t) => roundHalfToEven(discountCents * t, subtotalCents));
  const residueCents = discountCents - shares.reduce((sum, s) => sum + s, 0);

  let largest = 0;
  for (let i = 1; i < lineTotalsCents.length; i++) {
    if (lineTotalsCents[i] > lineTotalsCents[largest]) largest = i;
  }
  shares[largest] += residueCents;

  return lineTotalsCents.map((t, i) => t - shares[i]);
}

// ---------------------------------------------------------------------------
// D-F3-8 · alquiler de silla imputado a una quincena
// ---------------------------------------------------------------------------

export type BoothRentResult = { ok: true; cents: number } | { ok: false; error: string };

/**
 * Alquiler que se descuenta en UN periodo:
 * - `biweekly`: integro, una vez por periodo.
 * - `monthly`: la mitad en cada quincena; el centavo residual de una division
 *   impar va en la SEGUNDA quincena. Exige que el periodo sea una quincena
 *   calendario (1-15 o 16-fin de mes).
 * - `weekly`: `monto x cantidad de lunes` dentro del periodo (2 o 3 por quincena).
 */
export function boothRentForPeriod(input: {
  amountCents: number;
  frequency: BoothRentFrequency;
  startsOn: string;
  endsOn: string;
}): BoothRentResult {
  const start = parseIsoDate(input.startsOn);
  const end = parseIsoDate(input.endsOn);
  if (!start || !end || daysFromCivil(end) < daysFromCivil(start)) {
    return { ok: false, error: `Periodo invalido: ${input.startsOn} a ${input.endsOn}.` };
  }

  if (input.frequency === "biweekly") return { ok: true, cents: input.amountCents };

  if (input.frequency === "weekly") {
    return { ok: true, cents: input.amountCents * countMondays(start, end) };
  }

  const half = quincenaOf(start, end);
  if (half === null) {
    return {
      ok: false,
      error: "El alquiler mensual solo se puede imputar a una quincena calendario (1-15 o 16-fin de mes).",
    };
  }
  const firstHalf = Math.floor(input.amountCents / 2);
  return { ok: true, cents: half === 1 ? firstHalf : input.amountCents - firstHalf };
}

// ---------------------------------------------------------------------------
// D-F3-6 · neto a pagar
// ---------------------------------------------------------------------------

/** `commission + tips + adjustments - boothRent`. Puede ser NEGATIVO y no se trunca (D-F3-6). */
export function netPayableCents(parts: {
  commissionCents: number;
  tipsCents: number;
  adjustmentsCents: number;
  boothRentDeductedCents: number;
}): number {
  return parts.commissionCents + parts.tipsCents + parts.adjustmentsCents - parts.boothRentDeductedCents;
}

// ---------------------------------------------------------------------------
// D-F3-3 · resolucion de la regla de un (barbero, sede)
// ---------------------------------------------------------------------------

export type ResolveRuleResult = { ok: true; rule: PayoutRule } | { ok: false; problem: PayoutProblem };

function nameOf(names: Map<string, string>, id: string): string {
  return names.get(id) ?? id;
}

/**
 * Dos niveles, sin default silencioso: 1) el override de `barber_locations` de
 * esa fila exacta; 2) la unica regla `applies_to = 'chain'`. Si no hay
 * ninguna, error que nombra al barbero y a la sede. Nunca se asume 0% ni 50%.
 */
export function resolvePayoutRule(input: {
  barberId: string;
  locationId: string;
  barbers: PayoutBarber[];
  locations: PayoutLocation[];
  rules: PayoutRule[];
  assignments: PayoutAssignment[];
}): ResolveRuleResult {
  const barberName = nameOf(new Map(input.barbers.map((b) => [b.id, b.name])), input.barberId);
  const locationName = nameOf(new Map(input.locations.map((l) => [l.id, l.name])), input.locationId);
  const noRule = (message: string): ResolveRuleResult => ({
    ok: false,
    problem: { code: "no_rule", message, barberId: input.barberId, locationId: input.locationId },
  });

  const assignment = input.assignments.find(
    (a) => a.barberId === input.barberId && a.locationId === input.locationId,
  );
  if (assignment?.commissionRuleId) {
    const override = input.rules.find((r) => r.id === assignment.commissionRuleId);
    if (!override) {
      return noRule(
        `${barberName} tiene asignada en ${locationName} una regla de pago que ya no existe. Asigna otra regla.`,
      );
    }
    return { ok: true, rule: override };
  }

  const chainDefault = input.rules.find((r) => r.appliesTo === "chain");
  if (!chainDefault) {
    return noRule(`${barberName} no tiene regla de pago en ${locationName}.`);
  }
  return { ok: true, rule: chainDefault };
}

// ---------------------------------------------------------------------------
// Seleccion de ventas pagables del periodo
// ---------------------------------------------------------------------------

/**
 * D-F3-1: solo cuentan las ventas `paid` (las `refunded` se excluyen por
 * completo; las `open` tampoco pagan: bloquean la aprobacion, D-F3-10) cuya
 * fecha operativa local cae en [startsOn, endsOn]. YYYY-MM-DD ordena igual
 * como texto que como fecha.
 */
export function selectPayableSales(
  sales: PayoutSale[],
  periodStartsOn: string,
  periodEndsOn: string,
): PayoutSale[] {
  return sales.filter(
    (s) => s.status === "paid" && s.localDate >= periodStartsOn && s.localDate <= periodEndsOn,
  );
}

function validateSale(sale: PayoutSale): string | null {
  if (parseIsoDate(sale.localDate) === null) return `fecha operativa invalida (${sale.localDate})`;
  const ints = [sale.subtotalCents, sale.discountCents, sale.tipCents];
  if (!ints.every(Number.isInteger) || sale.subtotalCents < 0 || sale.discountCents < 0 || sale.tipCents < 0) {
    return "montos invalidos (deben ser centavos enteros no negativos)";
  }
  if (sale.discountCents > sale.subtotalCents) return "el descuento excede el subtotal";
  let itemsTotal = 0;
  for (const item of sale.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return `cantidad invalida en la linea ${item.id}`;
    if (!Number.isInteger(item.lineTotalCents) || item.lineTotalCents < 0) {
      return `monto invalido en la linea ${item.id}`;
    }
    itemsTotal += item.lineTotalCents;
  }
  if (itemsTotal !== sale.subtotalCents) {
    return `el subtotal (${sale.subtotalCents}) no coincide con la suma de sus lineas (${itemsTotal})`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Calculo principal
// ---------------------------------------------------------------------------

interface Accumulator {
  barberId: string;
  locationId: string;
  servicesCount: number;
  servicesRevenueCents: number;
  productRevenueCents: number;
  tipsCents: number;
}

/** Orden por punto de codigo (independiente del locale del proceso). Los IDs son unicos, nunca empatan. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : 1;
}

function keyOf(barberId: string, locationId: string): string {
  return `${barberId}|${locationId}`;
}

function failure(problems: PayoutProblem[]): ComputePayoutResult {
  return { ok: false, error: problems.map((p) => p.message).join(" "), problems };
}

/**
 * Calcula UNA linea por (barbero, sede) con actividad en el periodo.
 *
 * Reglas aplicadas: D-F3-1 (base = lineas de ventas `paid`, atribucion por
 * linea), D-F3-3 (regla), D-F3-4 (`fixed_per_service` rechazado), D-F3-5
 * (prorrateo), D-F3-6 (que escribe cada tipo), D-F3-7 (propina integra al
 * barbero de la venta; `split_pct` rechazado), D-F3-8 (alquiler).
 *
 * - Sin ventas pagables => `{ ok: true, lines: [] }` (no es error).
 * - `product_revenue`: el descuento se prorratea entre TODAS las lineas de la
 *   venta (servicio y producto) y cada base va a su columna. En F3 no hay
 *   productos (D-F2-20), asi que `services_revenue` suma exactamente
 *   `subtotal - descuento` (invariante de D-F3-11).
 * - Redondeo: un solo `roundHalfToEven` por linea de pago sobre el ingreso
 *   agregado (no por venta ni por linea de ticket).
 * - La salida es determinista: ordenada por sede y luego por barbero.
 * - Solo se generan lineas para pares con actividad. Un barbero de silla fija
 *   sin ventas ni propinas en el periodo NO recibe linea (y por tanto no se le
 *   imputa renta): ver deuda documentada en CHANGELOG.
 */
export function computePayoutLines(input: PayoutInputs): ComputePayoutResult {
  const problems: PayoutProblem[] = [];

  const periodStart = parseIsoDate(input.periodStartsOn);
  const periodEnd = parseIsoDate(input.periodEndsOn);
  if (!periodStart || !periodEnd || daysFromCivil(periodEnd) < daysFromCivil(periodStart)) {
    return failure([
      {
        code: "invalid_period",
        message: `Periodo invalido: ${input.periodStartsOn} a ${input.periodEndsOn}.`,
      },
    ]);
  }

  const chainDefaults = input.rules.filter((r) => r.appliesTo === "chain");
  if (chainDefaults.length > 1) {
    return failure([
      {
        code: "invalid_input",
        message: `Hay ${chainDefaults.length} reglas de pago por defecto de la cadena; debe haber una sola.`,
      },
    ]);
  }

  const barberNames = new Map(input.barbers.map((b) => [b.id, b.name]));
  const locationNames = new Map(input.locations.map((l) => [l.id, l.name]));

  // --- 1. Agregar por (barbero, sede) ---------------------------------------
  const accumulators = new Map<string, Accumulator>();
  const accumulatorFor = (barberId: string, locationId: string): Accumulator => {
    const key = keyOf(barberId, locationId);
    let acc = accumulators.get(key);
    if (!acc) {
      acc = {
        barberId,
        locationId,
        servicesCount: 0,
        servicesRevenueCents: 0,
        productRevenueCents: 0,
        tipsCents: 0,
      };
      accumulators.set(key, acc);
    }
    return acc;
  };

  for (const sale of selectPayableSales(input.sales, input.periodStartsOn, input.periodEndsOn)) {
    const saleProblem = validateSale(sale);
    if (saleProblem) {
      problems.push({
        code: "invalid_input",
        message: `La venta ${sale.id} no se puede calcular: ${saleProblem}.`,
        locationId: sale.locationId,
      });
      continue;
    }

    const bases = prorateDiscount(
      sale.items.map((i) => i.lineTotalCents),
      sale.discountCents,
    );
    sale.items.forEach((item, i) => {
      const acc = accumulatorFor(item.barberId, sale.locationId);
      if (item.type === "service") {
        acc.servicesCount += item.quantity;
        acc.servicesRevenueCents += bases[i];
      } else {
        acc.productRevenueCents += bases[i];
      }
    });

    // D-F3-7: la propina va integra al barbero de la venta, sin prorratear.
    accumulatorFor(sale.barberId, sale.locationId).tipsCents += sale.tipCents;
  }

  // --- 2. Regla + formula por linea, en orden determinista -------------------
  const ordered = [...accumulators.values()].sort((a, b) =>
    a.locationId === b.locationId
      ? compareIds(a.barberId, b.barberId)
      : compareIds(a.locationId, b.locationId),
  );

  const lines: PayoutLine[] = [];
  for (const acc of ordered) {
    const who = `${nameOf(barberNames, acc.barberId)} en ${nameOf(locationNames, acc.locationId)}`;
    const problem = (code: PayoutProblemCode, message: string): void => {
      problems.push({ code, message, barberId: acc.barberId, locationId: acc.locationId });
    };

    const resolved = resolvePayoutRule({
      barberId: acc.barberId,
      locationId: acc.locationId,
      barbers: input.barbers,
      locations: input.locations,
      rules: input.rules,
      assignments: input.assignments,
    });
    if (!resolved.ok) {
      problems.push(resolved.problem);
      continue;
    }
    const rule = resolved.rule;

    if (rule.type === "fixed_per_service") {
      problem(
        "unsupported_rule_type",
        `La regla "${rule.name}" (monto fijo por servicio) aun no esta soportada; aplica a ${who}. Asigna una regla de porcentaje, alquiler de silla o mixta.`,
      );
      continue;
    }
    if (rule.tipHandling === "split_pct") {
      problem(
        "unsupported_tip_handling",
        `La regla "${rule.name}" reparte propinas por porcentaje, lo cual aun no esta soportado; aplica a ${who}.`,
      );
      continue;
    }

    const paysCommission = rule.type === "percentage" || rule.type === "hybrid";
    const chargesRent = rule.type === "booth_rent" || rule.type === "hybrid";

    // booth_rent: el barbero se queda con el 100% de lo que produjo (D-F3-6).
    let commissionCents = acc.servicesRevenueCents;
    if (paysCommission) {
      const { serviceBps, productBps } = rule;
      if (serviceBps === null) {
        problem("invalid_rule", `La regla "${rule.name}" no define el porcentaje por servicio; aplica a ${who}.`);
        continue;
      }
      commissionCents = roundHalfToEven(acc.servicesRevenueCents * serviceBps, 10000);
      if (acc.productRevenueCents > 0) {
        if (productBps === null) {
          problem("invalid_rule", `La regla "${rule.name}" no define el porcentaje por producto; aplica a ${who}.`);
          continue;
        }
        commissionCents += roundHalfToEven(acc.productRevenueCents * productBps, 10000);
      }
    }

    let boothRentDeductedCents = 0;
    if (chargesRent) {
      if (rule.boothRentCents === null) {
        problem("invalid_rule", `La regla "${rule.name}" no define el monto del alquiler de silla; aplica a ${who}.`);
        continue;
      }
      if (rule.boothRentFrequency === null) {
        problem(
          "invalid_rule",
          `La regla "${rule.name}" no define la frecuencia del alquiler de silla; aplica a ${who}.`,
        );
        continue;
      }
      const rent = boothRentForPeriod({
        amountCents: rule.boothRentCents,
        frequency: rule.boothRentFrequency,
        startsOn: input.periodStartsOn,
        endsOn: input.periodEndsOn,
      });
      if (!rent.ok) {
        problem("invalid_period", `${rent.error} (${who}, regla "${rule.name}").`);
        continue;
      }
      boothRentDeductedCents = rent.cents;
    }

    const adjustmentsCents = 0; // D-F3-9: los ajustes manuales los aplica el ciclo del periodo (F3-05)
    lines.push({
      barberId: acc.barberId,
      locationId: acc.locationId,
      ruleId: rule.id,
      ruleType: rule.type,
      servicesCount: acc.servicesCount,
      servicesRevenueCents: acc.servicesRevenueCents,
      productRevenueCents: acc.productRevenueCents,
      commissionCents,
      boothRentDeductedCents,
      tipsCents: acc.tipsCents,
      adjustmentsCents,
      netPayableCents: netPayableCents({
        commissionCents,
        tipsCents: acc.tipsCents,
        adjustmentsCents,
        boothRentDeductedCents,
      }),
    });
  }

  return problems.length > 0 ? failure(problems) : { ok: true, lines };
}

// ---------------------------------------------------------------------------
// D-F3-11 · invariante de cuadre al centavo
// ---------------------------------------------------------------------------

export interface PayoutInvariantFigure {
  locationId: string;
  expectedRevenueCents: number;
  actualRevenueCents: number;
  expectedTipsCents: number;
  actualTipsCents: number;
}

export type PayoutInvariantResult =
  | { ok: true; figures: PayoutInvariantFigure[] }
  | { ok: false; error: string; figures: PayoutInvariantFigure[]; mismatches: PayoutInvariantFigure[] };

/**
 * Por sede, `sum(services_revenue + product_revenue)` de las lineas debe ser
 * EXACTAMENTE `sum(subtotal - descuento)` de las ventas `paid` del periodo, y
 * `sum(tips_amount)` exactamente `sum(sales.tip_amount)`. Las cifras esperadas
 * salen de los totales de la venta, NO de sus lineas: asi un prorrateo mal
 * hecho (o un subtotal que no cuadra con sus lineas) no puede validarse a si
 * mismo. El llamador DEBE invocarla antes de sellar `calculated` y abortar la
 * transaccion si `ok` es false (escribiendo `payout.calculate_failed` con
 * `figures` en `after`).
 */
export function verifyPayoutInvariant(input: {
  lines: PayoutLine[];
  sales: PayoutSale[];
  periodStartsOn: string;
  periodEndsOn: string;
  locations: PayoutLocation[];
}): PayoutInvariantResult {
  const byLocation = new Map<string, PayoutInvariantFigure>();
  const figureFor = (locationId: string): PayoutInvariantFigure => {
    let fig = byLocation.get(locationId);
    if (!fig) {
      fig = {
        locationId,
        expectedRevenueCents: 0,
        actualRevenueCents: 0,
        expectedTipsCents: 0,
        actualTipsCents: 0,
      };
      byLocation.set(locationId, fig);
    }
    return fig;
  };

  for (const sale of selectPayableSales(input.sales, input.periodStartsOn, input.periodEndsOn)) {
    const fig = figureFor(sale.locationId);
    fig.expectedRevenueCents += sale.subtotalCents - sale.discountCents;
    fig.expectedTipsCents += sale.tipCents;
  }
  for (const line of input.lines) {
    const fig = figureFor(line.locationId);
    fig.actualRevenueCents += line.servicesRevenueCents + line.productRevenueCents;
    fig.actualTipsCents += line.tipsCents;
  }

  const figures = [...byLocation.values()].sort((a, b) => compareIds(a.locationId, b.locationId));
  const mismatches = figures.filter(
    (f) => f.expectedRevenueCents !== f.actualRevenueCents || f.expectedTipsCents !== f.actualTipsCents,
  );
  if (mismatches.length === 0) return { ok: true, figures };

  const locationNames = new Map(input.locations.map((l) => [l.id, l.name]));
  const detail = mismatches
    .map(
      (m) =>
        `${nameOf(locationNames, m.locationId)}: ingreso esperado ${m.expectedRevenueCents} vs calculado ${m.actualRevenueCents} centavos, propinas esperadas ${m.expectedTipsCents} vs calculadas ${m.actualTipsCents} centavos`,
    )
    .join("; ");
  return {
    ok: false,
    error: `El calculo no cuadra al centavo con las ventas cobradas (${detail}).`,
    figures,
    mismatches,
  };
}
