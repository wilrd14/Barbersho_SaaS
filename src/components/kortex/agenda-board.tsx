"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ScheduleGrid, type ScheduleGridAppointment, type ScheduleGridBarber } from "@/components/kortex/schedule-grid"
import { AppointmentSheet, type AppointmentSheetAppointment } from "@/components/kortex/appointment-sheet"
import { CreateAppointmentSheet, type CreateAppointmentService } from "@/components/kortex/create-appointment-sheet"

export interface AgendaAppointmentFull extends ScheduleGridAppointment {
  barberName: string
  source: string
  priceAtBooking: string | null
  notes: string | null
}

/**
 * F2-06/F2-07/F2-08 · Orquesta la rejilla + el sheet de detalle + el sheet
 * de crear cita para un dia de una sede. Fetch de datos ocurre en la pagina
 * (Server Component); este componente solo maneja interaccion cliente.
 */
function AgendaBoard({
  locationId,
  timezone,
  dateISO,
  barbers,
  appointments,
  services,
}: {
  locationId: string
  timezone: string
  dateISO: string
  barbers: ScheduleGridBarber[]
  appointments: AgendaAppointmentFull[]
  services: CreateAppointmentService[]
}) {
  const [now] = React.useState(() => new Date())
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createDefaults, setCreateDefaults] = React.useState<{ barberId?: string; time?: string }>({})
  // Cuenta las aperturas del sheet de crear cita: se usa como `key` para que
  // cada apertura remonte el formulario con los defaults correctos en vez de
  // sincronizarlos con un effect (ver nota en create-appointment-sheet.tsx).
  const [createOpenCount, setCreateOpenCount] = React.useState(0)

  const selected = appointments.find((a) => a.id === selectedId) ?? null
  const sheetAppointment: AppointmentSheetAppointment | null = selected
    ? {
        id: selected.id,
        clientName: selected.clientName,
        serviceName: selected.serviceName,
        barberId: selected.barberId,
        barberName: selected.barberName,
        startsAt: selected.startsAt,
        endsAt: selected.endsAt,
        status: selected.status,
        source: selected.source,
        priceAtBooking: selected.priceAtBooking,
        notes: selected.notes,
      }
    : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-label text-(--text-tertiary)">Agenda — {dateISO}</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setCreateDefaults({})
            setCreateOpen(true)
            setCreateOpenCount((c) => c + 1)
          }}
        >
          <Plus className="size-4" strokeWidth={1.5} />
          Agregar cita
        </Button>
      </div>

      {barbers.length === 0 ? (
        <EmptyState
          kind="block"
          message="Ningun barbero tiene horario asignado en esta sede para este dia."
        />
      ) : (
        <ScheduleGrid
          dateISO={dateISO}
          timezone={timezone}
          barbers={barbers}
          appointments={appointments}
          now={now}
          onAppointmentClick={setSelectedId}
          onSlotClick={(barberId, hhmm) => {
            setCreateDefaults({ barberId, time: hhmm })
            setCreateOpen(true)
            setCreateOpenCount((c) => c + 1)
          }}
        />
      )}

      <AppointmentSheet
        key={selectedId ?? "none"}
        open={!!sheetAppointment}
        onOpenChange={(open) => !open && setSelectedId(null)}
        locationId={locationId}
        timezone={timezone}
        appointment={sheetAppointment}
        barbers={barbers}
      />

      <CreateAppointmentSheet
        key={createOpenCount}
        open={createOpen}
        onOpenChange={setCreateOpen}
        locationId={locationId}
        timezone={timezone}
        barbers={barbers}
        services={services}
        defaultBarberId={createDefaults.barberId}
        defaultDate={dateISO}
        defaultTime={createDefaults.time}
      />
    </div>
  )
}

export { AgendaBoard }
