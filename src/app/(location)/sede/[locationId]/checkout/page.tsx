import Link from "next/link"

import { requireLocationScope } from "@/lib/auth/guards"
import { loadCheckoutCatalog, loadAppointmentForCheckout } from "@/lib/actions/checkout"
import { loadCashRegisterState } from "@/lib/actions/cash-register"
import { CheckoutForm } from "@/components/kortex/checkout-form"
import { EmptyState } from "@/components/ui/empty-state"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"

/**
 * F2-21 · Checkout / cobro (UX-BRIEF §4.4). Entra desde una cita
 * (`?appointmentId=`, incluye la que crea `startServing`/D-F2-8 al pasar un
 * turno de la fila a "atendiendo") o como venta libre. D-F2-9: sin caja
 * abierta en la sede no se puede cobrar — la pantalla ofrece el camino a
 * `/register` para abrirla (solo gerente, verificado ahi mismo).
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>
  searchParams: Promise<{ appointmentId?: string }>
}) {
  const { locationId } = await params
  const { appointmentId } = await searchParams
  const scope = await requireLocationScope(locationId)

  const [catalog, cashState, appointment] = await Promise.all([
    loadCheckoutCatalog(locationId),
    loadCashRegisterState(locationId),
    appointmentId ? loadAppointmentForCheckout(locationId, appointmentId) : Promise.resolve(null),
  ])

  if (!cashState.openSession) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <h1 className="text-h1">Cobrar</h1>
        <EmptyState
          kind="block"
          message="No hay una caja abierta en esta sede. Un gerente debe abrir caja antes de poder cobrar."
          action={
            <Link href={`/sede/${locationId}/register`} className={cn(buttonVariants({ variant: "primary" }))}>
              Ir a caja
            </Link>
          }
          className="mt-4"
        />
      </div>
    )
  }

  if (appointmentId && !appointment) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <p className="text-body text-(--text-secondary)">Esa cita no existe en esta sede.</p>
      </div>
    )
  }

  if (appointment?.status === "sold") {
    return (
      <div className="mx-auto max-w-lg p-4">
        <h1 className="text-h1">Cobrar</h1>
        <EmptyState kind="block" message="Esta cita ya fue cobrada." className="mt-4" />
      </div>
    )
  }

  // effectiveRole del guard solo puede ser superuser/admin/barber_assigned
  // (nunca "barber" a secas, ver src/lib/auth/guards.ts) — se normaliza el
  // tipo aqui para que el componente cliente reciba una union cerrada.
  const checkoutRole: "superuser" | "admin" | "barber_assigned" =
    scope.effectiveRole === "barber_assigned"
      ? "barber_assigned"
      : scope.effectiveRole === "admin"
        ? "admin"
        : "superuser"

  return (
    <div className="mx-auto max-w-lg p-4">
      <h1 className="text-h1">Cobrar</h1>
      <div className="mt-4">
        <CheckoutForm
          locationId={locationId}
          role={checkoutRole}
          services={catalog.services}
          barbers={catalog.barbers}
          appointment={appointment}
          currentUserId={scope.userId}
        />
      </div>
    </div>
  )
}
