import { describe, expect, it } from "vitest";
import { assertAreaAllowed, enforceAreaAllowed, loadChainAccess, type GateExecutor } from "../gate";
import { bannerMessage, deniedMessage } from "../messages";

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const DAY = 86_400_000;

/** Ejecutor falso: devuelve la fila de suscripcion que se le indique (o ninguna). */
function executorWith(row: { status: "trialing" | "active" | "past_due" | "cancelled"; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null): GateExecutor {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }) }),
  } as unknown as GateExecutor;
}

const trialing = (offsetDays: number) => ({
  status: "trialing" as const,
  trialEndsAt: new Date(NOW + offsetDays * DAY),
  currentPeriodEnd: null,
});

describe("loadChainAccess", () => {
  it("prueba vigente -> acceso normal", async () => {
    const a = await loadChainAccess("c", executorWith(trialing(5)), NOW);
    expect(a.access).toBe("acceso_normal");
    expect(a.trialDaysLeft).toBe(5);
  });
  it("prueba vencida ayer -> restringido; hace 8 dias -> bloqueado", async () => {
    expect((await loadChainAccess("c", executorWith(trialing(-1)), NOW)).access).toBe("restringido");
    expect((await loadChainAccess("c", executorWith(trialing(-8)), NOW)).access).toBe("bloqueado");
  });
  it("cancelled -> bloqueado; sin fila -> normal", async () => {
    const cancelled = { status: "cancelled" as const, trialEndsAt: null, currentPeriodEnd: null };
    expect((await loadChainAccess("c", executorWith(cancelled), NOW)).access).toBe("bloqueado");
    expect((await loadChainAccess("c", executorWith(null), NOW)).access).toBe("acceso_normal");
  });
});

describe("assertAreaAllowed / enforceAreaAllowed", () => {
  it("restringido: bloquea analitica, deja operar", async () => {
    const ex = executorWith(trialing(-2));
    const analytics = await assertAreaAllowed("c", "analytics", ex, undefined, NOW);
    expect(analytics.ok).toBe(false);
    if (!analytics.ok) expect(analytics.error).toContain("en pausa");
    expect((await assertAreaAllowed("c", "operation", ex, undefined, NOW)).ok).toBe(true);
    expect((await assertAreaAllowed("c", "billing", ex, undefined, NOW)).ok).toBe(true);
  });
  it("bloqueado: todo salvo billing/auth y las excepciones duras (cerrar caja, cobrar)", async () => {
    const ex = executorWith(trialing(-30));
    expect((await assertAreaAllowed("c", "operation", ex, undefined, NOW)).ok).toBe(false);
    expect((await assertAreaAllowed("c", "analytics", ex, undefined, NOW)).ok).toBe(false);
    expect((await assertAreaAllowed("c", "operation", ex, "close_open_cash_session", NOW)).ok).toBe(true);
    expect((await assertAreaAllowed("c", "operation", ex, "charge_open_sale", NOW)).ok).toBe(true);
    expect((await assertAreaAllowed("c", "billing", ex, undefined, NOW)).ok).toBe(true);
  });
  it("enforce lanza con el texto legible y no lanza si esta permitido", async () => {
    await expect(enforceAreaAllowed("c", "operation", executorWith(trialing(-30)), undefined, NOW)).rejects.toThrow(/bloqueado/);
    await expect(enforceAreaAllowed("c", "operation", executorWith(trialing(3)), undefined, NOW)).resolves.toBeUndefined();
  });
});

describe("messages", () => {
  it("banner por estado", () => {
    expect(bannerMessage("active", "acceso_normal", null, null)).toBeNull();
    expect(bannerMessage("trialing", "acceso_normal", 20, null)).toBeNull();
    expect(bannerMessage("trialing", "acceso_normal", 1, null)).toContain("1 día de prueba");
    expect(bannerMessage("trialing", "acceso_normal", 4, null)).toContain("4 días de prueba");
    expect(bannerMessage("trialing", "restringido", null, 1)).toContain("1 día de gracia");
    expect(bannerMessage("trialing", "restringido", null, 5)).toContain("5 días de gracia");
    expect(bannerMessage("past_due", "restringido", null, null)).toContain("necesita atención");
    expect(bannerMessage("cancelled", "bloqueado", null, null)).toContain("bloqueado");
  });
  it("rechazo por area", () => {
    expect(deniedMessage("restringido", "analytics")).toContain("Activa el plan");
    expect(deniedMessage("restringido", "operation")).toContain("no está disponible");
    expect(deniedMessage("bloqueado", "operation")).toContain("Cerrar una caja abierta");
  });
});
