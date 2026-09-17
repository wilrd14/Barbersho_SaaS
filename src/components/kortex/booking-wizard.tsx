"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/field"
import {
  createPublicBookingAction,
  getBookingAvailabilityAction,
  getLocationBarbersAction,
  getLocationCatalogAction,
  lookupClientHistoryAction,
  type BookingAvailabilityResult,
  type BookingSlot,
} from "@/lib/actions/public-booking"

export interface WizardLocation {
  id: string
  slug: string
  name: string
}

export interface WizardBarberCoverage {
  locationId: string
  locationSlug: string
  locationName: string
  daysLabel: string
}

type WizardProps =
  | {
      mode: "location"
      chainSlug: string
      brandColor: string | null
      allowCrossLocationBooking: boolean
      locations: WizardLocation[]
      preselectedLocationSlug?: string
    }
  | {
      mode: "barber"
      chainSlug: string
      brandColor: string | null
      allowCrossLocationBooking: boolean
      barber: { id: string; fullName: string; coverage: WizardBarberCoverage[] }
    }

const searchParamsSchema = z.object({
  sede: z.string().trim().min(1).optional(),
  servicio: z.string().uuid().optional(),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  hora: z.coerce.number().int().min(0).max(24 * 60 - 1).optional(),
  barbero: z.string().uuid().optional(),
})

type WizardParams = z.infer<typeof searchParamsSchema>

/**
 * F2-12 · Wizard de reserva publica, 4 pasos, 2 rutas (D-F2-3/D-F2-14). El
 * estado de seleccion vive en `searchParams` (Zod-validado en cada lectura,
 * regla dura §3.8), asi que volver atras con el boton del navegador no
 * pierde la seleccion previa: cada paso hace `router.push` con los params
 * acumulados, nunca `replace`.
 *
 * Decision de producto (no explicita en el backlog): con
 * `allow_cross_location_booking = false`, la ruta por barbero se acota a la
 * sede PRIMARIA del barbero (la primera de su cobertura) en vez de dejarlo
 * elegir entre varias — el backlog dice "esa sede" sin precisar cual cuando
 * hay ambiguedad de mas de una.
 */
