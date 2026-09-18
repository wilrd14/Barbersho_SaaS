import Link from "next/link"

import { RulesManager } from "@/components/kortex/rules-manager"
import { loadRulesPageData } from "@/lib/payouts/queries-rules"

/**
 * F3-04 · Reglas de Pago (BRAND-BRIEF §4). El layout `(chain)` ya exige
 * superuser; `loadRulesPageData` vuelve a llamar al guard por dentro.
 */
export default async function RulesPage() {
  const { rules, assignments } = await loadRulesPageData()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <Link href="/commissions" className="text-body-s text-(--text-secondary) underline">
          Volver a El Corte
        </Link>
        <h1 className="text-h1">Reglas de Pago</h1>
        <p className="text-body-s text-(--text-tertiary)">
          Cómo se le paga a cada barbero: porcentaje, alquiler de silla o una mezcla de los dos.
        </p>
      </header>
      <RulesManager rules={rules} assignments={assignments} />
    </div>
  )
}
