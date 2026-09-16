import "server-only";

import { cache } from "react";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { membershipRole } from "@/lib/db/schema";

export type MembershipRole = (typeof membershipRole.enumValues)[number];

export interface MembershipContext {
  chainId: string;
  role: MembershipRole;
  isActive: boolean;
  createdAt: string;
}

export interface BarberLocationContext {
  locationId: string;
  isPrimary: boolean;
  isActive: boolean;
}

export type SessionContext =
  | {
      authenticated: false;
    }
  | {
      authenticated: true;
      userId: string;
      email: string | null;
      memberships: MembershipContext[];
      barberLocations: BarberLocationContext[];
      /**
       * D-S1-6: cadena activa = primera membership activa por created_at.
       * TODO(selector de cadena): cuando el usuario tiene mas de una
       * membership activa, Sprint 1 no construye UI para elegir cadena; se
       * fija la mas antigua y queda pendiente para un sprint posterior.
       */
      activeChainId: string | null;
      activeRole: MembershipRole | null;
      /** Ambito derivado: sin memberships activas => "client". */
      scope: "chain" | "client";
    };

/**
 * Resolvedor de sesion de servidor (S1-12), cacheado por request con
 * React `cache()`: sin importar cuantas veces se llame durante el mismo
 * render/Server Action, solo dispara una consulta a Supabase Auth y una
 * consulta a la base de datos (memberships + barber_locations en un solo
 * round-trip, via subconsultas agregadas en JSON).
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authenticated: false };
  }

  // Una sola consulta: dos subconsultas agregadas en JSON en el mismo round-trip.
  const result = await db.execute<{
    memberships: MembershipContext[] | null;
    barber_locations: BarberLocationContext[] | null;
  }>(sql`
    select
      (
        select coalesce(json_agg(json_build_object(
          'chainId', m.chain_id,
          'role', m.role,
          'isActive', m.is_active,
          'createdAt', m.created_at
        ) order by m.created_at asc), '[]'::json)
        from memberships m
        where m.user_id = ${user.id} and m.is_active = true
      ) as memberships,
      (
        select coalesce(json_agg(json_build_object(
          'locationId', bl.location_id,
          'isPrimary', bl.is_primary,
          'isActive', bl.is_active
        )), '[]'::json)
        from barber_locations bl
        where bl.user_id = ${user.id} and bl.is_active = true
      ) as barber_locations
  `);

  const row = result[0] as
    | { memberships: MembershipContext[]; barber_locations: BarberLocationContext[] }
    | undefined;

  const memberships = row?.memberships ?? [];
  const barberLocations = row?.barber_locations ?? [];

  const active = memberships[0] ?? null;

  return {
    authenticated: true,
    userId: user.id,
    email: user.email ?? null,
    memberships,
    barberLocations,
    activeChainId: active?.chainId ?? null,
    activeRole: active?.role ?? null,
    scope: active ? "chain" : "client",
  };
});
