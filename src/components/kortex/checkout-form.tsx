"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { FormField } from "@/components/ui/field"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { createSaleAction, type CheckoutAppointmentInfo, type CheckoutCatalogBarber, type CheckoutCatalogService } from "@/lib/actions/checkout"
import { searchClientsAction } from "@/lib/actions/appointments"

/**
 * F2-21 · Checkout / cobro (UX-BRIEF §4.4).
 *
 * Todo el dinero mostrado ANTES de cobrar es un preview de cliente para UX
 * (aritmetica entera en centavos, sin floats) — nunca es lo que se persiste.
 * `createSaleAction` recalcula todo desde cero en el servidor con
 * `lib/pos#computeSaleTotals`; si el preview y el resultado del servidor
 * difieren (precio cambiado, tope de descuento, etc.) gana siempre el
 * servidor y el error/monto real se muestra tal cual venga.
 *
 * Anti doble-submit: `idempotencyKey` se genera una sola vez por intento y
 * NO cambia entre reintentos del mismo formulario (solo cambia al iniciar
 * una venta nueva desde cero, con "Nueva venta"). El boton se deshabilita
 * mientras `pending` es true (defensa de UI) y ademas el servidor verifica
 * la clave contra `audit_log` (defensa real, ver checkout.ts).
 */

type Line = { key: string; serviceId: string; barberId: string; quantity: number }
type DiscountKind = "none" | "percentage" | "amount"
type TipKind = "none" | "percentage" | "amount"

let lineKeySeq = 0
function nextLineKey() {
  lineKeySeq += 1
  return `line-${lineKeySeq}`
}

function pctOfCents(amountCents: number, pct: number): number {
  // Preview client-side, entero, mismo criterio que roundHalfToEven pero sin
  // necesitar el detalle de empate exacto (solo UX) — se redondea al mas
  // cercano con enteros, nunca con floats.
  return Math.round((amountCents * pct) / 100)
}

