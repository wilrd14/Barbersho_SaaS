"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
  callTicket,
  getQueueIntakeOptionsAction,
  getQueueSnapshotAction,
  joinQueue,
  markLeft,
  startServing,
  type QueueDisplayTicket,
  type QueueSnapshot,
} from "@/lib/actions/queue"
import { Button } from "@/components/ui/button"
import { QueueCard, type QueueCardProps } from "@/components/kortex/queue-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Sheet } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { FormField } from "@/components/ui/field"

/**
 * F2-17 · Conecta La Fila a Supabase Realtime.
 *
 * Estrategia deliberadamente simple (documentada en el handback): en vez de
 * aplicar el payload crudo de `postgres_changes` sobre el estado local (que
 * no trae nombres de cliente/servicio/barbero, solo columnas de
 * `walk_in_queue`), cualquier evento dispara un refetch completo del
 * snapshot via `getQueueSnapshotAction` (debounced). Esto tambien cubre el
 * riesgo D del backlog ("refetch completo al reconectar") de forma trivial:
 * toda reconexion dispara al menos un evento o un cambio de estado del
 * canal, y ambos casos refetchean. Aceptable para el tamano tipico de una
 * fila de barberia (unos pocos turnos a la vez).
 */

const STATE_LABEL: Record<QueueDisplayTicket["status"], QueueCardProps["state"]> = {
  waiting: "esperando",
  called: "llamado",
  serving: "atendiendo",
}

function useNowTick(intervalMs: number) {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}

function elapsedMinutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
}

interface QueueRealtimeListProps {
  locationId: string
  locationName: string
  initialSnapshot: QueueSnapshot
}

