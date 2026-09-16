import * as React from "react"
import { cn } from "cn"

export interface MoneyDisplayProps {
  amount: number
  /** Rige decimales: sin decimales en summary, con decimales en checkout/commission. */
  context?: "summary" | "checkout" | "commission"
  /**
   * 'money' aplica --money — SOLO permitido cuando el contexto es dinero
   * devengado por una persona (comision, propina, Mi Silla). 'neutral' para
   * ingreso de sede/facturacion (regla dura DESIGN-SYSTEM.md §5.3: el cobre
   * nunca se usa para ingreso/facturacion de sede).
   */
  emphasis?: "money" | "neutral"
  align?: "left" | "right"
  size?: "num-m" | "num-l" | "display-m" | "display-l"
  className?: string
}

const FORMATTER_NO_DECIMALS = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const FORMATTER_WITH_DECIMALS = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * MoneyDisplay — DESIGN-SYSTEM.md §4.6. Encapsula el formato RD$ con
 * separador de miles dominicano, siempre --font-mono + tnum. No
 * reimplementar el formato de monto en cada pantalla.
 */
function MoneyDisplay({
  amount,
  context = "summary",
  emphasis = "neutral",
  align = "right",
  size = "num-m",
  className,
}: MoneyDisplayProps) {
  const formatter = context === "summary" ? FORMATTER_NO_DECIMALS : FORMATTER_WITH_DECIMALS

  const sizeClass =
    size === "display-l" ? "text-display-l" : size === "display-m" ? "text-display-m" : size === "num-l" ? "text-num-l" : "text-num-m"

  return (
    <span
      className={cn(
        sizeClass,
        align === "right" ? "text-right" : "text-left",
        "inline-block tabular-nums",
        emphasis === "money" ? "text-(--money)" : "text-(--text-primary)",
        className
      )}
    >
      RD$&nbsp;{formatter.format(amount)}
    </span>
  )
}

export { MoneyDisplay }
