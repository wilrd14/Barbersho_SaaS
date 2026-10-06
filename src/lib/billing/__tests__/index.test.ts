import { describe, expect, it } from "vitest";
import {
  assertLocationQuota,
  effectiveSubscription,
  isAllowed,
  type SubscriptionSnapshot,
} from "../index";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const trial = (trialEndsAtMs: number | null): SubscriptionSnapshot => ({
  status: "trialing",
  trialEndsAtMs,
  currentPeriodEndMs: null,
});

describe("effectiveSubscription", () => {
  it("prueba vigente -> normal con dias restantes", () => {
    expect(effectiveSubscription(trial(NOW + 3 * DAY - 1), NOW)).toEqual({
      access: "acceso_normal",
      trialDaysLeft: 3,
      graceDaysLeft: null,
    });
  });
  it("vencida ayer -> restringido", () => {
    const r = effectiveSubscription(trial(NOW - DAY), NOW);
    expect(r.access).toBe("restringido");
    expect(r.graceDaysLeft).toBe(6);
  });
  it("vencida justo ahora -> restringido", () => {
    expect(effectiveSubscription(trial(NOW), NOW).access).toBe("restringido");
  });
  it("exactamente 7 dias -> restringido; 8 dias -> bloqueado", () => {
    const seven = effectiveSubscription(trial(NOW - 7 * DAY), NOW);
    expect(seven.access).toBe("restringido");
    expect(seven.graceDaysLeft).toBe(0);
    expect(effectiveSubscription(trial(NOW - 8 * DAY), NOW).access).toBe("bloqueado");
  });
  it("trialing sin fecha -> restringido", () => {
    expect(effectiveSubscription(trial(null), NOW).access).toBe("restringido");
  });
  it("active -> normal", () => {
    expect(
      effectiveSubscription({ status: "active", trialEndsAtMs: null, currentPeriodEndMs: null }, NOW).access,
    ).toBe("acceso_normal");
  });
  it("past_due: gracia desde el fin del periodo, luego bloqueado; sin fecha restringido", () => {
    const pd = (end: number | null): SubscriptionSnapshot => ({
      status: "past_due",
      trialEndsAtMs: null,
      currentPeriodEndMs: end,
    });
    expect(effectiveSubscription(pd(NOW - 2 * DAY), NOW).access).toBe("restringido");
    expect(effectiveSubscription(pd(NOW - 9 * DAY), NOW).access).toBe("bloqueado");
    expect(effectiveSubscription(pd(null), NOW).access).toBe("restringido");
  });
  it("cancelled -> bloqueado", () => {
    expect(
      effectiveSubscription({ status: "cancelled", trialEndsAtMs: NOW + DAY, currentPeriodEndMs: null }, NOW).access,
    ).toBe("bloqueado");
  });
});

describe("isAllowed", () => {
  it("normal permite todo", () => {
    for (const area of ["analytics", "operation", "billing", "auth"] as const) {
      expect(isAllowed({ access: "acceso_normal", area })).toBe(true);
    }
  });
  it("restringido: opera, bloquea analitica", () => {
    expect(isAllowed({ access: "restringido", area: "operation" })).toBe(true);
    expect(isAllowed({ access: "restringido", area: "analytics" })).toBe(false);
  });
  it("bloqueado: solo billing y auth", () => {
    expect(isAllowed({ access: "bloqueado", area: "operation" })).toBe(false);
    expect(isAllowed({ access: "bloqueado", area: "analytics" })).toBe(false);
    expect(isAllowed({ access: "bloqueado", area: "billing" })).toBe(true);
    expect(isAllowed({ access: "bloqueado", area: "auth" })).toBe(true);
  });
  it("excepciones duras siempre permitidas", () => {
    expect(isAllowed({ access: "bloqueado", area: "operation", action: "close_open_cash_session" })).toBe(true);
    expect(isAllowed({ access: "bloqueado", area: "operation", action: "charge_open_sale" })).toBe(true);
  });
});

describe("assertLocationQuota", () => {
  it("local: 1 incluida, 3 con 2 extra, 4 rechazada con upsell", () => {
    expect(assertLocationQuota("local", 1)).toEqual({ ok: true, extraLocations: 0, extraMonthlyCents: 0 });
    expect(assertLocationQuota("local", 3)).toEqual({ ok: true, extraLocations: 2, extraMonthlyCents: 700_000 });
    const r = assertLocationQuota("local", 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("plan Cadena");
  });
  it("chain: 3 incluidas, 5 sedes -> 2 extra a RD$2,500", () => {
    expect(assertLocationQuota("chain", 3)).toEqual({ ok: true, extraLocations: 0, extraMonthlyCents: 0 });
    expect(assertLocationQuota("chain", 5)).toEqual({ ok: true, extraLocations: 2, extraMonthlyCents: 500_000 });
  });
  it("franchise: 12 -> 2 extra a RD$1,500; 0 sedes no da extra", () => {
    expect(assertLocationQuota("franchise", 12)).toEqual({ ok: true, extraLocations: 2, extraMonthlyCents: 300_000 });
    expect(assertLocationQuota("franchise", 0)).toEqual({ ok: true, extraLocations: 0, extraMonthlyCents: 0 });
  });
});
