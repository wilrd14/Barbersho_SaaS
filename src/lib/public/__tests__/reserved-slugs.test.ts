import { describe, expect, it } from "vitest";
import {
  RESERVED_CHAIN_SLUGS,
  RESERVED_LOCATION_SLUGS,
  RESERVED_SLUGS,
  chainSlugSchema,
  isReservedSlug,
  locationSlugSchema,
  normalizeSlug,
  validateChainSlug,
  validateSlug,
} from "../reserved-slugs";

describe("normalizeSlug", () => {
  it("minusculas, sin acentos, espacios y simbolos a guion simple", () => {
    expect(normalizeSlug("Don Bigote Barbershop")).toBe("don-bigote-barbershop");
    expect(normalizeSlug("Barbería Ñandú & Hijos")).toBe("barberia-nandu-hijos");
    expect(normalizeSlug("  --Corte   Fino--  ")).toBe("corte-fino");
    expect(normalizeSlug("a__b")).toBe("a-b");
  });
  it("nombre sin caracteres validos -> vacio", () => {
    expect(normalizeSlug("!!!")).toBe("");
  });
  it("trunca a 40 y no deja guion al final", () => {
    const long = normalizeSlug("a".repeat(39) + " " + "b".repeat(10));
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("-")).toBe(false);
    expect(normalizeSlug("x".repeat(60))).toBe("x".repeat(40));
  });
});

describe("validateSlug (formato)", () => {
  it("longitud: 2 y 41 rechazados, 3 y 40 aceptados", () => {
    expect(validateSlug("ab").ok).toBe(false);
    expect(validateSlug("abc")).toEqual({ ok: true, slug: "abc" });
    expect(validateSlug("a".repeat(40)).ok).toBe(true);
    expect(validateSlug("a".repeat(41)).ok).toBe(false);
  });
  it("mayusculas, acentos, espacios, guiones dobles/extremos, simbolos", () => {
    for (const bad of ["Naco", "barbería", "don bigote", "don--bigote", "-don", "don-", "don_bigote", "don.bigote"]) {
      expect(validateSlug(bad).ok, bad).toBe(false);
    }
    expect(validateSlug("don-bigote-2")).toEqual({ ok: true, slug: "don-bigote-2" });
  });
  it("mensajes en espanol", () => {
    const short = validateSlug("ab");
    const fmt = validateSlug("A-b-c");
    expect(!short.ok && short.error).toContain("entre 3 y 40");
    expect(!fmt.ok && fmt.error).toContain("minusculas");
  });
});

describe("slugs reservados", () => {
  it("cada slug reservado es rechazado como slug de cadena", () => {
    expect(RESERVED_SLUGS.size).toBeGreaterThan(30);
    for (const slug of RESERVED_SLUGS) {
      expect(isReservedSlug(slug)).toBe(true);
      expect(validateChainSlug(slug).ok, slug).toBe(false);
    }
  });
  it("los de D-F2-3 siguen reservados y el alias historico es la misma lista", () => {
    for (const s of ["book", "api", "login", "register", "sede", "admin", "_next"]) {
      expect(RESERVED_CHAIN_SLUGS.has(s)).toBe(true);
    }
    expect(RESERVED_CHAIN_SLUGS).toBe(RESERVED_SLUGS);
  });
  it("mensaje de reservado", () => {
    const r = validateChainSlug("billing");
    expect(!r.ok && r.error).toContain("reservado");
  });
  it("isReservedSlug ignora mayusculas; un slug normal no es reservado", () => {
    expect(isReservedSlug("BOOK")).toBe(true);
    expect(isReservedSlug("don-bigote")).toBe(false);
  });
  it("barber y book se rechazan como slug de sede, pero no otros reservados de cadena", () => {
    expect(RESERVED_LOCATION_SLUGS.has("barber")).toBe(true);
    expect(validateSlug("barber", "location").ok).toBe(false);
    expect(validateSlug("book", "location").ok).toBe(false);
    const r = validateSlug("barber", "location");
    expect(!r.ok && r.error).toContain("sede");
    expect(validateSlug("billing", "location").ok).toBe(true);
    expect(validateSlug("naco", "location").ok).toBe(true);
  });
});

describe("esquemas Zod", () => {
  it("chainSlugSchema acepta lo valido y rechaza lo reservado con el mensaje", () => {
    expect(chainSlugSchema.safeParse("don-bigote").success).toBe(true);
    const bad = chainSlugSchema.safeParse("settings");
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toContain("reservado");
    expect(chainSlugSchema.safeParse(42).success).toBe(false);
  });
  it("locationSlugSchema rechaza barber y book", () => {
    expect(locationSlugSchema.safeParse("naco").success).toBe(true);
    expect(locationSlugSchema.safeParse("barber").success).toBe(false);
    expect(locationSlugSchema.safeParse("Naco").success).toBe(false);
  });
});
