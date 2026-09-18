import { config } from "dotenv";

// Los E2E de Playwright corren contra el proyecto Supabase REAL (no un mock),
// igual que los 4 flujos criticos de F2-25. Este helper abre una conexion
// aparte (no pasa por `src/lib/db/client.ts`, que trae `import "server-only"`
// y lanza fuera del runtime de Next) SOLO para que los specs puedan sembrar
// el dato de prueba que la UI necesita y verificar el resultado final
// directamente contra Postgres — la UI ya lo verifica por su cuenta
// (pantalla/estado), esto es la doble confirmacion de que lo que se ve en
// pantalla es lo que realmente quedo en la base.
config({ path: ".env.local" });

import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";

const { appointments, auditLog, cashSessions, clients, sales, walkInQueue } = schema;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Falta DATABASE_URL en .env.local para los E2E que hablan con la DB real.");
}

export const pgConn = postgres(connectionString, { prepare: false, max: 1 });
export const testDb = drizzle(pgConn, { schema });

/** IDs fijos del seed (`src/lib/db/seed.ts`) — duplicados aqui a proposito
 * (no se importa seed.ts desde e2e/: trae `createSupabaseAdminClient` y
 * corre efectos secundarios de sembrado con solo importarlo). */
export const SEED_IDS = {
  chainId: "00000000-0000-0000-0000-000000000001",
  naco: "00000000-0000-0000-0000-000000000301",
  adminNacoId: "00000000-0000-0000-0000-000000000011",
  barbero1Id: "00000000-0000-0000-0000-000000000101", // "Barbero Uno"
  barbero2Id: "00000000-0000-0000-0000-000000000102", // "Barbero Dos"
  cliente1UserId: "00000000-0000-0000-0000-000000000201",
  serviceCorte: "00000000-0000-0000-0000-000000000401", // 30 min, ver seed
};

// ---------------------------------------------------------------------------
// Limpieza de datos que crean los E2E.
//
// Regla de oro: cada spec borra EXACTAMENTE lo que creo, identificado por
// nombre/telefono unico o por diferencia contra una foto tomada antes de
// correr, y NUNCA una fila del seed de IDs fijos (`00000000-0000-0000-0000-…`).
// `notSeedId` es una segunda barrera: aunque un filtro se equivoque, un DELETE
// nunca alcanza filas con ese prefijo.
// ---------------------------------------------------------------------------

const SEED_ID_PREFIX = "00000000-0000-0000-0000-";

/** Condicion SQL: la columna uuid NO es un ID fijo del seed. */
export function notSeedId(column: AnyPgColumn): SQL {
  return sql`${column}::text not like ${SEED_ID_PREFIX + "%"}`;
}

/** Como se guarda un telefono RD de 10 digitos (`normalizePhone` de las actions: `+1` + digitos). */
export function storedRdPhone(rawPhone: string): string {
  return rawPhone.length === 10 ? `+1${rawPhone}` : rawPhone;
}

/** IDs de clientes de la cadena que un E2E creo, por telefono (normalizado o crudo) y/o nombre exacto. */
export async function findE2eClientIds(by: { phone?: string; fullName?: string }): Promise<string[]> {
  const conds: SQL[] = [];
  if (by.phone) conds.push(inArray(clients.phone, [by.phone, storedRdPhone(by.phone)]));
  if (by.fullName) conds.push(eq(clients.fullName, by.fullName));
  if (conds.length === 0) return [];
  const rows = await testDb
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.chainId, SEED_IDS.chainId), or(...conds), notSeedId(clients.id)));
  return rows.map((r) => r.id);
}

/**
 * Borra a los clientes indicados y todo lo que cuelga de ellos (citas, ventas
 * con sus sale_items por cascade, turnos de la fila y las filas de audit_log de
 * esas entidades). Orden seguro respecto a las FK (`sales.client_id` es
 * RESTRICT). Ignora IDs fijos del seed.
 */
export async function purgeClients(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return;

  const apptIds = (
    await testDb
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(inArray(appointments.clientId, clientIds), notSeedId(appointments.id)))
  ).map((r) => r.id);

  const saleIds = (
    await testDb
      .select({ id: sales.id })
      .from(sales)
      .where(
        and(
          or(
            inArray(sales.clientId, clientIds),
            apptIds.length > 0 ? inArray(sales.appointmentId, apptIds) : undefined,
          ),
          notSeedId(sales.id),
        ),
      )
  ).map((r) => r.id);

  const queueIds = (
    await testDb
      .select({ id: walkInQueue.id })
      .from(walkInQueue)
      .where(and(inArray(walkInQueue.clientId, clientIds), notSeedId(walkInQueue.id)))
  ).map((r) => r.id);

  const entityIds = [...apptIds, ...saleIds, ...queueIds, ...clientIds];
  await testDb.delete(auditLog).where(and(inArray(auditLog.entityId, entityIds), notSeedId(auditLog.entityId)));
  if (saleIds.length > 0) await testDb.delete(sales).where(inArray(sales.id, saleIds)); // sale_items: cascade
  if (apptIds.length > 0) await testDb.delete(appointments).where(inArray(appointments.id, apptIds));
  if (queueIds.length > 0) await testDb.delete(walkInQueue).where(inArray(walkInQueue.id, queueIds));
  await testDb.delete(clients).where(and(inArray(clients.id, clientIds), notSeedId(clients.id)));
}

