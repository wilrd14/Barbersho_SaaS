import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { centsFromDecimalString, decimalStringFromCents } from "@/lib/actions/money-utils";
import { parseIsoDate } from "@/lib/commissions";
import type { db } from "@/lib/db/client";
import { appointments, locationDailyMetrics, locations } from "@/lib/db/schema";
import { roundHalfToEven } from "@/lib/pos";

import { utilizationBps, type DailyMetricsRow } from "./index";

/**
 * F3-12 · Agregacion diaria y materializacion perezosa (D-F3-12, D-F3-13).
 * Parte CON acceso a DB de `lib/metrics`; las derivadas viven en `./index` (puro).
 *
 * Ejecutor (regla dura §3.2): `db` o el `tx` de una transaccion abierta, SIN valor
 * por defecto, y se usa solo ese objeto (pool `max: 1`: el `db` singleton dentro
 * de una transaccion se cuelga para siempre).
 * Fechas (§3.3): nada de `Date` en templates `sql`; todo viaja como `YYYY-MM-DD`
 * y la conversion a la zona de la sede la hace Postgres.
 * Sin `Promise.all` con consultas (CHANGELOG, cuelgue de `postgres.js` sobre Supavisor).
 *
 * Lectura (`getLocationDailyMetrics`):
 *  - dia CERRADO (fecha < hoy en la tz de la sede): se lee de `location_daily_metrics`;
 *    si falta, se calcula y se hace `upsert` (unico `(location_id, date)`).
 *  - dia en curso o futuro: se calcula en vivo y NUNCA se persiste.
 *
 * Lo que la tabla no guarda y se recupera al leer una fila persistida:
 *  - `salesCount` = revenue / avg_ticket (redondeo bancario; si avg_ticket es 0 o
 *    null con revenue 0 queda 0: un dia con ventas 100% descontadas pierde ese conteo);
 *  - `terminalAppointments` = una consulta a `appointments` (1 round-trip extra).
 *
 * Definiciones (D-F3-13): revenue = sum(subtotal - descuento) de ventas `paid`
 * (sin propina, sin `refunded`); ocupacion = minutos de citas `completed` /
 * (sillas x minutos de apertura segun business_hours), topada a 100%.
 */
export type DailyMetricsExecutor = Pick<typeof db, "select" | "insert" | "execute">;

export interface DailyMetricsResult {
  row: DailyMetricsRow;
  /** Solo en calculo nuevo: la ocupacion cruda paso de 100% (se topo). */
  anomalous: boolean;
  /** true si la fila vino de `location_daily_metrics` en vez de recalcularse. */
  fromTable: boolean;
  /** true si esta llamada escribio (upsert) en location_daily_metrics. */
  persisted: boolean;
}

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function assertDate(date: string): void {
  if (!parseIsoDate(date)) throw new Error(`Fecha invalida para metricas: ${date}.`);
}

function toMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutos de apertura del dia segun `business_hours` (D-S1-1); 0 si cerrada o sin dato. */
function openMinutes(businessHours: unknown, dow: number): number {
  if (!businessHours || typeof businessHours !== "object") return 0;
  const day = (businessHours as Record<string, { opens_at?: string; closes_at?: string; closed?: boolean }>)[
    DOW_KEYS[dow]
  ];
  if (!day || day.closed) return 0;
  const open = toMinutes(day.opens_at);
  const close = toMinutes(day.closes_at);
  return open !== null && close !== null && close > open ? close - open : 0;
}

/** Dia calculado desde la fuente para una sede (incluye "hoy" local, leido en la misma sentencia). */
interface ComputedDay {
  row: DailyMetricsRow;
  /** La ocupacion cruda paso de 100% (se topo). */
  anomalous: boolean;
  /** "Hoy" en la tz de la sede (YYYY-MM-DD). */
  todayLocal: string;
}

/**
 * Calcula el dia de VARIAS sedes desde `sales`/`appointments`/`schedules` en UNA sentencia
 * (CTEs agrupadas por sede) y lee en ella misma tz/sillas/horario/"hoy" de cada sede:
 * 1 round-trip total en vez de 2 por sede (P95 de Vista Cadena, PRD §15).
 * Las sedes inexistentes no aparecen en el Map.
 */
