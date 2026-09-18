/**
 * F3-01 · Generador PURO de la historia de ventas del seed.
 *
 * Vive aparte de `seed.ts` porque ese archivo ejecuta `main()` al importarse
 * (no se puede testear); este modulo no toca la DB ni el reloj: recibe `now` y
 * devuelve filas listas para insertar. Es determinista: el mismo `now` (mismo
 * dia local) produce exactamente las mismas ventas, montos y IDs, gracias a un
 * PRNG con semilla fija. Dinero siempre en centavos enteros (via
 * `computeSaleTotals` de `@/lib/pos`, la misma regla que usa el cobro real) y
 * solo se convierte a string decimal al final.
 *
 * Todo esta anclado a `now` (nunca a fechas fijas): el dia `d` es "hoy menos d
 * dias" en la zona de la cadena. La cadena del seed es America/Santo_Domingo,
 * UTC-4 fijo (RD no tiene horario de verano); si el seed alguna vez crea sedes
 * en otra zona, este offset debe pasar a ser por sede.
 */
import { decimalStringFromCents } from "@/lib/actions/money-utils";
import { computeSaleTotals, type DiscountInput, type TipInput } from "@/lib/pos";

export const SEED_UUID_PREFIX = "00000000-0000-0000-0000-";

/** Prefijos de la cola de 12 digitos de cada tipo de fila de historia (los IDs viejos del seed empiezan con '0'). */
const KIND_SALE = 2;
const KIND_ITEM = 3;
const KIND_CLIENT = 4;

export function historyUuid(kind: 2 | 3 | 4, index: number): string {
  return `${SEED_UUID_PREFIX}${kind}${String(index).padStart(11, "0")}`;
}

/** Patrones LIKE para borrar/identificar filas de historia (y solo esas). */
export const HISTORY_SALE_ID_LIKE = `${SEED_UUID_PREFIX}${KIND_SALE}%`;
export const HISTORY_CLIENT_ID_LIKE = `${SEED_UUID_PREFIX}${KIND_CLIENT}%`;

const UTC_OFFSET_HOURS = 4; // America/Santo_Domingo = UTC-4 todo el ano
const MS_HOUR = 3_600_000;
const MS_MIN = 60_000;
const MS_DAY = 24 * MS_HOUR;

export const HISTORY_DAYS = 35;
export const HISTORY_CLIENT_COUNT = 24;

// --- IDs de referencia (los mismos de seed.ts, duplicados a proposito) --------

const LOC = {
  naco: "00000000-0000-0000-0000-000000000301",
  bellaVista: "00000000-0000-0000-0000-000000000302",
  sanCristobal: "00000000-0000-0000-0000-000000000303",
} as const;

const B = {
  b1: "00000000-0000-0000-0000-000000000101",
  b2: "00000000-0000-0000-0000-000000000102",
  b3: "00000000-0000-0000-0000-000000000103", // multi-sede
  b4: "00000000-0000-0000-0000-000000000104",
  b5: "00000000-0000-0000-0000-000000000105",
  b6: "00000000-0000-0000-0000-000000000106",
} as const;

const CREATED_BY = {
  [LOC.naco]: "00000000-0000-0000-0000-000000000011", // Admin Naco
  [LOC.bellaVista]: "00000000-0000-0000-0000-000000000012", // Admin Bella Vista
  [LOC.sanCristobal]: "00000000-0000-0000-0000-000000000010", // Owner (no hay admin en San Cristobal)
} as const;

const SERVICE = {
  corte: "00000000-0000-0000-0000-000000000401",
  fade: "00000000-0000-0000-0000-000000000402",
  barba: "00000000-0000-0000-0000-000000000403",
  fadeBarba: "00000000-0000-0000-0000-000000000404",
  tinte: "00000000-0000-0000-0000-000000000405",
} as const;
type ServiceKey = keyof typeof SERVICE;

/** Precio efectivo por sede en centavos (D-F2-1: Fade RD$500 en Naco, RD$400 en San Cristobal). */
const PRICE_CENTS: Record<string, Record<ServiceKey, number>> = {
  [LOC.naco]: { corte: 35000, fade: 50000, barba: 25000, fadeBarba: 65000, tinte: 80000 },
  [LOC.bellaVista]: { corte: 35000, fade: 45000, barba: 25000, fadeBarba: 65000, tinte: 80000 },
  [LOC.sanCristobal]: { corte: 35000, fade: 40000, barba: 25000, fadeBarba: 65000, tinte: 80000 },
};

