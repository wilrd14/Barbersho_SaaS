import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "node:crypto";
import fs from "node:fs";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MIGRATIONS_FOLDER = "src/lib/db/migrations";
// Ultima migracion que ya estaba aplicada en el proyecto Supabase real antes
// de que `drizzle.__drizzle_migrations` existiera como tracking table (0000 y
// 0001 se aplicaron a mano en Sprint 1). Si esa tabla aparece vacia pero
// `chains` ya existe, el proyecto esta en ese estado historico: se backfillea
// el registro de esta migracion para que el migrator solo corra lo nuevo
// (0002 en adelante) en vez de reintentar crear tipos/tablas que ya existen.
const LAST_MIGRATION_APPLIED_OUTSIDE_TRACKING = "0001_rls_policies";

/**
 * Script de migracion (npm run db:migrate). Usa DIRECT_URL (conexion directa,
 * sin pooler) porque las migraciones necesitan sesion estable, no
 * transaction-mode pooling.
 */
async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DIRECT_URL/DATABASE_URL en el entorno.");
  }

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  await backfillTrackingIfNeeded(migrationClient);

  console.log("Aplicando migraciones desde src/lib/db/migrations ...");
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log("Migraciones aplicadas.");

  await migrationClient.end();
}

async function backfillTrackingIfNeeded(sql: ReturnType<typeof postgres>) {
  const [{ exists: chainsExists }] = await sql<[{ exists: boolean }]>`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'chains'
    ) as exists
  `;
  if (!chainsExists) return; // base limpia: el migrator corre 0000 en adelante, normal.

  const trackingExists = await sql`
    select 1 from information_schema.tables
    where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
  `;
  if (trackingExists.length > 0) {
    const rows = await sql`select 1 from drizzle.__drizzle_migrations limit 1`;
    if (rows.length > 0) return; // ya trackea correctamente, nada que hacer.
  }

  const journal = JSON.parse(
    fs.readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`).toString(),
  ) as { entries: { tag: string; when: number }[] };
  const lastAppliedOutsideTracking = journal.entries.find(
    (e) => e.tag === LAST_MIGRATION_APPLIED_OUTSIDE_TRACKING,
  );
  if (!lastAppliedOutsideTracking) return;

  const query = fs
    .readFileSync(`${MIGRATIONS_FOLDER}/${lastAppliedOutsideTracking.tag}.sql`)
    .toString();
  const hash = crypto.createHash("sha256").update(query).digest("hex");

  console.log(
    `Backfill: '${lastAppliedOutsideTracking.tag}' ya estaba aplicada en la DB sin tracking. Registrando...`,
  );
  await sql`create schema if not exists drizzle`;
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;
  await sql`
    insert into drizzle.__drizzle_migrations ("hash", "created_at")
    values (${hash}, ${lastAppliedOutsideTracking.when})
  `;
}

main().catch((err) => {
  console.error("Error aplicando migraciones:", err);
  process.exit(1);
});
