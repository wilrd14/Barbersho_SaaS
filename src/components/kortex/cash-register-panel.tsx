"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/ui/field"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { EmptyState } from "@/components/ui/empty-state"
import {
  closeCashSessionAction,
  openCashSessionAction,
  type CashRegisterState,
} from "@/lib/actions/cash-register"

/**
 * F2-20/F2-23 · Panel de caja. Cliente puro: la apertura/cierre y el calculo
 * de esperado/contado/diferencia son SIEMPRE del servidor (regla dura §3.2);
 * este componente solo junta la intencion del gerente (montos ingresados) y
 * pinta la respuesta. `parseMoneyToCents` es solo parseo de texto -> entero,
 * nunca aritmetica de punto flotante sobre un monto.
 */

function parseMoneyToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "")
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const [intPart, fracPartRaw = ""] = trimmed.split(".")
  const fracPart = (fracPartRaw + "00").slice(0, 2)
  return Number(intPart) * 100 + Number(fracPart)
}

function centsToPesos(cents: number): number {
  // Solo para pintar con MoneyDisplay (que espera pesos, no centavos) — no
  // se usa este valor para ningun calculo, solo para formatear texto.
  return cents / 100
}

export function CashRegisterPanel({
  locationId,
  isManager,
  state,
}: {
  locationId: string
  isManager: boolean
  state: CashRegisterState
}) {
  const router = useRouter()

  if (!isManager) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body-s text-(--text-tertiary)">
          Solo un gerente de sede puede abrir o cerrar la caja. Pedile a tu admin que la abra al inicio del dia.
        </p>
        {state.openSession ? (
          <div className="rounded-md border border-(--border) p-4">
            <p className="text-body-s text-(--text-tertiary)">Caja abierta por</p>
            <p className="text-body">{state.openSession.openedByName}</p>
          </div>
        ) : (
          <EmptyState kind="block" message="No hay caja abierta en esta sede." />
        )}
      </div>
    )
  }

  if (state.openSession) {
    return (
      <CloseCashForm locationId={locationId} session={state.openSession} onDone={() => router.refresh()} />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <OpenCashForm locationId={locationId} onDone={() => router.refresh()} />
      {state.lastClosedSession ? <LastClosedSummary session={state.lastClosedSession} /> : null}
    </div>
  )
}

function OpenCashForm({ locationId, onDone }: { locationId: string; onDone: () => void }) {
  const [amount, setAmount] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    const cents = parseMoneyToCents(amount)
    if (cents === null) {
      setError("Ingresa un monto valido (ej. 1500 o 1500.00).")
      return
    }
    setPending(true)
    const result = await openCashSessionAction({ locationId, openingAmountCents: cents })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onDone()
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-(--border) p-4">
      <h2 className="text-h2">Abrir caja</h2>
      <FormField label="Monto inicial en efectivo" error={error ?? undefined}>
        <Input
          numeric
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </FormField>
      <Button loading={pending} loadingText="Abriendo..." onClick={handleSubmit}>
        Abrir caja
      </Button>
    </div>
  )
}

function CloseCashForm({
  locationId,
  session,
  onDone,
}: {
  locationId: string
  session: NonNullable<CashRegisterState["openSession"]>
  onDone: () => void
}) {
  const [counted, setCounted] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<{
    expectedCashCents: number
    countedCashCents: number
    differenceCents: number
  } | null>(null)

  async function handleSubmit() {
    setError(null)
    const cents = parseMoneyToCents(counted)
    if (cents === null) {
      setError("Ingresa el efectivo contado (ej. 4200 o 4200.00).")
      return
    }
    setPending(true)
    const res = await closeCashSessionAction({
      locationId,
      cashSessionId: session.id,
      countedCashCents: cents,
      notes: notes.trim() || undefined,
    })
    setPending(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setResult(res.data)
  }

  if (result) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-(--border) p-4">
        <h2 className="text-h2">Caja cerrada</h2>
        <SummaryRow label="Esperado (efectivo)" cents={result.expectedCashCents} />
        <SummaryRow label="Contado" cents={result.countedCashCents} />
        <SummaryRow
          label="Descuadre"
          cents={result.differenceCents}
          tone={result.differenceCents === 0 ? "neutral" : result.differenceCents < 0 ? "warn" : "pos"}
        />
        <Button variant="secondary" onClick={onDone}>
          Listo
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-(--border) p-4">
      <h2 className="text-h2">Cerrar caja</h2>
      <p className="text-body-s text-(--text-tertiary)">
        Abierta por {session.openedByName} a las{" "}
        {new Intl.DateTimeFormat("es-DO", { hour: "numeric", minute: "2-digit" }).format(
          new Date(session.openedAt),
        )}{" "}
        con <MoneyDisplay amount={centsToPesos(session.openingAmountCents)} context="checkout" />.
      </p>
      <FormField label="Efectivo contado" error={error ?? undefined}>
        <Input
          numeric
          inputMode="decimal"
          placeholder="0.00"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
        />
      </FormField>
      <FormField label="Notas (opcional)">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>
      <Button loading={pending} loadingText="Cerrando..." onClick={handleSubmit}>
        Cerrar caja
      </Button>
    </div>
  )
}

function LastClosedSummary({ session }: { session: NonNullable<CashRegisterState["lastClosedSession"]> }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-(--border) p-4 opacity-80">
      <p className="text-body-s text-(--text-tertiary)">
        Ultimo cierre —{" "}
        {new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(session.closedAt),
        )}
      </p>
      <SummaryRow label="Esperado" cents={session.expectedCashCents} />
      <SummaryRow label="Contado" cents={session.countedCashCents} />
      <SummaryRow
        label="Descuadre"
        cents={session.differenceCents}
        tone={session.differenceCents === 0 ? "neutral" : session.differenceCents < 0 ? "warn" : "pos"}
      />
      {session.notes ? <p className="text-body-s text-(--text-tertiary)">Nota: {session.notes}</p> : null}
    </div>
  )
}

function SummaryRow({
  label,
  cents,
  tone = "neutral",
}: {
  label: string
  cents: number
  tone?: "neutral" | "warn" | "pos"
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-s text-(--text-secondary)">{label}</span>
      <span
        className={
          tone === "warn" ? "text-(--data-warn)" : tone === "pos" ? "text-(--data-pos)" : undefined
        }
      >
        <MoneyDisplay amount={centsToPesos(cents)} context="checkout" />
      </span>
    </div>
  )
}