async function computeBatchFromSource(
  locationIds: string[],
  date: string,
  executor: DailyMetricsExecutor,
): Promise<Map<string, ComputedDay>> {
  const out = new Map<string, ComputedDay>();
  if (locationIds.length === 0) return out;
  const idList = sql.join(
    locationIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const rows = await executor.execute<{
    id: string;
    timezone: string;
    chairs_count: number;
    business_hours: unknown;
    today_local: string;
    dow: number;
    revenue: string;
    sales_count: number;
    services: number;
    unique_clients: number;
    new_clients: number;
    no_shows: number;
    terminal: number;
    served_min: number;
    minutes: number;
  }>(sql`
    with loc as (
      select l.id, l.timezone, l.chairs_count, l.business_hours,
             ((now() at time zone l.timezone)::date)::text as today_local,
             extract(dow from ${date}::date)::int as dow
      from locations l
      where l.id in (${idList})
    ),
    sl as (
      select s.location_id,
        coalesce(sum(s.subtotal - s.discount_amount), 0)::text as revenue,
        count(*)::int as sales_count,
        coalesce(sum(it.qty), 0)::int as services,
        (count(distinct s.client_id))::int as unique_clients,
        (count(distinct s.client_id) filter (where (c.created_at at time zone loc.timezone)::date = ${date}::date))::int as new_clients
      from sales s
      join loc on loc.id = s.location_id
      left join clients c on c.id = s.client_id
      left join lateral (
        select sum(si.quantity) as qty from sale_items si where si.sale_id = s.id and si.type = 'service'
      ) it on true
      where s.status = 'paid'
        and (s.created_at at time zone loc.timezone)::date = ${date}::date
      group by s.location_id
    ),
    ap as (
      select a.location_id,
        (count(*) filter (where a.status = 'no_show'))::int as no_shows,
        (count(*) filter (where a.status in ('completed', 'no_show', 'cancelled')))::int as terminal,
        coalesce(sum(extract(epoch from (a.ends_at - a.starts_at)) / 60) filter (where a.status = 'completed'), 0)::int as served_min
      from appointments a
      join loc on loc.id = a.location_id
      where (a.starts_at at time zone loc.timezone)::date = ${date}::date
      group by a.location_id
    ),
    blocks as (
      select sc.location_id, sc.user_id,
             ((${date}::date + sc.start_time) at time zone loc.timezone) as bstart,
             ((${date}::date + sc.end_time) at time zone loc.timezone) as bend
      from schedules sc
      join loc on loc.id = sc.location_id
      where sc.is_active and sc.day_of_week = loc.dow
    ),
    hr as (
      select b.location_id,
             coalesce(sum(greatest(0, extract(epoch from (b.bend - b.bstart)) / 60 - coalesce(ov.m, 0))), 0)::int as minutes
      from blocks b
      left join lateral (
        select sum(greatest(0, extract(epoch from (least(t.ends_at, b.bend) - greatest(t.starts_at, b.bstart))) / 60)) as m
        from time_off t
        where t.user_id = b.user_id and t.status = 'approved'
          and (t.location_id is null or t.location_id = b.location_id)
          and t.starts_at < b.bend and t.ends_at > b.bstart
      ) ov on true
      group by b.location_id
    )
    select loc.id, loc.timezone, loc.chairs_count, loc.business_hours, loc.today_local, loc.dow,
           coalesce(sl.revenue, '0') as revenue, coalesce(sl.sales_count, 0) as sales_count,
           coalesce(sl.services, 0) as services, coalesce(sl.unique_clients, 0) as unique_clients,
           coalesce(sl.new_clients, 0) as new_clients, coalesce(ap.no_shows, 0) as no_shows,
           coalesce(ap.terminal, 0) as terminal, coalesce(ap.served_min, 0) as served_min,
           coalesce(hr.minutes, 0) as minutes
    from loc
    left join sl on sl.location_id = loc.id
    left join ap on ap.location_id = loc.id
    left join hr on hr.location_id = loc.id
  `);

  for (const r of rows) {
    const util = utilizationBps(r.served_min, Number(r.chairs_count), openMinutes(r.business_hours, Number(r.dow)));
    out.set(r.id, {
      todayLocal: r.today_local,
      anomalous: util?.anomalous ?? false,
      row: {
        locationId: r.id,
        date,
        revenueCents: centsFromDecimalString(r.revenue),
        servicesCount: Number(r.services),
        salesCount: Number(r.sales_count),
        newClients: Number(r.new_clients),
        uniqueClients: Number(r.unique_clients),
        noShows: Number(r.no_shows),
        terminalAppointments: Number(r.terminal),
        utilizationBps: util?.bps ?? null,
        barberHoursX100: roundHalfToEven(Number(r.minutes) * 100, 60),
      },
    });
  }
  return out;
}

async function computeOne(locationId: string, date: string, executor: DailyMetricsExecutor): Promise<ComputedDay> {
  const found = (await computeBatchFromSource([locationId], date, executor)).get(locationId);
  if (!found) throw new Error(`Sede inexistente: ${locationId}.`);
  return found;
}

/**
 * Dia en curso (o futuro) de VARIAS sedes, calculado en vivo y sin persistir, en 1 round-trip.
 * Pensado para Vista Cadena; el llamador es responsable de que `date` no sea un dia cerrado.
 */
export async function computeLiveDailyRows(
  locationIds: string[],
  date: string,
  executor: DailyMetricsExecutor,
): Promise<DailyMetricsRow[]> {
  assertDate(date);
  const batch = await computeBatchFromSource(locationIds, date, executor);
  const rows: DailyMetricsRow[] = [];
  for (const id of locationIds) {
    const day = batch.get(id);
    if (!day) throw new Error(`Sede inexistente: ${id}.`);
    if (day.anomalous) console.warn(`[metrics] ocupacion >100% topada: sede ${id}, ${date}`);
    rows.push(day.row);
  }
  return rows;
}

async function upsertRow(row: DailyMetricsRow, executor: DailyMetricsExecutor): Promise<void> {
  const avgTicketCents = row.salesCount > 0 ? roundHalfToEven(row.revenueCents, row.salesCount) : null;
  const values = {
    revenue: decimalStringFromCents(row.revenueCents),
    servicesCount: row.servicesCount,
    productsRevenue: "0.00", // D-F3-13: 0 en F3 (no hay venta de producto)
    uniqueClients: row.uniqueClients,
    newClients: row.newClients,
    noShows: row.noShows,
    avgTicket: avgTicketCents === null ? null : decimalStringFromCents(avgTicketCents),
    chairUtilizationPct: row.utilizationBps === null ? null : decimalStringFromCents(row.utilizationBps),
    barberHours: decimalStringFromCents(row.barberHoursX100),
  };
  await executor
    .insert(locationDailyMetrics)
    .values({ locationId: row.locationId, date: row.date, ...values })
    .onConflictDoUpdate({
      target: [locationDailyMetrics.locationId, locationDailyMetrics.date],
      set: values,
    });
}

/**
 * D-F3-13: calcula SIEMPRE desde las ventas (no lee la tabla ni persiste).
 * Devuelve la fila diaria para `aggregateLocation`.
 */
export async function computeLocationDailyMetrics(
  locationId: string,
  date: string,
  executor: DailyMetricsExecutor,
): Promise<DailyMetricsRow> {
  assertDate(date);
  const { row, anomalous } = await computeOne(locationId, date, executor);
  if (anomalous) console.warn(`[metrics] ocupacion >100% topada: sede ${locationId}, ${date}`);
  return row;
}

/**
 * D-F3-12: unico punto de reparacion. Recalcula y hace `upsert` si el dia ya
 * esta cerrado; si es hoy o futuro solo calcula (no se persiste nunca).
 * Debe invocarse desde cualquier escritura que modifique un dia cerrado.
 */
export async function recomputeLocationDailyMetrics(
  locationId: string,
  date: string,
  executor: DailyMetricsExecutor,
): Promise<DailyMetricsResult> {
  assertDate(date);
  const { row, anomalous, todayLocal } = await computeOne(locationId, date, executor);
  if (anomalous) console.warn(`[metrics] ocupacion >100% topada: sede ${locationId}, ${date}`);
  const persisted = date < todayLocal;
  if (persisted) await upsertRow(row, executor);
  return { row, anomalous, fromTable: false, persisted };
}

/** Lectura de D-F3-12 (dia cerrado -> tabla con upsert perezoso; dia en curso -> vivo, sin persistir). */
export async function getLocationDailyMetrics(
  locationId: string,
  date: string,
  executor: DailyMetricsExecutor,
): Promise<DailyMetricsResult> {
  assertDate(date);

  const facts = await executor
    .select({
      timezone: locations.timezone,
      todayLocal: sql<string>`((now() at time zone ${locations.timezone})::date)::text`,
    })
    .from(locations)
    .where(eq(locations.id, locationId));
  if (facts.length === 0) throw new Error(`Sede inexistente: ${locationId}.`);
  const { timezone, todayLocal } = facts[0];

  if (date >= todayLocal) {
    const { row, anomalous } = await computeOne(locationId, date, executor);
    return { row, anomalous, fromTable: false, persisted: false };
  }

  const stored = await executor
    .select()
    .from(locationDailyMetrics)
    .where(and(eq(locationDailyMetrics.locationId, locationId), eq(locationDailyMetrics.date, date)));

  if (stored.length === 0) {
    const { row, anomalous } = await computeOne(locationId, date, executor);
    if (anomalous) console.warn(`[metrics] ocupacion >100% topada: sede ${locationId}, ${date}`);
    await upsertRow(row, executor);
    return { row, anomalous, fromTable: false, persisted: true };
  }

  const r = stored[0];
  const terminalRows = await executor
    .select({
      n: sql<number>`(count(*) filter (where ${appointments.status} in ('completed', 'no_show', 'cancelled')))::int`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.locationId, locationId),
        sql`(${appointments.startsAt} at time zone ${timezone})::date = ${date}::date`,
      ),
    );

  const revenueCents = centsFromDecimalString(r.revenue);
  const avgTicketCents = r.avgTicket === null ? 0 : centsFromDecimalString(r.avgTicket);
  return {
    anomalous: false,
    fromTable: true,
    persisted: false,
    row: {
      locationId,
      date,
      revenueCents,
      servicesCount: r.servicesCount,
      salesCount: avgTicketCents > 0 ? roundHalfToEven(revenueCents, avgTicketCents) : 0,
      newClients: r.newClients,
      uniqueClients: r.uniqueClients,
      noShows: r.noShows,
      terminalAppointments: Number(terminalRows[0].n),
      utilizationBps: r.chairUtilizationPct === null ? null : centsFromDecimalString(r.chairUtilizationPct),
      barberHoursX100: r.barberHours === null ? 0 : centsFromDecimalString(r.barberHours),
    },
  };
}

