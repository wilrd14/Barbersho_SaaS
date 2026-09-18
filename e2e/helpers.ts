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
