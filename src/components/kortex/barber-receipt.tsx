import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { centsToPesosForDisplay, formatCentsRd } from "@/lib/payouts/format"
import { badgeStatusOf, type PeriodStatusValue } from "@/lib/payouts/period"

/**
 * Recibo del barbero (BRAND-BRIEF §4): el desglose de UN barbero en UN corte,
 * una tarjeta por sede. Es lo mismo que ve el barbero en Mi Silla y lo que ven
 * el gerente y el dueno al hacer clic en su fila del Corte (UX-BRIEF §4.5).
 *
 * Componente de presentacion puro (sin hooks ni "use client"): sirve tanto
 * dentro de una Sheet como en una pagina de servidor. El cobre (`emphasis
 * "money"`) es legitimo aqui: dinero devengado por una persona (DESIGN-SYSTEM
 * §5.3). Neto negativo: en rojo, con el copy "debe RD$X a la barberia", sin
 * truncar a cero (D-F3-6).
 */
export interface ReceiptLineView {
  locationName: string
  ruleType: "percentage" | "fixed_per_service" | "booth_rent" | "hybrid" | null
  servicesCount: number
  servicesRevenueCents: number
  commissionCents: number
  boothRentDeductedCents: number
  tipsCents: number
  adjustmentsCents: number
  netPayableCents: number
  notes: string | null
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-body-s text-(--text-secondary)">{label}</dt>
      <dd className="text-body-s">{children}</dd>
    </div>
  )
}

function Amount({ cents, negative = false }: { cents: number; negative?: boolean }) {
  return (
    <MoneyDisplay
      amount={centsToPesosForDisplay(negative ? -cents : cents)}
      context="commission"
      className="text-body-s"
    />
  )
}

export function NetAmount({ cents, size = "num-l" }: { cents: number; size?: "num-m" | "num-l" | "display-l" }) {
  if (cents < 0) {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="text-num-l tabular-nums text-(--data-neg)">{formatCentsRd(cents)}</span>
        <span className="text-body-s text-(--data-neg)">Debe {formatCentsRd(-cents)} a la barbería.</span>
      </span>
    )
  }
  return <MoneyDisplay amount={centsToPesosForDisplay(cents)} context="commission" emphasis="money" size={size} align="left" />
}

export function BarberReceipt({
  barberName,
  periodLabel,
  status,
  lines,
}: {
  barberName: string
  periodLabel: string
  status: PeriodStatusValue | "en-curso"
  lines: ReceiptLineView[]
}) {
  const totalNet = lines.reduce((sum, l) => sum + l.netPayableCents, 0)
  return (
    <article className="flex flex-col gap-4" aria-label={`Recibo de ${barberName}`}>
      <header className="flex flex-col gap-1">
        <p className="text-label text-(--text-tertiary)">Recibo del barbero</p>
        <h3 className="text-h2">{barberName}</h3>
        <div className="flex items-center gap-2 text-body-s text-(--text-secondary)">
          <span>{periodLabel}</span>
          {status === "en-curso" ? (
            <span className="rounded-sm border border-(--border) px-2 py-0.5">En curso</span>
          ) : (
            <Badge status={badgeStatusOf(status)} kind="periodo" />
          )}
        </div>
      </header>

      {lines.map((line) => {
        const hidesCommission = line.ruleType === "booth_rent"
        return (
          <section
            key={line.locationName}
            className="flex flex-col gap-2 rounded-md border border-(--border) p-3"
            aria-label={`${barberName} en ${line.locationName}`}
          >
            <h4 className="text-body font-medium">{line.locationName}</h4>
            <dl className="flex flex-col gap-1.5">
              <Row label="Servicios">
                <span className="text-num-m tabular-nums">{line.servicesCount}</span>
              </Row>
              <Row label="Ingreso de servicios">
                <Amount cents={line.servicesRevenueCents} />
              </Row>
              <Row label="Comisión">{hidesCommission ? "—" : <Amount cents={line.commissionCents} />}</Row>
              {line.boothRentDeductedCents > 0 ? (
                <Row label="Alquiler de silla">
                  <Amount cents={line.boothRentDeductedCents} negative />
                </Row>
              ) : null}
              <Row label="Propinas">
                <Amount cents={line.tipsCents} />
              </Row>
              {line.adjustmentsCents !== 0 ? (
                <Row label={line.notes ? `Ajuste (${line.notes})` : "Ajuste"}>
                  <Amount cents={line.adjustmentsCents} />
                </Row>
              ) : null}
            </dl>
            <div className="flex items-baseline justify-between gap-3 border-t border-(--border) pt-2">
              <span className="text-body-s text-(--text-secondary)">Neto en {line.locationName}</span>
              <NetAmount cents={line.netPayableCents} size="num-m" />
            </div>
          </section>
        )
      })}

      {lines.length > 1 ? (
        <div className="flex items-baseline justify-between gap-3 rounded-md border border-(--border) p-3">
          <span className="text-body">Total de las {lines.length} sedes</span>
          <NetAmount cents={totalNet} />
        </div>
      ) : null}
    </article>
  )
}
