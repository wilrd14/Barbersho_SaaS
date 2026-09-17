import { describe, expect, it } from "vitest";

import {
  isTerminalAppointmentStatus,
  resolveAppointmentTransition,
  type AppointmentStatus,
} from "@/lib/scheduling/appointment-state";

describe("resolveAppointmentTransition", () => {
  it("pending -> confirmed via confirm", () => {
    expect(resolveAppointmentTransition("pending", "confirm")).toBe("confirmed");
  });

  it("pending -> in_progress via start (salta confirmar)", () => {
    expect(resolveAppointmentTransition("pending", "start")).toBe("in_progress");
  });

  it("confirmed -> in_progress via start", () => {
    expect(resolveAppointmentTransition("confirmed", "start")).toBe("in_progress");
  });

  it("in_progress -> completed via complete", () => {
    expect(resolveAppointmentTransition("in_progress", "complete")).toBe("completed");
  });

  it("pending/confirmed -> no_show via no_show", () => {
    expect(resolveAppointmentTransition("pending", "no_show")).toBe("no_show");
    expect(resolveAppointmentTransition("confirmed", "no_show")).toBe("no_show");
  });

  it("pending/confirmed/in_progress -> cancelled via cancel", () => {
    expect(resolveAppointmentTransition("pending", "cancel")).toBe("cancelled");
    expect(resolveAppointmentTransition("confirmed", "cancel")).toBe("cancelled");
    expect(resolveAppointmentTransition("in_progress", "cancel")).toBe("cancelled");
  });

  it("no permite completar una cita cancelada", () => {
    expect(resolveAppointmentTransition("cancelled", "complete")).toBeNull();
  });

  it("no permite ninguna transicion desde un estado terminal", () => {
    const terminal: AppointmentStatus[] = ["completed", "cancelled", "no_show"];
    const actions = ["confirm", "start", "complete", "no_show", "cancel"] as const;
    for (const status of terminal) {
      for (const action of actions) {
        expect(resolveAppointmentTransition(status, action)).toBeNull();
      }
    }
  });

  it("no permite completar directo desde pending o confirmed (falta iniciar)", () => {
    expect(resolveAppointmentTransition("pending", "complete")).toBeNull();
    expect(resolveAppointmentTransition("confirmed", "complete")).toBeNull();
  });

  it("no permite no_show desde in_progress", () => {
    expect(resolveAppointmentTransition("in_progress", "no_show")).toBeNull();
  });
});

describe("isTerminalAppointmentStatus", () => {
  it("marca completed/cancelled/no_show como terminales", () => {
    expect(isTerminalAppointmentStatus("completed")).toBe(true);
    expect(isTerminalAppointmentStatus("cancelled")).toBe(true);
    expect(isTerminalAppointmentStatus("no_show")).toBe(true);
  });

  it("no marca pending/confirmed/in_progress como terminales", () => {
    expect(isTerminalAppointmentStatus("pending")).toBe(false);
    expect(isTerminalAppointmentStatus("confirmed")).toBe(false);
    expect(isTerminalAppointmentStatus("in_progress")).toBe(false);
  });
});