export function BookingWizard(props: WizardProps) {
  const router = useRouter()
  const rawSearchParams = useSearchParams()
  const parsed = searchParamsSchema.safeParse(Object.fromEntries(rawSearchParams.entries()))
  const params: WizardParams = parsed.success ? parsed.data : {}

  const brandStyle = props.brandColor
    ? ({ "--client-brand": props.brandColor } as React.CSSProperties)
    : undefined

  // -- Resolver la sede activa segun el modo -------------------------------
  const availableLocations: WizardLocation[] =
    props.mode === "location"
      ? props.locations
      : (props.allowCrossLocationBooking ? props.barber.coverage : props.barber.coverage.slice(0, 1)).map(
          (c) => ({ id: c.locationId, slug: c.locationSlug, name: c.locationName }),
        )

  const sedeSlug = params.sede ?? (props.mode === "location" ? props.preselectedLocationSlug : undefined)
  const activeLocation = availableLocations.find((l) => l.slug === sedeSlug) ?? null

  const [confirmed, setConfirmed] = React.useState<{ code: string; startsAtLabel: string } | null>(null)

  function pushParams(next: Partial<WizardParams>, reset: (keyof WizardParams)[] = []) {
    const merged: WizardParams = { ...params, ...next }
    for (const key of reset) delete merged[key]
    const usp = new URLSearchParams()
    if (merged.sede) usp.set("sede", merged.sede)
    if (merged.servicio) usp.set("servicio", merged.servicio)
    if (merged.fecha) usp.set("fecha", merged.fecha)
    if (typeof merged.hora === "number") usp.set("hora", String(merged.hora))
    if (merged.barbero) usp.set("barbero", merged.barbero)
    router.push(`?${usp.toString()}`)
  }

  const step: 1 | 2 | 3 | 4 = !activeLocation
    ? 1
    : !params.servicio
      ? 2
      : !(params.fecha && typeof params.hora === "number" && params.barbero)
        ? 3
        : 4

  if (confirmed) {
    return (
      <div style={brandStyle} className="mx-auto flex max-w-xl flex-col items-center gap-4 p-6 pt-10 text-center sm:p-8">
        <h1 className="text-display-xl text-(--text-primary)">¡Listo!</h1>
        <p className="text-body text-(--text-secondary)">Tu cita quedo confirmada para {confirmed.startsAtLabel}.</p>
        <div className="rounded-md border border-dashed border-(--border) px-6 py-4">
          <p className="text-body-s text-(--text-tertiary)">Codigo de reserva</p>
          <p className="text-display-xl tracking-widest text-(--text-primary)">{confirmed.code}</p>
        </div>
        <p className="text-body-s text-(--text-tertiary)">
          Guarda este codigo. Si tenes cuenta, tambien vas a verla en &quot;Mis citas&quot;.
        </p>
      </div>
    )
  }

  return (
    <div style={brandStyle} className="mx-auto flex max-w-xl flex-col gap-6 p-4 pb-10 sm:p-8">
      <ProgressBar step={step} />

      {step === 1 ? (
        <StepLocation
          locations={availableLocations}
          onSelect={(slug) => pushParams({ sede: slug }, ["servicio", "fecha", "hora", "barbero"])}
        />
      ) : null}

      {step === 2 && activeLocation ? (
        <StepService
          locationId={activeLocation.id}
          onSelect={(serviceId) => pushParams({ servicio: serviceId }, ["fecha", "hora", "barbero"])}
          onBack={() => pushParams({}, ["sede", "servicio", "fecha", "hora", "barbero"])}
        />
      ) : null}

      {step === 3 && activeLocation && params.servicio ? (
        <StepDateTime
          locationId={activeLocation.id}
          serviceId={params.servicio}
          fixedBarberId={props.mode === "barber" ? props.barber.id : undefined}
          onSelect={(fecha, hora, barbero) => pushParams({ fecha, hora, barbero })}
          onBack={() => pushParams({}, ["servicio", "fecha", "hora", "barbero"])}
        />
      ) : null}

      {step === 4 && activeLocation && params.servicio && params.fecha && typeof params.hora === "number" && params.barbero ? (
        <StepConfirm
          chainSlug={props.chainSlug}
          location={activeLocation}
          serviceId={params.servicio}
          barberId={params.barbero}
          date={params.fecha}
          slotStartMinutes={params.hora}
          onBack={() => pushParams({}, ["fecha", "hora", "barbero"])}
          onConfirmed={(code, startsAtLabel) => setConfirmed({ code, startsAtLabel })}
        />
      ) : null}
    </div>
  )
}

