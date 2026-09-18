import type { Page } from "@playwright/test";

/**
 * F2-25 · Helpers compartidos por los 4 E2E de cierre de fase. Todos corren
 * contra el seed real de `npm run db:seed` (usuarios de
 * `src/lib/db/seed.ts`, password unica `Kortex#2026!`).
 */

export const SEED = {
  chainSlug: "don-bigote",
  locationSlug: "naco",
  naco: "00000000-0000-0000-0000-000000000301",
  password: "Kortex#2026!",
  adminNaco: "admin.naco@donbigote.test",
  barbero1: "barbero1@donbigote.test",
};

export async function loginAs(page: Page, email: string, password = SEED.password) {
  await page.goto("/login");
  await page.getByLabel("Correo electronico").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Iniciar sesion" }).click();
  // El form redirige a "/" tras un login exitoso (ver login-form.tsx).
  await page.waitForURL("**/");
}

/** Telefono RD unico por corrida (evita colisionar con el limite de 3 citas activas de D-F2-17 entre corridas). */
export function uniqueRdPhone(): string {
  const suffix = Date.now().toString().slice(-7).padStart(7, "0");
  return `809${suffix}`;
}

/**
 * Varios formularios de F2 usan `<FormField label="X"><Input/></FormField>`
 * (`src/components/ui/field.tsx`) sin pasar `htmlFor`, asi que el `<label>`
 * queda sin asociacion programatica con su `<input>` (son hermanos en el
 * DOM, no `for`/`id`). `getByLabel()` de Playwright no los encuentra por eso
 * — es una brecha real de accesibilidad, no un problema del test, pero
 * arreglar `field.tsx` en 8 componentes distintos es un cambio de UI fuera
 * del alcance de F2-25 (tarea de testing y cierre). Este helper ubica el
 * input por el texto del `<label>` hermano, que es estable mientras no
 * cambie el copy de la pantalla.
 */
export function fieldInput(page: Page, label: string) {
  return page.locator(`label:text-is("${label}") + input`);
}
