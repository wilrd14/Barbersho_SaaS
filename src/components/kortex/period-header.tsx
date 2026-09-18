import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { badgeStatusOf, PERIOD_STATUS_ORDER, type PeriodStatusValue } from "@/lib/payouts/period"

/**
 * Estado del periodo siempre visible en el header del Corte (UX-BRIEF §4.5):
 * `Abierto -> Calculado -> Aprobado -> Pagado`. El paso actual va marcado con
 * `aria-current="step"`; los anteriores llevan un check discreto.
 */
const STEP_LABEL: Record<PeriodStatusValue, string> = {
  open: "Abierto",
  calculated: "Calculado",
  approved: "Aprobado",
  paid: "Pagado",
}

export function PeriodStepper({ status }: { status: PeriodStatusValue }) {
  const currentIndex = PERIOD_STATUS_ORDER.indexOf(status)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-body-s text-(--text-tertiary)">Estado:</span>
      <Badge status={badgeStatusOf(status)} kind="periodo" />
      <ol className="flex flex-wrap items-center gap-2 text-body-s" aria-label="Avance del corte">
        {PERIOD_STATUS_ORDER.map((step, index) => (
          <li
            key={step}
            aria-current={index === currentIndex ? "step" : undefined}
            className={cn(
              "flex items-center gap-1",
              index === currentIndex ? "font-medium text-(--text-primary)" : "text-(--text-tertiary)",
            )}
          >
            {index < currentIndex ? <Check className="size-3.5" strokeWidth={1.5} aria-hidden /> : null}
            {STEP_LABEL[step]}
            {index < PERIOD_STATUS_ORDER.length - 1 ? <span aria-hidden>→</span> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * Sello de cobre al quedar cerrado (UX-BRIEF §4.5, BRAND-BRIEF §5.5): el unico
 * momento "emotivo" permitido del producto. Sobrio: texto, borde de cobre,
 * sin animacion ni ilustracion.
 */
export function CopperSeal({ status, detail }: { status: "approved" | "paid"; detail?: string }) {
  return (
    <div
      role="img"
      aria-label={status === "paid" ? "Sello: corte pagado" : "Sello: corte cerrado"}
      className="flex w-fit flex-col items-center gap-0.5 rounded-md border-2 border-(--money) px-4 py-2 text-(--money)"
    >
      <span className="text-label tracking-widest uppercase">{status === "paid" ? "Pagado" : "Cerrado"}</span>
      {detail ? <span className="text-body-s">{detail}</span> : null}
    </div>
  )
}
