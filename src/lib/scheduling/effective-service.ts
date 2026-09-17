/**
 * D-F2-1 (BACKLOG-F2.md §4) · Resolucion de duracion y precio efectivo,
 * pura. Orden de precedencia:
 *   duracion: barber_services.custom_duration -> location_service_overrides.duration_minutes -> services.default_duration_minutes
 *   precio:   location_service_overrides.price -> services.default_price
 *
 * Un `location_service_overrides.is_active = false` significa que ese
 * servicio no se ofrece en esa sede: devuelve `null`.
 */

export type EffectiveServiceInput = {
  defaultDurationMinutes: number;
  defaultPrice: number;
  overrideDurationMinutes?: number | null;
  overridePrice?: number | null;
  overrideIsActive?: boolean | null;
  customDurationMinutes?: number | null;
};

export type EffectiveService = {
  durationMinutes: number;
  price: number;
};

export function resolveEffectiveService(
  input: EffectiveServiceInput,
): EffectiveService | null {
  if (input.overrideIsActive === false) return null;

  const durationMinutes =
    input.customDurationMinutes ??
    input.overrideDurationMinutes ??
    input.defaultDurationMinutes;

  const price = input.overridePrice ?? input.defaultPrice;

  return { durationMinutes, price };
}
