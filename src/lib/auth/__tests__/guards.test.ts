import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionContext } from "@/lib/auth/session";

// --- Mocks -------------------------------------------------------------
// forbidden() de next/navigation lanza en produccion; aqui lo simulamos
// lanzando un error identificable para poder aserter "403" en los tests.
class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN_403");
  }
}

vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new ForbiddenError();
  },
}));

const getSessionContextMock = vi.fn<() => Promise<SessionContext>>();
vi.mock("@/lib/auth/session", () => ({
  getSessionContext: () => getSessionContextMock(),
}));

// Chain fluida db.select().from().where().limit() usada por requireLocationScope.
const dbSelectMock = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => dbSelectMock(),
  },
}));

function mockLocationLookup(row: { id: string; chainId: string } | undefined) {
  dbSelectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => (row ? [row] : []),
      }),
    }),
  });
}

const CHAIN_A = "chain-a";
const CHAIN_B = "chain-b";
const LOCATION_A = "location-a"; // pertenece a CHAIN_A
const LOCATION_B = "location-b"; // pertenece a CHAIN_A tambien (otra sede de la misma cadena)
const LOCATION_OTHER_CHAIN = "location-other-chain"; // pertenece a CHAIN_B

async function importGuards() {
  return await import("@/lib/auth/guards");
}

beforeEach(() => {
  getSessionContextMock.mockReset();
  dbSelectMock.mockReset();
  vi.resetModules();
});

describe("requireChainScope — S1-13", () => {
  it("caso 2: un barber recibe 403 en cualquier ruta (chain)", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "barber-1",
      email: "barber@test.com",
      memberships: [
        { chainId: CHAIN_A, role: "barber", isActive: true, createdAt: "2024-01-01" },
      ],
      barberLocations: [],
      activeChainId: CHAIN_A,
      activeRole: "barber",
      scope: "chain",
    });

    const { requireChainScope } = await importGuards();
    await expect(requireChainScope()).rejects.toThrow("FORBIDDEN_403");
  });

  it("caso 3a: un client recibe 403 en (chain)", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "client-1",
      email: "client@test.com",
      memberships: [],
      barberLocations: [],
      activeChainId: null,
      activeRole: null,
      scope: "client",
    });

    const { requireChainScope } = await importGuards();
    await expect(requireChainScope()).rejects.toThrow("FORBIDDEN_403");
  });

  it("un superuser SI puede acceder a (chain) de su propia cadena", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "owner-1",
      email: "owner@test.com",
      memberships: [
        { chainId: CHAIN_A, role: "superuser", isActive: true, createdAt: "2024-01-01" },
      ],
      barberLocations: [],
      activeChainId: CHAIN_A,
      activeRole: "superuser",
      scope: "chain",
    });

    const { requireChainScope } = await importGuards();
    const ctx = await requireChainScope();
    expect(ctx.chainId).toBe(CHAIN_A);
    expect(ctx.role).toBe("superuser");
  });
});

describe("requireLocationScope — S1-13", () => {
  it("caso 1: un admin asignado solo a Sede A recibe 403 al abrir Sede B (misma cadena)", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "admin-1",
      email: "admin@test.com",
      memberships: [
        { chainId: CHAIN_A, role: "admin", isActive: true, createdAt: "2024-01-01" },
      ],
      barberLocations: [{ locationId: LOCATION_A, isPrimary: true, isActive: true }],
      activeChainId: CHAIN_A,
      activeRole: "admin",
      scope: "chain",
    });
    mockLocationLookup({ id: LOCATION_B, chainId: CHAIN_A });

    const { requireLocationScope } = await importGuards();
    await expect(requireLocationScope(LOCATION_B)).rejects.toThrow("FORBIDDEN_403");
  });

  it("caso 3b: un client recibe 403 en (location)", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "client-1",
      email: "client@test.com",
      memberships: [],
      barberLocations: [],
      activeChainId: null,
      activeRole: null,
      scope: "client",
    });
    mockLocationLookup({ id: LOCATION_A, chainId: CHAIN_A });

    const { requireLocationScope } = await importGuards();
    await expect(requireLocationScope(LOCATION_A)).rejects.toThrow("FORBIDDEN_403");
  });

  it("caso 4: un superuser accede a cualquier sede DE SU CADENA", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "owner-1",
      email: "owner@test.com",
      memberships: [
        { chainId: CHAIN_A, role: "superuser", isActive: true, createdAt: "2024-01-01" },
      ],
      barberLocations: [],
      activeChainId: CHAIN_A,
      activeRole: "superuser",
      scope: "chain",
    });
    mockLocationLookup({ id: LOCATION_B, chainId: CHAIN_A });

    const { requireLocationScope } = await importGuards();
    const ctx = await requireLocationScope(LOCATION_B);
    expect(ctx.locationId).toBe(LOCATION_B);
    expect(ctx.effectiveRole).toBe("superuser");
  });

  it("caso 5: un superuser recibe 403 en una sede DE OTRA CADENA", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "owner-1",
      email: "owner@test.com",
      memberships: [
        { chainId: CHAIN_A, role: "superuser", isActive: true, createdAt: "2024-01-01" },
      ],
      barberLocations: [],
      activeChainId: CHAIN_A,
      activeRole: "superuser",
      scope: "chain",
    });
    mockLocationLookup({ id: LOCATION_OTHER_CHAIN, chainId: CHAIN_B });

    const { requireLocationScope } = await importGuards();
    await expect(requireLocationScope(LOCATION_OTHER_CHAIN)).rejects.toThrow(
      "FORBIDDEN_403",
    );
  });

  it("un barber asignado a su propia sede si puede entrar", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "barber-1",
      email: "barber@test.com",
      memberships: [
        { chainId: CHAIN_A, role: "barber", isActive: true, createdAt: "2024-01-01" },
      ],
      barberLocations: [{ locationId: LOCATION_A, isPrimary: true, isActive: true }],
      activeChainId: CHAIN_A,
      activeRole: "barber",
      scope: "chain",
    });
    mockLocationLookup({ id: LOCATION_A, chainId: CHAIN_A });

    const { requireLocationScope } = await importGuards();
    const ctx = await requireLocationScope(LOCATION_A);
    expect(ctx.effectiveRole).toBe("barber_assigned");
  });
});

describe("requireBarberScope / requireClientScope — S1-13", () => {
  it("requireBarberScope rechaza a un usuario sin membership de barber", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "client-1",
      email: "client@test.com",
      memberships: [],
      barberLocations: [],
      activeChainId: null,
      activeRole: null,
      scope: "client",
    });

    const { requireBarberScope } = await importGuards();
    await expect(requireBarberScope()).rejects.toThrow("FORBIDDEN_403");
  });

  it("requireClientScope rechaza a un usuario con membership activa", async () => {
    getSessionContextMock.mockResolvedValue({
      authenticated: true,
      userId: "admin-1",
      email: "admin@test.com",
      memberships: [
        { chainId: CHAIN_A, role: "admin", isActive: true, createdAt: "2024-01-01" },
      ],
      barberLocations: [],
      activeChainId: CHAIN_A,
      activeRole: "admin",
      scope: "chain",
    });

    const { requireClientScope } = await importGuards();
    await expect(requireClientScope()).rejects.toThrow("FORBIDDEN_403");
  });
});
