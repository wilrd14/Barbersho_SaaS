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

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";

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
