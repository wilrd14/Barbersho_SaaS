/**
 * Lectura del codigo SQLSTATE de un error de Postgres. Drizzle (0.45) envuelve
 * el error del driver en un `DrizzleQueryError` cuyo `cause` es el error
 * original (`code`, `constraint_name`); con el driver crudo el codigo viene en
 * el propio error. Se revisan ambos para no depender de la version.
 */
export interface PgErrorInfo {
  code?: string;
  constraint?: string;
}

export function pgErrorInfo(err: unknown): PgErrorInfo {
  const candidates: unknown[] = [err, (err as { cause?: unknown } | null)?.cause];
  for (const candidate of candidates) {
    if (typeof candidate === "object" && candidate !== null && "code" in candidate) {
      const { code, constraint_name } = candidate as { code?: unknown; constraint_name?: unknown };
      if (typeof code === "string") {
        return { code, constraint: typeof constraint_name === "string" ? constraint_name : undefined };
      }
    }
  }
  return {};
}

/** 23505 unique_violation. */
export const UNIQUE_VIOLATION = "23505";
/** 23P01 exclusion_violation (el EXCLUDE de periodos solapados). */
export const EXCLUSION_VIOLATION = "23P01";
