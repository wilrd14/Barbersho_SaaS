import { describe, expect, it } from "vitest";

import {
  clampRange,
  generateSlotStarts,
  getAvailableSlots,
  hasBarberScheduleOverlapAcrossLocations,
  subtractRanges,
  zonedMinutesSinceMidnight,
  type BusinessHoursDay,
} from "@/lib/scheduling";

const TZ = "America/Santo_Domingo"; // UTC-4 todo el año, sin DST.
const DATE = "2026-09-17";
const openAllDay: BusinessHoursDay = { opensAt: "09:00", closesAt: "20:00", closed: false };

// 2026-09-17 09:00 America/Santo_Domingo === 2026-09-17T13:00:00Z
function localTime(hhmm: string, dateISO = DATE): Date {
  const [h, m] = hhmm.split(":").map(Number);
  // UTC = local + 4h (America/Santo_Domingo es UTC-4 sin DST). Se construye
  // con Date.UTC para que el overflow de horas (>=24) avance el dia
  // correctamente en vez de producir una fecha invalida.
  const [y, mo, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 4, m, 0));
}

describe("zonedMinutesSinceMidnight", () => {
  it("convierte un instante del mismo dia local", () => {
    expect(zonedMinutesSinceMidnight(localTime("09:00"), TZ, DATE)).toBe(540);
  });

  it("cruce de medianoche: un instante del dia local siguiente da >= 1440", () => {
    // 2026-09-18T00:30 local == 2026-09-18T04:30Z
    const instant = new Date("2026-09-18T04:30:00Z");
    expect(zonedMinutesSinceMidnight(instant, TZ, DATE)).toBe(24 * 60 + 30);
  });

  it("un instante del dia local anterior da negativo", () => {
    // 2026-09-16T23:30 local == 2026-09-17T03:30Z
    const instant = new Date("2026-09-17T03:30:00Z");
    expect(zonedMinutesSinceMidnight(instant, TZ, DATE)).toBe(-30);
  });
});

describe("clampRange / subtractRanges", () => {
  it("clampRange intersecta correctamente", () => {
    expect(clampRange({ start: 0, end: 100 }, { start: 50, end: 150 })).toEqual({
      start: 50,
      end: 100,
    });
    expect(clampRange({ start: 0, end: 10 }, { start: 20, end: 30 })).toBeNull();
  });

  it("subtractRanges parte un bloque en dos cuando el ocupado esta a mitad", () => {
    const free = [{ start: 540, end: 1200 }]; // 09:00-20:00
    const busy = [{ start: 700, end: 760 }]; // 11:40-12:40
    expect(subtractRanges(free, busy)).toEqual([
      { start: 540, end: 700 },
      { start: 760, end: 1200 },
    ]);
  });

  it("subtractRanges no toca rangos sin solape", () => {
    const free = [{ start: 540, end: 600 }];
    const busy = [{ start: 700, end: 760 }];
    expect(subtractRanges(free, busy)).toEqual(free);
  });
});

describe("generateSlotStarts", () => {
  it("corta en rejilla de 15 minutos y no ofrece slots que no caben", () => {
    const starts = generateSlotStarts({
      ranges: [{ start: 540, end: 600 }], // 09:00-10:00, 60 min
      durationMinutes: 30,
      granularityMinutes: 15,
    });
    // 09:00, 09:15, 09:30 caben (terminan <=10:00); 09:45 no cabe (terminaria 10:15)
    expect(starts).toEqual([540, 555, 570]);
  });

  it("redondea hacia arriba al proximo punto de rejilla si el inicio no cae en el grid", () => {
    const starts = generateSlotStarts({
      ranges: [{ start: 545, end: 600 }],
      durationMinutes: 15,
      granularityMinutes: 15,
    });
    expect(starts[0]).toBe(555);
  });
});

