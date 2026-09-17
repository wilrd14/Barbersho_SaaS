import { Badge, type BadgeStatus } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getMyAppointments } from "@/lib/actions/client-appointments";
import { CancelAppointmentButton } from "@/components/kortex/cancel-appointment-button";

/** Fuera del componente: llamar `Date.now()` dentro del render de un Server
 * Component dispara `react-hooks/purity`; se aisla aqui como funcion pura de
 * datos (no es un componente ni un hook). */
function splitByNow(rows: Awaited<ReturnType<typeof getMyAppointments>>) {
  const now = Date.now();
  return {
    upcoming: rows.filter((r) => new Date(r.startsAt).getTime() >= now),
    past: rows.filter((r) => new Date(r.startsAt).getTime() < now),
  };
}

const STATUS_BADGE: Record<string, BadgeStatus> = {
  pending: "pendiente",
  confirmed: "confirmada",
  in_progress: "confirmada",
  completed: "completada",
  cancelled: "cancelada",
  no_show: "no-show",
};

/**
 * F2-14 · `(client)/appointments` — proximas y pasadas, cross-sede (D-F2-14:
 * el historial nunca se oculta). Guard `requireClientScope` dentro de
 * `getMyAppointments`.
 */
export default async function ClientAppointmentsPage() {
  const rows = await getMyAppointments();
  const { upcoming, past } = splitByNow(rows);

  return (
    <div className="flex flex-col gap-8 p-6 sm:p-8">
      <h1 className="text-display-xl text-(--text-primary)">Mis citas</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 text-(--text-primary)">Proximas</h2>
        {upcoming.length === 0 ? (
          <EmptyState kind="block" message="No tenes citas proximas." />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((appt) => (
              <AppointmentRow key={appt.id} appointment={appt} cancellable />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 text-(--text-primary)">Pasadas</h2>
        {past.length === 0 ? (
          <EmptyState kind="block" message="Todavia no tenes citas pasadas." />
        ) : (
          <ul className="flex flex-col gap-2">
            {past.map((appt) => (
              <AppointmentRow key={appt.id} appointment={appt} cancellable={false} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AppointmentRow({
  appointment,
  cancellable,
}: {
  appointment: Awaited<ReturnType<typeof getMyAppointments>>[number];
  cancellable: boolean;
}) {
  const startsAt = new Date(appointment.startsAt);
  const dateLabel = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(startsAt);
  const canCancel = cancellable && (appointment.status === "pending" || appointment.status === "confirmed");

  return (
    <li className="flex flex-col gap-2 rounded-md border border-(--border) p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-body text-(--text-primary)">
          {appointment.serviceName} · {appointment.locationName}
        </p>
        <p className="text-body-s text-(--text-tertiary)">
          {dateLabel} · {appointment.barberName}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge status={STATUS_BADGE[appointment.status] ?? "pendiente"} />
        {canCancel ? (
          <CancelAppointmentButton
            appointmentId={appointment.id}
            cancellationHours={appointment.chainCancellationHours}
          />
        ) : null}
      </div>
    </li>
  );
}
