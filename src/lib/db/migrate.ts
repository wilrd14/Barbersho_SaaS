import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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

  console.log("Aplicando migraciones desde src/lib/db/migrations ...");
  await migrate(db, { migrationsFolder: "src/lib/db/migrations" });
  console.log("Migraciones aplicadas.");

  await migrationClient.end();
}

main().catch((err) => {
  console.error("Error aplicando migraciones:", err);
  process.exit(1);
});
