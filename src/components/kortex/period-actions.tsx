"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button, buttonVariants } from "@/components/ui/button"
import { Sheet } from "@/components/ui/sheet"
import {
  approvePayoutPeriodAction,
  calculatePayoutPeriodAction,
  markPayoutPeriodPaidAction,
} from "@/lib/actions/payout-periods"
import { formatCentsRd } from "@/lib/payouts/format"
import type { PeriodStatusValue } from "@/lib/payouts/period"

/**
 * F3-06 · Acciones del Corte de Quincena: Calcular / Recalcular, Cerrar el
 * corte (aprobar), Marcar como pagado y Descargar CSV.
 *
 * UX-BRIEF §2.5 y §5.3 (pantallas de dinero):
 *  - "Cerrar el corte" NUNCA es un `disabled` mudo: si no se puede, el motivo
 *    (todos los motivos) va escrito justo al lado y enlazado con
 *    `aria-describedby`.
 *  - El cierre pide confirmacion con el resumen exacto y "despues no se puede
 *    editar".
 *  - Sin doble envio: el boton se bloquea al primer clic con su gerundio
 *    ("Calculando...", "Cerrando...").
 *  - Un error de dinero es un banner persistente (`role="alert"`) con
 *    "Reintentar" y "Entendido", nunca un toast que desaparece solo.
 *  - Exito sobrio: sin exclamaciones ni emoji.
 * El servidor es la autoridad de todas las reglas (estado, rol, bloqueadores,
 * inmutabilidad); aqui solo se pinta el resultado.
 */
type Pending = "calculate" | "approve" | "pay" | null

export function PeriodActions({
  periodId,
  status,
  periodLabel,
  barberCount,
  locationCount,
  totalNetCents,
  hasLines,
  closeBlockedReasons,
  csvHref,
}: {
  periodId: string
  status: PeriodStatusValue
  periodLabel: string
  barberCount: number
  locationCount: number
  totalNetCents: number
  hasLines: boolean
  closeBlockedReasons: string[]
  /** Enlace de "Descargar CSV" (F3-08); si no se pasa, no se muestra el boton. */
  csvHref?: string
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState<Pending>(null)
  const [error, setError] = React.useState<{ message: string; retry: "calculate" | "approve" | "pay" } | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState<"approve" | "pay" | null>(null)

  const summary = `${barberCount} ${barberCount === 1 ? "barbero" : "barberos"} · ${formatCentsRd(totalNetCents)} a pagar · ${locationCount} ${locationCount === 1 ? "sede" : "sedes"}`

  const calculate = React.useCallback(async () => {
    setPending("calculate")
    setError(null)
    setNotice(null)
    const result = await calculatePayoutPeriodAction({ periodId })
    setPending(null)
    if (!result.ok) {
      setError({ message: result.error, retry: "calculate" })
      return
    }
    setNotice(
      `Corte calculado. ${result.data.lineCount} ${result.data.lineCount === 1 ? "línea" : "líneas"}, ${formatCentsRd(result.data.totalNetCents)} a pagar.`,
    )
    router.refresh()
  }, [periodId, router])

  const approve = React.useCallback(async () => {
    setPending("approve")
    setError(null)
    setNotice(null)
    const result = await approvePayoutPeriodAction({ periodId })
    setPending(null)
    setConfirming(null)
    if (!result.ok) {
      setError({ message: result.error, retry: "approve" })
      return
    }
    setNotice(
      `Quincena cerrada. ${result.data.lineCount} ${result.data.lineCount === 1 ? "línea" : "líneas"}, ${formatCentsRd(result.data.totalNetCents)} a pagar. Ya no se puede editar.`,
    )
    router.refresh()
  }, [periodId, router])

  const markPaid = React.useCallback(async () => {
    setPending("pay")
    setError(null)
    setNotice(null)
    const result = await markPayoutPeriodPaidAction({ periodId })
    setPending(null)
    setConfirming(null)
    if (!result.ok) {
      setError({ message: result.error, retry: "pay" })
      return
    }
    setNotice("Corte marcado como pagado.")
    router.refresh()
  }, [periodId, router])

  const canClose = status === "calculated" && closeBlockedReasons.length === 0
  const showCloseButton = status === "open" || status === "calculated"

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-md border border-(--data-neg) bg-(--data-neg)/12 p-3">
          <p className="text-body-s">{error.message}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const retry = error.retry
                setError(null)
                if (retry === "calculate") void calculate()
                else setConfirming(retry)
              }}
            >
              Reintentar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setError(null)}>
              Entendido
            </Button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md border border-(--border) p-3 text-body-s text-(--text-secondary)">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {status === "open" || status === "calculated" ? (
          <Button
            variant={status === "open" ? "primary" : "secondary"}
            loading={pending === "calculate"}
            loadingText="Calculando..."
            disabled={pending !== null}
            onClick={() => void calculate()}
          >
            {status === "open" ? "Calcular el corte" : "Recalcular"}
          </Button>
        ) : null}

        {hasLines && csvHref ? (
          <a
            href={csvHref}
            download
            className={buttonVariants({ variant: "secondary", size: "md" })}
          >
            Descargar CSV
          </a>
        ) : null}

        {showCloseButton ? (
          <Button
            variant="primary"
            disabled={!canClose || pending !== null}
            aria-describedby={!canClose ? "close-blocked-reasons" : undefined}
            onClick={() => setConfirming("approve")}
          >
            Cerrar el corte
          </Button>
        ) : null}

        {status === "approved" ? (
          <Button variant="primary" disabled={pending !== null} onClick={() => setConfirming("pay")}>
            Marcar como pagado
          </Button>
        ) : null}
      </div>

      {showCloseButton && !canClose ? (
        <div id="close-blocked-reasons" className="flex flex-col gap-1 text-body-s text-(--text-secondary)">
          <p className="font-medium text-(--text-primary)">No se puede cerrar el corte todavía:</p>
          <ul className="list-disc pl-5">
            {closeBlockedReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {status === "approved" ? (
        <p className="text-body-s text-(--text-secondary)">
          El corte está cerrado y no se puede editar. Cuando pagues a los barberos, márcalo como pagado.
        </p>
      ) : null}

      <Sheet
        open={confirming === "approve"}
        onOpenChange={(open) => {
          if (!open && pending === null) setConfirming(null)
        }}
        title="Cerrar el corte"
      >
        <div className="flex flex-col gap-4">
          <p className="text-body">{periodLabel}</p>
          <p className="text-body" data-testid="approve-summary">
            {summary}
          </p>
          <p className="text-body-s text-(--text-secondary)">
            Revisa antes de aprobar: después no se puede editar. Las correcciones se registran como ajustes en la quincena siguiente.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button loading={pending === "approve"} loadingText="Cerrando..." onClick={() => void approve()}>
              Cerrar el corte
            </Button>
            <Button variant="secondary" disabled={pending !== null} onClick={() => setConfirming(null)}>
              Volver
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={confirming === "pay"}
        onOpenChange={(open) => {
          if (!open && pending === null) setConfirming(null)
        }}
        title="Marcar como pagado"
      >
        <div className="flex flex-col gap-4">
          <p className="text-body">{periodLabel}</p>
          <p className="text-body">{summary}</p>
          <p className="text-body-s text-(--text-secondary)">
            Kortex no mueve dinero: esto solo registra que ya les pagaste a los barberos. Queda guardado con tu nombre y la hora.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button loading={pending === "pay"} loadingText="Guardando..." onClick={() => void markPaid()}>
              Marcar como pagado
            </Button>
            <Button variant="secondary" disabled={pending !== null} onClick={() => setConfirming(null)}>
              Volver
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
