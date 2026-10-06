import { eq } from "drizzle-orm"
import { BillingPlanCard } from "@/components/kortex/billing-plan-card"
import { ScopeBanner } from "@/components/kortex/scope-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { requireChainScope } from "@/lib/auth/guards"
import { effectiveSubscription, type EffectiveAccess, type SubscriptionStatus } from "@/lib/billing"
import { db } from "@/lib/db/client"
import { locations, subscriptions } from "@/lib/db/schema"

/** Reloj del servidor, fuera del render para cumplir react-hooks/purity. */
function currentTimeMs(): number {
  return Date.now()
}

/** Sin numero configurado no se inventa ningun enlace. */
function whatsappHref(): string | null {
  const digits = (process.env.NEXT_PUBLIC_WHATSAPP_SALES ?? "").replace(/\D/g, "")
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}

function bannerMessage(
  status: SubscriptionStatus,
  access: EffectiveAccess,
  trialDaysLeft: number | null,
  graceDaysLeft: number | null,
): string | null {
  if (access === "bloqueado") {
    return "El acceso está bloqueado. Escríbenos para reactivar el plan; lo que montaste sigue guardado."
  }
  if (access === "restringido") {
    return graceDaysLeft === null
      ? "Tu plan necesita atención. Sigues operando, pero el análisis y la administración están en pausa."
      : `Tu prueba terminó. Te quedan ${graceDaysLeft} ${graceDaysLeft === 1 ? "día" : "días"} de gracia: sigues operando, pero el análisis está en pausa.`
  }
  if (status === "trialing" && trialDaysLeft !== null && trialDaysLeft <= 7) {
    return `Te quedan ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"} de prueba. Si activas el plan, no pierdes nada de lo que montaste.`
  }
  return null
}

/**
 * F3-19 · Tu plan (solo lectura, D-F3-16). El `chainId` sale de la sesion via
 * guard; no hay ninguna accion de pago ni de cambio de plan.
 */
export default async function BillingPage() {
  const { chainId } = await requireChainScope()

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.chainId, chainId)).limit(1)
  const rows = await db
    .select({ id: locations.id, isActive: locations.isActive })
    .from(locations)
    .where(eq(locations.chainId, chainId))
  const activeLocations = rows.filter((l) => l.isActive).length

  if (!sub) {
    return (
      <div className="mx-auto max-w-[720px] p-4">
        <h1 className="text-h1">Tu plan</h1>
        <EmptyState kind="block" message="Esta cadena todavía no tiene una suscripción registrada." />
      </div>
    )
  }

  const effective = effectiveSubscription(
    {
      status: sub.status,
      trialEndsAtMs: sub.trialEndsAt ? sub.trialEndsAt.getTime() : null,
      currentPeriodEndMs: sub.currentPeriodEnd ? sub.currentPeriodEnd.getTime() : null,
    },
    currentTimeMs(),
  )
  const banner = bannerMessage(sub.status, effective.access, effective.trialDaysLeft, effective.graceDaysLeft)

  return (
    <>
      {banner ? <ScopeBanner variant="trial-ending" message={banner} /> : null}
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 p-4">
        <h1 className="text-h1">Tu plan</h1>
        <BillingPlanCard
          plan={sub.plan}
          status={sub.status}
          access={effective.access}
          trialDaysLeft={effective.trialDaysLeft}
          graceDaysLeft={effective.graceDaysLeft}
          activeLocations={activeLocations}
          includedLocations={sub.includedLocations}
          whatsappHref={whatsappHref()}
        />
      </div>
    </>
  )
}