export interface BackfillParams {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Inclusive, YYYY-MM-DD. Los dias no cerrados en la tz de cada sede se omiten. */
  to: string;
  /** Si se omite, todas las sedes. */
  locationId?: string;
}

export interface BackfillSummary {
  locations: number;
  daysPersisted: number;
  skippedOpenDays: number;
}

const MAX_BACKFILL_DAYS = 400;

/** `npm run metrics:backfill`: recalcula y persiste cada dia cerrado del rango (idempotente por `(location_id, date)`). */
export async function backfillLocationDailyMetrics(
  params: BackfillParams,
  executor: DailyMetricsExecutor,
): Promise<BackfillSummary> {
  assertDate(params.from);
  assertDate(params.to);
  if (params.to < params.from) throw new Error(`Rango invalido: ${params.from} a ${params.to}.`);

  const days = await executor.execute<{ d: string }>(
    sql`select (g::date)::text as d from generate_series(${params.from}::date, ${params.to}::date, interval '1 day') g`,
  );
  if (days.length > MAX_BACKFILL_DAYS) {
    throw new Error(`Rango demasiado grande (${days.length} dias, maximo ${MAX_BACKFILL_DAYS}).`);
  }

  const locs = await executor
    .select({ id: locations.id })
    .from(locations)
    .where(params.locationId ? eq(locations.id, params.locationId) : undefined);

  let persisted = 0;
  let skipped = 0;
  for (const loc of locs) {
    for (const { d } of days) {
      const res = await recomputeLocationDailyMetrics(loc.id, d, executor);
      if (res.persisted) persisted += 1;
      else skipped += 1;
    }
  }
  return { locations: locs.length, daysPersisted: persisted, skippedOpenDays: skipped };
}
