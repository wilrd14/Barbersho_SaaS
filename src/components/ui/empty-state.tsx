import * as React from "react"
import { cn } from "cn"

/**
 * Empty state esquematico — DESIGN-SYSTEM.md §4.12. Nunca ilustracion de
 * personaje: `table` renderiza fila fantasma con guiones, `block`
 * renderiza bloque de texto corto + accion unica.
 */
function EmptyState({
  kind,
  message,
  action,
  columns = 4,
  className,
}: {
  kind: "table" | "block"
  message: React.ReactNode
  action?: React.ReactNode
  /** Solo usado por kind="table": cuantas celdas fantasma dibujar. */
  columns?: number
  className?: string
}) {
  if (kind === "table") {
    return (
      <tr className={cn("border-b border-(--border)", className)}>
        <td colSpan={columns} className="px-4 py-8 text-center">
          <p className="text-body-s text-(--text-tertiary)">{message}</p>
          {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
        </td>
      </tr>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-(--border) px-6 py-10 text-center",
        className
      )}
    >
      <p className="text-body-s text-(--text-tertiary)">{message}</p>
      {action ? <div>{action}</div> : null}
    </div>
  )
}

export { EmptyState }
