"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Sheet } from "@/components/ui/sheet"
import {
  assignBarberLocationRuleAction,
  createCommissionRuleAction,
  deleteCommissionRuleAction,
  updateCommissionRuleAction,
} from "@/lib/actions/commission-rules"
import { decimalStringFromCents } from "@/lib/actions/money-utils"
import { formatCentsRd } from "@/lib/payouts/format"
import { normalizePercentInput, parseMoneyInputToCents } from "@/lib/payouts/money-input"
import type { AssignmentView, RuleView } from "@/lib/payouts/queries-rules"

/**
 * F3-04 · Reglas de Pago (`(chain)/commissions/rules`). Solo el superuser
 * llega a esta pantalla (el layout `(chain)` da 403 al resto) y solo el
 * superuser puede escribir (las acciones lo vuelven a verificar en servidor:
 * aqui `readOnly` solo oculta los controles, no es una capa de seguridad).
 *
 * Tono (BRAND-BRIEF §2): pantalla de dinero, sin exclamaciones ni emoji;
 * errores que dicen que paso, por que y que hacer. Un error de dinero es un
 * banner persistente con `role="alert"`, nunca un toast.
 *
 * Tipos ofrecidos: porcentaje, alquiler de silla y mixta (D-F3-4).
 * `fixed_per_service` y `split_pct` no aparecen como opcion (D-F3-4/D-F3-7).
 */

const TYPE_LABEL: Record<RuleView["type"], string> = {
  percentage: "Porcentaje",
  booth_rent: "Alquiler de silla",
  hybrid: "Mixta",
  fixed_per_service: "Monto fijo por servicio (no soportado)",
}

const FREQUENCY_LABEL: Record<NonNullable<RuleView["boothRentFrequency"]>, string> = {
  weekly: "por semana",
  biweekly: "por quincena",
  monthly: "por mes",
}

const FREQUENCY_HELP: Record<NonNullable<RuleView["boothRentFrequency"]>, string> = {
  weekly: "Se cobra una semana por cada lunes de la quincena.",
  biweekly: "Se cobra completo, una vez por quincena.",
  monthly: "La renta mensual se cobra mitad y mitad, una parte en cada quincena.",
}

const TYPE_ITEMS = [
  { value: "percentage", label: "Porcentaje de lo que produce" },
  { value: "booth_rent", label: "Alquiler de silla" },
  { value: "hybrid", label: "Mixta: porcentaje y alquiler de silla" },
]

const FREQUENCY_ITEMS = [
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quincenal" },
  { value: "monthly", label: "Mensual" },
]

const APPLIES_ITEMS = [
  { value: "barber", label: "Para barberos concretos (se asigna abajo)" },
  { value: "chain", label: "Regla por defecto de la cadena" },
]

function describeRule(rule: RuleView): string {
  const parts: string[] = []
  if (rule.serviceCommissionPct !== null && rule.type !== "booth_rent") {
    parts.push(`${rule.serviceCommissionPct}% por servicio`)
  }
  if (rule.productCommissionPct !== null && rule.type !== "booth_rent") {
    parts.push(`${rule.productCommissionPct}% por producto`)
  }
  if (rule.boothRentCents !== null && rule.boothRentFrequency !== null) {
    parts.push(`silla ${formatCentsRd(rule.boothRentCents)} ${FREQUENCY_LABEL[rule.boothRentFrequency]}`)
  }
  if (rule.type === "booth_rent") parts.unshift("el barbero se queda con lo que produce")
  return parts.join(" · ") || "—"
}

