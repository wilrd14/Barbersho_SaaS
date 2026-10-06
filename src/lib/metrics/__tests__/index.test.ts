import { describe, expect, it } from "vitest";
import {
  aggregateChain,
  aggregateLocation,
  deltaBps,
  flagsDeviation,
  previousRange,
  rankLocations,
  utilizationBps,
  type DailyMetricsRow,
  type LocationInfo,
} from "../index";

function row(over: Partial<DailyMetricsRow> & { locationId: string; date: string }): DailyMetricsRow {
  return {
    revenueCents: 0,
    servicesCount: 0,
    salesCount: 0,
    newClients: 0,
    uniqueClients: 0,
    noShows: 0,
    terminalAppointments: 0,
    utilizationBps: null,
    barberHoursX100: 0,
    ...over,
  };
}

const NACO: LocationInfo = { id: "naco", name: "Naco", chairsCount: 6 };
const SC: LocationInfo = { id: "sc", name: "San Cristobal", chairsCount: 2 };

describe("previousRange", () => {
  it("hoy -> ayer", () => {
    expect(previousRange({ startsOn: "2026-09-18", endsOn: "2026-09-18" })).toEqual({
      startsOn: "2026-09-17",
      endsOn: "2026-09-17",
    });
  });
  it("7 dias -> los 7 previos", () => {
    expect(previousRange({ startsOn: "2026-09-12", endsOn: "2026-09-18" })).toEqual({
      startsOn: "2026-09-05",
      endsOn: "2026-09-11",
    });
  });
  it("cruza mes y anio, y respeta bisiesto", () => {
    expect(previousRange({ startsOn: "2026-01-01", endsOn: "2026-01-12" })).toEqual({
      startsOn: "2025-12-20",
      endsOn: "2025-12-31",
    });
    expect(previousRange({ startsOn: "2024-03-01", endsOn: "2024-03-01" })).toEqual({
      startsOn: "2024-02-29",
      endsOn: "2024-02-29",
    });
    expect(previousRange({ startsOn: "2026-03-01", endsOn: "2026-03-01" })?.startsOn).toBe("2026-02-28");
    expect(previousRange({ startsOn: "2000-03-01", endsOn: "2000-03-01" })?.startsOn).toBe("2000-02-29");
    expect(previousRange({ startsOn: "2100-03-01", endsOn: "2100-03-01" })?.startsOn).toBe("2100-02-28");
  });
  it("meses de 30 y 31 dias", () => {
    expect(previousRange({ startsOn: "2026-05-01", endsOn: "2026-05-01" })?.startsOn).toBe("2026-04-30");
    expect(previousRange({ startsOn: "2026-04-01", endsOn: "2026-04-01" })?.startsOn).toBe("2026-03-31");
  });
  it("rangos invalidos -> null", () => {
    expect(previousRange({ startsOn: "basura", endsOn: "2026-09-18" })).toBeNull();
    expect(previousRange({ startsOn: "2026-09-18", endsOn: "2026-13-01" })).toBeNull();
    expect(previousRange({ startsOn: "2026-02-30", endsOn: "2026-03-01" })).toBeNull();
    expect(previousRange({ startsOn: "2026-09-18", endsOn: "2026-09-17" })).toBeNull();
  });
});

describe("utilizationBps", () => {
  it("calcula minutos / (sillas x apertura)", () => {
    expect(utilizationBps(3240, 6, 660)).toEqual({ bps: 8182, anomalous: false });
  });
  it("topa a 100% y marca anomalo", () => {
    expect(utilizationBps(5000, 2, 660)).toEqual({ bps: 10000, anomalous: true });
  });
  it("exactamente 100% no es anomalo", () => {
    expect(utilizationBps(1320, 2, 660)).toEqual({ bps: 10000, anomalous: false });
  });
  it("capacidad 0 -> null", () => {
    expect(utilizationBps(100, 0, 660)).toBeNull();
    expect(utilizationBps(100, 3, 0)).toBeNull();
  });
});

describe("deltaBps", () => {
  it("periodo anterior en 0 -> null (nunca division por cero)", () => {
    expect(deltaBps(1000, 0)).toBeNull();
    expect(deltaBps(0, 0)).toBeNull();
    expect(deltaBps(1000, -5)).toBeNull();
  });
  it("positivo, negativo y cero", () => {
    expect(deltaBps(10800, 10000)).toBe(800);
    expect(deltaBps(9700, 10000)).toBe(-300);
    expect(deltaBps(10000, 10000)).toBe(0);
  });
  it("redondeo bancario", () => {
    // (3-2)/2 = 50% exacto; 1/8 = 12.5% -> 1250 bps; 1/16 = 625; 1/32 = 312.5 -> 312 (par)
    expect(deltaBps(3, 2)).toBe(5000);
    expect(deltaBps(33, 32)).toBe(312);
    expect(deltaBps(35, 32)).toBe(938); // 937.5 -> 938 (par)
  });
});

