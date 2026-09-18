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
type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Node (next dev / next start / vitest / scripts): un unico cliente por proceso. */
let _nodeDb: Db | undefined;

/**
 * Workers (OpenNext/workerd): un cliente por REQUEST, nunca compartido.
 *
 * Bug encontrado al probar el flujo de dinero en workerd (F2, tarea
 * "verificar en el runtime real de Cloudflare"): un socket TCP (`connect()`)
 * pertenece a la request que lo abrio. Un cliente `postgres.js` guardado en
 * una variable de modulo (lo que funciona en Node) sobrevive entre requests
 * dentro del mismo isolate, y cualquier query de la SEGUNDA request espera un
 * socket cuyo dueno ya termino: workerd detecta que la promesa nunca se
 * resolvera y cancela la request con "The Workers runtime canceled this
 * request because it detected that your Worker's code had hung" (HTTP 500).
 * La primera request tras arrancar funcionaba, todas las siguientes no.
 *
 * OpenNext publica un almacen NUEVO por request en
 * `globalThis[Symbol.for("__cloudflare-context__")]` (AsyncLocalStorage de
 * `.open-next/cloudflare/init.js`); se usa su identidad como llave de un
 * WeakMap, asi el cliente vive lo que vive la request y se recolecta despues.
 * Fuera de Workers ese simbolo no existe y se usa el singleton de Node.
 */
const _requestDbs = new WeakMap<object, Db>();

function getRequestKey(): object | undefined {
  const store = (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")];
  return typeof store === "object" && store !== null ? store : undefined;
}

function getConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta DATABASE_URL. Copia .env.example a .env.local y complétalo.");
  }
  return url;
}

function createDb(): Db {
  const client = postgres(getConnectionString(), {
    prepare: false,
    max: 1,
    // Instrumentacion temporal de diagnostico (F2-25): cuenta round-trips
    // reales a la DB cuando DEBUG_DB_ROUNDTRIPS=1. No se activa en
    // produccion ni en tests normales; solo la usa
    // scripts/measure-availability-roundtrips.ts.
    ...(process.env.DEBUG_DB_ROUNDTRIPS === "1"
      ? {
          debug: (_conn: unknown, query: string) => {
            console.log(`[db round-trip] ${query.slice(0, 90).replace(/\s+/g, " ")}`);
          },
        }
      : {}),
  });
  return drizzle(client, { schema });
}

export function getDb(): Db {
  const requestKey = getRequestKey();
  if (requestKey) {
    let requestDb = _requestDbs.get(requestKey);
    if (!requestDb) {
      requestDb = createDb();
      _requestDbs.set(requestKey, requestDb);
    }
    return requestDb;
  }
  _nodeDb ??= createDb();
  return _nodeDb;
}

export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