/** Ventas por dia [min, max] segun la sede: Naco (6 sillas) > San Cristobal (5) ~ Bella Vista (4), con variacion. */
const SALES_PER_DAY: Record<string, [number, number]> = {
  [LOC.naco]: [8, 11],
  [LOC.bellaVista]: [5, 7],
  [LOC.sanCristobal]: [4, 6],
};

const DISCOUNT_REASONS = ["Cliente frecuente", "Promo de temporada", "Cortesia del gerente"];

// --- Tipos de salida ----------------------------------------------------------

export interface HistoryClientRow {
  id: string;
  fullName: string;
  phone: string;
  createdAt: Date;
}

export interface HistorySaleItemRow {
  id: string;
  saleId: string;
  serviceId: string;
  unitPrice: string;
  lineTotal: string;
  barberId: string;
}

export interface HistorySaleRow {
  id: string;
  locationId: string;
  clientId: string;
  barberId: string;
  createdBy: string;
  subtotal: string;
  discountAmount: string;
  discountReason: string | null;
  tipAmount: string;
  total: string;
  paymentMethod: "cash" | "card" | "transfer";
  status: "paid" | "refunded";
  createdAt: Date;
}

export interface SeedHistory {
  clients: HistoryClientRow[];
  sales: HistorySaleRow[];
  items: HistorySaleItemRow[];
}

// --- PRNG determinista (mulberry32) -------------------------------------------

