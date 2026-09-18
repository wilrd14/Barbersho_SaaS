import Link from "next/link"
import { notFound } from "next/navigation"

import { BlockersPanel } from "@/components/kortex/blockers-panel"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { PayoutTable } from "@/components/kortex/payout-table"
import { PeriodActions } from "@/components/kortex/period-actions"
import { CopperSeal, PeriodStepper } from "@/components/kortex/period-header"
import { centsToPesosForDisplay, formatCentsRd } from "@/lib/payouts/format"
import { formatDateEs } from "@/lib/payouts/period"
import { loadPeriodDetail } from "@/lib/payouts/queries-periods"
import { zUuid } from "@/lib/validation/id"

/**
 * F3-06 · Corte de Quincena (UX-BRIEF §4.5). Es especificacion, no
 * inspiracion: estado siempre visible en el header, resumen, tabla con
 * DataTable, panel de bloqueadores con texto y enlace, "Cerrar el corte" que
 * explica por que no se puede, confirmacion con el resumen exacto y sello de
 * cobre al cerrar. El guard de superuser lo aplica `loadPeriodDetail`.
 */
export default async function PeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!zUuid.safeParse(id).success) notFound()

  const period = await loadPeriodDetail(id)
  if (!period) notFound()

  const isClosed = period.status === "approved" || period.status === "paid"
  const negativeNet = period.totals.totalNetCents < 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-3">
        <Link href="/commissions/periods" className="text-body-s text-(--text-secondary) underline">
          Volver a los cortes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-h1">El Corte — {period.label}</h1>
            <p className="text-body-s text-(--text-tertiary)">
              Del {formatDateEs(period.startsOn)} al {formatDateEs(period.endsOn)}, con las ventas cobradas en todas las sedes.
            </p>
          </div>
          {isClosed ? (
            <CopperSeal
              status={period.status as "approved" | "paid"}
              detail={period.approvedByName ? `Aprobó ${period.approvedByName}` : undefined}
            />
          ) : null}
        </div>
        <PeriodStepper status={period.status} />
      </header>

      <section
        aria-label="Resumen del corte"
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body"
        data-testid="period-summary"
      >
        {period.lines.length === 0 ? (
          <span className="text-(--text-secondary)">
            {period.status === "open" ? "Sin calcular todavía." : "Sin ventas cobradas en esta quincena."}
          </span>
        ) : (
          <>
            <span>
              {period.totals.barberCount} {period.totals.barberCount === 1 ? "barbero" : "barberos"}
            </span>
            <span aria-hidden>·</span>
            {negativeNet ? (
              <span className="text-num-m tabular-nums text-(--data-neg)">{formatCentsRd(period.totals.totalNetCents)}</span>
            ) : (
              <MoneyDisplay amount={centsToPesosForDisplay(period.totals.totalNetCents)} context="commission" align="left" />
            )}
            <span>a pagar</span>
            <span aria-hidden>·</span>
            <span>
              {period.totals.locationCount} {period.totals.locationCount === 1 ? "sede" : "sedes"}
            </span>
          </>
        )}
      </section>

      <PayoutTable
        periodId={period.id}
        periodLabel={period.label}
        status={period.status}
        lines={period.lines}
        canAdjust={period.status === "calculated"}
      />

      {period.readiness ? (
        <BlockersPanel
          blockers={period.readiness.blockers}
          notEnded={period.readiness.notEnded}
          stale={period.readiness.stale}
          computeError={period.readiness.computeError}
        />
      ) : null}

      <PeriodActions
        periodId={period.id}
        status={period.status}
        periodLabel={period.label}
        barberCount={period.totals.barberCount}
        locationCount={period.totals.locationCount}
        totalNetCents={period.totals.totalNetCents}
        hasLines={period.lines.length > 0}
        closeBlockedReasons={period.readiness?.closeBlockedReasons ?? []}
        csvHref={`/commissions/periods/${period.id}/csv`}
      />
    </div>
  )
}
