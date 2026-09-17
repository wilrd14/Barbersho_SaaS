/**
 * F2-07 · Maquina de estados de `appointments.status`, pura (sin `db` ni
 * `next/*`, igual que el resto de `lib/scheduling`).
 *
 * Enum real (enums.ts): pending | confirmed | in_progress | completed |
 * cancelled | no_show. `completed`, `cancelled` y `no_show` son terminales:
 * ninguna accion los mueve de ahi.
 */

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type AppointmentTransitionAction =
  | "confirm"
  | "start"
  | "complete"
  | "no_show"
  | "cancel";

/**
 * Por accion, el conjunto de estados de origen validos y el estado destino.
 * "start" acepta pending o confirmed: en consola una cita puede pasarse a
 * en curso sin el paso intermedio de "confirmar" (p.ej. reservada por
 * telefono y el barbero ya esta listo).
 */
const TRANSITIONS: Record<
  AppointmentTransitionAction,
  { from: AppointmentStatus[]; to: AppointmentStatus }
> = {
  confirm: { from: ["pending"], to: "confirmed" },
  start: { from: ["pending", "confirmed"], to: "in_progress" },
  complete: { from: ["in_progress"], to: "completed" },
  no_show: { from: ["pending", "confirmed"], to: "no_show" },
  cancel: { from: ["pending", "confirmed", "in_progress"], to: "cancelled" },
};

/**
 * Devuelve el estado destino si la transicion es valida desde `current`, o
 * `null` si no lo es (estado terminal, o salto no permitido). El llamador
 * decide como comunicar el `null` (mensaje en espanol legible).
 */
export function resolveAppointmentTransition(
  current: AppointmentStatus,
  action: AppointmentTransitionAction,
): AppointmentStatus | null {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(current)) return null;
  return rule.to;
}

export function isTerminalAppointmentStatus(status: AppointmentStatus): boolean {
  return status === "completed" || status === "cancelled" || status === "no_show";
}
