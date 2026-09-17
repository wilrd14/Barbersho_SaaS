import { eq } from "drizzle-orm"

import { requireLocationScope } from "@/lib/auth/guards"
import { db } from "@/lib/db/client"
import { locations } from "@/lib/db/schema"
import { loadQueueSnapshot } from "@/lib/actions/queue"
import { QueueRealtimeList } from "@/components/kortex/queue-realtime-list"

/**
 * La Fila — (location)/sede/[locationId]/queue (F2-17). Carga inicial en el
 * Server Component (guard ya aplicado en el layout padre, se re-verifica
 * aqui via `requireLocationScope` antes de leer nada, regla dura §3.1); el
 * resto (Realtime, acciones) vive en `QueueRealtimeList` ("use client").
 */
interface QueuePageProps {
  params: Promise<{ locationId: string }>
}

export default async function QueuePage({ params }: QueuePageProps) {
  const { locationId: rawLocationId } = await params
  const { locationId } = await requireLocationScope(rawLocationId)

  const [location, snapshot] = await Promise.all([
    db.select({ name: locations.name }).from(locations).where(eq(locations.id, locationId)).limit(1),
    loadQueueSnapshot(locationId),
  ])

  return (
    <QueueRealtimeList
      locationId={locationId}
      locationName={location[0]?.name ?? "Sede"}
      initialSnapshot={snapshot}
    />
  )
}
