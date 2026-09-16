import * as React from "react"
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react"
import { cn } from "cn"

export interface TrendIndicatorProps {
  value: number
  direction: "up" | "down" | "flat"
  severity: "pos" | "warn" | "neg" | "neutral"
  className?: string
}

const ICONS = {
  up: ArrowUp,
  down: ArrowDown,
  flat: ArrowRight,
} as const

const SEVERITY_CLASS = {
  pos: "text-(--data-pos)",
  warn: "text-(--data-warn)",
  neg: "text-(--data-neg)",
  neutral: "text-(--data-neutral)",
} as const

/**
 * TrendIndicator (Delta/Semaforo) — DESIGN-SYSTEM.md §4.7.
 *
 * Regla dura §5.4: combina SIEMPRE flecha + color + signo explicito
 * (+8%, -3%). Nunca comunica solo con color (8% de hombres dominicanos
 * tiene daltonismo rojo-verde, BRAND-BRIEF §3.3).
 */
function TrendIndicator({ value, direction, severity, className }: TrendIndicatorProps) {
  const Icon = ICONS[direction]
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  const magnitude = Math.abs(value)

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-num-m", SEVERITY_CLASS[severity], className)}
    >
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
      <span>
        {sign}
        {magnitude}%
      </span>
    </span>
  )
}

export { TrendIndicator }
