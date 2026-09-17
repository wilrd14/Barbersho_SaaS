import { describe, expect, it } from "vitest";

import { resolveEffectiveService } from "@/lib/scheduling/effective-service";

describe("resolveEffectiveService", () => {
  it("usa los valores por defecto del servicio cuando no hay overrides", () => {
    expect(
      resolveEffectiveService({ defaultDurationMinutes: 30, defaultPrice: 500 }),
    ).toEqual({ durationMinutes: 30, price: 500 });
  });

  it("el override de sede pisa el default", () => {
    expect(
      resolveEffectiveService({
        defaultDurationMinutes: 30,
        defaultPrice: 500,
        overrideDurationMinutes: 45,
        overridePrice: 400,
      }),
    ).toEqual({ durationMinutes: 45, price: 400 });
  });

  it("custom_duration del barbero pisa el override de sede y el default", () => {
    expect(
      resolveEffectiveService({
        defaultDurationMinutes: 30,
        defaultPrice: 500,
        overrideDurationMinutes: 45,
        customDurationMinutes: 60,
      }),
    ).toEqual({ durationMinutes: 60, price: 500 });
  });

  it("override inactivo => el servicio no se ofrece en esa sede (null)", () => {
    expect(
      resolveEffectiveService({
        defaultDurationMinutes: 30,
        defaultPrice: 500,
        overrideIsActive: false,
      }),
    ).toBeNull();
  });
});
