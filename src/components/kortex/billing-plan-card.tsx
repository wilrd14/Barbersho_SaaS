import * as React from "react"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { PLAN_QUOTAS, type EffectiveAccess, type SubscriptionPlan, type SubscriptionStatus } from "@/lib/billing"

/** Precio base mensual por plan (PRD §7.2), en centavos. */
const PLAN_BASE_CENTS: Record<SubscriptionPlan, number> = {
  local: 450_000,
  chain: 950_000,
  franchise: 2_200_000,
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "En prueba",
  active: "Activo",
  past_due: "Pago vencido",
  cancelled: "Cancelado",
}

const ACCESS_LABEL: Record<EffectiveAccess, string> = {
  acceso_normal: "Acceso normal.",
  restringido: "Acceso restringido: sigues operando, el análisis y la administración quedan en pausa.",
  bloqueado: "Acceso bloqueado: solo puedes ver Tu plan, cerrar una caja abierta y cobrar una venta en curso.",
}

export interface BillingPlanCardProps {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  access: EffectiveAccess
  trialDaysLeft: number | null
  graceDaysLeft: number | null
  activeLocations: number
  includedLocations: number
  whatsappHref: string | null
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-(--border) py-3 last:border-b-0">
      <dt className="text-label uppercase text-(--text-secondary)">{label}</dt>
      <dd className="text-right text-body text-(--text-primary)">{children}</dd>
    </div>
  )
}

function days(n: number): string {
  return n === 1 ? "1 día" : `${n} días`
}

/** F3-19 · "Tu plan", solo lectura. Sin autoservicio de pago (D-F3-16). */
export function BillingPlanCard(props: BillingPlanCardProps) {
  const quota = PLAN_QUOTAS[props.plan]
  const maxLocations = quota.maxExtra === null ? null : quota.included + quota.maxExtra
  const atLimit = maxLocations !== null && props.activeLocations >= maxLocations
  const nextText = atLimit
    ? `el plan ${quota.label} llega hasta ${maxLocations} sedes; para más, pasa al plan ${quota.upsell}`
    : `la siguiente cuesta RD$${(quota.extraPriceCents / 100).toLocaleString("es-DO")}/mes`
  const extraUsed = Math.max(0, props.activeLocations - props.includedLocations)

  return (
    <section className="rounded-md border border-(--border) bg-(--surface-card) p-4">
      <dl>
        <Row label="Plan">{quota.label}</Row>
        <Row label="Precio base">
          <span className="inline-flex items-baseline gap-1">
            <MoneyDisplay amount={PLAN_BASE_CENTS[props.plan] / 100} size="num-l" align="left" />
            <span className="text-body-s text-(--text-secondary)">al mes</span>
          </span>
        </Row>
        <Row label="Estado">{STATUS_LABEL[props.status]}</Row>
        {props.trialDaysLeft !== null ? <Row label="Prueba">Te quedan {days(props.trialDaysLeft)}</Row> : null}
        {props.graceDaysLeft !== null ? (
          <Row label="Gracia">Quedan {days(props.graceDaysLeft)} antes del bloqueo total</Row>
        ) : null}
        <Row label="Sedes">
          {props.activeLocations} de {props.includedLocations} sedes incluidas · {nextText}
          {extraUsed > 0 ? ` · ${extraUsed} adicional${extraUsed === 1 ? "" : "es"} en uso` : ""}
        </Row>
      </dl>
      <p className="mt-3 text-body-s text-(--text-secondary)">{ACCESS_LABEL[props.access]}</p>
      <p className="mt-4 text-body">
        Para cambiar de plan o pagar, hablamos directo:{" "}
        {props.whatsappHref ? (
          <a className="text-(--accent) underline" href={props.whatsappHref} target="_blank" rel="noreferrer">
            escríbenos por WhatsApp
          </a>
        ) : (
          <span className="text-(--text-primary)">escríbenos por WhatsApp</span>
        )}
        .
      </p>
    </section>
  )
}