export function CheckoutForm({
  locationId,
  role,
  services,
  barbers,
  appointment,
  currentUserId,
}: {
  locationId: string
  role: "superuser" | "admin" | "barber_assigned"
  services: CheckoutCatalogService[]
  barbers: CheckoutCatalogBarber[]
  appointment: CheckoutAppointmentInfo | null
  currentUserId: string
}) {
  const router = useRouter()
  const isBarber = role === "barber_assigned"
  const defaultBarberId = isBarber ? currentUserId : (appointment?.barberId ?? barbers[0]?.id ?? "")

  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() => crypto.randomUUID())
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<{ totalCents: number; replay: boolean } | null>(null)

  const [lines, setLines] = React.useState<Line[]>(() => [
    {
      key: nextLineKey(),
      serviceId: appointment?.serviceId ?? services[0]?.id ?? "",
      barberId: appointment?.barberId ?? defaultBarberId,
      quantity: 1,
    },
  ])

  const [clientMode, setClientMode] = React.useState<"appointment" | "search" | "new">(
    appointment ? "appointment" : "search",
  )
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<{ id: string; fullName: string; phone: string | null }[]>([])
  const [selectedClientId, setSelectedClientId] = React.useState<string>("")
  const [newName, setNewName] = React.useState("")
  const [newPhone, setNewPhone] = React.useState("")

  const [discountKind, setDiscountKind] = React.useState<DiscountKind>("none")
  const [discountPct, setDiscountPct] = React.useState(10)
  const [discountAmount, setDiscountAmount] = React.useState("")
  const [discountReason, setDiscountReason] = React.useState("")

  const [tipKind, setTipKind] = React.useState<TipKind>("none")
  const [tipPct, setTipPct] = React.useState(10)
  const [tipAmount, setTipAmount] = React.useState("")

  const [paymentMethod, setPaymentMethod] = React.useState<"cash" | "card" | "transfer">("cash")

  React.useEffect(() => {
    if (clientMode !== "search") return
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    const timeout = setTimeout(async () => {
      const result = await searchClientsAction({ locationId, query: trimmed })
      if (result.ok) setResults(result.data)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, clientMode, locationId])

  // Igual que create-appointment-sheet.tsx: el "vaciado" de resultados con
  // menos de 2 caracteres se resuelve derivando en el render, no con un
  // setState sincrono dentro del efecto (regla react-hooks/set-state-in-effect).
  const visibleResults = clientMode === "search" && query.trim().length >= 2 ? results : []

  const priceById = React.useMemo(() => new Map(services.map((s) => [s.id, s.priceCents])), [services])

  const subtotalCents = lines.reduce((sum, l) => sum + (priceById.get(l.serviceId) ?? 0) * l.quantity, 0)

  const discountPreviewCents =
    discountKind === "percentage"
      ? pctOfCents(subtotalCents, discountPct)
      : discountKind === "amount"
        ? Math.min(subtotalCents, parseMoneyToCentsOrZero(discountAmount))
        : 0

  const afterDiscountCents = Math.max(0, subtotalCents - discountPreviewCents)

  const tipPreviewCents =
    tipKind === "percentage"
      ? pctOfCents(afterDiscountCents, tipPct)
      : tipKind === "amount"
        ? parseMoneyToCentsOrZero(tipAmount)
        : 0

  const totalPreviewCents = afterDiscountCents + tipPreviewCents

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: nextLineKey(), serviceId: services[0]?.id ?? "", barberId: defaultBarberId, quantity: 1 },
    ])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function resetForNewSale() {
    setIdempotencyKey(crypto.randomUUID())
    setSuccess(null)
    setError(null)
    setLines([{ key: nextLineKey(), serviceId: services[0]?.id ?? "", barberId: defaultBarberId, quantity: 1 }])
    setDiscountKind("none")
    setDiscountReason("")
    setDiscountAmount("")
    setTipKind("none")
    setTipAmount("")
    setSelectedClientId("")
    setQuery("")
    setNewName("")
    setNewPhone("")
    router.refresh()
  }

  async function handleSubmit() {
    setError(null)

    if (clientMode === "search" && !appointment && !selectedClientId) {
      setError("Elegi un cliente de la lista o cambia a 'Cliente nuevo'.")
      return
    }
    if (clientMode === "new" && (!newName.trim() || !newPhone.trim())) {
      setError("Nombre y telefono son obligatorios para un cliente nuevo.")
      return
    }
    if ((discountKind === "percentage" || discountKind === "amount") && !discountReason.trim()) {
      setError("El descuento necesita un motivo.")
      return
    }

    const discount =
      discountKind === "none"
        ? { kind: "none" as const }
        : discountKind === "percentage"
          ? { kind: "percentage" as const, pct: discountPct, reason: discountReason.trim() }
          : {
              kind: "amount" as const,
              amountCents: parseMoneyToCentsOrZero(discountAmount),
              reason: discountReason.trim(),
            }

    const tip =
      tipKind === "none"
        ? { kind: "none" as const }
        : tipKind === "percentage"
          ? { kind: "percentage" as const, pct: tipPct }
          : { kind: "amount" as const, amountCents: parseMoneyToCentsOrZero(tipAmount) }

    setPending(true)
    const result = await createSaleAction({
      locationId,
      idempotencyKey,
      appointmentId: appointment?.id,
      existingClientId: clientMode === "search" && !appointment ? selectedClientId : undefined,
      newClient: clientMode === "new" ? { fullName: newName, phone: newPhone } : undefined,
      lines: lines.map((l) => ({ serviceId: l.serviceId, barberId: l.barberId, quantity: l.quantity })),
      discount,
      tip,
      paymentMethod,
    })
    setPending(false)

    if (!result.ok) {
      // No se pierde nada del formulario (regla dura del encargo): el error
      // se muestra y el mismo `idempotencyKey` queda listo para "Reintentar".
      setError(result.error)
      return
    }

    setSuccess({ totalCents: result.data.totalCents, replay: result.data.replay })
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-md border border-(--border) p-6 text-center">
        <p className="text-body text-(--data-pos)">
          {success.replay ? "Esta venta ya estaba cobrada." : "Cobro registrado."}
        </p>
        <MoneyDisplay amount={success.totalCents / 100} context="checkout" size="display-m" />
        <Button onClick={resetForNewSale}>Nueva venta</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      {appointment ? (
        <div className="rounded-md border border-(--border) p-3">
          <p className="text-body-s text-(--text-tertiary)">Cobrando cita de</p>
          <p className="text-body font-medium">{appointment.clientName}</p>
        </div>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button size="sm" variant={clientMode === "search" ? "primary" : "secondary"} onClick={() => setClientMode("search")}>
              Cliente existente
            </Button>
            <Button size="sm" variant={clientMode === "new" ? "primary" : "secondary"} onClick={() => setClientMode("new")}>
              Cliente nuevo
            </Button>
          </div>
          {clientMode === "search" ? (
            <FormField label="Buscar por nombre o telefono">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej. Ana o 8095551234" />
              {visibleResults.length > 0 ? (
                <div className="mt-1 flex flex-col gap-1 rounded-md border border-(--border)">
                  {visibleResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedClientId(r.id)
                        setQuery(r.fullName)
                        setResults([])
                      }}
                      className="px-3 py-2 text-left text-body-s hover:bg-(--surface-raised)"
                    >
                      {r.fullName} {r.phone ? `· ${r.phone}` : ""}
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedClientId ? <p className="text-body-s text-(--data-pos)">Cliente seleccionado.</p> : null}
            </FormField>
          ) : (
            <div className="flex flex-col gap-2">
              <FormField label="Nombre completo">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </FormField>
              <FormField label="Telefono">
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="809 555 1234" />
              </FormField>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-h2">Servicios</h2>
        {lines.map((line) => (
          <div key={line.key} className="flex flex-col gap-2 rounded-md border border-(--border) p-3">
            <Select
              label="Servicio"
              items={services.map((s) => ({ label: `${s.name} · RD$ ${(s.priceCents / 100).toFixed(2)}`, value: s.id }))}
              value={line.serviceId}
              onValueChange={(v) => updateLine(line.key, { serviceId: v })}
            />
            <Select
              label="Barbero"
              items={barbers.map((b) => ({ label: b.fullName, value: b.id }))}
              value={line.barberId}
              onValueChange={(v) => updateLine(line.key, { barberId: v })}
              disabled={isBarber}
            />
            <div className="flex items-end gap-2">
              <FormField label="Cantidad" className="w-24">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
              </FormField>
              {lines.length > 1 ? (
                <Button size="sm" variant="ghost" onClick={() => removeLine(line.key)}>
                  Quitar
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={addLine}>
          + Agregar servicio
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h2">Descuento</h2>
        <div className="flex flex-wrap gap-2">
          <Chip active={discountKind === "none"} onClick={() => setDiscountKind("none")}>
            Sin descuento
          </Chip>
          <Chip active={discountKind === "percentage"} onClick={() => setDiscountKind("percentage")}>
            Porcentaje
          </Chip>
          <Chip active={discountKind === "amount"} onClick={() => setDiscountKind("amount")}>
            Monto fijo
          </Chip>
        </div>
        {discountKind === "percentage" ? (
          <FormField label="Porcentaje de descuento">
            <Input
              type="number"
              min={1}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(Math.min(100, Math.max(1, Number(e.target.value) || 0)))}
            />
          </FormField>
        ) : null}
        {discountKind === "amount" ? (
          <FormField label="Monto de descuento">
            <Input numeric inputMode="decimal" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="0.00" />
          </FormField>
        ) : null}
        {discountKind !== "none" ? (
          <FormField label="Motivo (obligatorio)">
            <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Ej. cliente frecuente" />
          </FormField>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h2">Propina</h2>
        <div className="flex flex-wrap gap-2">
          <Chip active={tipKind === "none"} onClick={() => setTipKind("none")}>
            0%
          </Chip>
          {[10, 15, 20].map((pct) => (
            <Chip
              key={pct}
              active={tipKind === "percentage" && tipPct === pct}
              onClick={() => {
                setTipKind("percentage")
                setTipPct(pct)
              }}
            >
              {pct}%
            </Chip>
          ))}
          <Chip active={tipKind === "amount"} onClick={() => setTipKind("amount")}>
            Otro
          </Chip>
        </div>
        {tipKind === "amount" ? (
          <FormField label="Monto de propina">
            <Input numeric inputMode="decimal" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} placeholder="0.00" />
          </FormField>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-h2">Metodo de pago</h2>
        <Select
          items={[
            { label: "Efectivo", value: "cash" },
            { label: "Tarjeta", value: "card" },
            { label: "Transferencia", value: "transfer" },
          ]}
          value={paymentMethod}
          onValueChange={(v) => setPaymentMethod(v as "cash" | "card" | "transfer")}
        />
        {paymentMethod === "card" ? (
          <p className="text-body-s text-(--text-tertiary)">Registra el monto cobrado por la terminal.</p>
        ) : null}
      </section>

      <div className="flex flex-col gap-1 rounded-md border border-(--border) p-3">
        <Row label="Subtotal" cents={subtotalCents} />
        {discountPreviewCents > 0 ? <Row label="Descuento" cents={-discountPreviewCents} /> : null}
        {tipPreviewCents > 0 ? <Row label="Propina" cents={tipPreviewCents} /> : null}
      </div>

      {error ? <p className="text-body-s text-(--data-neg)">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-(--border) bg-(--surface-card) p-4">
        <Button
          size="xl"
          loading={pending}
          loadingText="Cobrando..."
          onClick={handleSubmit}
          disabled={subtotalCents <= 0}
        >
          Cobrar RD$ {(totalPreviewCents / 100).toFixed(2)}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-s text-(--text-secondary)">{label}</span>
      <MoneyDisplay amount={cents / 100} context="checkout" size="num-m" />
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md border border-(--accent) bg-(--accent)/10 px-3 py-1.5 text-body-s text-(--accent)"
          : "rounded-md border border-(--border) px-3 py-1.5 text-body-s text-(--text-secondary) hover:bg-(--surface-raised)"
      }
    >
      {children}
    </button>
  )
}

function parseMoneyToCentsOrZero(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, "")
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0
  const [intPart, fracPartRaw = ""] = trimmed.split(".")
  const fracPart = (fracPartRaw + "00").slice(0, 2)
  return Number(intPart) * 100 + Number(fracPart)
}
