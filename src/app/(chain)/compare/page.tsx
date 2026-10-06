import { ChainRangeSelector } from "@/components/kortex/chain-range-selector"
import { PositionsTable } from "@/components/kortex/positions-table"
import { EmptyState } from "@/components/ui/empty-state"
import { requireChainScope } from "@/lib/auth/guards"
import { db } from "@/lib/db/client"
import { loadChainPositions, loadChainTimezone, todayInTimezone } from "@/lib/metrics/chain-overview"
import { resolveRange } from "@/lib/metrics/ranges"

/**
 * F3-14 · Tabla de Posiciones (UX-BRIEF §4.1, PRD §5.4.B). Mismo selector de rango
 * que Vista Cadena (`searchParams` validados en `resolveRange`); el `chainId` sale
 * siempre de la sesion. RD$/silla es una columna fija de la tabla, nunca un toggle.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { chainId } = await requireChainScope()
  const timezone = await loadChainTimezone(chainId, db)
  const today = todayInTimezone(timezone)
  const range = resolveRange(await searchParams, today)

  const { positions, chain } = await loadChainPositions({ chainId, range, today }, db)

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-h1">Tabla de Posiciones</h1>
        <ChainRangeSelector
          basePath="/compare"
          preset={range.preset}
          startsOn={range.startsOn}
          endsOn={range.endsOn}
          today={today}
        />
        {range.fellBack ? (
          <p role="status" className="text-body-s text-(--data-warn)">
            El rango pedido no es válido; se muestra hoy. Elige otro rango arriba.
          </p>
        ) : null}
      </header>

      {positions.length === 0 ? (
        <EmptyState kind="block" message="Todavía no hay sedes activas en la cadena." />
      ) : (
        <section className="flex flex-col gap-2">
          <PositionsTable rows={positions} />
          <p className="text-body-s text-(--text-tertiary)">
            Ordena por cualquier columna. RD$/silla compara sedes de distinto tamaño. El borde rojo marca una sede
            con más de 10% de ingreso por debajo del promedio de la cadena. Toca una fila para ver la sede.
          </p>
          {chain.revenueCents === 0 ? (
            <p className="text-body-s text-(--text-tertiary)">
              Todavía no se ha cobrado nada en este rango. Cuando cobren en cualquier sede, aparece aquí.
            </p>
          ) : null}
        </section>
      )}
    </div>
  )
}
