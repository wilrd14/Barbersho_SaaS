import Link from "next/link"

import { BarberReceipt } from "@/components/kortex/barber-receipt"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { formatCentsRd } from "@/lib/payouts/format"
import { badgeStatusOf } from "@/lib/payouts/period"
import { loadMyClosedReceipts, loadMyCurrentQuincena } from "@/lib/payouts/queries-barber"

/**
 * Lo mío — (barber)/earnings (BRAND-BRIEF §4, F3-07): el recibo de la quincena
 * en curso (con el desglose por sede) y el histórico de recibos cerrados. Solo
 * lo del barbero autenticado (D-F3-18): nada de otros barberos ni del total de
 * la sede. Una sola columna apilada, sin tablas horizontales (UX-BRIEF §4.6).
 */
export default async function EarningsPage() {
  const current = await loadMyCurrentQuincena()
  const closed = await loadMyClosedReceipts()

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8 p-4">
      <header className="flex flex-col gap-1">
        <Link href="/mi-silla" className="text-body-s text-(--text-secondary) underline">
          Volver a Mi Silla
        </Link>
        <h1 className="text-h1">Lo mío</h1>
      </header>

      <section aria-labelledby="actual-title" className="flex flex-col gap-3">
        <h2 id="actual-title" className="text-h2">
          Esta quincena
        </h2>
        {current.unavailable ? (
          <p role="status" className="text-body text-(--text-secondary)">
            Tu corte de esta quincena todavía no se puede calcular. Pídele al gerente que revise tu regla de pago.
          </p>
        ) : current.lines.length === 0 ? (
          <p role="status" className="text-body text-(--text-secondary)">
            Todavía no tienes cobros esta quincena.
          </p>
        ) : (
          <BarberReceipt
            barberName={current.barberName}
            periodLabel={current.label}
            status={current.status === "open" ? "en-curso" : current.status}
            lines={current.lines}
          />
        )}
      </section>

      <section aria-labelledby="cerrados-title" className="flex flex-col gap-3">
        <h2 id="cerrados-title" className="text-h2">
          Recibos cerrados
        </h2>
        {closed.length === 0 ? (
          <EmptyState kind="block" message="Todavía no hay quincenas cerradas. Cuando el dueño cierre una, tu recibo queda aquí." />
        ) : (
          <ul className="flex flex-col divide-y divide-(--border) rounded-md border border-(--border)">
            {closed.map((r) => (
              <li key={r.periodId} className="flex items-center justify-between gap-3 p-3">
                <div className="flex flex-col gap-1">
                  <Link href={`/mi-silla/recibo/${r.periodId}`} className="underline underline-offset-4">
                    {r.label}
                  </Link>
                  <Badge status={badgeStatusOf(r.status)} kind="periodo" />
                </div>
                <span className={r.netCents < 0 ? "text-num-m tabular-nums text-(--data-neg)" : "text-num-m tabular-nums"}>
                  {formatCentsRd(r.netCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
