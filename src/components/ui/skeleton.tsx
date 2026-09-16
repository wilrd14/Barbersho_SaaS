import * as React from "react"
import { cn } from "cn"

function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-(--surface-raised)", className)} />
}

/**
 * Skeleton loader — DESIGN-SYSTEM.md §4.11. El layout debe calzar con el
 * contenido real que reemplaza; nunca un spinner generico centrado en
 * pantallas con estructura de datos conocida.
 */
function Skeleton({
  layout,
  rows = 5,
  columns = 4,
  className,
}: {
  layout: "table" | "card" | "kpi" | "list"
  rows?: number
  columns?: number
  className?: string
}) {
  if (layout === "table") {
    return (
      <div className={cn("w-full overflow-hidden rounded-md border border-(--border)", className)}>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 border-b border-(--border) px-4 last:border-b-0"
            style={{ height: 44 }}
          >
            {Array.from({ length: columns }).map((__, c) => (
              <Bone key={c} className={cn("h-3.5", c === 0 ? "w-32" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (layout === "kpi") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <Bone className="h-3 w-24" />
        <Bone className="h-9 w-40" />
      </div>
    )
  }

  if (layout === "list") {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-3">
            <Bone className="size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Bone className="h-3.5 w-1/2" />
              <Bone className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // card
  return (
    <div className={cn("flex flex-col gap-3 rounded-md border border-(--border) p-4", className)}>
      <Bone className="h-4 w-2/3" />
      <Bone className="h-3 w-1/2" />
      <Bone className="h-24 w-full" />
    </div>
  )
}

export { Skeleton }
