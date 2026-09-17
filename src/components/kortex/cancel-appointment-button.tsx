"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { cancelMyAppointmentAction } from "@/lib/actions/client-appointments"

/**
 * F2-14 · Boton de cancelacion en `(client)/appointments`. El servidor es la
 * unica autoridad sobre la ventana de `cancellation_hours` (D-F2-2) — este
 * componente solo muestra el error legible que devuelve la Server Action.
 */
export function CancelAppointmentButton({
  appointmentId,
  cancellationHours,
}: {
  appointmentId: string
  cancellationHours: number | null
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)

  async function handleCancel() {
    setPending(true)
    setError(null)
    const result = await cancelMyAppointmentAction({ appointmentId })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setConfirming(false)
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
            Volver
          </Button>
          <Button size="sm" variant="destructive" onClick={handleCancel} loading={pending} loadingText="Cancelando...">
            Confirmar cancelacion
          </Button>
        </div>
        {error ? <p className="max-w-56 text-right text-body-s text-(--data-neg)">{error}</p> : null}
      </div>
    )
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => setConfirming(true)}
      title={
        cancellationHours != null
          ? `Se puede cancelar hasta ${cancellationHours} h antes`
          : undefined
      }
    >
      Cancelar
    </Button>
  )
}
