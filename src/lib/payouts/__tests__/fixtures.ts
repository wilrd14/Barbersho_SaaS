import type { SessionContext } from "@/lib/auth/session";

/** IDs fijos del seed usados por los tests de F3 bloque B. */
export const IDS = {
  chain: "00000000-0000-0000-0000-000000000001",
  owner: "00000000-0000-0000-0000-000000000010",
  adminNaco: "00000000-0000-0000-0000-000000000011",
  adminBv: "00000000-0000-0000-0000-000000000012",
  b1: "00000000-0000-0000-0000-000000000101",
  b2: "00000000-0000-0000-0000-000000000102",
  b3: "00000000-0000-0000-0000-000000000103",
  b4: "00000000-0000-0000-0000-000000000104",
  naco: "00000000-0000-0000-0000-000000000301",
  bellaVista: "00000000-0000-0000-0000-000000000302",
  sanCristobal: "00000000-0000-0000-0000-000000000303",
  ruleDefault: "00000000-0000-0000-0000-000000000501",
  ruleBooth: "00000000-0000-0000-0000-000000000502",
  ruleHybrid: "00000000-0000-0000-0000-000000000503",
  client: "00000000-0000-0000-0000-000000000701",
  serviceCorte: "00000000-0000-0000-0000-000000000401",
};

const NOW = "2024-01-01";

export function superuserSession(): SessionContext {
  return {
    authenticated: true,
    userId: IDS.owner,
    email: "owner@donbigote.test",
    memberships: [{ chainId: IDS.chain, role: "superuser", isActive: true, createdAt: NOW }],
    barberLocations: [],
    activeChainId: IDS.chain,
    activeRole: "superuser",
    scope: "chain",
  };
}

export function adminNacoSession(): SessionContext {
  return {
    authenticated: true,
    userId: IDS.adminNaco,
    email: "admin.naco@donbigote.test",
    memberships: [{ chainId: IDS.chain, role: "admin", isActive: true, createdAt: NOW }],
    barberLocations: [{ locationId: IDS.naco, isPrimary: true, isActive: true }],
    activeChainId: IDS.chain,
    activeRole: "admin",
    scope: "chain",
  };
}

export function barberSession(userId: string, locationIds: string[]): SessionContext {
  return {
    authenticated: true,
    userId,
    email: `${userId}@donbigote.test`,
    memberships: [{ chainId: IDS.chain, role: "barber", isActive: true, createdAt: NOW }],
    barberLocations: locationIds.map((locationId, i) => ({ locationId, isPrimary: i === 0, isActive: true })),
    activeChainId: IDS.chain,
    activeRole: "barber",
    scope: "chain",
  };
}