function ProgressBar({ step }: { step: 1 | 2 | 3 | 4 }) {
  const labels = ["Sede", "Servicio", "Fecha y hora", "Confirmar"]
  return (
    <ol className="flex items-center gap-2">
      {labels.map((label, index) => {
        const n = (index + 1) as 1 | 2 | 3 | 4
        const active = n === step
        const done = n < step
        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={
                "flex size-6 items-center justify-center rounded-full text-body-s " +
                (active
                  ? "bg-(--client-brand,var(--accent)) text-(--accent-contrast)"
                  : done
                    ? "bg-(--data-pos) text-white"
                    : "border border-(--border) text-(--text-tertiary)")
              }
            >
              {n}
            </span>
            <span className="text-body-s text-(--text-tertiary)">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const period = h < 12 ? "am" : "pm"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")}${period}`
}

// ---------------------------------------------------------------------------
// Paso 1 — sede
// ---------------------------------------------------------------------------

function StepLocation({
  locations,
  onSelect,
}: {
  locations: WizardLocation[]
  onSelect: (slug: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-h2 text-(--text-primary)">Elegi tu sede</h2>
      {locations.length === 0 ? (
        <p className="text-body-s text-(--text-tertiary)">No hay sedes disponibles para reservar.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {locations.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onSelect(l.slug)}
              className="rounded-md border border-(--border) px-4 py-3 text-left text-body text-(--text-primary) hover:bg-(--surface-raised)"
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paso 2 — servicio
// ---------------------------------------------------------------------------

function StepService({
  locationId,
  onSelect,
  onBack,
}: {
  locationId: string
  onSelect: (serviceId: string) => void
  onBack: () => void
}) {
  type ServiceRow = { id: string; name: string; category: string; durationMinutes: number; price: number }
  const [loaded, setLoaded] = React.useState<{ locationId: string; data: ServiceRow[] } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    getLocationCatalogAction({ locationId }).then((result) => {
      if (!cancelled && result.ok) setLoaded({ locationId, data: result.data })
    })
    return () => {
      cancelled = true
    }
  }, [locationId])

  const services = loaded?.locationId === locationId ? loaded.data : null

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="self-start text-body-s text-(--text-tertiary) hover:underline">
        ← Cambiar sede
      </button>
      <h2 className="text-h2 text-(--text-primary)">Elegi el servicio</h2>
      {services === null ? (
        <p className="text-body-s text-(--text-tertiary)">Cargando...</p>
      ) : services.length === 0 ? (
        <p className="text-body-s text-(--text-tertiary)">Esta sede no tiene servicios disponibles.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className="flex items-center justify-between rounded-md border border-(--border) px-4 py-3 text-left hover:bg-(--surface-raised)"
            >
              <span>
                <span className="block text-body text-(--text-primary)">{s.name}</span>
                <span className="block text-body-s text-(--text-tertiary)">{s.durationMinutes} min</span>
              </span>
              <span className="text-num-m text-(--text-primary)">RD${s.price.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paso 3 — fecha y hora (+ barbero opcional)
// ---------------------------------------------------------------------------

function nextDates(count: number): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = []
  const weekdayFmt = new Intl.DateTimeFormat("es-DO", { weekday: "short" })
  for (let i = 0; i < count; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const label = i === 0 ? "Hoy" : i === 1 ? "Mañana" : weekdayFmt.format(d)
    out.push({ date: iso, label })
  }
  return out
}

function StepDateTime({
  locationId,
  serviceId,
  fixedBarberId,
  onSelect,
  onBack,
}: {
  locationId: string
  serviceId: string
  fixedBarberId?: string
  onSelect: (date: string, slotStartMinutes: number, barberId: string) => void
  onBack: () => void
}) {
  const dates = React.useMemo(() => nextDates(7), [])
  const [selectedDate, setSelectedDate] = React.useState(dates[0]!.date)
  const [barbers, setBarbers] = React.useState<{ id: string; fullName: string }[] | null>(null)
  const [selectedBarberId, setSelectedBarberId] = React.useState<string | undefined>(fixedBarberId)
  const requestKey = `${locationId}|${serviceId}|${selectedBarberId ?? ""}|${selectedDate}`
  const [loaded, setLoaded] = React.useState<{ key: string; data: BookingAvailabilityResult } | null>(null)

  React.useEffect(() => {
    if (fixedBarberId) return
    getLocationBarbersAction({ locationId }).then((result) => {
      if (result.ok) setBarbers(result.data)
    })
  }, [locationId, fixedBarberId])

  React.useEffect(() => {
    let cancelled = false
    getBookingAvailabilityAction({
      locationId,
      serviceId,
      barberId: selectedBarberId,
      date: selectedDate,
    }).then((result) => {
      if (cancelled) return
      if (result.ok) setLoaded({ key: requestKey, data: result.data })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey ya deriva de las mismas deps
  }, [locationId, serviceId, selectedBarberId, selectedDate])

  const loading = loaded?.key !== requestKey
  const availability = loaded?.key === requestKey ? loaded.data : null

  const slots: BookingSlot[] = availability
    ? selectedBarberId
      ? (availability.byBarber.find((b) => b.barberId === selectedBarberId)?.slotStartMinutes ?? []).map(
          (m) => ({ slotStartMinutes: m, barberId: selectedBarberId, barberName: "" }),
        )
      : availability.anyBarber
    : []

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-body-s text-(--text-tertiary) hover:underline">
        ← Cambiar servicio
      </button>
      <h2 className="text-h2 text-(--text-primary)">Elegi fecha y hora</h2>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {dates.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => setSelectedDate(d.date)}
            className={
              "shrink-0 rounded-md border px-3 py-2 text-body-s " +
              (d.date === selectedDate
                ? "border-(--accent) bg-(--accent) text-(--accent-contrast)"
                : "border-(--border) text-(--text-primary) hover:bg-(--surface-raised)")
            }
          >
            {d.label}
          </button>
        ))}
      </div>

      {!fixedBarberId && barbers ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedBarberId(undefined)}
            className={
              "rounded-full border px-3 py-1 text-body-s " +
              (!selectedBarberId
                ? "border-(--accent) bg-(--accent) text-(--accent-contrast)"
                : "border-(--border) text-(--text-secondary)")
            }
          >
            Cualquier barbero
          </button>
          {barbers.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBarberId(b.id)}
              className={
                "rounded-full border px-3 py-1 text-body-s " +
                (selectedBarberId === b.id
                  ? "border-(--accent) bg-(--accent) text-(--accent-contrast)"
                  : "border-(--border) text-(--text-secondary)")
              }
            >
              {b.fullName}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="text-body-s text-(--text-tertiary)">Buscando horarios...</p>
      ) : slots.length === 0 ? (
        <p className="text-body-s text-(--text-tertiary)">No hay horarios disponibles ese dia. Proba otra fecha.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((slot) => (
            <button
              key={`${slot.barberId}-${slot.slotStartMinutes}`}
              type="button"
              onClick={() => onSelect(selectedDate, slot.slotStartMinutes, slot.barberId)}
              className="rounded-md border border-(--border) px-2 py-2 text-body-s text-(--text-primary) hover:bg-(--surface-raised)"
            >
              {formatMinutes(slot.slotStartMinutes)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paso 4 — confirmar
// ---------------------------------------------------------------------------

function StepConfirm({
  chainSlug,
  location,
  serviceId,
  barberId,
  date,
  slotStartMinutes,
  onBack,
  onConfirmed,
}: {
  chainSlug: string
  location: WizardLocation
  serviceId: string
  barberId: string
  date: string
  slotStartMinutes: number
  onBack: () => void
  onConfirmed: (code: string, startsAtLabel: string) => void
}) {
  const [fullName, setFullName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [history, setHistory] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const trimmed = phone.trim()
    const timeout = setTimeout(async () => {
      if (trimmed.length < 10) {
        setHistory(null)
        return
      }
      const result = await lookupClientHistoryAction({ chainSlug, phone: trimmed })
      if (result.ok && result.data.found) {
        setHistory(result.data.lastVisitLabel ?? `Te reconocemos, ${result.data.fullName}.`)
        if (!fullName.trim() && result.data.fullName) setFullName(result.data.fullName)
      } else {
        setHistory(null)
      }
    }, 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo re-consulta por telefono
  }, [phone, chainSlug])

  async function handleSubmit() {
    setError(null)
    if (!fullName.trim() || !phone.trim()) {
      setError("Nombre y telefono son obligatorios.")
      return
    }
    setPending(true)
    const result = await createPublicBookingAction({
      chainSlug,
      locationId: location.id,
      serviceId,
      barberId,
      date,
      slotStartMinutes,
      fullName,
      phone,
      email: email.trim() || undefined,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const label = new Intl.DateTimeFormat("es-DO", { dateStyle: "long", timeStyle: "short" }).format(
      new Date(result.data.startsAt),
    )
    onConfirmed(result.data.code, label)
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-body-s text-(--text-tertiary) hover:underline">
        ← Cambiar hora
      </button>
      <h2 className="text-h2 text-(--text-primary)">Confirma tu reserva</h2>

      <div className="rounded-md border border-(--border) p-4">
        <p className="text-body text-(--text-primary)">{location.name}</p>
        <p className="text-body-s text-(--text-tertiary)">
          {date} · {formatMinutes(slotStartMinutes)}
        </p>
      </div>

      <FormField label="Nombre completo">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </FormField>
      <FormField label="Telefono" helperText="Formato RD: 809/829/849 + 7 digitos">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="809 555 1234" />
      </FormField>
      <FormField label="Correo (opcional)">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>

      {history ? <p className="text-body-s text-(--data-pos)">{history}</p> : null}
      {error ? <p className="text-body-s text-(--data-neg)">{error}</p> : null}

      <Button size="xl" className="bg-(--client-brand)" loading={pending} loadingText="Reservando..." onClick={handleSubmit}>
        Confirmar reserva
      </Button>
    </div>
  )
}
