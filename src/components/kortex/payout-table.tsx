"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet } from "@/components/ui/sheet"
import { BarberReceipt } from "@/components/kortex/barber-receipt"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { adjustPayoutLineAction } from "@/lib/actions/payout-periods"
import { centsToPesosForDisplay, formatCentsRd } from "@/lib/payouts/format"
import { parseMoneyInputToCents } from "@/lib/payouts/money-input"
import type { PeriodStatusValue } from "@/lib/payouts/period"
import type { PayoutLineView } from "@/lib/payouts/queries-periods"

/**
 * F3-06 · Tabla del Corte de Quincena (UX-BRIEF §4.5): una fila por barbero y
 * sede, con DataTable. Los montos siempre con centavos (las comisiones no se
 * redondean, BRAND-BRIEF §2.1). En silla fija la columna de comision muestra un
 * guion (D-F3-6: no hay porcentaje, aunque `commission_amount` no sea 0 en la
 * base). El neto negativo va en rojo y dice "debe RD$X a la barberia".
 *
 * Clic en una fila (o en el nombre, que es un boton para teclado) abre el
 * Recibo del barbero en solo lectura (F3-07). Con el corte `calculated` el
 * superuser puede ademas registrar un ajuste manual desde ahi (F3-05, P1);
 * en cuanto el corte se aprueba la tabla y el recibo son solo lectura.
 */
function money(cents: number, emphasis: "money" | "neutral" = "neutral") {
  return <MoneyDisplay amount={centsToPesosForDisplay(cents)} context="commission" emphasis={emphasis} align="right" />
}

const DASH = <span className="text-(--text-tertiary)">—</span>

export function PayoutTable({
  periodId,
  periodLabel,
  status,
  lines,
  canAdjust,
}: {
  periodId: string
  periodLabel: string
  status: PeriodStatusValue
  lines: PayoutLineView[]
  canAdjust: boolean
}) {
  const [selectedBarber, setSelectedBarber] = React.useState<string | null>(null)
  const hasAdjustments = lines.some((l) => l.adjustmentsCents !== 0)

  const columns: DataTableColumn<PayoutLineView>[] = [
    {
      id: "barber",
      header: "Barbero",
      sortable: true,
      accessor: (l) => l.barberName,
      render: (l) => (
        <button
          type="button"
          className="text-left underline decoration-(--border) underline-offset-4 outline-none hover:decoration-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          aria-label={`Ver recibo de ${l.barberName} en ${l.locationName}`}
          onClick={() => setSelectedBarber(l.barberId)}
        >
          {l.barberName}
        </button>
      ),
    },
    { id: "location", header: "Sede", sortable: true, accessor: (l) => l.locationName },
    { id: "count", header: "Serv.", type: "number", sortable: true, accessor: (l) => l.servicesCount },
    {
      id: "revenue",
      header: "Ing. serv.",
      type: "money",
      sortable: true,
      accessor: (l) => l.servicesRevenueCents,
      render: (l) => money(l.servicesRevenueCents),
    },
    {
      id: "commission",
      header: "Comis.",
      type: "money",
      sortable: true,
      accessor: (l) => l.commissionCents,
      render: (l) => (l.ruleType === "booth_rent" ? DASH : money(l.commissionCents)),
    },
    {
      id: "rent",
      header: "Alq. silla",
      type: "money",
      sortable: true,
      accessor: (l) => l.boothRentDeductedCents,
      render: (l) => (l.boothRentDeductedCents === 0 ? DASH : money(l.boothRentDeductedCents)),
    },
    {
      id: "tips",
      header: "Propinas",
      type: "money",
      sortable: true,
      accessor: (l) => l.tipsCents,
      render: (l) => money(l.tipsCents),
    },
    ...(hasAdjustments
      ? [
          {
            id: "adjustments",
            header: "Ajustes",
            type: "money",
            sortable: true,
            accessor: (l: PayoutLineView) => l.adjustmentsCents,
            render: (l: PayoutLineView) => (l.adjustmentsCents === 0 ? DASH : money(l.adjustmentsCents)),
          } satisfies DataTableColumn<PayoutLineView>,
        ]
      : []),
    {
      id: "net",
      header: "Neto",
      type: "money",
      sortable: true,
      accessor: (l) => l.netPayableCents,
      render: (l) =>
        l.netPayableCents < 0 ? (
          <span className="flex flex-col items-end gap-0.5">
            <span className="text-num-m tabular-nums text-(--data-neg)">{formatCentsRd(l.netPayableCents)}</span>
            <span className="text-body-s text-(--data-neg)">debe {formatCentsRd(-l.netPayableCents)} a la barbería</span>
          </span>
        ) : (
          money(l.netPayableCents, "money")
        ),
    },
  ]

  const selectedLines = selectedBarber ? lines.filter((l) => l.barberId === selectedBarber) : []

  return (
    <>
      <DataTable
        columns={columns}
        data={lines}
        rowKey={(l) => l.key}
        stickyFirstColumn
        onRowClick={(l) => setSelectedBarber(l.barberId)}
        emptyState={
          <EmptyState
            kind="table"
            columns={columns.length}
            message={
              status === "open"
                ? "Todavía no se calculó. Calcula el corte para ver cuánto le toca a cada barbero."
                : "No hubo ventas cobradas en esta quincena."
            }
          />
        }
      />

      <Sheet
        open={selectedBarber !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedBarber(null)
        }}
        title="Recibo del barbero"
      >
        {selectedLines.length > 0 ? (
          <div className="flex flex-col gap-6">
            <BarberReceipt
              barberName={selectedLines[0]!.barberName}
              periodLabel={periodLabel}
              status={status}
              lines={selectedLines}
            />
            {canAdjust ? (
              <div className="flex flex-col gap-4 border-t border-(--border) pt-4">
                <h4 className="text-body font-medium">Ajuste manual</h4>
                {selectedLines.map((line) => (
                  <AdjustForm key={line.key} periodId={periodId} line={line} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </>
  )
}

function AdjustForm({ periodId, line }: { periodId: string; line: PayoutLineView }) {
  const router = useRouter()
  const [amount, setAmount] = React.useState(
    line.adjustmentsCents === 0 ? "" : formatAdjustmentInput(line.adjustmentsCents),
  )
  const [note, setNote] = React.useState(line.notes ?? "")
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaved(false)
    setError(null)
    const cents = amount.trim() === "" ? 0 : parseMoneyInputToCents(amount)
    if (cents === null) {
      setError("Escribe el ajuste como monto, por ejemplo 500 o -250.50. Usa el signo menos para descontar.")
      return
    }
    if (!line.lineId) return
    setPending(true)
    const result = await adjustPayoutLineAction({ periodId, lineId: line.lineId, amountCents: cents, note })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-(--border) p-3" noValidate>
      <p className="text-body-s text-(--text-secondary)">{line.locationName}</p>
      <FormField label={`Ajuste en ${line.locationName} (RD$, negativo descuenta)`} error={error ?? undefined}>
        <Input numeric inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </FormField>
      <FormField label={`Motivo del ajuste en ${line.locationName}`}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. adelanto de la quincena pasada" />
      </FormField>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" loading={pending} loadingText="Guardando...">
          Guardar ajuste
        </Button>
        {saved ? (
          <span role="status" className="text-body-s text-(--text-secondary)">
            Ajuste guardado. El neto ya lo incluye.
          </span>
        ) : null}
      </div>
    </form>
  )
}

/** Centavos -> texto editable ("-15" / "50.5"), solo con enteros. */
function formatAdjustmentInput(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  return frac === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(frac).padStart(2, "0")}`
}
