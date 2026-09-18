import "server-only";

import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { PayoutProblem } from "@/lib/commissions";
import type { db } from "@/lib/db/client";
import { cashSessions, clients, locations, sales, users } from "@/lib/db/schema";
import { centsFromDecimalString } from "@/lib/actions/money-utils";
import { formatCentsRd } from "@/lib/payouts/format";
import { formatDateEs } from "@/lib/payouts/period";

/**
 * F3-05/F3-06 · Bloqueadores de aprobacion (D-F3-10): una lista CERRADA de
 * cuatro, cada uno con su texto, su conteo y su enlace. Ninguno es ignorable.
 *
 *  1. `open_sales`               ventas `open` en el rango
 *  2. `open_cash`                cajas con `closed_at is null` abiertas dentro del rango
 *  3. `discount_without_reason`  ventas con descuento > 0 y sin `discount_reason`
 *  4. `missing_rule`             (barbero, sede) con ventas y sin regla de pago resoluble
 *
 * Los tres primeros salen de SQL (`loadSqlBlockers`); el cuarto sale del
 * calculo (`blockersFromProblems`, puro) porque necesita las reglas cargadas.
 *
 * Ejecutor (regla dura §3.2): recibe `db` o `tx` explicitamente, sin valor por
 * defecto. Consultas SECUENCIALES (sin `Promise.all`, pool max:1). Nada de
 * `Date` en plantillas `sql`: las fechas viajan como strings YYYY-MM-DD.
 */
export type BlockerReadExecutor = Pick<typeof db, "select">;

export type ApprovalBlockerCode = "open_sales" | "open_cash" | "discount_without_reason" | "missing_rule";

export interface ApprovalBlockerItem {
  label: string;
  href: string | null;
  /** Solo `discount_without_reason`: permite registrar el motivo desde el panel. */
  saleId?: string;
  locationId?: string;
}

export interface ApprovalBlocker {
  code: ApprovalBlockerCode;
  title: string;
  /** Una frase con el conteo y el que hacer (BRAND-BRIEF §2.3: que paso, por que, que hacer). */
  summary: string;
  count: number;
  items: ApprovalBlockerItem[];
  /** Enlace a la lista donde se resuelve (o null si se resuelve en el propio panel). */
  href: string | null;
}

const MAX_ITEMS = 20;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function registerHref(locationId: string): string {
  return `/sede/${locationId}/register`;
}

export interface BlockerPeriodParams {
  chainId: string;
  startsOn: string;
  endsOn: string;
}

