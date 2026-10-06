import { describe, expect, it } from "vitest";
import { MAX_RANGE_DAYS, addDays, eachDate, rangeToQuery, resolveRange } from "../ranges";

const TODAY = "2026-09-18";

describe("resolveRange", () => {
  it("sin params -> hoy", () => {
    expect(resolveRange({}, TODAY)).toEqual({ preset: "hoy", startsOn: TODAY, endsOn: TODAY, fellBack: false });
  });
  it("semana = 7 dias incluido hoy; mes = 30 dias incluido hoy", () => {
    expect(resolveRange({ rango: "semana" }, TODAY)).toMatchObject({ startsOn: "2026-09-12", endsOn: TODAY });
    expect(resolveRange({ rango: "mes" }, TODAY)).toMatchObject({ startsOn: "2026-08-20", endsOn: TODAY });
    expect(eachDate("2026-09-12", TODAY)).toHaveLength(7);
    expect(eachDate("2026-08-20", TODAY)).toHaveLength(30);
  });
  it("cruza anio y bisiesto", () => {
    expect(resolveRange({ rango: "semana" }, "2026-01-03").startsOn).toBe("2025-12-28");
    expect(resolveRange({ rango: "mes" }, "2024-03-10").startsOn).toBe("2024-02-10");
  });
  it("custom valido", () => {
    expect(resolveRange({ rango: "custom", desde: "2026-09-01", hasta: "2026-09-12" }, TODAY)).toEqual({
      preset: "custom",
      startsOn: "2026-09-01",
      endsOn: "2026-09-12",
      fellBack: false,
    });
  });
  it("custom con hasta futuro se topa en hoy", () => {
    expect(resolveRange({ rango: "custom", desde: "2026-09-10", hasta: "2026-12-31" }, TODAY).endsOn).toBe(TODAY);
  });
  it("custom invalido cae a hoy con fellBack", () => {
    const bad = [
      { rango: "custom" },
      { rango: "custom", desde: "2026-09-10" },
      { rango: "custom", desde: "x", hasta: "2026-09-12" },
      { rango: "custom", desde: "2026-02-30", hasta: "2026-09-12" },
      { rango: "custom", desde: "2026-09-10", hasta: "2026-13-01" },
      { rango: "custom", desde: "2026-09-12", hasta: "2026-09-10" },
      { rango: "custom", desde: "2026-12-01", hasta: "2026-12-31" },
      { rango: "custom", desde: "2024-01-01", hasta: "2026-09-12" },
      { rango: "inventado" },
    ];
    for (const params of bad) {
      expect(resolveRange(params, TODAY)).toEqual({ preset: "hoy", startsOn: TODAY, endsOn: TODAY, fellBack: true });
    }
  });
  it("custom de exactamente MAX_RANGE_DAYS es valido y uno mas no", () => {
    const start = addDays(TODAY, -(MAX_RANGE_DAYS - 1))!;
    expect(resolveRange({ rango: "custom", desde: start, hasta: TODAY }, TODAY).preset).toBe("custom");
    const tooLong = addDays(TODAY, -MAX_RANGE_DAYS)!;
    expect(resolveRange({ rango: "custom", desde: tooLong, hasta: TODAY }, TODAY).fellBack).toBe(true);
  });
  it("acepta arrays (toma el primero)", () => {
    expect(resolveRange({ rango: ["semana", "mes"] }, TODAY).preset).toBe("semana");
  });
  it("hoy invalido lanza", () => {
    expect(() => resolveRange({}, "mal")).toThrow();
  });
});

describe("addDays / eachDate / rangeToQuery", () => {
  it("addDays", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("basura", 1)).toBeNull();
  });
  it("eachDate", () => {
    expect(eachDate("2026-09-17", "2026-09-19")).toEqual(["2026-09-17", "2026-09-18", "2026-09-19"]);
    expect(eachDate("2026-09-19", "2026-09-17")).toEqual([]);
    expect(eachDate("x", "2026-09-17")).toEqual([]);
  });
  it("rangeToQuery", () => {
    expect(rangeToQuery({ preset: "semana", startsOn: "a", endsOn: "b" })).toBe("rango=semana");
    expect(rangeToQuery({ preset: "custom", startsOn: "2026-09-01", endsOn: "2026-09-12" })).toBe(
      "rango=custom&desde=2026-09-01&hasta=2026-09-12",
    );
  });
});
