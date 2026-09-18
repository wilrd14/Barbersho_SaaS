"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Select } from "@/components/ui/select"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { createPayoutPeriodAction } from "@/lib/actions/payout-periods"
import { centsToPesosForDisplay, formatCentsRd } from "@/lib/payouts/format"
import { badgeStatusOf } from "@/lib/payouts/period"
import type { PeriodListRow, QuincenaOption } from "@/lib/payouts/queries-periods"

/**
 * F3-06 · Historial de cortes con estado y total, y "Crear corte" (solo el
 * superuser crea, D-F3-9; el servidor lo vuelve a verificar). Clic en la fila
 * abre el Corte de Quincena; el nombre de la quincena es un enlace real para
 * teclado y lectores de pantalla.
 */
export function PeriodsList({ periods, creatable }: { periods: PeriodListRow[]; creatable: QuincenaOption[] }) {
  const router = useRouter()
  const [chosen, setChosen] = React.useState<string>(creatable[0] ? creatable[0].startsOn : "")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function create() {
    const option = creatable.find((c) => c.startsOn === chosen)
    if (!option) return
    setError(null)
    setPending(true)
    const result = await createPayoutPeriodAction({ startsOn: option.startsOn, endsOn: option.endsOn })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/commissions/periods/${result.data.periodId}`)
  }

  const columns: DataTableColumn<PeriodListRow>[] = [
    {
      id: "period",
      header: "Quincena",
      sortable: true,
      accessor: (p) => p.startsOn,
      render: (p) => (
        <Link href={`/commissions/periods/${p.id}`} className="underline decoration-(--border) underline-offset-4">
          {p.label}
        </Link>
      ),
    },
    { id: "status", header: "Estado", accessor: (p) => p.status, render: (p) => <Badge status={badgeStatusOf(p.status)} kind="periodo" /> },
    { id: "barbers", header: "Barberos", type: "number", accessor: (p) => p.barberCount },
    { id: "locations", header: "Sedes", type: "number", accessor: (p) => p.locationCount },
    {
      id: "total",
      header: "Neto a pagar",
      type: "money",
      accessor: (p) => p.totalNetCents ?? 0,
      render: (p) =>
        p.totalNetCents === null ? (
          <span className="text-(--text-tertiary)">—</span>
        ) : p.totalNetCents < 0 ? (
          <span className="text-num-m tabular-nums text-(--data-neg)">{formatCentsRd(p.totalNetCents)}</span>
        ) : (
          <MoneyDisplay amount={centsToPesosForDisplay(p.totalNetCents)} context="commission" />
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="rounded-md border border-(--data-neg) bg-(--data-neg)/12 p-3 text-body-s">
          {error}
        </p>
      ) : null}

      {creatable.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-md border border-(--border) p-4 sm:flex-row sm:items-end">
          <Select
            label="Crear el corte de"
            className="sm:w-72"
            items={creatable.map((c) => ({ value: c.startsOn, label: c.label }))}
            value={chosen}
            onValueChange={setChosen}
          />
          <Button loading={pending} loadingText="Creando..." onClick={() => void create()}>
            Crear corte
          </Button>
        </div>
      ) : (
        <p className="text-body-s text-(--text-tertiary)">Ya hay un corte para cada quincena reciente.</p>
      )}

      <DataTable
        columns={columns}
        data={periods}
        rowKey={(p) => p.id}
        onRowClick={(p) => router.push(`/commissions/periods/${p.id}`)}
        emptyState={<EmptyState kind="table" columns={columns.length} message="Todavía no hay cortes. Crea el de la quincena en curso." />}
      />
    </div>
  )
}
