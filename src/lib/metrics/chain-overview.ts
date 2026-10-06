import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { centsFromDecimalString } from "@/lib/actions/money-utils";
import type { db } from "@/lib/db/client";
import {
  appointments,
  chains,
  locationDailyMetrics,
  locations,
  saleItems,
  sales,
  services,
  users,
} from "@/lib/db/schema";
import { roundHalfToEven } from "@/lib/pos";

import { getLocationDailyMetrics } from "./daily";
import { aggregateTopBarbers, type TopBarberSale } from "./top-barbers";
import {
  aggregateChain,
  aggregateLocation,
  deltaBps,
  flagsDeviation,
  previousRange,
  rankLocations,
  type ChainPeriodTotals,
  type DailyMetricsRow,
  type LocationPeriodTotals,
} from "./index";
import { eachDate, type ResolvedRange } from "./ranges";

/**
 * F3-13 · Loader de Vista Cadena (servidor). Quien lo llame es responsable del
 * guard (`requireChainScope`); el `chainId` sale de la sesion, nunca del cliente.
 *
 * Rendimiento (PRD §15, P95 < 2 s): un dia cerrado se lee EN BLOQUE de
 * `location_daily_metrics` (1 consulta para todo el rango, mas 1 para las citas
 * terminales), no sede por sede y dia por dia. Solo los dias que faltan y el dia
 * en curso pasan por `getLocationDailyMetrics` (que materializa/calcula en vivo,
 * D-F3-12). Todas las consultas son secuenciales (sin `Promise.all`, ver CHANGELOG).
 */
export type ChainOverviewExecutor = Pick<typeof db, "select" | "insert" | "execute">;

export interface PositionRow extends LocationPeriodTotals {
  rank: number;
  /** Δ de ingreso vs. el bloque anterior del mismo largo, en puntos basicos; null = "—". */
  revenueDeltaBps: number | null;
  /** Mas de 10% bajo el promedio de la cadena (borde izquierdo --data-neg). */
  deviated: boolean;
}

export interface TopBarber {
  barberId: string;
  name: string;
  /** Ingreso neto de descuento de sus lineas de servicio (D-F3-5), en centavos. */
  producedCents: number;
  servicesCount: number;
}

export interface TopService {
  serviceId: string;
  name: string;
  servicesCount: number;
}

export interface ChainOverview {
  today: string;
  range: { startsOn: string; endsOn: string };
  previous: { startsOn: string; endsOn: string } | null;
  chain: ChainPeriodTotals;
  previousChain: ChainPeriodTotals;
  revenueDeltaBps: number | null;
  positions: PositionRow[];
  topBarbers: TopBarber[];
  topServices: TopService[];
}

/** "Hoy" en la zona dada, sin depender de la tz del proceso (Intl con `timeZone` explicito). */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

interface LocationLite {
  id: string;
  name: string;
  chairsCount: number;
}

/** Filas diarias de todas las sedes para [startsOn, endsOn]: tabla en bloque + huecos/hoy via getLocationDailyMetrics. */
async function loadRows(
  locs: LocationLite[],
  startsOn: string,
  endsOn: string,
  today: string,
  executor: ChainOverviewExecutor,
): Promise<DailyMetricsRow[]> {
  if (locs.length === 0) return [];
  const ids = locs.map((l) => l.id);

  const stored = await executor
    .select()
    .from(locationDailyMetrics)
    .where(
      and(
        inArray(locationDailyMetrics.locationId, ids),
        sql`${locationDailyMetrics.date} between ${startsOn}::date and ${endsOn}::date`,
      ),
    );

  const terminal = await executor
    .select({
      locationId: appointments.locationId,
      date: sql<string>`((${appointments.startsAt} at time zone ${locations.timezone})::date)::text`,
      n: sql<number>`(count(*) filter (where ${appointments.status} in ('completed', 'no_show', 'cancelled')))::int`,
    })
    .from(appointments)
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .where(
      and(
        inArray(appointments.locationId, ids),
        sql`((${appointments.startsAt} at time zone ${locations.timezone})::date) between ${startsOn}::date and ${endsOn}::date`,
      ),
    )
    .groupBy(appointments.locationId, sql`((${appointments.startsAt} at time zone ${locations.timezone})::date)`);

  const terminalBy = new Map(terminal.map((t) => [`${t.locationId}|${t.date}`, Number(t.n)]));
  const storedBy = new Map(stored.map((s) => [`${s.locationId}|${s.date}`, s]));

  const rows: DailyMetricsRow[] = [];
  for (const loc of locs) {
    for (const date of eachDate(startsOn, endsOn)) {
      const s = date < today ? storedBy.get(`${loc.id}|${date}`) : undefined;
      if (s) {
        const revenueCents = centsFromDecimalString(s.revenue);
        const avgTicketCents = s.avgTicket === null ? 0 : centsFromDecimalString(s.avgTicket);
        rows.push({
          locationId: loc.id,
          date,
          revenueCents,
          servicesCount: s.servicesCount,
          salesCount: avgTicketCents > 0 ? roundHalfToEven(revenueCents, avgTicketCents) : 0,
          newClients: s.newClients,
          uniqueClients: s.uniqueClients,
          noShows: s.noShows,
          terminalAppointments: terminalBy.get(`${loc.id}|${date}`) ?? 0,
          utilizationBps: s.chairUtilizationPct === null ? null : centsFromDecimalString(s.chairUtilizationPct),
          barberHoursX100: s.barberHours === null ? 0 : centsFromDecimalString(s.barberHours),
        });
      } else {
        // Hueco de un dia cerrado (se materializa) o dia en curso (en vivo, sin persistir).
        rows.push((await getLocationDailyMetrics(loc.id, date, executor)).row);
      }
    }
  }
  return rows;
}

