"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Sheet } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/field"
import { createAppointmentAction, searchClientsAction } from "@/lib/actions/appointments"

export interface CreateAppointmentBarber {
  id: string
  name: string
}

export interface CreateAppointmentService {
  id: string
  name: string
  durationMinutes: number
  price: number
}

/**
 * F2-08 · Crear cita desde la consola. Cliente existente (busqueda por
 * nombre/telefono) o nuevo (nombre + telefono). `source` se fija segun el
 * copy elegido por el gerente ("vino por telefono" -> phone, si no -> admin).
 */
function CreateAppointmentSheet({
  open,
  onOpenChange,
  locationId,
  timezone,
  barbers,
  services,
  defaultBarberId,
  defaultDate,
  defaultTime,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locationId: string
  timezone: string
  barbers: CreateAppointmentBarber[]
  services: CreateAppointmentService[]
  defaultBarberId?: string
  defaultDate?: string
  defaultTime?: string
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [clientMode, setClientMode] = React.useState<"search" | "new">("search")
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<{ id: string; fullName: string; phone: string | null }[]>([])
  const [selectedClientId, setSelectedClientId] = React.useState<string>("")
  const [newName, setNewName] = React.useState("")
  const [newPhone, setNewPhone] = React.useState("")

  // Los defaults (barbero/fecha/hora sugeridos por el hueco clickeado en la
  // rejilla) se fijan solo al montar: el llamador (F2-06/08) remonta este
  // sheet con una `key` distinta cada vez que se abre, asi que no hace
  // falta sincronizarlos con un effect.
  const [serviceId, setServiceId] = React.useState(services[0]?.id ?? "")
  const [barberId, setBarberId] = React.useState(defaultBarberId ?? barbers[0]?.id ?? "")
  const [date, setDate] = React.useState(defaultDate ?? "")
  const [time, setTime] = React.useState(defaultTime ?? "")
  const [cameByPhone, setCameByPhone] = React.useState(false)

  React.useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return;
    const timeout = setTimeout(async () => {
      const result = await searchClientsAction({ locationId, query })
      if (result.ok) setResults(result.data)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, locationId])

  const visibleResults = query.trim().length < 2 ? [] : results

  async function handleSubmit() {
    setError(null)
    if (!serviceId || !barberId || !date || !time) {
      setError("Completa servicio, barbero, fecha y hora.")
      return
    }
    if (clientMode === "search" && !selectedClientId) {
      setError("Elegi un cliente de la lista o cambia a 'Cliente nuevo'.")
      return
    }
    if (clientMode === "new" && (!newName.trim() || !newPhone.trim())) {
      setError("Nombre y telefono son obligatorios para un cliente nuevo.")
      return
    }

    setPending(true)
    const startsAt = fromDatetimeLocalParts(date, time, timezone)
    const result = await createAppointmentAction({
      locationId,
      serviceId,
      barberId,
      startsAt,
      source: cameByPhone ? "phone" : "admin",
      existingClientId: clientMode === "search" ? selectedClientId : undefined,
      newClient: clientMode === "new" ? { fullName: newName, phone: newPhone } : undefined,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Agregar cita">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={clientMode === "search" ? "primary" : "secondary"}
            onClick={() => setClientMode("search")}
          >
            Cliente existente
          </Button>
          <Button
            size="sm"
            variant={clientMode === "new" ? "primary" : "secondary"}
            onClick={() => setClientMode("new")}
          >
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
            {selectedClientId ? (
              <p className="text-body-s text-(--data-pos)">Cliente seleccionado.</p>
            ) : null}
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

        <Select
          label="Servicio"
          items={services.map((s) => ({ label: `${s.name} · ${s.durationMinutes} min`, value: s.id }))}
          value={serviceId}
          onValueChange={setServiceId}
        />
        <Select
          label="Barbero"
          items={barbers.map((b) => ({ label: b.name, value: b.id }))}
          value={barberId}
          onValueChange={setBarberId}
        />
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Hora">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-body-s text-(--text-secondary)">
          <input type="checkbox" checked={cameByPhone} onChange={(e) => setCameByPhone(e.target.checked)} />
          Vino por telefono
        </label>

        {error ? <p className="text-body-s text-(--data-neg)">{error}</p> : null}

        <Button loading={pending} onClick={handleSubmit}>
          Crear cita
        </Button>
      </div>
    </Sheet>
  )
}

function fromDatetimeLocalParts(date: string, time: string, timeZone: string): string {
  const naive = new Date(`${date}T${time}:00Z`)
  const asIfLocal = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(naive)
  const get = (t: string) => Number(asIfLocal.find((p) => p.type === t)!.value)
  const offsetMs =
    Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) -
    naive.getTime()
  return new Date(naive.getTime() - offsetMs).toISOString()
}

export { CreateAppointmentSheet }
