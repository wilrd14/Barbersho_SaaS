"use client"

import * as React from "react"
import { cn } from "cn"

export interface ScheduleGridAppointment {
  id: string
  barberId: string
  clientName: string
  serviceName: string
  /** ISO (timestamptz). */
  startsAt: string
  endsAt: string
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show"
}

export interface ScheduleGridBarber {
  id: string
  name: string
}

const ROW_MINUTES = 30
const PX_PER_MINUTE = 1.6 // 30 min = 48px
const GRID_START_MINUTES = 8 * 60 // 08:00
const GRID_END_MINUTES = 21 * 60 // 21:00

const STATUS_STYLES: Record<ScheduleGridAppointment["status"], string> = {
  pending: "border-(--border) bg-(--surface-raised) text-(--text-primary)",
  confirmed: "border-(--accent)/40 bg-(--accent)/10 text-(--text-primary)",
  in_progress: "border-(--data-pos)/50 bg-(--data-pos)/15 text-(--text-primary)",
  completed: "border-(--border) bg-(--surface-raised) text-(--text-tertiary) line-through",
  cancelled: "border-(--data-neg)/30 bg-(--data-neg)/5 text-(--text-tertiary) line-through",
  no_show: "border-(--data-neg)/30 bg-(--data-neg)/5 text-(--text-tertiary) line-through",
}

function minutesInTimezone(isoUTC: string, timeZone: string): number {
  const d = new Date(isoUTC)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d)
  const hour = Number(parts.find((p) => p.type === "hour")!.value)
  const minute = Number(parts.find((p) => p.type === "minute")!.value)
  return hour * 60 + minute
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const period = h >= 12 ? "pm" : "am"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")}${period}`
}

/**
 * F2-06 · Rejilla de agenda (dia por barbero). CSS puro (regla dura §3.11):
 * filas de 30 min con pixel-precision para el bloque real (evita snapping
 * visual), columnas = barberos, linea de "ahora", scroll horizontal en
 * movil. Toque en hueco libre -> crear cita; toque en bloque -> sheet de
 * detalle (ambos via callbacks, la logica vive en la pagina).
 */
function ScheduleGrid({
  dateISO,
  timezone,
  barbers,
  appointments,
  now,
  onSlotClick,
  onAppointmentClick,
}: {
  dateISO: string
  timezone: string
  barbers: ScheduleGridBarber[]
  appointments: ScheduleGridAppointment[]
  now: Date
  onSlotClick: (barberId: string, hhmm: string) => void
  onAppointmentClick: (appointmentId: string) => void
}) {
  const totalMinutes = GRID_END_MINUTES - GRID_START_MINUTES
  const totalHeight = totalMinutes * PX_PER_MINUTE
  const rows = Math.ceil(totalMinutes / ROW_MINUTES)

  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now)
  const isToday = todayISO === dateISO
  const nowMinutes = isToday ? minutesInTimezone(now.toISOString(), timezone) : null

  if (barbers.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-(--border) px-6 py-10 text-center text-body-s text-(--text-tertiary)">
        Ningun barbero tiene turno programado este dia en esta sede.
      </p>
    )
  }

  return (
    <div className="w-full overflow-x-auto rounded-md border border-(--border)">
      <div className="flex" style={{ minWidth: 96 + barbers.length * 180 }}>
        {/* Columna de horas */}
        <div className="shrink-0" style={{ width: 96 }}>
          <div className="h-10 border-b border-(--border)" />
          <div className="relative" style={{ height: totalHeight }}>
            {Array.from({ length: rows }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-(--border) px-2 text-body-s text-(--text-tertiary)"
                style={{ top: i * ROW_MINUTES * PX_PER_MINUTE }}
              >
                {formatTime(GRID_START_MINUTES + i * ROW_MINUTES)}
              </div>
            ))}
          </div>
        </div>

        {barbers.map((barber) => {
          const barberAppointments = appointments.filter((a) => a.barberId === barber.id)
          return (
            <div key={barber.id} className="shrink-0 border-l border-(--border)" style={{ width: 180 }}>
              <div className="flex h-10 items-center justify-center border-b border-(--border) px-2 text-body-s font-medium text-(--text-primary)">
                {barber.name}
              </div>
              <div className="relative" style={{ height: totalHeight }}>
                {/* Huecos clickeables de 30 min (debajo de las tarjetas de cita) */}
                {Array.from({ length: rows }).map((_, i) => {
                  const slotStart = GRID_START_MINUTES + i * ROW_MINUTES
                  const occupied = barberAppointments.some((a) => {
                    const s = minutesInTimezone(a.startsAt, timezone)
                    const e = minutesInTimezone(a.endsAt, timezone)
                    return s < slotStart + ROW_MINUTES && e > slotStart
                  })
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={occupied}
                      onClick={() => onSlotClick(barber.id, formatHHMM(slotStart))}
                      aria-label={`Agregar cita ${formatTime(slotStart)}`}
                      className={cn(
                        "absolute left-0 right-0 border-t border-(--border) transition-colors",
                        !occupied && "hover:bg-(--surface-raised)"
                      )}
                      style={{ top: i * ROW_MINUTES * PX_PER_MINUTE, height: ROW_MINUTES * PX_PER_MINUTE }}
                    />
                  )
                })}

                {barberAppointments.map((a) => {
                  const start = minutesInTimezone(a.startsAt, timezone)
                  const end = minutesInTimezone(a.endsAt, timezone)
                  const top = Math.max(0, (start - GRID_START_MINUTES) * PX_PER_MINUTE)
                  const height = Math.max(20, (end - start) * PX_PER_MINUTE)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onAppointmentClick(a.id)}
                      className={cn(
                        "absolute left-0.5 right-0.5 overflow-hidden rounded-sm border px-1.5 py-1 text-left text-body-s shadow-sm",
                        STATUS_STYLES[a.status]
                      )}
                      style={{ top, height }}
                    >
                      <p className="truncate font-medium">{a.clientName}</p>
                      <p className="truncate text-(--text-tertiary)">{a.serviceName}</p>
                    </button>
                  )
                })}

                {nowMinutes !== null && nowMinutes >= GRID_START_MINUTES && nowMinutes <= GRID_END_MINUTES ? (
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t-2 border-(--data-warn)"
                    style={{ top: (nowMinutes - GRID_START_MINUTES) * PX_PER_MINUTE }}
                  />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export { ScheduleGrid }
