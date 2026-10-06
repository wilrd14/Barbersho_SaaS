/**
 * F4-01 · Slugs reservados y validacion de slug, PURO (D-F4-3).
 *
 * Una URL publica `kortexbarber.com/[chainSlug]` que coincide con una ruta
 * estatica "se come" a la cadena (D-F2-3), asi que la lista vive en un unico
 * modulo. Sin `db`, `next/*` ni `server-only`: lo usan el Zod del alta de
 * cadena, el de sedes y las lecturas publicas (`directory.ts` lo reexporta).
 */
import { z } from "zod";

/** Lista ampliada de D-F4-3 (incluye la de F2: book, api, login, register, sede, admin, _next). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "book",
  "api",
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "sede",
  "admin",
  "_next",
  "overview",
  "compare",
  "locations",
  "team",
  "services",
  "commissions",
  "reports",
  "settings",
  "billing",
  "clients",
  "mi-silla",
  "schedule",
  "earnings",
  "appointments",
  "profile",
  "onboarding",
  "cancelar",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "health",
  "www",
  "app",
  "kortex",
  "kortexbarber",
]);

/** Nombre historico (F2): `directory.ts` lo sigue exportando con el mismo contrato. */
export const RESERVED_CHAIN_SLUGS = RESERVED_SLUGS;

/** Colisionan con `/[chainSlug]/barber/...` y `/[chainSlug]/book`: no valen como slug de sede. */
export const RESERVED_LOCATION_SLUGS: ReadonlySet<string> = new Set(["barber", "book"]);

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Deriva un slug de un nombre: minusculas, sin acentos, guiones simples, maximo 40 caracteres. */
export function normalizeSlug(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, SLUG_MAX_LENGTH).replace(/-+$/g, "");
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export type SlugKind = "chain" | "location";
export type SlugValidation = { ok: true; slug: string } | { ok: false; error: string };

/** Formato (D-F4-3) y lista reservada; el slug de sede ademas no puede ser `barber` ni `book`. */
export function validateSlug(slug: string, kind: SlugKind = "chain"): SlugValidation {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return {
      ok: false,
      error: `El enlace debe tener entre ${SLUG_MIN_LENGTH} y ${SLUG_MAX_LENGTH} caracteres.`,
    };
  }
  if (!SLUG_FORMAT.test(slug)) {
    return {
      ok: false,
      error:
        "El enlace solo puede llevar minusculas, numeros y guiones simples, sin guion al inicio ni al final.",
    };
  }
  if (kind === "chain" && isReservedSlug(slug)) {
    return { ok: false, error: `"${slug}" esta reservado por Kortex. Elige otro nombre para tu enlace.` };
  }
  if (kind === "location" && RESERVED_LOCATION_SLUGS.has(slug)) {
    return { ok: false, error: `"${slug}" no se puede usar como enlace de una sede. Elige otro.` };
  }
  return { ok: true, slug };
}

function slugSchema(kind: SlugKind) {
  return z.string().superRefine((value, ctx) => {
    const result = validateSlug(value, kind);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.error });
  });
}

/** Zod del alta de cadena (F4-02). */
export const chainSlugSchema = slugSchema("chain");
/** Zod del slug de sede (F4-04): mismo formato, unico por cadena (la unicidad la valida el servidor). */
export const locationSlugSchema = slugSchema("location");

export function validateChainSlug(slug: string): SlugValidation {
  return validateSlug(slug, "chain");
}