export function RulesManager({
  rules,
  assignments,
  readOnly = false,
}: {
  rules: RuleView[]
  assignments: AssignmentView[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = React.useState<RuleView | "new" | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null)

  async function handleDelete(rule: RuleView) {
    setNotice(null)
    setError(null)
    setPendingDelete(rule.id)
    const result = await deleteCommissionRuleAction({ ruleId: rule.id })
    setPendingDelete(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNotice(`Regla "${rule.name}" eliminada.`)
    router.refresh()
  }

  const columns: DataTableColumn<RuleView>[] = [
    { id: "name", header: "Regla", accessor: (r) => r.name },
    { id: "type", header: "Tipo", accessor: (r) => TYPE_LABEL[r.type] },
    { id: "detail", header: "Cómo paga", accessor: (r) => describeRule(r) },
    {
      id: "applies",
      header: "Aplica a",
      accessor: (r) => (r.appliesTo === "chain" ? "Todos los barberos sin regla propia" : "Barberos asignados"),
    },
    { id: "used", header: "En uso", type: "number", accessor: (r) => r.usedBy },
    ...(readOnly
      ? []
      : [
          {
            id: "actions",
            header: "Acciones",
            accessor: (r: RuleView) => (
              <span className="inline-flex gap-2">
                <Button variant="secondary" size="sm" aria-label={`Editar ${r.name}`} onClick={() => setEditing(r)}>
                  Editar
                </Button>
                {r.appliesTo === "chain" ? null : (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Eliminar ${r.name}`}
                    loading={pendingDelete === r.id}
                    loadingText="Eliminando..."
                    onClick={() => void handleDelete(r)}
                  >
                    Eliminar
                  </Button>
                )}
              </span>
            ),
          } satisfies DataTableColumn<RuleView>,
        ]),
  ]

  return (
    <div className="flex flex-col gap-8">
      {error ? (
        <p role="alert" className="rounded-md border border-(--data-neg) bg-(--data-neg)/12 p-3 text-body-s">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md border border-(--border) p-3 text-body-s text-(--text-secondary)">
          {notice}
        </p>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="rules-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="rules-title" className="text-h2">
            Reglas
          </h2>
          {readOnly ? null : (
            <Button
              size="sm"
              onClick={() => {
                setNotice(null)
                setError(null)
                setEditing("new")
              }}
            >
              Nueva regla
            </Button>
          )}
        </div>
        <DataTable
          columns={columns}
          data={rules}
          rowKey={(r) => r.id}
          emptyState={<EmptyState kind="table" columns={columns.length} message="Todavía no hay reglas de pago. Crea la regla por defecto de la cadena." />}
        />
        <p className="text-body-s text-(--text-tertiary)">
          Las propinas son del barbero, completas. El alquiler de silla se descuenta del corte de cada quincena.
        </p>
      </section>

      <AssignmentsSection
        rules={rules}
        assignments={assignments}
        readOnly={readOnly}
        onError={(message) => {
          setNotice(null)
          setError(message)
        }}
        onSaved={(message) => {
          setError(null)
          setNotice(message)
          router.refresh()
        }}
      />

      {editing ? (
        <RuleFormSheet
          key={editing === "new" ? "new" : editing.id}
          rule={editing === "new" ? null : editing}
          hasChainDefault={rules.some((r) => r.appliesTo === "chain")}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            setError(null)
            setNotice(message)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function AssignmentsSection({
  rules,
  assignments,
  readOnly,
  onError,
  onSaved,
}: {
  rules: RuleView[]
  assignments: AssignmentView[]
  readOnly: boolean
  onError: (message: string) => void
  onSaved: (message: string) => void
}) {
  const chainDefault = rules.find((r) => r.appliesTo === "chain")
  const CHAIN = "__chain__"
  const items = [
    { value: CHAIN, label: chainDefault ? `Regla de la cadena (${chainDefault.name})` : "Regla de la cadena" },
    ...rules.filter((r) => r.appliesTo !== "chain").map((r) => ({ value: r.id, label: r.name })),
  ]

  const byBarber = new Map<string, { name: string; rows: AssignmentView[] }>()
  for (const a of assignments) {
    const entry = byBarber.get(a.barberId) ?? { name: a.barberName, rows: [] }
    entry.rows.push(a)
    byBarber.set(a.barberId, entry)
  }

  async function assign(a: AssignmentView, value: string) {
    const ruleId = value === CHAIN ? null : value
    if (ruleId === a.commissionRuleId) return
    const result = await assignBarberLocationRuleAction({ barberId: a.barberId, locationId: a.locationId, ruleId })
    if (!result.ok) {
      onError(result.error)
      return
    }
    onSaved(`Regla de ${a.barberName} en ${a.locationName} actualizada. Su regla en las otras sedes no cambió.`)
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="assignments-title">
      <h2 id="assignments-title" className="text-h2">
        Regla de cada barbero por sede
      </h2>
      <p className="text-body-s text-(--text-tertiary)">
        Un barbero puede tener una regla distinta en cada sede donde cubre. Sin regla propia, se le aplica la de la cadena.
      </p>
      {byBarber.size === 0 ? (
        <EmptyState kind="block" message="Todavía no hay barberos asignados a sedes." />
      ) : (
        <ul className="flex flex-col divide-y divide-(--border) rounded-md border border-(--border)">
          {[...byBarber.entries()].map(([barberId, entry]) => (
            <li key={barberId} className="flex flex-col gap-3 p-3">
              <p className="text-body font-medium">{entry.name}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {entry.rows.map((a) => (
                  <Select
                    key={a.barberLocationId}
                    label={`${entry.name} en ${a.locationName}`}
                    items={items}
                    value={a.commissionRuleId ?? CHAIN}
                    disabled={readOnly}
                    onValueChange={(value) => void assign(a, value)}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RuleFormSheet({
  rule,
  hasChainDefault,
  onClose,
  onSaved,
}: {
  rule: RuleView | null
  hasChainDefault: boolean
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const isEdit = rule !== null
  const [name, setName] = React.useState(rule?.name ?? "")
  const [type, setType] = React.useState<"percentage" | "booth_rent" | "hybrid">(
    rule && rule.type !== "fixed_per_service" ? rule.type : "percentage",
  )
  const [pct, setPct] = React.useState(rule?.serviceCommissionPct ?? "")
  const [productPct, setProductPct] = React.useState(rule?.productCommissionPct ?? "")
  const [rent, setRent] = React.useState(
    rule?.boothRentCents != null ? decimalStringFromCents(rule.boothRentCents).replace(/\.00$/, "") : "",
  )
  const [frequency, setFrequency] = React.useState<"weekly" | "biweekly" | "monthly" | "">(rule?.boothRentFrequency ?? "")
  const [appliesTo, setAppliesTo] = React.useState<"chain" | "barber">(
    rule ? (rule.appliesTo === "chain" ? "chain" : "barber") : hasChainDefault ? "barber" : "chain",
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const usesPct = type === "percentage" || type === "hybrid"
  const usesRent = type === "booth_rent" || type === "hybrid"

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = "Ponle un nombre a la regla."

    const servicePct = usesPct ? normalizePercentInput(pct) : null
    if (usesPct && servicePct === null) next.pct = "El porcentaje debe estar entre 0 y 100, con hasta 2 decimales."

    let productNormalized: string | null = null
    if (usesPct && productPct.trim() !== "") {
      productNormalized = normalizePercentInput(productPct)
      if (productNormalized === null) next.productPct = "El porcentaje por producto debe estar entre 0 y 100."
    }

    let rentCents: number | null = null
    if (usesRent) {
      rentCents = parseMoneyInputToCents(rent)
      if (rentCents === null || rentCents < 1) next.rent = "Escribe el monto del alquiler, por ejemplo 3000 o 3,000.50."
      if (!frequency) next.frequency = "Elige cada cuánto se cobra el alquiler."
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return

    setPending(true)
    const body = {
      name: name.trim(),
      type,
      serviceCommissionPct: usesPct ? servicePct : null,
      productCommissionPct: usesPct ? productNormalized : null,
      boothRentCents: usesRent ? rentCents : null,
      boothRentFrequency: usesRent && frequency ? frequency : null,
    }
    const result = isEdit
      ? await updateCommissionRuleAction({ ...body, ruleId: rule.id })
      : await createCommissionRuleAction({ ...body, appliesTo })
    setPending(false)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    onSaved(`Regla "${body.name}" guardada.`)
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
      title={isEdit ? "Editar regla de pago" : "Nueva regla de pago"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError ? (
          <p role="alert" className="rounded-md border border-(--data-neg) bg-(--data-neg)/12 p-3 text-body-s">
            {formError}
          </p>
        ) : null}

        <FormField label="Nombre de la regla" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Silla fija RD$3,000 por semana" />
        </FormField>

        <Select
          label="Tipo de regla"
          items={TYPE_ITEMS}
          value={type}
          onValueChange={(v) => setType(v as typeof type)}
        />

        {usesPct ? (
          <>
            <FormField label="Porcentaje por servicio (%)" error={errors.pct} helperText="Sobre lo cobrado, ya sin descuento ni propina.">
              <Input numeric inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="50" />
            </FormField>
            <FormField label="Porcentaje por producto (%) — opcional" error={errors.productPct}>
              <Input numeric inputMode="decimal" value={productPct} onChange={(e) => setProductPct(e.target.value)} placeholder="Sin definir" />
            </FormField>
          </>
        ) : null}

        {usesRent ? (
          <>
            <FormField label="Alquiler de silla (RD$)" error={errors.rent}>
              <Input numeric inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="3000" />
            </FormField>
            <Select
              label="Cada cuánto se cobra"
              items={FREQUENCY_ITEMS}
              value={frequency || undefined}
              placeholder="Elige la frecuencia"
              error={errors.frequency}
              helperText={frequency ? FREQUENCY_HELP[frequency] : undefined}
              onValueChange={(v) => setFrequency(v as typeof frequency)}
            />
          </>
        ) : null}

        {isEdit ? null : (
          <Select
            label="A quién aplica"
            items={APPLIES_ITEMS}
            value={appliesTo}
            onValueChange={(v) => setAppliesTo(v as typeof appliesTo)}
            helperText={
              appliesTo === "chain" && hasChainDefault
                ? "Ya existe la regla por defecto de la cadena. Solo puede haber una."
                : undefined
            }
          />
        )}

        <p className="text-body-s text-(--text-tertiary)">Las propinas son del barbero, completas.</p>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" loading={pending} loadingText="Guardando...">
            Guardar regla
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
