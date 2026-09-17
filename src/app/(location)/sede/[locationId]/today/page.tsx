import { requireLocationScope } from "@/lib/auth/guards"
import { AttendingNowSection } from "@/components/kortex/attending-now"
import { QueueLiveBadge } from "@/components/kortex/queue-live-badge"

/**
 * F2-18 · "Atendiendo ahora" + badge en vivo de La Fila. El resto de "El
 * Día" (KPIs, tabs Agenda/La Fila, acciones rapidas — F2-05/06/07/08/09) es
 * Bloque B, construido en paralelo en otro worktree; este cambio se limita
 * deliberadamente a los dos componentes aislados de abajo para minimizar
 * el conflicto de merge.
 */
interface TodayPageProps {
  params: Promise<{ locationId: string }>
}

export default async function Page({ params }: TodayPageProps) {
  const { locationId: rawLocationId } = await params
  const { locationId } = await requireLocationScope(rawLocationId)

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">today</h1>
      <p className="text-muted-foreground">Placeholder Sprint 1 — sin UI de negocio todavia.</p>

      <div className="mt-6 flex flex-col gap-4">
        <QueueLiveBadge locationId={locationId} />
        <AttendingNowSection locationId={locationId} />
      </div>
    </div>
  )
}
