/**
 * F2-15 · src/lib/queue — posicion y ETA de La Fila, puro.
 *
 * Modulo puro (regla dura §3.10): no importa `db` ni `next/*`. Implementa
 * D-F2-6 (renumeracion FIFO de `walk_in_queue.position`, que es derivado, no
 * autoritativo) y D-F2-7 (formula de espera estimada, congelada).
 */

export type QueueTicketStatus = "waiting" | "called" | "serving" | "done" | "left";

export type QueueTicket = {
  id: string;
  status: QueueTicketStatus;
  joinedAt: Date;
  preferredBarberId: string | null;
  /** Duracion efectiva (minutos) del servicio pedido — ya resuelta (D-F2-1). */
  serviceDurationMinutes: number;
};

/** Un barbero que puede tomar el siguiente turno de la fila ahora mismo. */
export type AvailableBarber = {
  barberId: string;
  /**
   * Si esta atendiendo actualmente, minutos que le faltan para terminar (>=0).
   * `null` si esta libre ahora mismo.
   */
  minutesRemainingCurrentService: number | null;
};

// ---------------------------------------------------------------------------
// D-F2-6 · Renumeracion FIFO
// ---------------------------------------------------------------------------

/**
 * Devuelve el orden FIFO real de la fila: solo los tickets `waiting`,
 * ordenados por `joinedAt` ascendente (empate por `id` para ser determinista).
 * El resultado es la fuente de la renumeracion de `position` (1..n sin huecos).
 */
export function computeFifoOrder(tickets: QueueTicket[]): QueueTicket[] {
  return tickets
    .filter((t) => t.status === "waiting")
    .slice()
    .sort((a, b) => {
      const diff = a.joinedAt.getTime() - b.joinedAt.getTime();
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
}

export type PositionAssignment = { ticketId: string; position: number };

/** `position` 1..n sin huecos para los tickets en espera, en orden FIFO. */
export function renumberQueue(tickets: QueueTicket[]): PositionAssignment[] {
  return computeFifoOrder(tickets).map((ticket, index) => ({
    ticketId: ticket.id,
    position: index + 1,
  }));
}

// ---------------------------------------------------------------------------
// D-F2-7 · ETA (estimated_wait_minutes)
// ---------------------------------------------------------------------------

function countAvailableBarbers(barbers: AvailableBarber[]): number {
  return barbers.length;
}

/**
 * Calcula la espera estimada (minutos) para un ticket dado, segun D-F2-7.
 * `ticket` debe estar en `waiting` (llamar antes de insertarlo/con la fila
 * ya incluyendolo, segun se necesite para la UI).
 */
export function computeEtaMinutes(params: {
  ticket: QueueTicket;
  /** Todos los tickets en `waiting` de la sede, incluido (o no) el propio. */
  waitingTickets: QueueTicket[];
  availableBarbers: AvailableBarber[];
}): number | null {
  const { ticket, waitingTickets, availableBarbers } = params;
  const barbersAvailable = countAvailableBarbers(availableBarbers);
  if (barbersAvailable === 0) return null;

  const fifoOrder = computeFifoOrder(waitingTickets);
  const myIndex = fifoOrder.findIndex((t) => t.id === ticket.id);
  const ahead = myIndex === -1 ? fifoOrder : fifoOrder.slice(0, myIndex);

  if (ticket.preferredBarberId) {
    const aheadForBarber = ahead.filter(
      (t) => t.preferredBarberId === ticket.preferredBarberId,
    );
    const aheadMinutes = aheadForBarber.reduce(
      (sum, t) => sum + t.serviceDurationMinutes,
      0,
    );
    const preferredBarber = availableBarbers.find(
      (b) => b.barberId === ticket.preferredBarberId,
    );
    const inProgressMinutes = preferredBarber?.minutesRemainingCurrentService ?? 0;
    return Math.ceil(aheadMinutes + inProgressMinutes);
  }

  const aheadMinutes = ahead.reduce((sum, t) => sum + t.serviceDurationMinutes, 0);
  const inProgressMinutes = availableBarbers.reduce(
    (sum, b) => sum + (b.minutesRemainingCurrentService ?? 0),
    0,
  );
  return Math.ceil((aheadMinutes + inProgressMinutes) / Math.max(1, barbersAvailable));
}

/** Recalcula el ETA de todos los tickets `waiting` de una sede, en bloque. */
export function recomputeEtasForQueue(params: {
  waitingTickets: QueueTicket[];
  availableBarbers: AvailableBarber[];
}): Map<string, number | null> {
  const { waitingTickets, availableBarbers } = params;
  const result = new Map<string, number | null>();
  for (const ticket of waitingTickets) {
    result.set(
      ticket.id,
      computeEtaMinutes({ ticket, waitingTickets, availableBarbers }),
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Transiciones validas del enum queue_status (F2-16 AC)
// ---------------------------------------------------------------------------

const VALID_QUEUE_TRANSITIONS: Record<QueueTicketStatus, QueueTicketStatus[]> = {
  waiting: ["called", "left"],
  called: ["serving", "left"],
  serving: ["done"],
  done: [],
  left: [],
};

export function isValidQueueTransition(
  from: QueueTicketStatus,
  to: QueueTicketStatus,
): boolean {
  return VALID_QUEUE_TRANSITIONS[from].includes(to);
}
