import { loadAttendingNow } from "@/lib/actions/queue"

/**
 * F2-18 · "Atendiendo ahora" en El Día — componente aislado, pensado para
 * importarse dentro de `today/page.tsx` sin tocar el resto de esa pantalla
 * (que otro agente construye en paralelo en su propio worktree, ver
 * BACKLOG-F2.md Bloque B). Server Component: no necesita Realtime propio,
 * ya vive dentro de la misma pagina que se re-renderiza en cada navegacion;
 * la actualizacion "sin recargar" al llamar un turno la cubre
 * `QueueRealtimeList` en la pantalla de La Fila, que es la que dispara la
 * transicion de estado.
 */
export async function AttendingNowSection({ locationId }: { locationId: string }) {
  const entries = await loadAttendingNow(locationId)

  function formatRange(startsAt: string | null, endsAt: string | null, timezone: string) {
    if (!startsAt || !endsAt) return null
    const fmt = new Intl.DateTimeFormat("es-DO", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    })
    return `${fmt.format(new Date(startsAt))}–${fmt.format(new Date(endsAt))}`
  }

  // La zona horaria de la sede no viaja en este componente para mantenerlo
  // aislado (sin query extra a `locations`); se usa la del navegador del
  // servidor (America/Santo_Domingo es la unica zona del PRD por ahora).
  const timezone = "America/Santo_Domingo"

  return (
    <section className="flex flex-col gap-2 border-t border-(--border) pt-4">
      <p className="text-label text-(--text-tertiary)">Atendiendo ahora</p>
      {entries.length === 0 ? (
        <p className="text-body-s text-(--text-tertiary)">Sin barberos activos ahora mismo.</p>
      ) : (
        entries.map((entry) => {
          const range = formatRange(entry.startsAt, entry.endsAt, timezone)
          return (
            <p key={entry.barberId} className="text-body-s text-(--text-secondary)">
              {entry.barberName} → {entry.clientName ? entry.clientName : "(libre)"}
              {entry.serviceName ? ` · ${entry.serviceName}` : ""}
              {range ? ` · ${range}` : ""}
            </p>
          )
        })
      )}
    </section>
  )
}
