/**
 * Convencion unica de resultado para Server Actions (S1-14):
 * input Zod -> guard -> logica -> resultado tipado. Nunca se deja escapar una
 * excepcion sin capturar hacia el cliente.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError<T = never>(error: string): ActionResult<T> {
  return { ok: false, error };
}
