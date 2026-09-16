"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "cn"
import { TrendIndicator, type TrendIndicatorProps } from "@/components/kortex/trend-indicator"
import { MoneyDisplay } from "@/components/kortex/money-display"

type ColumnType = "text" | "money" | "number" | "percent" | "delta"

export interface DataTableColumn<T> {
  id: string
  header: string
  type?: ColumnType
  sortable?: boolean
  /** Requerido cuando type es money/number/percent/delta, ignorado para "text". */
  accessor: (row: T) => React.ReactNode | number
  /** Para type="delta": debe devolver los props de TrendIndicator. */
  trend?: (row: T) => TrendIndicatorProps
  /** Fila con desviacion fuerte: borde izquierdo --data-neg, nunca fondo completo. */
  isDeviated?: (row: T) => boolean
}

/**
 * Tabla de datos densa — DESIGN-SYSTEM.md §4.4. El componente mas
 * importante del sistema (Tabla de Posiciones, El Corte, reportes).
 *
 * Regla dura §5.2: toda columna money/number/percent/delta se alinea a la
 * derecha y usa --font-mono con font-feature-settings: "tnum", sin
 * excepcion.
 */
function DataTable<T>({
  columns,
  data,
  rowKey,
  density = 44,
  stickyFirstColumn,
  emptyState,
  onRowClick,
}: {
  columns: DataTableColumn<T>[]
  data: T[]
  rowKey: (row: T) => string
  density?: 44 | 52
  /** Por defecto activo <lg (se controla via CSS, aqui solo se permite forzar). */
  stickyFirstColumn?: boolean
  emptyState?: React.ReactNode
  onRowClick?: (row: T) => void
}) {
  const [sort, setSort] = React.useState<{ id: string; dir: "asc" | "desc" } | null>(null)

  const sorted = React.useMemo(() => {
    if (!sort) return data
    const col = columns.find((c) => c.id === sort.id)
    if (!col) return data
    return [...data].sort((a, b) => {
      const va = col.accessor(a)
      const vb = col.accessor(b)
      const na = typeof va === "number" ? va : Number(va)
      const nb = typeof vb === "number" ? vb : Number(vb)
      const cmp = Number.isNaN(na) || Number.isNaN(nb) ? String(va).localeCompare(String(vb)) : na - nb
      return sort.dir === "asc" ? cmp : -cmp
    })
  }, [data, sort, columns])

  const isNumeric = (type?: ColumnType) => type === "money" || type === "number" || type === "percent" || type === "delta"

  function toggleSort(colId: string) {
    setSort((prev) => {
      if (!prev || prev.id !== colId) return { id: colId, dir: "asc" }
      if (prev.dir === "asc") return { id: colId, dir: "desc" }
      return null
    })
  }

  return (
    <div className="w-full overflow-x-auto rounded-md border border-(--border)">
      <table className="w-full border-collapse text-body-s">
        <thead>
          <tr className="border-b border-(--border)">
            {columns.map((col, i) => (
              <th
                key={col.id}
                scope="col"
                className={cn(
                  "text-label whitespace-nowrap px-4 py-2 text-(--text-tertiary)",
                  isNumeric(col.type) ? "text-right" : "text-left",
                  stickyFirstColumn && i === 0 && "sticky left-0 z-10 bg-(--surface-card)"
                )}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.id)}
                    className="inline-flex items-center gap-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                  >
                    {col.header}
                    {sort?.id === col.id ? (
                      sort.dir === "asc" ? (
                        <ChevronUp className="size-3" strokeWidth={1.5} />
                      ) : (
                        <ChevronDown className="size-3" strokeWidth={1.5} />
                      )
                    ) : null}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && emptyState ? (
            emptyState
          ) : (
            sorted.map((row) => {
              const deviated = columns.some((c) => c.isDeviated?.(row))
              return (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-(--border) last:border-b-0",
                    onRowClick && "cursor-pointer hover:bg-(--surface-raised)",
                    deviated && "border-l-2 border-l-(--data-neg)"
                  )}
                  style={{ height: density }}
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.id}
                      className={cn(
                        "px-4 py-2 align-middle text-(--text-primary)",
                        isNumeric(col.type) ? "text-right" : "text-left",
                        stickyFirstColumn && i === 0 && "sticky left-0 z-10 bg-(--surface-card)"
                      )}
                    >
                      {col.type === "money" ? (
                        <MoneyDisplay amount={Number(col.accessor(row))} align="right" />
                      ) : col.type === "delta" && col.trend ? (
                        <div className="flex justify-end">
                          <TrendIndicator {...col.trend(row)} />
                        </div>
                      ) : col.type === "number" || col.type === "percent" ? (
                        <span className="text-num-m">
                          {col.accessor(row)}
                          {col.type === "percent" ? "%" : ""}
                        </span>
                      ) : (
                        col.accessor(row)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

export { DataTable }
export type { ColumnType }
