import { ChainRangeSelector } from "@/components/kortex/chain-range-selector"
import { ChainRevenueHero, KpiCard } from "@/components/kortex/chain-kpi"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { PositionsTable } from "@/components/kortex/positions-table"
import { EmptyState } from "@/components/ui/empty-state"
import { requireChainScope } from "@/lib/auth/guards"
import { db } from "@/lib/db/client"
import { loadChainOverview, loadChainTimezone, todayInTimezone } from "@/lib/metrics/chain-overview"
import { resolveRange } from "@/lib/metrics/ranges"

const COMPARED_WITH: Record<string, string> = {
  hoy: "vs. ayer",
  semana: "vs. la semana anterior",
  mes: "vs. los 30 días anteriores",
  custom: "vs. el período anterior",
}

function pctText(bps: number | null): string {
  return bps === null ? "—" : `${Math.round(bps / 100)}%`
}

/**
 * F3-13 · Vista Cadena (UX-BRIEF §4.1). `requireChainScope` ya corre en el
 * layout; aqui se vuelve a invocar para obtener el `chainId` de la sesion (nunca
 * del cliente). El rango viaja en `searchParams` validados con Zod (ranges.ts).
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { chainId } = await requireChainScope()
  const timezone = await loadChainTimezone(chainId, db)
  const today = todayInTimezone(timezone)
  const range = resolveRange(await searchParams, today)

  const overview = await loadChainOverview({ chainId, range, today }, db)
  const { chain, positions } = overview

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-h1">Vista Cadena</h1>
        <ChainRangeSelector
          basePath="/overview"
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
        <>
          <ChainRevenueHero
            revenueCents={chain.revenueCents}
            deltaBps={overview.revenueDeltaBps}
            comparedWith={COMPARED_WITH[range.preset]}
            locationsCount={positions.length}
          />

          <section aria-label="Números de la cadena" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Servicios">{chain.servicesCount}</KpiCard>
            <KpiCard label="Ticket">
              {chain.avgTicketCents === null ? "—" : <MoneyDisplay amount={chain.avgTicketCents / 100} size="num-l" align="left" />}
            </KpiCard>
            <KpiCard label="Ocupación">{pctText(chain.occupancyBps)}</KpiCard>
            <KpiCard label="No-show">{pctText(chain.noShowBps)}</KpiCard>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-h2">Tabla de Posiciones</h2>
            <PositionsTable rows={positions} />
            {chain.revenueCents === 0 ? (
              <p className="text-body-s text-(--text-tertiary)">
                Todavía no se ha cobrado nada en este rango. Cuando cobren en cualquier sede, aparece aquí.
              </p>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h2 className="text-h2">Top barberos de la cadena</h2>
              {overview.topBarbers.length === 0 ? (
                <EmptyState kind="block" message="Sin servicios cobrados en este rango." />
              ) : (
                <ol className="flex flex-col divide-y divide-(--border) rounded-md border border-(--border) bg-(--surface-card)">
                  {overview.topBarbers.map((b, i) => (
                    <li key={b.barberId} className="flex items-center justify-between gap-3 px-4 py-2 text-body-s">
                      <span>
                        {i + 1}. {b.name}
                      </span>
                      <span className="flex items-center gap-3">
                        <MoneyDisplay amount={b.producedCents / 100} />
                        <span className="text-(--text-tertiary)">{b.servicesCount} serv.</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-h2">Top servicios</h2>
              {overview.topServices.length === 0 ? (
                <EmptyState kind="block" message="Sin servicios cobrados en este rango." />
              ) : (
                <ol className="flex flex-col divide-y divide-(--border) rounded-md border border-(--border) bg-(--surface-card)">
                  {overview.topServices.map((s, i) => (
                    <li key={s.serviceId} className="flex items-center justify-between gap-3 px-4 py-2 text-body-s">
                      <span>
                        {i + 1}. {s.name}
                      </span>
                      <span className="text-num-m tabular-nums">{s.servicesCount}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