function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Entero en [min, max]. */
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
    weighted: <T>(entries: readonly (readonly [T, number])[]): T => {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [value, weight] of entries) {
        r -= weight;
        if (r < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
}

// --- Fechas locales sin depender de la zona del proceso -----------------------

/** Medianoche local del dia `daysAgo`, expresada como ms UTC "de pared" (aun sin sumar el offset). */
function localMidnightWallMs(now: Date, daysAgo: number): number {
  const local = new Date(now.getTime() - UTC_OFFSET_HOURS * MS_HOUR);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysAgo * MS_DAY;
}

function weekdayOf(wallMs: number): number {
  return new Date(wallMs).getUTCDay(); // 0 = domingo
}

function localTimeToDate(wallMidnightMs: number, minutesOfDay: number): Date {
  return new Date(wallMidnightMs + minutesOfDay * MS_MIN + UTC_OFFSET_HOURS * MS_HOUR);
}

// --- Quien atiende donde y cuando ---------------------------------------------

/**
 * Barberos disponibles en una sede un dia de la semana. Refleja los horarios
 * que siembra `seedSchedules`: el multi-sede (b3) esta en Naco lun-mie y en
 * Bella Vista jue-sab, asi que en CUALQUIER quincena tiene ventas en sus dos
 * sedes (el caso cross-sede que hoy se calcula mal a mano).
 */
function barbersAt(locationId: string, weekday: number): string[] {
  if (locationId === LOC.naco) return weekday >= 1 && weekday <= 3 ? [B.b1, B.b2, B.b3] : [B.b1, B.b2];
  if (locationId === LOC.bellaVista) return weekday >= 4 && weekday <= 6 ? [B.b4, B.b5, B.b3] : [B.b4, B.b5];
  return [B.b6];
}

// --- Construccion de una venta ------------------------------------------------

interface LineSpec {
  service: ServiceKey;
  barberId: string;
}

interface SaleSpec {
  locationId: string;
  clientId: string;
  createdAt: Date;
  lines: LineSpec[];
  discount: DiscountInput;
  tip: TipInput;
  paymentMethod: "cash" | "card" | "transfer";
  status: "paid" | "refunded";
}

function buildSale(spec: SaleSpec, saleIndex: number, itemStart: number): { sale: HistorySaleRow; items: HistorySaleItemRow[] } {
  const prices = PRICE_CENTS[spec.locationId];
  const totals = computeSaleTotals({
    lines: spec.lines.map((l) => ({
      serviceId: SERVICE[l.service],
      barberId: l.barberId,
      type: "service" as const,
      quantity: 1,
      unitPriceCents: prices[l.service],
    })),
    discount: spec.discount,
    tip: spec.tip,
    maxDiscountPct: "unlimited",
  });
  if (!totals.ok) {
    // Un error aqui es un bug del generador, no un dato de usuario: que el seed falle ruidoso.
    throw new Error(`seed-history: venta invalida (${totals.error})`);
  }

  const id = historyUuid(KIND_SALE, saleIndex);
  const reason = spec.discount.kind === "none" ? null : spec.discount.reason;
  const sale: HistorySaleRow = {
    id,
    locationId: spec.locationId,
    clientId: spec.clientId,
    barberId: totals.primaryBarberId,
    createdBy: CREATED_BY[spec.locationId as keyof typeof CREATED_BY],
    subtotal: decimalStringFromCents(totals.subtotalCents),
    discountAmount: decimalStringFromCents(totals.discountAmountCents),
    discountReason: reason,
    tipAmount: decimalStringFromCents(totals.tipAmountCents),
    total: decimalStringFromCents(totals.totalCents),
    paymentMethod: spec.paymentMethod,
    status: spec.status,
    createdAt: spec.createdAt,
  };
  const items = totals.lines.map((line, i) => ({
    id: historyUuid(KIND_ITEM, itemStart + i),
    saleId: id,
    serviceId: line.serviceId,
    unitPrice: decimalStringFromCents(line.unitPriceCents),
    lineTotal: decimalStringFromCents(line.lineTotalCents),
    barberId: line.barberId,
  }));
  return { sale, items };
}

// --- Punto de entrada ---------------------------------------------------------

export function generateSeedHistory(now: Date): SeedHistory {
  const rng = makeRng(20260918);

  // Clientes de historia: creados escalonados a lo largo de la ventana, para
  // que `new_clients` de las metricas tenga dias con y sin altas.
  const clients: HistoryClientRow[] = [];
  for (let i = 0; i < HISTORY_CLIENT_COUNT; i++) {
    const daysAgo = HISTORY_DAYS - 1 - Math.floor((i * (HISTORY_DAYS - 2)) / HISTORY_CLIENT_COUNT);
    clients.push({
      id: historyUuid(KIND_CLIENT, i + 1),
      fullName: `Cliente Historico ${String(i + 1).padStart(2, "0")}`,
      phone: `809-555-05${String(i + 1).padStart(2, "0")}`,
      createdAt: localTimeToDate(localMidnightWallMs(now, daysAgo), 8 * 60 + (i % 5) * 10),
    });
  }

  const sales: HistorySaleRow[] = [];
  const items: HistorySaleItemRow[] = [];
  let saleIndex = 1;
  let itemIndex = 1;
  const push = (spec: SaleSpec) => {
    const built = buildSale(spec, saleIndex, itemIndex);
    sales.push(built.sale);
    items.push(...built.items);
    saleIndex += 1;
    itemIndex += built.items.length;
  };

  const clientFor = (createdAtSale: Date): string => {
    const eligible = clients.filter((c) => c.createdAt.getTime() <= createdAtSale.getTime());
    return rng.pick(eligible).id;
  };

  // --- Dias 1..HISTORY_DAYS-1: ventas repartidas en las 3 sedes -------------
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 1; daysAgo--) {
    const midnight = localMidnightWallMs(now, daysAgo);
    const weekday = weekdayOf(midnight);
    if (weekday === 0) continue; // domingo: la barberia cierra (business_hours del seed)

    for (const locationId of [LOC.naco, LOC.bellaVista, LOC.sanCristobal]) {
      const available = barbersAt(locationId, weekday);
      const [minSales, maxSales] = SALES_PER_DAY[locationId];
      const count = rng.int(minSales, maxSales);

      for (let k = 0; k < count; k++) {
        // Horario comercial 09:00-20:00; el cobro cae repartido en el dia.
        const minutesOfDay = 9 * 60 + 15 + Math.floor((k * 620) / count) + rng.int(0, 25);
        const createdAt = localTimeToDate(midnight, minutesOfDay);

        const barberA = rng.pick(available);
        const lines: LineSpec[] = [];
        if (available.length >= 2 && rng.chance(0.18)) {
          // Ticket de 2 barberos: corte/fade de uno, barba de otro (D-F2-12 / D-F3-1).
          const others = available.filter((b) => b !== barberA);
          lines.push({ service: rng.pick(["corte", "fade"] as const), barberId: barberA });
          lines.push({ service: "barba", barberId: rng.pick(others) });
        } else {
          lines.push({
            service: rng.weighted([
              ["corte", 30],
              ["fade", 30],
              ["barba", 15],
              ["fadeBarba", 15],
              ["tinte", 10],
            ] as const),
            barberId: barberA,
          });
          if (rng.chance(0.12)) lines.push({ service: "barba", barberId: barberA });
        }

        const discount: DiscountInput = rng.chance(0.08)
          ? rng.chance(0.5)
            ? { kind: "percentage", pct: rng.pick([5, 10] as const), reason: rng.pick(DISCOUNT_REASONS) }
            : { kind: "amount", amountCents: rng.pick([5000, 10000] as const), reason: rng.pick(DISCOUNT_REASONS) }
          : { kind: "none" };
        const tip: TipInput = rng.chance(0.55)
          ? rng.chance(0.7)
            ? { kind: "percentage", pct: rng.pick([10, 15] as const) }
            : { kind: "amount", amountCents: rng.pick([5000, 10000] as const) }
          : { kind: "none" };

        push({
          locationId,
          clientId: clientFor(createdAt),
          createdAt,
          lines,
          discount,
          tip,
          paymentMethod: rng.weighted([["cash", 50], ["card", 30], ["transfer", 20]] as const),
          status: "paid",
        });
      }
    }
  }

  // --- Ventas de hoy: ancladas a `now` (2 por sede), para que la quincena en
  // curso tenga con que calcular incluso el dia 1 o 16. Siempre las mismas 6
  // (IDs consecutivos), solo cambia su hora al re-sembrar.
  const todayPlan: { locationId: string; barberId: string; service: ServiceKey; minutesAgo: number; tipPct: number }[] = [
    { locationId: LOC.naco, barberId: B.b1, service: "corte", minutesAgo: 100, tipPct: 10 },
    { locationId: LOC.naco, barberId: B.b2, service: "fade", minutesAgo: 40, tipPct: 0 },
    { locationId: LOC.bellaVista, barberId: B.b4, service: "corte", minutesAgo: 90, tipPct: 15 },
    { locationId: LOC.bellaVista, barberId: B.b5, service: "barba", minutesAgo: 35, tipPct: 0 },
    { locationId: LOC.sanCristobal, barberId: B.b6, service: "fadeBarba", minutesAgo: 80, tipPct: 10 },
    { locationId: LOC.sanCristobal, barberId: B.b6, service: "fade", minutesAgo: 30, tipPct: 0 },
  ];
  for (const t of todayPlan) {
    const createdAt = new Date(now.getTime() - t.minutesAgo * MS_MIN);
    push({
      locationId: t.locationId,
      clientId: clientFor(createdAt),
      createdAt,
      lines: [{ service: t.service, barberId: t.barberId }],
      discount: { kind: "none" },
      tip: t.tipPct > 0 ? { kind: "percentage", pct: t.tipPct } : { kind: "none" },
      paymentMethod: "cash",
      status: "paid",
    });
  }

  // --- Ventas de guion (casos que el motor de comisiones DEBE resolver) ----
  const scripted = (daysAgo: number, hour: number) => {
    const midnight = localMidnightWallMs(now, daysAgo);
    return localTimeToDate(midnight, hour * 60);
  };
  const oldClient = clients[0].id; // creado hace 34 dias: valido para cualquier dia

  // 1. Descuento con residuo de 1 centavo: 3 lineas iguales de RD$350 con RD$100.00 de
  //    descuento => 3 x 33.33 = 99.99; el centavo sobrante va a la PRIMERA linea (b1).
  push({
    locationId: LOC.naco,
    clientId: oldClient,
    createdAt: scripted(3, 15),
    lines: [
      { service: "corte", barberId: B.b1 },
      { service: "corte", barberId: B.b2 },
      { service: "corte", barberId: B.b1 },
    ],
    discount: { kind: "amount", amountCents: 10000, reason: "Promo familiar (residuo de 1 centavo)" },
    tip: { kind: "none" },
    paymentMethod: "cash",
    status: "paid",
  });
  // 2. Ticket de 2 barberos con descuento impar: fade (b1) RD$500 + barba (b2) RD$250,
  //    descuento RD$100.01 => 66.67 + 33.34 (el residuo cae en la linea menor por redondeo).
  push({
    locationId: LOC.naco,
    clientId: oldClient,
    createdAt: scripted(4, 16),
    lines: [
      { service: "fade", barberId: B.b1 },
      { service: "barba", barberId: B.b2 },
    ],
    discount: { kind: "amount", amountCents: 10001, reason: "Ajuste de cortesia" },
    tip: { kind: "amount", amountCents: 5000 },
    paymentMethod: "card",
    status: "paid",
  });
  // 3. Venta ANULADA (refunded) con propina: el motor la excluye por completo.
  push({
    locationId: LOC.bellaVista,
    clientId: oldClient,
    createdAt: scripted(2, 14),
    lines: [{ service: "corte", barberId: B.b4 }],
    discount: { kind: "none" },
    tip: { kind: "percentage", pct: 10 },
    paymentMethod: "cash",
    status: "refunded",
  });
  return { clients, sales, items };
}
