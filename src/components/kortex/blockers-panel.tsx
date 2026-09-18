"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { setSaleDiscountReasonAction } from "@/lib/actions/sale-discount-reason"
import type { ApprovalBlocker, ApprovalBlockerItem } from "@/lib/payouts/blockers"
import { formatDateEs } from "@/lib/payouts/period"

/**
 * F3-06 · Panel de pendientes del Corte (UX-BRIEF §4.5, D-F3-10). Muestra los
 * cuatro bloqueadores de aprobacion (ventas sin cerrar, cajas sin cuadrar,
 * descuentos sin motivo, barberos sin regla) cada uno con su texto, su conteo y
 * su enlace, mas los avisos que no son bloqueador pero impiden cerrar (la
 * quincena sigue corriendo, el corte quedo desactualizado, el calculo no
 * cuadra). Ningun bloqueador es "ignorable con un check": se resuelven y se
 * recalcula. Los descuentos sin motivo se resuelven aqui mismo, escribiendo el
 * motivo de cada venta.
 */
export function BlockersPanel({
  blockers,
  notEnded,
  stale,
  computeError,
}: {
  blockers: ApprovalBlocker[]
  notEnded: { endsOn: string; today: string } | null
  stale: { differingLines: number } | null
  computeError: string | null
}) {
  const nothing = blockers.length === 0 && !notEnded && !stale && !computeError
  return (
    <section aria-labelledby="blockers-title" className="flex flex-col gap-3">
      <h2 id="blockers-title" className="text-h2">
        Pendientes antes de cerrar
      </h2>
      {nothing ? (
        <p className="text-body-s text-(--text-secondary)">Nada pendiente. El corte se puede cerrar.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {notEnded ? (
            <Notice>
              La quincena termina el {formatDateEs(notEnded.endsOn)} y todavía está corriendo (hoy es {formatDateEs(notEnded.today)}).
              Puedes calcularla como vista previa; cerrarla se puede a partir del día siguiente.
            </Notice>
          ) : null}
          {stale ? (
            <Notice>
              Las ventas o las reglas cambiaron después del último cálculo ({stale.differingLines}{" "}
              {stale.differingLines === 1 ? "línea distinta" : "líneas distintas"}). Recalcula el corte antes de cerrarlo.
            </Notice>
          ) : null}
          {computeError ? <Notice>El cálculo no cuadra: {computeError}</Notice> : null}
          {blockers.map((b) => (
            <BlockerCard key={b.code} blocker={b} />
          ))}
        </div>
      )}
    </section>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-(--data-warn)/40 p-3 text-body-s">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-(--data-warn)" strokeWidth={1.5} aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function BlockerCard({ blocker }: { blocker: ApprovalBlocker }) {
  const more = blocker.count - blocker.items.length
  return (
    <article
      className="flex flex-col gap-2 rounded-md border border-(--data-warn)/40 p-3"
      aria-label={blocker.title}
      data-blocker={blocker.code}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-(--data-warn)" strokeWidth={1.5} aria-hidden />
          <div className="flex flex-col gap-0.5">
            <h3 className="text-body font-medium">
              {blocker.title} <span className="text-(--text-tertiary)">({blocker.count})</span>
            </h3>
            <p className="text-body-s text-(--text-secondary)">{blocker.summary}</p>
          </div>
        </div>
        {blocker.href ? (
          <Link href={blocker.href} className="shrink-0 text-body-s underline underline-offset-4">
            Ver la lista
          </Link>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2 pl-6">
        {blocker.items.map((item, index) => (
          <li key={`${item.saleId ?? item.label}-${index}`} className="flex flex-col gap-2 text-body-s">
            <span>{item.label}</span>
            {blocker.code === "discount_without_reason" && item.saleId && item.locationId ? (
              <DiscountReasonForm item={item} position={index + 1} />
            ) : null}
          </li>
        ))}
        {more > 0 ? <li className="text-body-s text-(--text-tertiary)">y {more} más.</li> : null}
      </ul>
    </article>
  )
}

function DiscountReasonForm({ item, position }: { item: ApprovalBlockerItem; position: number }) {
  const router = useRouter()
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const result = await setSaleDiscountReasonAction({ locationId: item.locationId, saleId: item.saleId, reason })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start" noValidate>
      <FormField label={`Motivo del descuento ${position}`} error={error ?? undefined} className="sm:flex-1">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. cliente frecuente" />
      </FormField>
      <Button type="submit" size="sm" variant="secondary" loading={pending} loadingText="Guardando..." className="sm:mt-6">
        Guardar motivo
      </Button>
    </form>
  )
}
