"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QueueCard } from "@/components/kortex/queue-card"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * La Fila — (location)/sede/[locationId]/queue (BRAND-BRIEF §4,
 * UX-BRIEF §4.3). Mobile-first, pensada para vivir siempre visible en un
 * tablet fijo del mostrador.
 *
 * TODO(realtime): reemplazar `queueMock`/`setQueue` por una suscripcion a
 * Supabase Realtime sobre la tabla de turnos de esta sede
 * (`location_id` = params.locationId, resuelto por `requireLocationScope`
 * en el layout padre). "Llamar turno" hoy solo actualiza estado local;
 * en produccion debe ser una server action que mueva el turno a
 * "atendiendo" y dispare el evento realtime para todos los clientes
 * conectados (recepcion + tablet de mostrador).
 */

interface QueueEntry {
  id: string
  position: number
  clientName: string
  service: string
  preferredBarber?: string
  state: "esperando" | "llamado" | "atendiendo" | "se-fue"
  estimatedWaitMinutes: number
  elapsedMinutes: number
  isNew?: boolean
}

const queueMock: QueueEntry[] = [
  {
    id: "1",
    position: 1,
    clientName: "Ana Peralta",
    service: "Fade + barba",
    preferredBarber: "Jandy",
    state: "esperando",
    estimatedWaitMinutes: 5,
    elapsedMinutes: 4,
  },
  {
    id: "2",
    position: 2,
    clientName: "Luis Manzueta",
    service: "Corte clasico",
    state: "esperando",
    estimatedWaitMinutes: 15,
    elapsedMinutes: 10,
  },
  {
    id: "3",
    position: 3,
    clientName: "Pedro Reyes",
    service: "Fade",
    state: "esperando",
    estimatedWaitMinutes: 22,
    elapsedMinutes: 25,
    isNew: true,
  },
]

const attendingMock = [
  { barber: "Jandy", client: "Ramon Guzman", time: "2:30–3:00" },
  { barber: "Kelvin", client: null },
]

export default function QueuePage() {
  const [queue, setQueue] = React.useState<QueueEntry[]>(queueMock)

  const waiting = queue.filter((q) => q.state === "esperando")
  const avgWait = waiting.length
    ? Math.round(waiting.reduce((acc, q) => acc + q.estimatedWaitMinutes, 0) / waiting.length)
    : 0

  function handleCall(id: string) {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, state: "llamado" as const } : q)))
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-h1">La Fila — Sede Naco</h1>
        <Button size="md">
          <Plus className="size-4" strokeWidth={1.5} />
          Dar turno
        </Button>
      </header>

      <p className="text-body-s text-(--text-secondary)">
        {waiting.length} esperando · espera prom. {avgWait} min
      </p>

      <div className="flex flex-col gap-3">
        {waiting.length === 0 ? (
          <EmptyState kind="block" message="Todavia no hay nadie en la fila." />
        ) : (
          waiting.map((entry) => (
            <QueueCard
              key={entry.id}
              position={entry.position}
              clientName={entry.clientName}
              service={entry.service}
              preferredBarber={entry.preferredBarber}
              state={entry.state}
              estimatedWaitMinutes={entry.estimatedWaitMinutes}
              elapsedMinutes={entry.elapsedMinutes}
              isNew={entry.isNew}
              onCall={() => handleCall(entry.id)}
            />
          ))
        )}
      </div>

      <section className="mt-2 flex flex-col gap-2 border-t border-(--border) pt-4">
        <p className="text-label text-(--text-tertiary)">Atendiendo ahora</p>
        {attendingMock.map((row) => (
          <p key={row.barber} className="text-body-s text-(--text-secondary)">
            {row.barber} → {row.client ? row.client : "(libre)"}
          </p>
        ))}
      </section>
    </div>
  )
}