// --- Estado compartido de caja (specs 03 y 04) ------------------------------

type CashSessionRow = typeof cashSessions.$inferSelect;
export type CashSnapshot = { sessions: CashSessionRow[]; auditIds: Set<string> };

/**
 * Foto de TODAS las cajas de Naco (y de los IDs de audit_log que tienen esas
 * cajas) antes de que el spec toque nada. El seed deja una abierta (`…1001`);
 * 03 la usa y 04 la CIERRA, asi que el cleanup tiene que poder reabrirla.
 */
export async function snapshotCashState(): Promise<CashSnapshot> {
  const sessions = await testDb.select().from(cashSessions).where(eq(cashSessions.locationId, SEED_IDS.naco));
  const ids = sessions.map((s) => s.id);
  const audits =
    ids.length > 0
      ? await testDb.select({ id: auditLog.id }).from(auditLog).where(inArray(auditLog.entityId, ids))
      : [];
  return { sessions, auditIds: new Set(audits.map((a) => a.id)) };
}

/**
 * Deja las cajas de Naco como estaban en la foto: borra las cajas nuevas (y su
 * audit_log; sus ventas ya las borra `purgeClients`, y si quedara alguna,
 * `cash_session_id` es SET NULL) y restaura las columnas de las cajas que ya
 * existian (p.ej. reabre la del seed que 04 cerro). Tambien borra las filas de
 * audit_log que el spec genero sobre cajas ya existentes (`cash.close` /
 * `cash.open`), identificadas por no estar en la foto.
 */
export async function restoreCashState(snapshot: CashSnapshot): Promise<void> {
  const before = new Map(snapshot.sessions.map((s) => [s.id, s]));
  const now = await testDb.select().from(cashSessions).where(eq(cashSessions.locationId, SEED_IDS.naco));

  const createdIds = now.filter((s) => !before.has(s.id)).map((s) => s.id);
  if (createdIds.length > 0) {
    await testDb.delete(auditLog).where(and(inArray(auditLog.entityId, createdIds), notSeedId(auditLog.entityId)));
    await testDb.delete(cashSessions).where(and(inArray(cashSessions.id, createdIds), notSeedId(cashSessions.id)));
  }

  for (const original of snapshot.sessions) {
    const { id, ...columns } = original;
    await testDb.update(cashSessions).set(columns).where(eq(cashSessions.id, id));
  }

  const existingIds = snapshot.sessions.map((s) => s.id);
  if (existingIds.length > 0) {
    const audits = await testDb
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(inArray(auditLog.entityId, existingIds));
    const newAuditIds = audits.map((a) => a.id).filter((id) => !snapshot.auditIds.has(id));
    if (newAuditIds.length > 0) await testDb.delete(auditLog).where(inArray(auditLog.id, newAuditIds));
  }
}

// --- La Fila (spec 02) -------------------------------------------------------

export type QueueSnapshot = (typeof walkInQueue.$inferSelect)[];

/** Foto de los turnos de Naco: `recalcQueueState` reescribe position/ETA de los turnos hermanos al agregar uno. */
export async function snapshotQueue(): Promise<QueueSnapshot> {
  return testDb.select().from(walkInQueue).where(eq(walkInQueue.locationId, SEED_IDS.naco));
}

/** Borra los turnos nuevos y restaura las columnas de los que ya existian. */
export async function restoreQueue(snapshot: QueueSnapshot): Promise<void> {
  const knownIds = new Set(snapshot.map((t) => t.id));
  const now = await testDb
    .select({ id: walkInQueue.id })
    .from(walkInQueue)
    .where(eq(walkInQueue.locationId, SEED_IDS.naco));
  const createdIds = now.map((t) => t.id).filter((id) => !knownIds.has(id));
  if (createdIds.length > 0) {
    await testDb.delete(walkInQueue).where(and(inArray(walkInQueue.id, createdIds), notSeedId(walkInQueue.id)));
  }
  for (const original of snapshot) {
    const { id, ...columns } = original;
    await testDb.update(walkInQueue).set(columns).where(eq(walkInQueue.id, id));
  }
}
