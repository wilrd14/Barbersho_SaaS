"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/field"
import { Sheet } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/empty-state"
import { MoneyDisplay } from "@/components/kortex/money-display"
import type { OpenSessionSale } from "@/lib/actions/cash-register"
import { voidSaleAction } from "@/lib/actions/checkout"

/**
 * F2-22 · Ventas de la caja abierta con boton "Anular". Solo se monta para
 * gerente (admin/superuser) y solo cuando hay caja abierta; el servidor
 * (`voidSaleAction`) sigue siendo la autoridad de las reglas: rol, caja de la
 * venta aun abierta, motivo obligatorio y audit_log. Aqui solo se junta el
 * motivo y se pinta la respuesta.
 *
 * Tono (BRAND-BRIEF §2.2/§2.3): pantalla de dinero, sin exclamaciones ni
 * emoji; el numero primero, frases cortas, tuteo.
 */

const PAYMENT_LABEL: Record<OpenSessionSale["paymentMethod"], string> = {
  cash: "efectivo",
  card: "tarjeta",
  transfer: "transferencia",
  mixed: "pago mixto",
  online: "en linea",
}

function centsToPesos(cents: number): number {
  // Solo para pintar con MoneyDisplay (espera pesos); no se calcula con esto.
  return cents / 100
}

export function OpenSessionSales({
  locationId,
  sales,
}: {
  locationId: string
  sales: OpenSessionSale[]
}) {
  const router = useRouter()
  const [target, setTarget] = React.useState<OpenSessionSale | null>(null)
  const [notice, setNotice] = React.useState<OpenSessionSale | null>(null)

  return (
    <section className="flex flex-col gap-3" aria-labelledby="open-session-sales-title">
      <h2 id="open-session-sales-title" className="text-h2">
        Ventas de esta caja
      </h2>

      {notice ? (
        <p role="status" className="rounded-md border border-(--border) p-3 text-body-s text-(--text-secondary)">
          Venta anulada: {notice.clientName},{" "}
          <MoneyDisplay amount={centsToPesos(notice.totalCents)} context="checkout" className="text-body-s" />.{" "}
          {notice.paymentMethod === "cash"
            ? "Ese monto sale del efectivo esperado en el cierre."
            : "No cambia el efectivo esperado."}
        </p>
      ) : null}

      {sales.length === 0 ? (
        <EmptyState kind="block" message="Todavia no se ha cobrado nada en esta caja." />
      ) : (
        <ul className="flex flex-col divide-y divide-(--border) rounded-md border border-(--border)">
          {sales.map((sale) => {
            const refunded = sale.status === "refunded"
            return (
              <li key={sale.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-body">{sale.clientName}</p>
                  <p className="truncate text-body-s text-(--text-tertiary)">
                    {sale.timeLabel} · {sale.itemsLabel} · {PAYMENT_LABEL[sale.paymentMethod]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={refunded ? "line-through opacity-60" : undefined}>
                    <MoneyDisplay amount={centsToPesos(sale.totalCents)} context="checkout" />
                  </span>
                  {refunded ? (
                    <span className="text-body-s text-(--text-tertiary)">Anulada</span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Anular venta de ${sale.clientName}`}
                      onClick={() => {
                        setNotice(null)
                        setTarget(sale)
                      }}
                    >
                      Anular
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <VoidSaleSheet
        key={target?.id ?? "none"}
        locationId={locationId}
        sale={target}
        onClose={() => setTarget(null)}
        onVoided={(voided) => {
          setTarget(null)
          setNotice(voided)
          router.refresh()
        }}
      />
    </section>
  )
}

function VoidSaleSheet({
  locationId,
  sale,
  onClose,
  onVoided,
}: {
  locationId: string
  sale: OpenSessionSale | null
  onClose: () => void
  onVoided: (sale: OpenSessionSale) => void
}) {
  const [reason, setReason] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleConfirm() {
    if (!sale) return
    setError(null)
    if (!reason.trim()) {
      setError("Escribe el motivo de la anulacion. Queda registrado junto a tu nombre.")
      return
    }
    setPending(true)
    const result = await voidSaleAction({ locationId, saleId: sale.id, reason: reason.trim() })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onVoided(sale)
  }

  return (
    <Sheet
      open={sale !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      title="Anular venta"
    >
      {sale ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-body">
              {sale.clientName} · {sale.itemsLabel}
            </p>
            <MoneyDisplay amount={centsToPesos(sale.totalCents)} context="checkout" size="num-l" align="left" />
            <p className="text-body-s text-(--text-tertiary)">
              {sale.paymentMethod === "cash"
                ? "Esta venta fue en efectivo: al anularla, ese monto sale del efectivo esperado en el cierre."
                : `Esta venta fue con ${PAYMENT_LABEL[sale.paymentMethod]}: al anularla, el efectivo esperado no cambia.`}{" "}
              Solo se puede anular mientras la caja siga abierta.
            </p>
          </div>

          <FormField label="Motivo de la anulacion (obligatorio)" error={error ?? undefined}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. el cliente pidio otro servicio y se cobro de mas"
            />
          </FormField>

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant="destructive" loading={pending} loadingText="Anulando..." onClick={handleConfirm}>
              Anular venta
            </Button>
            <Button variant="secondary" disabled={pending} onClick={onClose}>
              Volver
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  )
}
