import { describe, expect, it } from "vitest";

import {
  computeEtaMinutes,
  computeFifoOrder,
  isValidQueueTransition,
  recomputeEtasForQueue,
  renumberQueue,
  type AvailableBarber,
  type QueueTicket,
} from "@/lib/queue";

function ticket(overrides: Partial<QueueTicket> & { id: string }): QueueTicket {
  return {
    status: "waiting",
    joinedAt: new Date("2026-09-17T10:00:00Z"),
    preferredBarberId: null,
    serviceDurationMinutes: 30,
    ...overrides,
  };
}

describe("computeFifoOrder / renumberQueue", () => {
  it("fila vacia no produce posiciones", () => {
    expect(renumberQueue([])).toEqual([]);
  });

  it("ordena por joinedAt ascendente y numera 1..n sin huecos", () => {
    const tickets = [
      ticket({ id: "c", joinedAt: new Date("2026-09-17T10:10:00Z") }),
      ticket({ id: "a", joinedAt: new Date("2026-09-17T10:00:00Z") }),
      ticket({ id: "b", joinedAt: new Date("2026-09-17T10:05:00Z") }),
    ];
    expect(renumberQueue(tickets)).toEqual([
      { ticketId: "a", position: 1 },
      { ticketId: "b", position: 2 },
      { ticketId: "c", position: 3 },
    ]);
  });

  it("ignora tickets que no estan en waiting", () => {
    const tickets = [
      ticket({ id: "a", status: "done" }),
      ticket({ id: "b", status: "waiting" }),
      ticket({ id: "c", status: "left" }),
    ];
    expect(renumberQueue(tickets)).toEqual([{ ticketId: "b", position: 1 }]);
  });

  it("un turno que sale de la fila renumera a los siguientes sin huecos", () => {
    const before = [
      ticket({ id: "a", joinedAt: new Date("2026-09-17T10:00:00Z") }),
      ticket({ id: "b", joinedAt: new Date("2026-09-17T10:05:00Z") }),
      ticket({ id: "c", joinedAt: new Date("2026-09-17T10:10:00Z") }),
    ];
    expect(renumberQueue(before).map((p) => p.position)).toEqual([1, 2, 3]);

    const afterBLeaves = before.filter((t) => t.id !== "b");
    expect(renumberQueue(afterBLeaves)).toEqual([
      { ticketId: "a", position: 1 },
      { ticketId: "c", position: 2 },
    ]);
  });

  it("desempata por id cuando joinedAt coincide (determinista)", () => {
    const sameTime = new Date("2026-09-17T10:00:00Z");
    const tickets = [
      ticket({ id: "z", joinedAt: sameTime }),
      ticket({ id: "a", joinedAt: sameTime }),
    ];
    expect(computeFifoOrder(tickets).map((t) => t.id)).toEqual(["a", "z"]);
  });
});

describe("computeEtaMinutes", () => {
  it("0 barberos disponibles -> null (fuera de horario)", () => {
    const t = ticket({ id: "a" });
    expect(
      computeEtaMinutes({ ticket: t, waitingTickets: [t], availableBarbers: [] }),
    ).toBeNull();
  });

  it("3 en espera sin preferencia con 2 barberos", () => {
    const a = ticket({ id: "a", serviceDurationMinutes: 20 });
    const b = ticket({ id: "b", serviceDurationMinutes: 30 });
    const c = ticket({ id: "c", serviceDurationMinutes: 40 });
    const barbers: AvailableBarber[] = [
      { barberId: "b1", minutesRemainingCurrentService: 10 },
      { barberId: "b2", minutesRemainingCurrentService: null },
    ];
    // Para "c": delante estan a(20) + b(30) = 50; + en curso 10 = 60; /2 = 30
    const eta = computeEtaMinutes({
      ticket: c,
      waitingTickets: [a, b, c],
      availableBarbers: barbers,
    });
    expect(eta).toBe(30);
  });

  it("turno con barbero preferido ocupado: solo cuenta lo de ese barbero, divisor 1", () => {
    const a = ticket({
      id: "a",
      serviceDurationMinutes: 20,
      preferredBarberId: "jandy",
    });
    const b = ticket({ id: "b", serviceDurationMinutes: 999 }); // sin preferencia, no debe contar
    const c = ticket({
      id: "c",
      serviceDurationMinutes: 15,
      preferredBarberId: "jandy",
    });
    const barbers: AvailableBarber[] = [
      { barberId: "jandy", minutesRemainingCurrentService: 5 },
      { barberId: "other", minutesRemainingCurrentService: 0 },
    ];
    // Para "c": delante que prefieren a jandy = a(20) + resto de jandy(5) = 25
    const eta = computeEtaMinutes({
      ticket: c,
      waitingTickets: [a, b, c],
      availableBarbers: barbers,
    });
    expect(eta).toBe(25);
  });

  it("barbero preferido sin entrada en availableBarbers cuenta 0 minutos en curso", () => {
    const a = ticket({
      id: "a",
      serviceDurationMinutes: 10,
      preferredBarberId: "jandy",
    });
    const barbers: AvailableBarber[] = [
      { barberId: "other", minutesRemainingCurrentService: 0 },
    ];
    expect(
      computeEtaMinutes({ ticket: a, waitingTickets: [a], availableBarbers: barbers }),
    ).toBe(0);
  });

  it("ticket que no esta en waitingTickets se trata como si estuviera al final", () => {
    const a = ticket({ id: "a", serviceDurationMinutes: 20 });
    const notInList = ticket({ id: "z", serviceDurationMinutes: 10 });
    const barbers: AvailableBarber[] = [{ barberId: "b1", minutesRemainingCurrentService: 0 }];
    expect(
      computeEtaMinutes({
        ticket: notInList,
        waitingTickets: [a],
        availableBarbers: barbers,
      }),
    ).toBe(20);
  });
});

describe("recomputeEtasForQueue", () => {
  it("recalcula el ETA de todos los tickets en waiting a la vez", () => {
    const a = ticket({ id: "a", serviceDurationMinutes: 15 });
    const b = ticket({ id: "b", serviceDurationMinutes: 15 });
    const barbers: AvailableBarber[] = [{ barberId: "b1", minutesRemainingCurrentService: 0 }];
    const etas = recomputeEtasForQueue({ waitingTickets: [a, b], availableBarbers: barbers });
    expect(etas.get("a")).toBe(0);
    expect(etas.get("b")).toBe(15);
  });
});

describe("isValidQueueTransition", () => {
  it("acepta las transiciones validas del enum queue_status", () => {
    expect(isValidQueueTransition("waiting", "called")).toBe(true);
    expect(isValidQueueTransition("called", "serving")).toBe(true);
    expect(isValidQueueTransition("serving", "done")).toBe(true);
    expect(isValidQueueTransition("waiting", "left")).toBe(true);
    expect(isValidQueueTransition("called", "left")).toBe(true);
  });

  it("rechaza transiciones invalidas y estados terminales", () => {
    expect(isValidQueueTransition("waiting", "serving")).toBe(false);
    expect(isValidQueueTransition("waiting", "done")).toBe(false);
    expect(isValidQueueTransition("done", "waiting")).toBe(false);
    expect(isValidQueueTransition("left", "waiting")).toBe(false);
  });
});
