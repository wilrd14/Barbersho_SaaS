import Link from "next/link"
import { eq } from "drizzle-orm"

import { requireLocationScope } from "@/lib/auth/guards"
import { db } from "@/lib/db/client"
import { locations } from "@/lib/db/schema"
import {
  getLocationActiveServices,
  getLocationDayAgenda,
  getLocationDayKpis,
  resolveDateInTimezone,
} from "@/lib/scheduling/agenda"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { AgendaBoard } from "@/components/kortex/agenda-board"
import { AttendingNowSection } from "@/components/kortex/attending-now"
import { QueueLiveBadge } from "@/components/kortex/queue-live-badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"

/**
 * F2-05 · "El Dia" — shell de la sede (UX-BRIEF §4.2). KPI compacto +
 * tab "Agenda" (esta pagina) / "La Fila" (navega a /queue, ya construida
 * por otro flujo de trabajo — no se duplica aqui) + acciones rapidas fijas
 * en el tercio inferior en movil. El badge en vivo de la fila (F2-18) y la
 * seccion "Atendiendo ahora" vienen de otro flujo de trabajo en paralelo.
 */
export default async function TodayPage({
  params,
}: {
  params: Promise<{ locationId: string }>
}) {
  const { locationId } = await params
  const scope = await requireLocationScope(locationId)

  const [locationRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1)

  const timezone = locationRow?.timezone ?? "America/Santo_Domingo"
  const now = new Date()
  const todayISO = resolveDateInTimezone(now, timezone)

  const [agenda, kpis, services] = await Promise.all([
    getLocationDayAgenda(locationId, todayISO),
    getLocationDayKpis(locationId, todayISO, now),
    getLocationActiveServices(locationId),
  ])

  if (!agenda) {
    return (
      <div className="p-8">
        <p className="text-body text-(--text-secondary)">Sede no encontrada.</p>
      </div>
    )
  }

  const nowLabel = new Intl.DateTimeFormat("es-DO", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now)

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-4 p-4 pb-28">
      <header>
        <h1 className="text-h1">El Dia — {agenda.location.name}</h1>
        <p className="text-body-s text-(--text-tertiary)">ambito: {scope.effectiveRole}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 rounded-md border border-(--border) p-4 sm:grid-cols-3">
        <div>
          <p className="text-label text-(--text-tertiary)">Ingreso de hoy</p>
          <MoneyDisplay amount={kpis.revenueToday} size="num-l" align="left" />
        </div>
        <div>
          <p className="text-label text-(--text-tertiary)">Servicios completados</p>
          <p className="text-num-l text-(--text-primary)">{kpis.servicesCompletedToday}</p>
        </div>
        <div>
          <p className="text-label text-(--text-tertiary)">Sillas ocupadas ahora</p>
          <p className="text-num-l text-(--text-primary)">
            {kpis.chairsOccupiedNow} de {kpis.chairsCount}
          </p>
        </div>
      </section>

      <nav className="flex gap-2 border-b border-(--border)">
        <span className="border-b-2 border-(--accent) px-3 py-2 text-body-s font-medium text-(--text-primary)">
          Agenda
        </span>
        <Link
          href={`/sede/${locationId}/queue`}
          className="flex items-center gap-2 px-3 py-2 text-body-s text-(--text-secondary) hover:text-(--text-primary)"
        >
          La Fila
          <QueueLiveBadge locationId={locationId} />
        </Link>
      </nav>

      <p className="text-body-s text-(--text-tertiary)">Ahora: {nowLabel}</p>

      <AttendingNowSection locationId={locationId} />

      <AgendaBoard
        locationId={locationId}
        timezone={timezone}
        dateISO={todayISO}
        barbers={agenda.barbers}
        appointments={agenda.appointments.map((a) => ({
          id: a.id,
          barberId: a.barberId,
          barberName: agenda.barbers.find((b) => b.id === a.barberId)?.name ?? "Barbero",
          clientName: a.clientName,
          serviceName: a.serviceName,
          startsAt: a.startsAt.toISOString(),
          endsAt: a.endsAt.toISOString(),
          status: a.status,
          source: a.source,
          priceAtBooking: a.priceAtBooking,
          notes: a.notes,
        }))}
        services={services}
      />

      {/* Acciones rapidas fijas en el tercio inferior en movil (UX-BRIEF §4.2). */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-(--border) bg-(--surface-card) p-4 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0">
        <Link
          href={`/sede/${locationId}/queue`}
          className={cn(buttonVariants({ variant: "secondary", size: "xl" }), "flex-1")}
        >
          Dar turno
        </Link>
        <Link
          href={`/sede/${locationId}/checkout`}
          className={cn(buttonVariants({ variant: "primary", size: "xl" }), "flex-1")}
        >
          Cobrar
        </Link>
      </div>
    </div>
  )
}
