import Link from "next/link"
import { z } from "zod"

import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { PayoutTable } from "@/components/kortex/payout-table"
import { RulesManager } from "@/components/kortex/rules-manager"
import { centsToPesosForDisplay, formatCentsRd } from "@/lib/payouts/format"
import { badgeStatusOf } from "@/lib/payouts/period"
import { loadLocationPayouts } from "@/lib/payouts/queries-location"
import { zUuid } from "@/lib/validation/id"

/**
 * F3-10 · Corte de esta sede, SOLO LECTURA, para el gerente (D-F3-18): las
 * lineas de pago de los barberos de esta sede en el corte elegido. Sin
 * aprobacion, sin ajustes y sin cifras de otras sedes (el filtro va en la
 * consulta, no aqui). El guard de sede lo aplican el layout de `[locationId]` y
 * `loadLocationPayouts`; el periodo viaja en `?periodo=` validado con Zod.
 */
const searchSchema = z.object({ periodo: zUuid.optional() })

export default async function LocationPayoutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locationId } = await params
  const query = searchSchema.safeParse(
    Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  )
  const data = await loadLocationPayouts(locationId, query.success ? query.data.periodo : undefined)
  const { selected } = data

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <Link href={`/sede/${locationId}/today`} className="text-body-s text-(--text-secondary) underline">
          Volver a El Día
        </Link>
        <h1 className="text-h1">El Corte — {data.locationName}</h1>
        <p className="text-body-s text-(--text-tertiary)">
          Lo que le toca a cada barbero de esta sede. Solo lectura: el dueño calcula y cierra el corte.
        </p>
      </header>

      {data.periods.length === 0 ? (
        <EmptyState kind="block" message="Todavía no hay cortes calculados. Cuando el dueño calcule una quincena, tu equipo aparece aquí." />
      ) : (
        <nav aria-label="Quincenas" className="flex flex-wrap gap-2">
          {data.periods.map((p) => (
            <Link
              key={p.id}
              href={`/sede/${locationId}/payouts?periodo=${p.id}`}
              aria-current={selected?.id === p.id ? "page" : undefined}
              className={
                selected?.id === p.id
                  ? "rounded-md border border-(--accent) px-3 py-1.5 text-body-s font-medium"
                  : "rounded-md border border-(--border) px-3 py-1.5 text-body-s text-(--text-secondary)"
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>
      )}

      {selected ? (
        <section className="flex flex-col gap-4" aria-labelledby="periodo-title" data-testid="location-period">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="periodo-title" className="text-h2">
              {selected.label}
            </h2>
            <Badge status={badgeStatusOf(selected.status)} kind="periodo" />
            {selected.status === "calculated" ? (
              <span className="text-body-s text-(--text-tertiary)">Calculado, falta que el dueño lo cierre.</span>
            ) : null}
          </div>

          {selected.lines.length === 0 ? (
            <p className="text-body-s text-(--text-secondary)">Esta sede no tuvo ventas cobradas en esta quincena.</p>
          ) : (
            <p className="flex flex-wrap items-baseline gap-x-3 text-body">
              <span>
                {selected.totals.barberCount} {selected.totals.barberCount === 1 ? "barbero" : "barberos"}
              </span>
              <span aria-hidden>·</span>
              {selected.totals.totalNetCents < 0 ? (
                <span className="text-num-m tabular-nums text-(--data-neg)">{formatCentsRd(selected.totals.totalNetCents)}</span>
              ) : (
                <MoneyDisplay amount={centsToPesosForDisplay(selected.totals.totalNetCents)} context="commission" align="left" />
              )}
              <span>en {data.locationName}</span>
            </p>
          )}

          <PayoutTable periodId={selected.id} periodLabel={selected.label} status={selected.status} lines={selected.lines} canAdjust={false} />
        </section>
      ) : null}

      <section aria-labelledby="reglas-sede-title" className="flex flex-col gap-3">
        <h2 id="reglas-sede-title" className="text-h2">
          Reglas de pago de tu equipo
        </h2>
        <RulesManager rules={data.rules} assignments={data.assignments} readOnly />
      </section>
    </div>
  )
}