export async function loadSqlBlockers(
  params: BlockerPeriodParams,
  executor: BlockerReadExecutor,
): Promise<ApprovalBlocker[]> {
  const { chainId, startsOn, endsOn } = params;
  const blockers: ApprovalBlocker[] = [];

  // Cota gruesa en UTC para poder usar indices (+-2/+3 dias, igual que loadPayoutInputs); el filtro exacto es la fecha local de la sede.
  const coarseFrom = sql`((${startsOn}::date - 2)::timestamp at time zone 'UTC')`;
  const coarseTo = sql`((${endsOn}::date + 3)::timestamp at time zone 'UTC')`;
  const saleLocalDate = sql`((${sales.createdAt} at time zone ${locations.timezone})::date)`;
  const saleInRange = and(
    eq(sales.chainId, chainId),
    sql`${sales.createdAt} >= ${coarseFrom}`,
    sql`${sales.createdAt} < ${coarseTo}`,
    sql`${saleLocalDate} between ${startsOn}::date and ${endsOn}::date`,
  );
  const localDateText = sql<string>`${saleLocalDate}::text`;

  // 1. Ventas sin cerrar.
  const openSales = await executor
    .select({
      saleId: sales.id,
      locationId: sales.locationId,
      locationName: locations.name,
      localDate: localDateText,
      total: sales.total,
      clientName: clients.fullName,
    })
    .from(sales)
    .innerJoin(locations, eq(locations.id, sales.locationId))
    .innerJoin(clients, eq(clients.id, sales.clientId))
    .where(and(saleInRange, eq(sales.status, "open")))
    .orderBy(asc(sales.createdAt));
  if (openSales.length > 0) {
    blockers.push({
      code: "open_sales",
      title: "Ventas sin cerrar",
      summary: `${openSales.length} ${plural(openSales.length, "venta sigue abierta", "ventas siguen abiertas")} en la quincena. Cóbralas o anúlalas y recalcula.`,
      count: openSales.length,
      items: openSales.slice(0, MAX_ITEMS).map((s) => ({
        label: `${s.locationName}, ${formatDateEs(s.localDate)}: venta de ${s.clientName} por ${formatCentsRd(centsFromDecimalString(s.total))}`,
        href: registerHref(s.locationId),
        locationId: s.locationId,
      })),
      href: registerHref(openSales[0]!.locationId),
    });
  }

  // 2. Cajas sin cuadrar: abiertas, con fecha de apertura (en la zona de su sede) dentro del rango.
  const opener = alias(users, "cash_opener");
  const cashLocalDate = sql`((${cashSessions.openedAt} at time zone ${locations.timezone})::date)`;
  const openCash = await executor
    .select({
      locationId: cashSessions.locationId,
      locationName: locations.name,
      timezone: locations.timezone,
      openedAt: cashSessions.openedAt,
      openedByName: opener.fullName,
    })
    .from(cashSessions)
    .innerJoin(locations, eq(locations.id, cashSessions.locationId))
    .leftJoin(opener, eq(opener.id, cashSessions.openedBy))
    .where(
      and(
        eq(locations.chainId, chainId),
        isNull(cashSessions.closedAt),
        sql`${cashSessions.openedAt} >= ${coarseFrom}`,
        sql`${cashSessions.openedAt} < ${coarseTo}`,
        sql`${cashLocalDate} between ${startsOn}::date and ${endsOn}::date`,
      ),
    )
    .orderBy(asc(cashSessions.openedAt));
  if (openCash.length > 0) {
    blockers.push({
      code: "open_cash",
      title: "Cajas sin cuadrar",
      summary: `${openCash.length} ${plural(openCash.length, "caja sigue abierta", "cajas siguen abiertas")}: una caja abierta todavía puede recibir ventas que cambiarían el corte. Cuádrala primero.`,
      count: openCash.length,
      items: openCash.slice(0, MAX_ITEMS).map((c) => {
        const when = new Intl.DateTimeFormat("es-DO", {
          timeZone: c.timezone,
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(c.openedAt);
        const by = c.openedByName ? `, abierta por ${c.openedByName}` : "";
        return {
          label: `Caja de ${c.locationName} abierta el ${when}${by}`,
          href: registerHref(c.locationId),
          locationId: c.locationId,
        };
      }),
      href: registerHref(openCash[0]!.locationId),
    });
  }

  // 3. Descuentos sin motivo (las anuladas no cuentan: no entran al calculo).
  const noReason = await executor
    .select({
      saleId: sales.id,
      locationId: sales.locationId,
      locationName: locations.name,
      localDate: localDateText,
      discount: sales.discountAmount,
      clientName: clients.fullName,
    })
    .from(sales)
    .innerJoin(locations, eq(locations.id, sales.locationId))
    .innerJoin(clients, eq(clients.id, sales.clientId))
    .where(
      and(
        saleInRange,
        ne(sales.status, "refunded"),
        sql`${sales.discountAmount} > 0`,
        sql`trim(coalesce(${sales.discountReason}, '')) = ''`,
      ),
    )
    .orderBy(asc(sales.createdAt));
  if (noReason.length > 0) {
    blockers.push({
      code: "discount_without_reason",
      title: "Descuentos sin motivo",
      summary: `${noReason.length} ${plural(noReason.length, "venta tiene", "ventas tienen")} un descuento sin motivo registrado. Escribe el motivo de cada una para poder cerrar.`,
      count: noReason.length,
      items: noReason.slice(0, MAX_ITEMS).map((s) => ({
        label: `${s.locationName}, ${formatDateEs(s.localDate)}: descuento de ${formatCentsRd(centsFromDecimalString(s.discount))} en la venta de ${s.clientName}`,
        href: null,
        saleId: s.saleId,
        locationId: s.locationId,
      })),
      href: null,
    });
  }

  return blockers;
}

/**
 * 4. Barberos sin regla de pago (D-F3-3): los problemas del calculo que
 * impiden calcular a un (barbero, sede) por falta de una regla utilizable
 * (`no_rule`) o por una regla inutilizable (`invalid_rule`,
 * `unsupported_rule_type`, `unsupported_tip_handling`). Funcion pura. Los
 * demas problemas (`invalid_input`, `invalid_period`) no son de reglas y se
 * muestran como error de calculo.
 */
export function blockersFromProblems(problems: PayoutProblem[]): ApprovalBlocker[] {
  const ruleProblems = problems.filter(
    (p) =>
      p.code === "no_rule" ||
      p.code === "invalid_rule" ||
      p.code === "unsupported_rule_type" ||
      p.code === "unsupported_tip_handling",
  );
  if (ruleProblems.length === 0) return [];
  return [
    {
      code: "missing_rule",
      title: "Barberos sin regla de pago",
      summary: `${ruleProblems.length} ${plural(ruleProblems.length, "caso sin regla de pago utilizable", "casos sin regla de pago utilizable")}. Asigna una regla en Reglas de Pago y recalcula.`,
      count: ruleProblems.length,
      items: ruleProblems.slice(0, MAX_ITEMS).map((p) => ({
        label: p.message,
        href: "/commissions/rules",
        locationId: p.locationId,
      })),
      href: "/commissions/rules",
    },
  ];
}
