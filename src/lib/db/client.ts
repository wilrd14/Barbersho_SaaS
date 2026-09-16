import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Cliente Drizzle server-side. Usa DATABASE_URL (pooler / transaction mode de
 * Supabase). Nunca se importa desde un componente "use client".
 *
 * Spike S1-04 (runtime Cloudflare Workers via OpenNext): el driver elegido es
 * `postgres` (postgres.js) sobre TCP directo, habilitado en Workers con la
 * flag de compatibilidad `nodejs_compat` (ver wrangler.toml). Es el driver
 * recomendado por Drizzle para Supabase + entornos edge con soporte de
 * sockets TCP (Cloudflare los expone desde 2024 via `connect()`).
 * `prepare: false` porque el pooler de Supabase en modo transaccion (puerto
 * 6543) no soporta prepared statements por conexion.
 *
 * NOTA IMPORTANTE (transparencia con el equipo): en este sandbox de
 * desarrollo no hay cuenta de Cloudflare ni proyecto Supabase real
 * disponibles, asi que el spike no se pudo ejecutar end-to-end contra un
 * preview desplegado. El codigo sigue el patron documentado de Drizzle +
 * OpenNext + Cloudflare (mismo approach que usa el ejemplo oficial
 * `opennextjs-cloudflare` con Drizzle), pero falta la verificacion real en
 * Workers que pide el AC de S1-04. Queda como riesgo abierto documentado en
 * el reporte de cierre de sprint.
 */
let _client: postgres.Sql | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env.local y complétalo.");
  }
  return url;
}

export function getDb() {
  if (!_db) {
    _client = postgres(getConnectionString(), { prepare: false, max: 1 });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