export function QueueRealtimeList({ locationId, locationName, initialSnapshot }: QueueRealtimeListProps) {
  const [snapshot, setSnapshot] = React.useState<QueueSnapshot>(initialSnapshot)
  const [error, setError] = React.useState<string | null>(null)
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set())
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const wasConnected = React.useRef(false)

  useNowTick(30_000)

  const refetch = React.useCallback(async () => {
    const result = await getQueueSnapshotAction({ locationId })
    if (result.ok) {
      setSnapshot(result.data)
    }
  }, [locationId])

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void refetch()
      }, 150)
    }

    const channel = supabase
      .channel(`walk-in-queue:${locationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "walk_in_queue",
          filter: `location_id=eq.${locationId}`,
        },
        () => scheduleRefetch(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Reconexion (no la primera conexion): refetch completo por
          // consistencia (riesgo D — el internet del local se cae).
          if (wasConnected.current) scheduleRefetch()
          wasConnected.current = true
        }
        if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          wasConnected.current = false
        }
      })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [locationId, refetch])

  const waiting = snapshot.waiting
  const called = snapshot.called
  const avgWait = waiting.length
    ? Math.round(
        waiting.reduce((acc, q) => acc + (q.estimatedWaitMinutes ?? 0), 0) / waiting.length,
      )
    : 0

  async function withPending(ticketId: string, run: () => Promise<{ ok: boolean; error?: string }>) {
    setPendingIds((prev) => new Set(prev).add(ticketId))
    setError(null)
    try {
      const result = await run()
      if (!result.ok) setError(result.error ?? "No se pudo completar la accion.")
      else await refetch()
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(ticketId)
        return next
      })
    }
  }

  const visibleTickets = [...waiting, ...called].sort((a, b) =>
    a.joinedAt.localeCompare(b.joinedAt),
  )

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-h1">La Fila — {locationName}</h1>
        <Button size="md" onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" strokeWidth={1.5} />
          Dar turno
        </Button>
      </header>

      <p className="text-body-s text-(--text-secondary)">
        {waiting.length} esperando · espera prom. {avgWait} min
      </p>

      {error ? (
        <p role="alert" className="rounded-md border border-(--data-neg)/30 bg-(--data-neg)/10 p-2 text-body-s text-(--data-neg)">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {visibleTickets.length === 0 ? (
          <EmptyState kind="block" message="Todavia no hay nadie en la fila." />
        ) : (
          visibleTickets.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-2">
              <QueueCard
                position={entry.position ?? 0}
                clientName={entry.clientName}
                service={entry.serviceName}
                preferredBarber={entry.preferredBarberName ?? undefined}
                state={STATE_LABEL[entry.status]}
                estimatedWaitMinutes={entry.estimatedWaitMinutes ?? 0}
                elapsedMinutes={elapsedMinutesSince(entry.joinedAt)}
                onCall={
                  entry.status === "waiting"
                    ? () => withPending(entry.id, () => callTicket({ ticketId: entry.id }))
                    : undefined
                }
              />
              {entry.status === "called" ? (
                <div className="flex gap-2 pl-11">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={pendingIds.has(entry.id)}
                    onClick={() =>
                      withPending(entry.id, () =>
                        startServing({ ticketId: entry.id, barberId: undefined }),
                      )
                    }
                  >
                    Empezar a atender
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pendingIds.has(entry.id)}
                    onClick={() => withPending(entry.id, () => markLeft({ ticketId: entry.id }))}
                  >
                    Se fue
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <section className="mt-2 flex flex-col gap-2 border-t border-(--border) pt-4">
        <p className="text-label text-(--text-tertiary)">Atendiendo ahora</p>
        {snapshot.activeBarbers.map((barber) => {
          const serving = snapshot.serving.find((s) => s.preferredBarberId === barber.id)
          return (
            <p key={barber.id} className="text-body-s text-(--text-secondary)">
              {barber.fullName} → {serving ? serving.clientName : "(libre)"}
            </p>
          )
        })}
      </section>

      <QueueIntakeSheet
        locationId={locationId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCreated={() => void refetch()}
      />
    </div>
  )
}

function QueueIntakeSheet({
  locationId,
  open,
  onOpenChange,
  onCreated,
}: {
  locationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [options, setOptions] = React.useState<{ services: { id: string; name: string }[]; barbers: { id: string; fullName: string }[] } | null>(null)
  const [clientNameTemp, setClientNameTemp] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [serviceId, setServiceId] = React.useState("")
  const [preferredBarberId, setPreferredBarberId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    void getQueueIntakeOptionsAction({ locationId }).then((result) => {
      if (result.ok) setOptions(result.data)
    })
  }, [open, locationId])

  function reset() {
    setClientNameTemp("")
    setPhone("")
    setServiceId("")
    setPreferredBarberId("")
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!clientNameTemp.trim() || !serviceId) {
      setFormError("Nombre y servicio son obligatorios.")
      return
    }
    setSubmitting(true)
    try {
      const result = await joinQueue({
        locationId,
        serviceId,
        preferredBarberId: preferredBarberId || undefined,
        clientNameTemp: clientNameTemp.trim(),
        phone: phone.trim() || undefined,
      })
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      reset()
      onOpenChange(false)
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Dar turno">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <FormField label="Nombre del cliente">
          <Input
            value={clientNameTemp}
            onChange={(e) => setClientNameTemp(e.target.value)}
            placeholder="Ej. Ana Peralta"
            required
          />
        </FormField>
        <FormField label="Telefono (opcional)">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="809-000-0000" />
        </FormField>
        <Select
          label="Servicio"
          items={(options?.services ?? []).map((s) => ({ label: s.name, value: s.id }))}
          value={serviceId}
          onValueChange={setServiceId}
          placeholder="Selecciona un servicio"
        />
        <Select
          label="Barbero preferido (opcional)"
          items={(options?.barbers ?? []).map((b) => ({ label: b.fullName, value: b.id }))}
          value={preferredBarberId}
          onValueChange={setPreferredBarberId}
          placeholder="Sin preferencia"
        />
        {formError ? (
          <p role="alert" className="text-body-s text-(--data-neg)">
            {formError}
          </p>
        ) : null}
        <Button type="submit" size="lg" loading={submitting} loadingText="Agregando…">
          Agregar a la fila
        </Button>
      </form>
    </Sheet>
  )
}
