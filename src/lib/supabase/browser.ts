"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para el navegador (anon key). Uso previsto: Realtime
 * (cola de walk-ins, sprint posterior) con el JWT de la sesion del usuario.
 * RLS es la unica defensa para este cliente: nunca se importa el service role aqui.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
