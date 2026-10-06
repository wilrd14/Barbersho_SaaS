import * as React from "react"

import { MoneyDisplay } from "@/components/kortex/money-display"
import { TrendIndicator } from "@/components/kortex/trend-indicator"

/** Δ en puntos basicos -> TrendIndicator (solo presentacion; null = "—", nunca "+∞%"). */
export function DeltaBadge({ bps, className }: { bps: number | null; className?: string }) {
  if (bps === null) return <span className={className ?? "text-(--text-tertiary)"}>—</span>
  const value = Math.round(bps / 100)
  return (
    <TrendIndicator
      value={value}
      direction={bps > 0 ? "up" : bps < 0 ? "down" : "flat"}
      severity={bps > 0 ? "pos" : bps < 0 ? "neg" : "neutral"}
      className={className}
    />
  )
}

/** KPI hero: ingreso total de la cadena (display-l, neutro: el cobre nunca es ingreso de sede). */
export function ChainRevenueHero({
  revenueCents,
  deltaBps,
  comparedWith,
  locationsCount,
}: {
  revenueCents: number
  deltaBps: number | null
  comparedWith: string
  locationsCount: number
}) {
  return (
    <section className="flex flex-col gap-1 rounded-md border border-(--border) bg-(--surface-card) p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <MoneyDisplay amount={revenueCents / 100} context="summary" size="display-l" align="left" />
        <DeltaBadge bps={deltaBps} />
        <span className="text-body-s text-(--text-tertiary)">{comparedWith}</span>
      </div>
      <p className="text-body-s text-(--text-secondary)">
        Ingreso total de la cadena · {locationsCount} {locationsCount === 1 ? "sede" : "sedes"}
      </p>
    </section>
  )
}

export function KpiCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-(--border) bg-(--surface-card) p-4">
      <span className="text-label uppercase text-(--text-tertiary)">{label}</span>
      <span className="text-num-l tabular-nums text-(--text-primary)">{children}</span>
    </div>
  )
}