describe("getAvailableSlots", () => {
  const baseParams = {
    date: DATE,
    timezone: TZ,
    businessHoursForDay: openAllDay,
    scheduleBlocks: [{ start: 540, end: 1200 }], // 09:00-20:00
    timeOffRanges: [] as { start: Date; end: Date }[],
    existingAppointments: [] as { start: Date; end: Date }[],
    serviceDurationMinutes: 30,
    now: localTime("00:00"),
    leadTimeMinutes: 30,
    granularityMinutes: 15,
  };

  it("dia sin horario (closed) devuelve vacio", () => {
    const result = getAvailableSlots({
      ...baseParams,
      businessHoursForDay: { opensAt: null, closesAt: null, closed: true },
    });
    expect(result).toEqual([]);
  });

  it("dia sin bloques de schedule para el barbero devuelve vacio", () => {
    const result = getAvailableSlots({ ...baseParams, scheduleBlocks: [] });
    expect(result).toEqual([]);
  });

  it("time_off parcial a mitad del bloque parte la disponibilidad en dos", () => {
    const result = getAvailableSlots({
      ...baseParams,
      timeOffRanges: [{ start: localTime("12:00"), end: localTime("13:00") }],
    });
    expect(result).not.toContain(720); // 12:00 bloqueado
    expect(result).toContain(540); // 09:00 sigue libre
    expect(result).toContain(780); // 13:00 sigue libre
  });

  it("una cita existente parte el bloque en dos", () => {
    const result = getAvailableSlots({
      ...baseParams,
      existingAppointments: [{ start: localTime("10:00"), end: localTime("10:30") }],
    });
    expect(result).not.toContain(600); // 10:00 ocupado
    expect(result).toContain(540); // 09:00 libre
    expect(result).toContain(630); // 10:30 libre
  });

  it("un servicio que no cabe antes del cierre no se ofrece", () => {
    const result = getAvailableSlots({
      ...baseParams,
      businessHoursForDay: { opensAt: "09:00", closesAt: "09:40", closed: false },
      scheduleBlocks: [{ start: 540, end: 580 }],
      serviceDurationMinutes: 45,
      now: localTime("00:00"),
    });
    expect(result).toEqual([]);
  });

  it("el lead time elimina los slots inmediatos", () => {
    // "ahora" son las 09:10; lead time 30 min -> nada reservable antes de 09:40.
    const result = getAvailableSlots({
      ...baseParams,
      now: localTime("09:10"),
      leadTimeMinutes: 30,
    });
    expect(result).not.toContain(540);
    expect(result).not.toContain(555);
    expect(result[0]).toBeGreaterThanOrEqual(9 * 60 + 40);
  });

  it("cruce de medianoche: una cita que termina en el dia local siguiente sigue restando el bloque", () => {
    const result = getAvailableSlots({
      ...baseParams,
      scheduleBlocks: [{ start: 540, end: 1500 }], // 09:00 -> 01:00 del dia siguiente
      businessHoursForDay: { opensAt: "09:00", closesAt: "23:59", closed: false },
      existingAppointments: [
        // cita 23:30 -> 00:30 del dia local siguiente
        { start: localTime("23:30"), end: new Date("2026-09-18T04:30:00Z") },
      ],
    });
    expect(result).not.toContain(1410); // 23:30 ocupado
  });
});

describe("hasBarberScheduleOverlapAcrossLocations", () => {
  it("rechaza un bloque que se solapa con otra sede el mismo dia", () => {
    const result = hasBarberScheduleOverlapAcrossLocations({
      proposed: { locationId: "naco", dayOfWeek: 1, startMinutes: 540, endMinutes: 720 },
      existingBlocks: [
        { locationId: "bella-vista", dayOfWeek: 1, startMinutes: 600, endMinutes: 780 },
      ],
    });
    expect(result).toBe(true);
  });

  it("no rechaza un bloque en la misma sede aunque se solape", () => {
    const result = hasBarberScheduleOverlapAcrossLocations({
      proposed: { locationId: "naco", dayOfWeek: 1, startMinutes: 540, endMinutes: 720 },
      existingBlocks: [{ locationId: "naco", dayOfWeek: 1, startMinutes: 600, endMinutes: 780 }],
    });
    expect(result).toBe(false);
  });

  it("no rechaza si es otro dia de la semana", () => {
    const result = hasBarberScheduleOverlapAcrossLocations({
      proposed: { locationId: "naco", dayOfWeek: 1, startMinutes: 540, endMinutes: 720 },
      existingBlocks: [
        { locationId: "bella-vista", dayOfWeek: 2, startMinutes: 540, endMinutes: 720 },
      ],
    });
    expect(result).toBe(false);
  });

  it("no rechaza si no hay solape de horario aunque sea otra sede y mismo dia", () => {
    const result = hasBarberScheduleOverlapAcrossLocations({
      proposed: { locationId: "naco", dayOfWeek: 1, startMinutes: 540, endMinutes: 600 },
      existingBlocks: [
        { locationId: "bella-vista", dayOfWeek: 1, startMinutes: 600, endMinutes: 700 },
      ],
    });
    expect(result).toBe(false);
  });
});
