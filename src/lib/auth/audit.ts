import "server-only";

import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export interface WriteAuditLogInput {
  chainId: string;
  locationId?: string | null;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Ejecutor Drizzle: el cliente normal (`db`) o una transaccion abierta con
 * `db.transaction(async (tx) => ...)`. Solo necesitamos el metodo `insert`,
 * que ambos exponen con la misma forma.
 */
type DbExecutor = Pick<typeof db, "insert">;

/**
 * Helper obligatorio (regla dura #3/§3.7 de BACKLOG-F2) para toda operacion
 * de dinero, permisos o anulacion.
 *
 * Bug real encontrado en F2-25 (E2E de cierre de fase): todos los llamadores
 * dentro de `db.transaction(async (tx) => ...)` invocaban `writeAuditLog`
 * sin pasarle `tx`, asi que esta funcion siempre usaba el cliente `db`
 * singleton (`src/lib/db/client.ts`, pool `max: 1` a proposito para
 * Cloudflare Workers). Eso autobloqueaba: la transaccion en curso ya tenia
 * reservada la UNICA conexion del pool, y el `insert` de `writeAuditLog`
 * esperaba por siempre una conexion libre que la propia transaccion (que
 * esperaba a `writeAuditLog` para poder hacer `COMMIT`) nunca iba a soltar.
 * Confirmado con `pg_stat_activity`: la sesion quedaba en
 * `idle in transaction` esperando al cliente, sin ningun lock bloqueante —
 * era un deadlock 100% del lado de la aplicacion, no de Postgres. Esto
 * rompia SILENCIOSAMENTE (colgando para siempre, sin error) cualquier
 * operacion de dinero real contra la DB: reservar, cobrar, abrir/cerrar
 * caja, dar turno. Ahora `writeAuditLog` acepta el ejecutor (`tx` o `db`)
 * como parametro opcional; todo llamador DENTRO de una transaccion debe
 * pasar `tx` explicitamente.
 */
export async function writeAuditLog(input: WriteAuditLogInput, executor: DbExecutor = db) {
  await executor.insert(auditLog).values({
    chainId: input.chainId,
    locationId: input.locationId ?? null,
    actorUserId: input.actorUserId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
