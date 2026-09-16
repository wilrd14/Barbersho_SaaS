import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

const dbExecuteMock = vi.fn();
vi.mock("@/lib/db/client", () => ({
  db: { execute: (...args: unknown[]) => dbExecuteMock(...args) },
}));

async function importSession() {
  return await import("@/lib/auth/session");
}

beforeEach(() => {
  getUserMock.mockReset();
  dbExecuteMock.mockReset();
  vi.resetModules();
});

describe("getSessionContext — S1-12", () => {
  it("usuario no autenticado -> authenticated: false, sin consultar la DB", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { getSessionContext } = await importSession();
    const ctx = await getSessionContext();

    expect(ctx.authenticated).toBe(false);
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  it("usuario autenticado sin memberships -> scope client", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u1@test.com" } } });
    dbExecuteMock.mockResolvedValue([{ memberships: [], barber_locations: [] }]);

    const { getSessionContext } = await importSession();
    const ctx = await getSessionContext();

    expect(ctx.authenticated).toBe(true);
    if (ctx.authenticated) {
      expect(ctx.scope).toBe("client");
      expect(ctx.activeChainId).toBeNull();
    }
  });

  it("D-S1-6: con >1 membership activa, usa la primera por created_at", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u1@test.com" } } });
    dbExecuteMock.mockResolvedValue([
      {
        memberships: [
          { chainId: "chain-old", role: "admin", isActive: true, createdAt: "2023-01-01" },
          { chainId: "chain-new", role: "superuser", isActive: true, createdAt: "2024-01-01" },
        ],
        barber_locations: [],
      },
    ]);

    const { getSessionContext } = await importSession();
    const ctx = await getSessionContext();

    expect(ctx.authenticated).toBe(true);
    if (ctx.authenticated) {
      expect(ctx.activeChainId).toBe("chain-old");
      expect(ctx.activeRole).toBe("admin");
      expect(ctx.scope).toBe("chain");
    }
  });

  it("ejecuta una sola consulta a la DB por resolucion de contexto", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "u1@test.com" } } });
    dbExecuteMock.mockResolvedValue([{ memberships: [], barber_locations: [] }]);

    const { getSessionContext } = await importSession();
    await getSessionContext();

    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });
});
