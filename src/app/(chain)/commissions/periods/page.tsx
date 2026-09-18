import Link from "next/link"

import { PeriodsList } from "@/components/kortex/periods-list"
import { loadPeriodsPageData } from "@/lib/payouts/queries-periods"

/** F3-06 · Historial de cortes de quincena, con estado y total. */
export default async function PeriodsPage() {
  const { periods, creatable } = await loadPeriodsPageData()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <Link href="/commissions" className="text-body-s text-(--text-secondary) underline">
          Volver a El Corte
        </Link>
        <h1 className="text-h1">Cortes de quincena</h1>
        <p className="text-body-s text-(--text-tertiary)">
          Cada corte junta lo que se cobró en todas las sedes y dice cuánto se le debe a cada barbero.
        </p>
      </header>
      <PeriodsList periods={periods} creatable={creatable} />
    </div>
  )
}
