import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { centsFromDecimalString } from "@/lib/actions/money-utils";
import type { db } from "@/lib/db/client";
import {
  barberLocations,
  commissionRules,
  locations,
  saleItems,
  sales,
  users,
} from "@/lib/db/schema";

import {
  bpsFromPercentString,
  parseIsoDate,
  type PayoutAssignment,
  type PayoutInputs,
  type PayoutRule,
  type PayoutSale,
  type PayoutSaleItem,
} from "./index";

/**
 * F3-03 · Capa de lectura del periodo (servidor). Parte CON acceso a DB de
 * `lib/commissions`; el calculo vive en `./index` (puro).
 *
 * Ejecutor (regla dura §3.2): recibe `db` o el `tx` de una transaccion abierta y
 * usa SOLO ese objeto. El pool es `max: 1` a proposito (Cloudflare Workers): una
 * consulta hecha con el `db` singleton DENTRO de `db.transaction(...)` espera
 * para siempre una conexion que la propia transaccion tiene tomada — deadlock
 * silencioso de aplicacion (ya paso con `writeAuditLog` y con
 * `resolveEffectiveServiceFor`). Por eso el ejecutor NO tiene valor por defecto.
 * Solo necesita `select`, que exponen ambos.
 *
 * Fechas (regla dura §3.3): este archivo no crea ni interpola ningun `Date`;
 * las fechas viajan como strings `YYYY-MM-DD` y la conversion a la zona de la
 * sede la hace Postgres (`created_at AT TIME ZONE locations.timezone`).
 */
export type PayoutReadExecutor = Pick<typeof db, "select">;

export interface LoadPayoutInputsParams {
  chainId: string;
  /** Inclusive, YYYY-MM-DD (fecha operativa local de cada sede, D-F3-2). */
  startsOn: string;
  /** Inclusive, YYYY-MM-DD. */
  endsOn: string;
}

/**
 * Carga y normaliza (centavos enteros, puntos basicos, fechas locales) todo lo
 * que `computePayoutLines` necesita para UNA cadena y UN periodo:
 *
 * - ventas `paid` (D-F3-1) cuya fecha operativa en la zona de SU sede cae en
 *   [startsOn, endsOn] (D-F3-2), con sus `sale_items` (atribucion por linea);
 * - reglas de pago de la cadena, overrides de `barber_locations`, sedes y
 *   nombres de las personas de la cadena (para los mensajes de error).
 *
 * Round-trips: 3 consultas SECUENCIALES (reglas, overrides de barber_locations,
 * ventas+lineas con nombres de sede y barbero ya unidos). Deliberadamente NO se
 * usa `Promise.all`: sobre el pool `max: 1` (Supavisor en modo transaccion)
 * lanzar consultas concurrentes FUERA de una transaccion colgo el cliente para
 * siempre en una medicion real (ver CHANGELOG); dentro de una transaccion
 * funciona, pero este loader se llama con `db` o `tx` y debe ser seguro con
 * ambos. Los nombres se derivan de las filas de ventas: solo hacen falta para
 * los mensajes de error, y estos solo nombran pares (barbero, sede) con ventas.
 *
 * El orden de las lineas dentro de una venta es por `sale_items.id`: la tabla
 * no tiene `created_at`, asi que "orden de creacion" (D-F3-5, desempate del
 * residuo de centavos) no es recuperable; se usa un orden estable y
 * determinista para que recalcular de el mismo resultado.
 */
