import Link from "next/link"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import type { RangePreset } from "@/lib/metrics/ranges"

const PRESETS: Array<{ id: Exclude<RangePreset, "custom">; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mes" },
]

/**
 * Selector global de fechas de Vista Cadena (D-F3-14). Todo viaja en la URL
 * (`?rango=semana`, `?rango=custom&desde=..&hasta=..`), asi que el enlace es
 * compartible y el boton atras funciona. Sin JS: el rango custom es un form GET.
 */
export function ChainRangeSelector({
  basePath,
  preset,
  startsOn,
  endsOn,
  today,
}: {
  basePath: string
  preset: RangePreset
  startsOn: string
  endsOn: string
  today: string
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <nav aria-label="Rango de fechas" className="flex gap-1">
        {PRESETS.map((p) => (
          <Link
            key={p.id}
            href={`${basePath}?rango=${p.id}`}
            aria-current={preset === p.id ? "true" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-md border border-(--border) px-3 text-body-s",
              preset === p.id
                ? "bg-(--accent) text-white"
                : "text-(--text-secondary) hover:bg-(--surface-raised)"
            )}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <form action={basePath} method="get" className="flex items-end gap-2">
        <input type="hidden" name="rango" value="custom" />
        <label className="flex flex-col gap-1 text-label text-(--text-tertiary)">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={startsOn}
            max={today}
            required
            className="h-8 rounded-md border border-(--border) bg-(--surface-card) px-2 text-body-s text-(--text-primary)"
          />
        </label>
        <label className="flex flex-col gap-1 text-label text-(--text-tertiary)">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={endsOn}
            max={today}
            required
            className="h-8 rounded-md border border-(--border) bg-(--surface-card) px-2 text-body-s text-(--text-primary)"
          />
        </label>
        <Button type="submit" variant={preset === "custom" ? "primary" : "secondary"} size="sm">
          Aplicar rango
        </Button>
      </form>
    </div>
  )
}
