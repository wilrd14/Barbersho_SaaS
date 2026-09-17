"use client"

import * as React from "react"
import { cn } from "cn"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { getQueueSnapshotAction } from "@/lib/actions/queue"

/**
 * F2-18 · Badge de conteo en vivo de La Fila, para el tab "La Fila" de El
 * Día. Aislado del resto de "El Día" (importable sin tocar el resto de esa
 * pantalla, ver nota en `attending-now.tsx`). Misma estrategia de Realtime
 * que `QueueRealtimeList` (F2-17): cualquier evento o reconexion dispara un
 * refetch completo del snapshot.
 */
export function QueueLiveBadge({ locationId }: { locationId: string }) {
  const [state, setState] = React.useState<{ waitingCount: number; isOverdue: boolean }>({
    waitingCount: 0,
    isOverdue: false,
  })
  const wasConnected = React.useRef(false)

  const refetch = React.useCallback(async () => {
    const result = await getQueueSnapshotAction({ locationId })
    if (!result.ok) return
    const { waiting, called } = result.data
    const isOverdue = waiting.some((t) => {
      const elapsedMinutes = (Date.now() - new Date(t.joinedAt).getTime()) / 60_000
      return t.estimatedWaitMinutes !== null && elapsedMinutes > t.estimatedWaitMinutes
    })
    setState({ waitingCount: waiting.length + called.length, isOverdue })
  }, [locationId])

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => void refetch(), 150)
    }

    const channel = supabase
      .channel(`walk-in-queue-badge:${locationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "walk_in_queue", filter: `location_id=eq.${locationId}` },
        () => scheduleRefetch(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Cubre tanto la carga inicial como cualquier reconexion
          // (riesgo D del backlog): siempre refetch completo al conectar.
          scheduleRefetch()
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

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-body-s font-medium",
        state.isOverdue
          ? "border-(--data-warn)/30 bg-(--data-warn)/10 text-(--data-warn)"
          : "border-(--border) bg-(--surface-raised) text-(--text-secondary)",
      )}
    >
      La Fila ({state.waitingCount})
    </span>
  )
}
