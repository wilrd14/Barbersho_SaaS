"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { TrendIndicator } from "@/components/kortex/trend-indicator"

/**
 * Fila de la Tabla de Posiciones, solo datos serializables (centavos y puntos
 * basicos enteros). F3-14 completa esta tabla; F3-13 la deja lista y reutilizable.
 */
export interface PositionTableRow {
  locationId: string
  name: string
  rank: number
  revenueCents: number
  /** Δ de ingreso en puntos basicos; null = sin periodo anterior comparable ("—"). */
  revenueDeltaBps: number | null
  servicesCount: number
  avgTicketCents: number | null
  occupancyBps: number | null
  revenuePerChairCents: number | null
  noShowBps: number | null
  /** Mas de 10% bajo el promedio de la cadena: borde izquierdo --data-neg (D-F3-13). */
  deviated: boolean
}

const DASH = <span className="text-(--text-tertiary)">—</span>

/** Ratio en puntos basicos -> porcentaje entero para mostrar (display, no es dinero). */
function pct(bps: number): number {
  return Math.round(bps / 100)
}

function moneyCell(cents: number | null) {
  return cents === null ? DASH : <MoneyDisplay amount={cents / 100} context="summary" align="right" />
}

function percentCell(bps: number | null) {
  return bps === null ? DASH : <span className="text-num-m">{pct(bps)}%</span>
}

export function PositionsTable({
  rows,
  drillHref = (id: string) => `/sede/${id}/today?desde=cadena`,
}: {
  rows: PositionTableRow[]
  /** Destino del clic en una fila (D-F3-15: drill-down en modo lectura+). */
  drillHref?: (locationId: string) => string
}) {
  const router = useRouter()

  const columns: DataTableColumn<PositionTableRow>[] = [
    { id: "name", header: "Sede", sortable: true, accessor: (r) => r.name, isDeviated: (r) => r.deviated },
    { id: "rank", header: "#", type: "number", sortable: true, accessor: (r) => r.rank },
    {
      id: "revenue",
      header: "Ingreso",
      type: "money",
      sortable: true,
      accessor: (r) => r.revenueCents / 100,
    },
    {
      id: "delta",
      header: "Δ",
      type: "delta",
      sortable: true,
      accessor: (r) => (r.revenueDeltaBps === null ? Number.NEGATIVE_INFINITY : r.revenueDeltaBps),
      render: (r) =>
        r.revenueDeltaBps === null ? (
          <div className="flex justify-end">{DASH}</div>
        ) : (
          <div className="flex justify-end">
            <TrendIndicator
              value={pct(r.revenueDeltaBps)}
              direction={r.revenueDeltaBps > 0 ? "up" : r.revenueDeltaBps < 0 ? "down" : "flat"}
              severity={r.revenueDeltaBps > 0 ? "pos" : r.revenueDeltaBps < 0 ? "neg" : "neutral"}
            />
          </div>
        ),
    },
    { id: "services", header: "Serv.", type: "number", sortable: true, accessor: (r) => r.servicesCount },
    {
      id: "ticket",
      header: "Ticket",
      type: "money",
      sortable: true,
      accessor: (r) => (r.avgTicketCents ?? -1) / 100,
      render: (r) => moneyCell(r.avgTicketCents),
    },
    {
      id: "occupancy",
      header: "Ocup.",
      type: "percent",
      sortable: true,
      accessor: (r) => (r.occupancyBps === null ? -1 : pct(r.occupancyBps)),
      render: (r) => percentCell(r.occupancyBps),
    },
    {
      // Obligatoria y siempre visible (PRD §5.4.B): nunca detras de un toggle.
      id: "perChair",
      header: "RD$/silla",
      type: "money",
      sortable: true,
      accessor: (r) => (r.revenuePerChairCents ?? -1) / 100,
      render: (r) => moneyCell(r.revenuePerChairCents),
    },
    {
      id: "noShow",
      header: "No-show",
      type: "percent",
      sortable: true,
      accessor: (r) => (r.noShowBps === null ? -1 : pct(r.noShowBps)),
      render: (r) => percentCell(r.noShowBps),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={rows}
      rowKey={(r) => r.locationId}
      stickyFirstColumn
      onRowClick={(r) => router.push(drillHref(r.locationId))}
      emptyState={
        <EmptyState kind="table" columns={columns.length} message="Todavía no hay sedes activas con cobros en este rango." />
      }
    />
  )
}
