import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { formatCentsRd } from "@/lib/payouts/format"
import { badgeStatusOf } from "@/lib/payouts/period"
import { loadPeriodsPageData } from "@/lib/payouts/queries-periods"

/**
 * F3-06 · El Corte (BRAND-BRIEF §4): indice con accesos a las Reglas de Pago y
 * a los cortes de quincena, y los ultimos cortes. Solo superuser (layout
 * `(chain)` y guard dentro de `loadPeriodsPageData`).
 */
export default async function CommissionsPage() {
  const { periods } = await loadPeriodsPageData()
  const recent = periods.slice(0, 3)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1">El Corte</h1>
        <p className="text-body-s text-(--text-tertiary)">
          Cuánto se le debe a cada barbero, calculado sobre lo que se cobró de verdad.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-md border border-(--border) p-4" aria-labelledby="cortes-title">
          <h2 id="cortes-title" className="text-h2">
            Cortes de quincena
          </h2>
          <p className="text-body-s text-(--text-secondary)">Calcula, revisa y cierra la quincena. Después no se puede editar.</p>
          <Link href="/commissions/periods" className={buttonVariants({ variant: "primary", size: "md" })}>
            Ver los cortes
          </Link>
        </section>
        <section className="flex flex-col gap-3 rounded-md border border-(--border) p-4" aria-labelledby="reglas-title">
          <h2 id="reglas-title" className="text-h2">
            Reglas de Pago
          </h2>
          <p className="text-body-s text-(--text-secondary)">Porcentaje, alquiler de silla o mixta, por barbero y por sede.</p>
          <Link href="/commissions/rules" className={buttonVariants({ variant: "secondary", size: "md" })}>
            Ver las reglas
          </Link>
        </section>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="ultimos-title">
        <h2 id="ultimos-title" className="text-h2">
          Últimos cortes
        </h2>
        {recent.length === 0 ? (
          <EmptyState kind="block" message="Todavía no hay cortes. Crea el de la quincena en curso." />
        ) : (
          <ul className="flex flex-col divide-y divide-(--border) rounded-md border border-(--border)">
            {recent.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <Link href={`/commissions/periods/${p.id}`} className="underline underline-offset-4">
                  {p.label}
                </Link>
                <span className="flex items-center gap-3">
                  <Badge status={badgeStatusOf(p.status)} kind="periodo" />
                  <span className="text-num-m tabular-nums">
                    {p.totalNetCents === null ? "—" : formatCentsRd(p.totalNetCents)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
