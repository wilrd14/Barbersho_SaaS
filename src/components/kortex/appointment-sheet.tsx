"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Sheet } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge, type BadgeStatus } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { FormField } from "@/components/ui/field"
import { MoneyDisplay } from "@/components/kortex/money-display"
import {
  rescheduleAppointmentAction,
  transitionAppointmentAction,
} from "@/lib/actions/appointments"

export type AppointmentSheetStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"

const STATUS_TO_BADGE: Record<AppointmentSheetStatus, BadgeStatus> = {
  pending: "pendiente",
  confirmed: "confirmada",
  in_progress: "atendiendo",
  completed: "completada",
  cancelled: "cancelada",
  no_show: "no-show",
}

export interface AppointmentSheetAppointment {
  id: string
  clientName: string
  serviceName: string
  barberId: string
  barberName: string
  /** ISO, ya en UTC (timestamptz). */
  startsAt: string
  endsAt: string
  status: AppointmentSheetStatus
  source: string
  priceAtBooking: string | null
  notes: string | null
}

/**
 * F2-07/F2-09 · Sheet de detalle de cita: transiciones de estado y
 * reprogramar/reasignar. El drag-and-drop (D-F2-19) es P1 y no se
 * implementa aqui; este sheet es el unico camino P0, funciona igual en
 * movil y desktop.
 */
function AppointmentSheet({
  open,
  onOpenChange,
  locationId,
  timezone,
  appointment,
  barbers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locationId: string
  timezone: string
  appointment: AppointmentSheetAppointment | null
  barbers: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [showCancelForm, setShowCancelForm] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState("")
  const [showReschedule, setShowReschedule] = React.useState(false)
  // Inicializados una sola vez a partir de `appointment`: el llamador (F2-06/07)
  // monta este componente con `key={appointment.id}`, asi que un cambio de
  // cita fuerza un remount con estado fresco en vez de sincronizarlo por
  // efecto (evita "setState directo dentro de un effect").
  const initial = appointment ? toDatetimeLocalParts(appointment.startsAt, timezone) : { date: "", time: "" }
  const [newDate, setNewDate] = React.useState(initial.date)
  const [newTime, setNewTime] = React.useState(initial.time)
  const [newBarberId, setNewBarberId] = React.useState(appointment?.barberId ?? "")

  if (!appointment) return null

  async function runTransition(action: "confirm" | "start" | "complete" | "no_show" | "cancel") {
    setPending(true)
    setError(null)
    const result = await transitionAppointmentAction({
      locationId,
      appointmentId: appointment!.id,
      action,
      cancellationReason: action === "cancel" ? cancelReason : undefined,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onOpenChange(false)
    router.refresh()
  }

  async function submitReschedule() {
    if (!newDate || !newTime) {
      setError("Elegi fecha y hora.")
      return
    }
    setPending(true)
    setError(null)
    const startsAtISO = fromDatetimeLocalParts(newDate, newTime, timezone)
    const result = await rescheduleAppointmentAction({
      locationId,
      appointmentId: appointment!.id,
      newStartsAt: startsAtISO,
      newBarberId: newBarberId || undefined,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onOpenChange(false)
    router.refresh()
  }

  const isTerminal =
    appointment.status === "completed" ||
    appointment.status === "cancelled" ||
    appointment.status === "no_show"

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={appointment.clientName}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Badge status={STATUS_TO_BADGE[appointment.status]} />
          {appointment.priceAtBooking ? (
            <MoneyDisplay amount={Number(appointment.priceAtBooking)} context="checkout" />
          ) : null}
        </div>

        <dl className="flex flex-col gap-1 text-body-s">
          <div className="flex justify-between">
            <dt className="text-(--text-tertiary)">Servicio</dt>
            <dd className="text-(--text-primary)">{appointment.serviceName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-(--text-tertiary)">Barbero</dt>
            <dd className="text-(--text-primary)">{appointment.barberName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-(--text-tertiary)">Horario</dt>
            <dd className="text-(--text-primary)">
              {formatRange(appointment.startsAt, appointment.endsAt, timezone)}
            </dd>
          </div>
          {appointment.notes ? (
            <div className="flex justify-between gap-4">
              <dt className="text-(--text-tertiary)">Notas</dt>
              <dd className="text-right text-(--text-primary)">{appointment.notes}</dd>
            </div>
          ) : null}
        </dl>

        {error ? <p className="text-body-s text-(--data-neg)">{error}</p> : null}

        {!isTerminal ? (
          <div className="flex flex-col gap-3 border-t border-(--border) pt-4">
            <div className="flex flex-wrap gap-2">
              {appointment.status === "pending" ? (
                <Button size="sm" variant="secondary" loading={pending} onClick={() => runTransition("confirm")}>
                  Confirmar
                </Button>
              ) : null}
              {(appointment.status === "pending" || appointment.status === "confirmed") ? (
                <Button size="sm" loading={pending} onClick={() => runTransition("start")}>
                  Iniciar
                </Button>
              ) : null}
              {appointment.status === "in_progress" ? (
                <Button size="sm" loading={pending} onClick={() => runTransition("complete")}>
                  Completar
                </Button>
              ) : null}
              {(appointment.status === "pending" || appointment.status === "confirmed") ? (
                <Button size="sm" variant="secondary" loading={pending} onClick={() => runTransition("no_show")}>
                  No-show
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowCancelForm((v) => !v)}
              >
                Cancelar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowReschedule((v) => !v)}>
                Reprogramar
              </Button>
            </div>

            {showCancelForm ? (
              <div className="flex flex-col gap-2 rounded-md border border-(--border) p-3">
                <FormField label="Motivo de cancelacion (obligatorio)">
                  <Input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Ej. el cliente llamo a cancelar"
                  />
                </FormField>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={pending}
                  disabled={!cancelReason.trim()}
                  onClick={() => runTransition("cancel")}
                >
                  Confirmar cancelacion
                </Button>
              </div>
            ) : null}

            {showReschedule ? (
              <div className="flex flex-col gap-2 rounded-md border border-(--border) p-3">
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Fecha">
                    <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  </FormField>
                  <FormField label="Hora">
                    <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                  </FormField>
                </div>
                <Select
                  label="Barbero"
                  items={barbers.map((b) => ({ label: b.name, value: b.id }))}
                  value={newBarberId}
                  onValueChange={setNewBarberId}
                />
                <Button size="sm" loading={pending} onClick={submitReschedule}>
                  Guardar cambios
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Sheet>
  )
}

function toDatetimeLocalParts(isoUTC: string, timeZone: string): { date: string; time: string } {
  const d = new Date(isoUTC)
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d)
  return { date, time }
}

/**
 * Convierte fecha+hora "de pared" en la timezone de la sede a un instante
 * UTC. Evita asumir offset fijo: usa el truco de comparar contra la misma
 * fecha formateada en esa tz para calcular el desfase real.
 */
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

function formatRange(startISO: string, endISO: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("es-DO", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
  const fmtEnd = new Intl.DateTimeFormat("es-DO", { timeZone, hour: "numeric", minute: "2-digit" })
  return `${fmt.format(new Date(startISO))} – ${fmtEnd.format(new Date(endISO))}`
}

export { AppointmentSheet }
