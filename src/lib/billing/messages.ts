/**
 * F3-18 · Copy de la suscripcion (BRAND-BRIEF §2.2: que paso + por que + que hacer). PURO.
 */
import type { AccessArea, EffectiveAccess, SubscriptionStatus } from "./index";

/** Banner persistente (`ScopeBanner variant="trial-ending"`); null = no mostrar nada. */
export function bannerMessage(
  status: SubscriptionStatus,
  access: EffectiveAccess,
  trialDaysLeft: number | null,
  graceDaysLeft: number | null,
): string | null {
  if (access === "bloqueado") {
    return "El acceso está bloqueado. Escríbenos para reactivar el plan; lo que montaste sigue guardado.";
  }
  if (access === "restringido") {
    return graceDaysLeft === null
      ? "Tu plan necesita atención. Sigues operando, pero el análisis y la administración están en pausa."
      : `Tu prueba terminó. Te quedan ${graceDaysLeft} ${graceDaysLeft === 1 ? "día" : "días"} de gracia: sigues operando, pero el análisis está en pausa.`;
  }
  if (status === "trialing" && trialDaysLeft !== null && trialDaysLeft <= 7) {
    return `Te quedan ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"} de prueba. Si activas el plan, no pierdes nada de lo que montaste.`;
  }
  return null;
}

/** Texto de rechazo cuando una pantalla o accion no esta permitida para el estado efectivo. */
export function deniedMessage(access: EffectiveAccess, area: AccessArea): string {
  if (access === "bloqueado") {
    return "El acceso a Kortex está bloqueado porque el plan no está al día. Escríbenos para reactivarlo; lo que montaste sigue guardado. Cerrar una caja abierta y cobrar siguen disponibles.";
  }
  if (area === "analytics") {
    return "Esta sección está en pausa porque tu prueba terminó. Puedes seguir operando (agenda, fila, cobro y cuadre). Activa el plan para volver a ver los números y cerrar el corte.";
  }
  return "Esta acción no está disponible con el estado actual del plan. Escríbenos para revisarlo.";
}