describe("aggregateLocation", () => {
  const rows = [
    row({
      locationId: "naco",
      date: "2026-09-16",
      revenueCents: 1_000_00,
      servicesCount: 4,
      salesCount: 3,
      newClients: 1,
      uniqueClients: 4,
      noShows: 1,
      terminalAppointments: 5,
      utilizationBps: 7000,
      barberHoursX100: 800,
    }),
    row({
      locationId: "naco",
      date: "2026-09-17",
      revenueCents: 500_01,
      servicesCount: 2,
      salesCount: 2,
      uniqueClients: 2,
      noShows: 0,
      terminalAppointments: 5,
      utilizationBps: 8000,
      barberHoursX100: 800,
    }),
    row({ locationId: "naco", date: "2026-09-18", utilizationBps: null }),
    row({ locationId: "otra", date: "2026-09-16", revenueCents: 999_999 }),
  ];

  it("suma, pondera y deriva, ignorando otras sedes", () => {
    const t = aggregateLocation(rows, NACO);
    expect(t.revenueCents).toBe(150_001);
    expect(t.servicesCount).toBe(6);
    expect(t.salesCount).toBe(5);
    expect(t.avgTicketCents).toBe(30_000); // 150001/5 = 30000.2
    expect(t.occupancyBps).toBe(7500); // promedio de los dias con dato
    expect(t.noShows).toBe(1);
    expect(t.noShowBps).toBe(1000); // 1 de 10
    expect(t.newClients).toBe(1);
    expect(t.uniqueClients).toBe(6); // suma de visitas-cliente por dia
    expect(t.barberHoursX100).toBe(1600);
    expect(t.revenuePerChairCents).toBe(25_000); // 150001/6 = 25000.17
    expect(t.revenuePerBarberHourCents).toBe(9375); // 150001*100/1600 = 9375.06
  });

  it("sin datos: nulls, no division por cero", () => {
    const t = aggregateLocation([], { id: "x", name: "X", chairsCount: 0 });
    expect(t.avgTicketCents).toBeNull();
    expect(t.occupancyBps).toBeNull();
    expect(t.noShowBps).toBeNull();
    expect(t.revenuePerChairCents).toBeNull();
    expect(t.revenuePerBarberHourCents).toBeNull();
    expect(t.revenueCents).toBe(0);
  });

  it("la sede chica gana en RD$/silla aunque pierda en ingreso bruto (PRD §5.4.B)", () => {
    const big = aggregateLocation([row({ locationId: "naco", date: "d", revenueCents: 600_000 })], NACO);
    const small = aggregateLocation([row({ locationId: "sc", date: "d", revenueCents: 400_000 })], SC);
    expect(big.revenueCents).toBeGreaterThan(small.revenueCents);
    expect(small.revenuePerChairCents!).toBeGreaterThan(big.revenuePerChairCents!);
    const byRevenue = rankLocations([big, small], "revenueCents").map((l) => l.locationId);
    const byChair = rankLocations([big, small], "revenuePerChairCents").map((l) => l.locationId);
    expect(byRevenue).toEqual(["naco", "sc"]);
    expect(byChair).toEqual(["sc", "naco"]);
  });
});

describe("aggregateChain", () => {
  it("pondera ticket y no-show, no promedia promedios", () => {
    const rows = [
      row({ locationId: "naco", date: "d", revenueCents: 100_000, salesCount: 1, noShows: 1, terminalAppointments: 2, utilizationBps: 6000, newClients: 2, uniqueClients: 1, servicesCount: 1 }),
      row({ locationId: "sc", date: "d", revenueCents: 90_000, salesCount: 9, noShows: 0, terminalAppointments: 8, utilizationBps: 8000, newClients: 1, uniqueClients: 7, servicesCount: 9 }),
      row({ locationId: "fuera", date: "d", revenueCents: 1_000_000, salesCount: 1 }),
    ];
    const locs = [aggregateLocation(rows, NACO), aggregateLocation(rows, SC)];
    const chain = aggregateChain(locs, rows);
    expect(chain.revenueCents).toBe(190_000);
    expect(chain.salesCount).toBe(10);
    expect(chain.avgTicketCents).toBe(19_000);
    expect(chain.noShowBps).toBe(1000); // 1 de 10
    expect(chain.occupancyBps).toBe(7000);
    expect(chain.newClients).toBe(3);
    expect(chain.uniqueClients).toBe(8);
    expect(chain.servicesCount).toBe(10);
  });

  it("cadena vacia -> nulls", () => {
    const chain = aggregateChain([], []);
    expect(chain.avgTicketCents).toBeNull();
    expect(chain.noShowBps).toBeNull();
    expect(chain.occupancyBps).toBeNull();
  });
});

