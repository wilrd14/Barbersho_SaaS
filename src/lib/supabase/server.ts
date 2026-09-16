import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para Server Components / Server Actions / Route Handlers.
 * Usa la sesion (JWT) del usuario via cookies -> respeta RLS.
 * Nunca uses el cliente admin para leer datos "en nombre del usuario".
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Se puede ignorar si se llama desde un Server Component sin
            // capacidad de escritura de cookies (Next lo maneja via middleware).
          }
        },
      },
    },
  );
}