export type ChainPositions = Pick<
  ChainOverview,
  "today" | "range" | "previous" | "chain" | "previousChain" | "revenueDeltaBps" | "positions"
>;

type OverviewParams = { chainId: string; range: ResolvedRange | { startsOn: string; endsOn: string }; today: string };

/** Solo KPIs de cadena y Tabla de Posiciones (sin top barberos/servicios): lo que necesita `(chain)/compare`. */
export async function loadChainPositions(params: OverviewParams, executor: ChainOverviewExecutor): Promise<ChainPositions> {
  const { chainId, range, today } = params;

  const locs: LocationLite[] = await executor
    .select({ id: locations.id, name: locations.name, chairsCount: locations.chairsCount })
    .from(locations)
    .where(and(eq(locations.chainId, chainId), eq(locations.isActive, true)))
    .orderBy(asc(locations.name));

  const prev = previousRange(range);
  const currentRows = await loadRows(locs, range.startsOn, range.endsOn, today, executor);
  const prevRows = prev ? await loadRows(locs, prev.startsOn, prev.endsOn, today, executor) : [];

  const current = locs.map((l) => aggregateLocation(currentRows, l));
  const previous = locs.map((l) => aggregateLocation(prevRows, l));
  const previousBy = new Map(previous.map((p) => [p.locationId, p]));
  const flags = flagsDeviation(current);

  const positions: PositionRow[] = rankLocations(current, "revenueCents").map((l) => ({
    ...l,
    revenueDeltaBps: deltaBps(l.revenueCents, previousBy.get(l.locationId)?.revenueCents ?? 0),
    deviated: flags.get(l.locationId) ?? false,
  }));

  const chain = aggregateChain(current, currentRows);
  const previousChain = aggregateChain(previous, prevRows);

  return {
    today,
    range: { startsOn: range.startsOn, endsOn: range.endsOn },
    previous: prev,
    chain,
    previousChain,
    revenueDeltaBps: deltaBps(chain.revenueCents, previousChain.revenueCents),
    positions,
  };
}

export async function loadChainOverview(params: OverviewParams, executor: ChainOverviewExecutor): Promise<ChainOverview> {
  const { chainId, range } = params;
  const base = await loadChainPositions(params, executor);

  const localSaleDate = sql`((${sales.createdAt} at time zone ${locations.timezone})::date)`;
  const inRange = and(
    eq(sales.chainId, chainId),
    eq(sales.status, "paid"),
    sql`${localSaleDate} between ${range.startsOn}::date and ${range.endsOn}::date`,
  );

  // Todas las lineas (servicio y producto) de las ventas pagadas del rango: el descuento se
  // prorratea entre todas (D-F3-5) y la agregacion neta vive en el modulo puro `top-barbers`.
  const topItemRows = await executor
    .select({
      saleId: sales.id,
      discount: sales.discountAmount,
      itemId: saleItems.id,
      barberId: saleItems.barberId,
      type: saleItems.type,
      lineTotal: saleItems.lineTotal,
      quantity: saleItems.quantity,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(locations, eq(locations.id, sales.locationId))
    .where(inRange);

  const salesById = new Map<string, TopBarberSale>();
  for (const r of topItemRows) {
    const sale = salesById.get(r.saleId) ?? {
      status: "paid",
      discountCents: centsFromDecimalString(r.discount),
      items: [],
    };
    sale.items.push({
      id: r.itemId,
      barberId: r.barberId,
      type: r.type,
      lineTotalCents: centsFromDecimalString(r.lineTotal),
      quantity: Number(r.quantity),
    });
    salesById.set(r.saleId, sale);
  }
  const topTotals = aggregateTopBarbers([...salesById.values()]);
  const barberNames =
    topTotals.length === 0
      ? []
      : await executor
          .select({ id: users.id, name: users.fullName })
          .from(users)
          .where(
            inArray(
              users.id,
              topTotals.map((t) => t.barberId),
            ),
          );
  const nameById = new Map(barberNames.map((n) => [n.id, n.name]));

  const serviceRows = await executor
    .select({
      serviceId: saleItems.serviceId,
      name: services.name,
      qty: sql<number>`coalesce(sum(${saleItems.quantity}), 0)::int`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(locations, eq(locations.id, sales.locationId))
    .innerJoin(services, eq(services.id, saleItems.serviceId))
    .where(and(inRange, eq(saleItems.type, "service")))
    .groupBy(saleItems.serviceId, services.name)
    .orderBy(sql`sum(${saleItems.quantity}) desc`, asc(services.name))
    .limit(5);

  return {
    ...base,
    topBarbers: topTotals.map((t) => ({
      barberId: t.barberId,
      name: nameById.get(t.barberId) ?? "Sin nombre",
      producedCents: t.producedCents,
      servicesCount: t.servicesCount,
    })),
    topServices: serviceRows.flatMap((s) =>
      s.serviceId ? [{ serviceId: s.serviceId, name: s.name, servicesCount: Number(s.qty) }] : [],
    ),
  };
}

/** Zona horaria de la cadena (para resolver "hoy"). */
export async function loadChainTimezone(chainId: string, executor: Pick<typeof db, "select">): Promise<string> {
  const rows = await executor.select({ timezone: chains.timezone }).from(chains).where(eq(chains.id, chainId));
  return rows[0]?.timezone ?? "America/Santo_Domingo";
}