describe("rankLocations", () => {
  const mk = (id: string, name: string, revenueCents: number, occ: number | null = null) =>
    aggregateLocation(
      [row({ locationId: id, date: "d", revenueCents, utilizationBps: occ })],
      { id, name, chairsCount: 1 },
    );

  it("ordena descendente y asigna puestos 1..n sin mutar la entrada", () => {
    const input = [mk("a", "A", 100), mk("b", "B", 300), mk("c", "C", 200)];
    const snapshot = input.map((l) => l.locationId);
    const ranked = rankLocations(input);
    expect(ranked.map((l) => [l.locationId, l.rank])).toEqual([["b", 1], ["c", 2], ["a", 3]]);
    expect(input.map((l) => l.locationId)).toEqual(snapshot);
  });

  it("empate: desempata por nombre y luego por id, de forma determinista", () => {
    const ranked = rankLocations([mk("z", "Mismo", 100), mk("y", "Mismo", 100), mk("x", "Antes", 100)]);
    expect(ranked.map((l) => l.locationId)).toEqual(["x", "y", "z"]);
    const again = rankLocations([mk("x", "Antes", 100), mk("z", "Mismo", 100), mk("y", "Mismo", 100)]);
    expect(again.map((l) => l.locationId)).toEqual(["x", "y", "z"]);
  });

  it("los valores null van al final", () => {
    const ranked = rankLocations([mk("a", "A", 1, null), mk("b", "B", 1, 5000), mk("c", "C", 1, null)], "occupancyBps");
    expect(ranked.map((l) => l.locationId)).toEqual(["b", "a", "c"]);
  });
});

describe("flagsDeviation", () => {
  const loc = (id: string, revenueCents: number) =>
    aggregateLocation([row({ locationId: id, date: "d", revenueCents })], { id, name: id, chairsCount: 1 });

  it("marca solo las sedes MAS de 10% por debajo del promedio", () => {
    // promedio = 1000; 900 = exactamente 10% por debajo -> NO marca; 899 -> marca
    const flags = flagsDeviation([loc("a", 1101), loc("b", 900), loc("c", 999)]);
    // total 3000 -> promedio 1000
    expect(flags.get("b")).toBe(false);
    expect(flags.get("a")).toBe(false);
    expect(flags.get("c")).toBe(false);
    const flags2 = flagsDeviation([loc("a", 1101), loc("b", 899), loc("c", 1000)]);
    expect(flags2.get("b")).toBe(true);
  });

  it("con una sola sede no hay con que comparar", () => {
    expect(flagsDeviation([loc("a", 0)]).get("a")).toBe(false);
  });
});

describe("casos limite de cobertura", () => {
  it("valida 29 de febrero segun el calendario", () => {
    expect(previousRange({ startsOn: "2024-02-29", endsOn: "2024-02-29" })?.startsOn).toBe("2024-02-28");
    expect(previousRange({ startsOn: "2000-02-29", endsOn: "2000-02-29" })).not.toBeNull();
    expect(previousRange({ startsOn: "2026-02-29", endsOn: "2026-03-01" })).toBeNull();
    expect(previousRange({ startsOn: "2100-02-29", endsOn: "2100-03-01" })).toBeNull();
  });

  it("la cadena ignora dias sin ocupacion calculada", () => {
    const rows = [
      row({ locationId: "naco", date: "d1", utilizationBps: null }),
      row({ locationId: "naco", date: "d2", utilizationBps: 5000 }),
    ];
    expect(aggregateChain([aggregateLocation(rows, NACO)], rows).occupancyBps).toBe(5000);
  });

  it("ranking: mismo nombre y mismo id no rompe el orden", () => {
    const a = aggregateLocation([], { id: "k", name: "K", chairsCount: 1 });
    const ranked = rankLocations([a, { ...a }]);
    expect(ranked.map((l) => l.rank)).toEqual([1, 2]);
    const b = aggregateLocation([], { id: "a", name: "K", chairsCount: 1 });
    expect(rankLocations([a, b]).map((l) => l.locationId)).toEqual(["a", "k"]);
    expect(rankLocations([b, a]).map((l) => l.locationId)).toEqual(["a", "k"]);
  });
});