export async function loadPayoutInputs(
  params: LoadPayoutInputsParams,
  executor: PayoutReadExecutor,
): Promise<PayoutInputs> {
  const { chainId, startsOn, endsOn } = params;
  if (!parseIsoDate(startsOn) || !parseIsoDate(endsOn) || endsOn < startsOn) {
    throw new Error(`Periodo invalido para cargar el corte: ${startsOn} a ${endsOn}.`);
  }

  // Cota gruesa en UTC (solo para poder usar el indice de sales): la fecha
  // local de cualquier zona (UTC-12..UTC+14) queda a <= 1 dia de la UTC, asi
  // que +-2 dias nunca deja fuera una venta del periodo. El filtro exacto es el
  // de fecha local de abajo. Ambas cotas son strings, no `Date`.
  const coarseFrom = sql`((${startsOn}::date - 2)::timestamp at time zone 'UTC')`;
  const coarseTo = sql`((${endsOn}::date + 3)::timestamp at time zone 'UTC')`;
  const localDateExpr = sql`((${sales.createdAt} at time zone ${locations.timezone})::date)`;
  const localDate = sql<string>`${localDateExpr}::text`;

  const saleBarber = alias(users, "sale_barber");
  const itemBarber = alias(users, "item_barber");

  const ruleRows = await executor.select().from(commissionRules).where(eq(commissionRules.chainId, chainId));

  const assignmentRows = await executor
    .select({
      barberId: barberLocations.userId,
      locationId: barberLocations.locationId,
      commissionRuleId: barberLocations.commissionRuleId,
    })
    .from(barberLocations)
    .innerJoin(locations, eq(locations.id, barberLocations.locationId))
    .where(eq(locations.chainId, chainId));

  const saleRows = await executor
    .select({
      saleId: sales.id,
      locationId: sales.locationId,
      locationName: locations.name,
      barberId: sales.barberId,
      saleBarberName: saleBarber.fullName,
      status: sales.status,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      tipAmount: sales.tipAmount,
      localDate,
      itemId: saleItems.id,
      itemType: saleItems.type,
      itemQuantity: saleItems.quantity,
      itemLineTotal: saleItems.lineTotal,
      itemBarberId: saleItems.barberId,
      itemBarberName: itemBarber.fullName,
    })
    .from(sales)
    .innerJoin(locations, eq(locations.id, sales.locationId))
    .innerJoin(saleBarber, eq(saleBarber.id, sales.barberId))
    .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
    .leftJoin(itemBarber, eq(itemBarber.id, saleItems.barberId))
    .where(
      and(
        eq(sales.chainId, chainId),
        eq(sales.status, "paid"),
        sql`${sales.createdAt} >= ${coarseFrom}`,
        sql`${sales.createdAt} < ${coarseTo}`,
        sql`${localDateExpr} between ${startsOn}::date and ${endsOn}::date`,
      ),
    )
    .orderBy(asc(sales.id), asc(saleItems.id));

  const rules: PayoutRule[] = ruleRows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    serviceBps: r.serviceCommissionPct === null ? null : bpsFromPercentString(r.serviceCommissionPct),
    productBps: r.productCommissionPct === null ? null : bpsFromPercentString(r.productCommissionPct),
    boothRentCents: r.boothRentAmount === null ? null : centsFromDecimalString(r.boothRentAmount),
    boothRentFrequency: r.boothRentFrequency,
    tipHandling: r.tipHandling,
    appliesTo: r.appliesTo,
  }));

  const assignments: PayoutAssignment[] = assignmentRows.map((a) => ({
    barberId: a.barberId,
    locationId: a.locationId,
    commissionRuleId: a.commissionRuleId,
  }));

  // Una fila por (venta, linea): se agrupan preservando el orden de la consulta.
  const salesById = new Map<string, PayoutSale>();
  const locationNames = new Map<string, string>();
  const barberNames = new Map<string, string>();
  for (const row of saleRows) {
    locationNames.set(row.locationId, row.locationName);
    barberNames.set(row.barberId, row.saleBarberName ?? row.barberId); // full_name es nullable
    let sale = salesById.get(row.saleId);
    if (!sale) {
      sale = {
        id: row.saleId,
        locationId: row.locationId,
        barberId: row.barberId,
        localDate: row.localDate,
        status: row.status,
        subtotalCents: centsFromDecimalString(row.subtotal),
        discountCents: centsFromDecimalString(row.discountAmount),
        tipCents: centsFromDecimalString(row.tipAmount),
        items: [],
      };
      salesById.set(row.saleId, sale);
    }
    if (row.itemId !== null) {
      barberNames.set(row.itemBarberId!, row.itemBarberName ?? row.itemBarberId!);
      const item: PayoutSaleItem = {
        id: row.itemId,
        type: row.itemType!,
        quantity: row.itemQuantity!,
        lineTotalCents: centsFromDecimalString(row.itemLineTotal!),
        barberId: row.itemBarberId!,
      };
      sale.items.push(item);
    }
  }

  return {
    periodStartsOn: startsOn,
    periodEndsOn: endsOn,
    barbers: [...barberNames].map(([id, name]) => ({ id, name })),
    locations: [...locationNames].map(([id, name]) => ({ id, name })),
    rules,
    assignments,
    sales: [...salesById.values()],
  };
}
