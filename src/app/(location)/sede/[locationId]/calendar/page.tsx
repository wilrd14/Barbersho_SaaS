import Link from "next/link"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { zUuid } from "@/lib/validation/id"

import { requireLocationScope } from "@/lib/auth/guards"
import { db } from "@/lib/db/client"
import { locations } from "@/lib/db/schema"
import {
  getBarberDayAppointments,
  getBarberWeekLocations,
  getLocationBarbers,
  resolveDateInTimezone,
} from "@/lib/scheduling/agenda"
import { Badge, type BadgeStatus } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"

const searchParamsSchema = z.object({
  barberId: zUuid.optional(),
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

const STATUS_TO_BADGE: Record<string, BadgeStatus> = {
  pending: "pendiente",
  confirmed: "confirmada",
  in_progress: "atendiendo",
  completed: "completada",
  cancelled: "cancelada",
  no_show: "no-show",
}

function mondayOf(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const day = date.getUTCDay() // 0=domingo
  const diff = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().slice(0, 10)
}

function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * F2-06 (segunda mitad) · Vista semana filtrada por un barbero: en que sede
 * esta cada dia (PRD §5.2). El drag-and-drop es P1 (D-F2-19) y no se
 * implementa; reprogramar se hace desde el sheet en /today.
 */
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locationId } = await params
  await requireLocationScope(locationId)

  const rawSearchParams = await searchParams
  const parsedParams = searchParamsSchema.safeParse({
    barberId: typeof rawSearchParams.barberId === "string" ? rawSearchParams.barberId : undefined,
    week: typeof rawSearchParams.week === "string" ? rawSearchParams.week : undefined,
  })
  const { barberId, week } = parsedParams.success ? parsedParams.data : {}

  const [locationRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1)
  const timezone = locationRow?.timezone ?? "America/Santo_Domingo"
  const todayISO = resolveDateInTimezone(new Date(), timezone)

  const barbers = await getLocationBarbers(locationId)

  if (!barberId) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
        <h1 className="text-h1">Semana por barbero</h1>
        <p className="text-body-s text-(--text-tertiary)">
          Elegi un barbero para ver su semana y en que sede esta cada dia (PRD §5.2).
        </p>
        <div className="flex flex-col gap-2">
          {barbers.map((b) => (
            <Link
              key={b.id}
              href={`/sede/${locationId}/calendar?barberId=${b.id}`}
              className="rounded-md border border-(--border) px-4 py-3 text-body hover:bg-(--surface-raised)"
            >
              {b.name}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  const barber = barbers.find((b) => b.id === barberId)
  const weekStart = mondayOf(week ?? todayISO)
  const weekEnd = addDays(weekStart, 6)
  const days = await getBarberWeekLocations(barberId, weekStart, weekEnd)

  const dayAppointments = await Promise.all(
    days.map(async (day) => {
      if (!day.locationId) return { ...day, appointments: [] }
      const appts = await getBarberDayAppointments(barberId, day.locationId, day.date)
      return { ...day, appointments: appts }
    }),
  )

  const prevWeek = addDays(weekStart, -7)
  const nextWeek = addDays(weekStart, 7)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">{barber?.name ?? "Barbero"} — semana</h1>
          <p className="text-body-s text-(--text-tertiary)">
            {weekStart} a {weekEnd}
          </p>
        </div>
        <Link
          href={`/sede/${locationId}/calendar`}
          className="text-body-s text-(--text-secondary) hover:text-(--text-primary)"
        >
          Cambiar barbero
        </Link>
      </header>

      <div className="flex gap-2">
        <Link
          href={`/sede/${locationId}/calendar?barberId=${barberId}&week=${prevWeek}`}
          className="rounded-md border border-(--border) px-3 py-1.5 text-body-s hover:bg-(--surface-raised)"
        >
          ← Semana anterior
        </Link>
        <Link
          href={`/sede/${locationId}/calendar?barberId=${barberId}&week=${nextWeek}`}
          className="rounded-md border border-(--border) px-3 py-1.5 text-body-s hover:bg-(--surface-raised)"
        >
          Semana siguiente →
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {dayAppointments.map((day) => (
          <div key={day.date} className="rounded-md border border-(--border) p-4">
            <div className="flex items-center justify-between">
              <p className="text-body font-medium text-(--text-primary)">
                {formatDayLabel(day.date)}
                {day.date === todayISO ? " · hoy" : ""}
              </p>
              <p className="text-body-s text-(--text-tertiary)">
                {day.locationName ?? "Sin turno esta sede"}
              </p>
            </div>
            {day.appointments.length === 0 ? (
              <EmptyState kind="block" message="Sin citas este dia." />
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {day.appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-body-s">
                    <span>
                      {formatTime(a.startsAt, timezone)}–{formatTime(a.endsAt, timezone)} ·{" "}
                      {a.clientName} · {a.serviceName}
                    </span>
                    <Badge status={STATUS_TO_BADGE[a.status] ?? "pendiente"} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDayLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number)
  return new Intl.DateTimeFormat("es-DO", { weekday: "long", day: "2-digit", month: "short" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  )
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-DO", { timeZone, hour: "numeric", minute: "2-digit" }).format(date)
}
