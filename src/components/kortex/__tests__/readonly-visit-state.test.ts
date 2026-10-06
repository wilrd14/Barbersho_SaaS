import { describe, expect, it } from "vitest";
import {
  clearVisitMark,
  isVisitParam,
  readVisitMark,
  shouldShowVisitBanner,
  visitStorageKey,
  writeVisitMark,
} from "../readonly-visit-state";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}
const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("readonly-visit-state", () => {
  it("el parametro valido muestra el banner; otro valor no", () => {
    expect(isVisitParam("cadena")).toBe(true);
    expect(isVisitParam("otro")).toBe(false);
    expect(isVisitParam(null)).toBe(false);
    expect(shouldShowVisitBanner({ param: "cadena", marked: false })).toBe(true);
    expect(shouldShowVisitBanner({ param: null, marked: false })).toBe(false);
  });

  it("la marca mantiene el banner al navegar sin el parametro", () => {
    expect(shouldShowVisitBanner({ param: null, marked: true })).toBe(true);
  });

  it("marca por sede: escribir, leer y limpiar", () => {
    const s = fakeStorage();
    expect(readVisitMark(s, "A")).toBe(false);
    writeVisitMark(s, "A");
    expect(readVisitMark(s, "A")).toBe(true);
    expect(readVisitMark(s, "B")).toBe(false);
    expect(visitStorageKey("A")).not.toBe(visitStorageKey("B"));
    clearVisitMark(s, "A");
    expect(readVisitMark(s, "A")).toBe(false);
  });

  it("storage ausente o roto no lanza", () => {
    expect(readVisitMark(null, "A")).toBe(false);
    expect(readVisitMark(broken, "A")).toBe(false);
    expect(() => writeVisitMark(broken, "A")).not.toThrow();
    expect(() => writeVisitMark(null, "A")).not.toThrow();
    expect(() => clearVisitMark(broken, "A")).not.toThrow();
    expect(() => clearVisitMark(null, "A")).not.toThrow();
  });
});
