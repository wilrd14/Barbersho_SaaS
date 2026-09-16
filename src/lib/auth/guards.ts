import "server-only";

import { forbidden } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { locations } from "@/lib/db/schema";
import { getSessionContext, type MembershipRole } from "@/lib/auth/session";

/**
 * Guards de autorizacion por ambito (S1-13). Reglas de §3 del backlog:
 *  - chain_id se deriva SIEMPRE de la sesion, nunca del cliente.
 *  - location_id puede venir de la URL, pero se verifica contra la
 *    membership/barber_locations ANTES de cualquier lectura o escritura.
 *  - Si no cumple, 403 (forbidden()) incluso por URL directa.
 *
 * Estas funciones se invocan desde el layout de cada route group, antes de
 * renderizar o consultar nada mas.
 */

export interface ChainScopeContext {
  userId: string;
  chainId: string;
  role: Extract<MembershipRole, "superuser">;
}

export interface LocationScopeContext {
  userId: string;
  chainId: string;
  locationId: string;
  /** Rol efectivo sobre esa sede: superuser de la cadena, admin, o barber. */
  effectiveRole: MembershipRole | "barber_assigned";
}

export interface BarberScopeContext {
  userId: string;
  chainId: string | null;
}

export interface ClientScopeContext {
  userId: string;
}

/** (chain) => requiere rol superuser en la cadena activa de la sesion. */
export async function requireChainScope(): Promise<ChainScopeContext> {
  const ctx = await getSessionContext();

  if (!ctx.authenticated || ctx.scope !== "chain" || !ctx.activeChainId) {
    forbidden();
  }

  if (ctx.activeRole !== "superuser") {
    forbidden();
  }

  return {
    userId: ctx.userId,
    chainId: ctx.activeChainId,
    role: "superuser",
  };
}

/**
 * (location)/[locationId] => la sede debe pertenecer a la cadena de la
 * sesion Y el usuario debe ser superuser de esa cadena, o admin/barber
 * asignado a esa sede especifica (barber_locations).
 */
export async function requireLocationScope(
  locationId: string,
): Promise<LocationScopeContext> {
  const ctx = await getSessionContext();

  if (!ctx.authenticated) {
    forbidden();
  }

  // Todas las cadenas en las que el usuario tiene membership activa
  // (independiente de la "activa por defecto" de D-S1-6): el chequeo de
  // ambito no depende del selector de cadena, depende de pertenencia real.
  const membershipByChain = new Map(ctx.memberships.map((m) => [m.chainId, m.role]));

  const [location] = await db
    .select({ id: locations.id, chainId: locations.chainId })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);

  if (!location) {
    forbidden();
  }

  const roleInChain = membershipByChain.get(location!.chainId);

  if (roleInChain === "superuser") {
    return {
      userId: ctx.userId,
      chainId: location!.chainId,
      locationId,
      effectiveRole: "superuser",
    };
  }

  const barberAssignment = ctx.barberLocations.find(
    (bl) => bl.locationId === locationId && bl.isActive,
  );

  if (roleInChain === "admin" && barberAssignment) {
    return {
      userId: ctx.userId,
      chainId: location!.chainId,
      locationId,
      effectiveRole: "admin",
    };
  }

  if (roleInChain === "barber" && barberAssignment) {
    return {
      userId: ctx.userId,
      chainId: location!.chainId,
      locationId,
      effectiveRole: "barber_assigned",
    };
  }

  // Nota de producto (§3.3 del backlog): un admin asignado por
  // barber_locations a UNA sede tiene acceso solo a esa sede, aunque su rol
  // de membership sea "admin". Sin fila en barber_locations para esta sede,
  // no hay acceso salvo que sea superuser (cubierto arriba).
  forbidden();
}

/** (barber) => cualquier usuario con membership activa como barber en alguna cadena. */
export async function requireBarberScope(): Promise<BarberScopeContext> {
  const ctx = await getSessionContext();

  if (!ctx.authenticated) {
    forbidden();
  }

  const barberMembership = ctx.memberships.find((m) => m.role === "barber");

  if (!barberMembership) {
    forbidden();
  }

  return {
    userId: ctx.userId,
    chainId: barberMembership!.chainId,
  };
}

/** (client) => cualquier usuario autenticado sin membership activa alguna. */
export async function requireClientScope(): Promise<ClientScopeContext> {
  const ctx = await getSessionContext();

  if (!ctx.authenticated) {
    forbidden();
  }

  if (ctx.scope !== "client") {
    forbidden();
  }

  return { userId: ctx.userId };
}
