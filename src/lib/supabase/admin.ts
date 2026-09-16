import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con SUPABASE_SERVICE_ROLE_KEY. Bypassa RLS por completo.
 *
 * Uso permitido SOLO en:
 *  - src/lib/db/seed.ts (datos de prueba)
 *  - la sincronizacion auth.users -> public.users en el alta (S1-11)
 *  - jobs de sistema explicitos de sprints posteriores
 *
 * Nunca lo uses para responder directo a una peticion de usuario sin haber
 * pasado antes por el guard de autorizacion (src/lib/auth). El "server-only"
 * de arriba ya impide que este modulo se cuele en un bundle de cliente.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createSupabaseAdminClient: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
