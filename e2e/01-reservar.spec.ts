import { test, expect } from "@playwright/test";
import { SEED, uniqueRdPhone } from "./helpers";

/**
 * F2-25 · Flujo critico 1/4 (PRD §15): RESERVAR.
 *
 * Cliente anonimo completa el wizard de 4 pasos en
 * `/[chainSlug]/book` (D-F2-3) para la sede Naco del seed y confirma que la
 * cita se crea (pantalla de confirmacion con codigo de reserva, D-F2-16).
 */
test("un cliente anonimo reserva una cita de principio a fin", async ({ page }) => {
  await page.goto(`/${SEED.chainSlug}/book`);

  // Paso 1 — sede.
  await expect(page.getByRole("heading", { name: "Elegi tu sede" })).toBeVisible();
  await page.getByRole("button", { name: /Naco/i }).click();

  // Paso 2 — servicio.
  await expect(page.getByRole("heading", { name: "Elegi el servicio" })).toBeVisible();
  const firstServiceButton = page.locator("button").filter({ hasText: "RD$" }).first();
  await expect(firstServiceButton).toBeVisible({ timeout: 10_000 });
  await firstServiceButton.click();

  // Paso 3 — fecha y hora. Se prueban varias fechas de la tira hasta
  // encontrar un dia con slots libres (el seed puede dejar ocupados los mas
  // cercanos).
  await expect(page.getByRole("heading", { name: "Elegi fecha y hora" })).toBeVisible();
  const dateChips = page.locator("div.flex.gap-2.overflow-x-auto button");
  const chipCount = await dateChips.count();
  let slotButton = null;
  for (let i = 0; i < chipCount; i++) {
    await dateChips.nth(i).click();
    await page.waitForTimeout(400); // debounce de la carga de disponibilidad
    await expect(page.getByText("Buscando horarios...")).toBeHidden({ timeout: 5_000 }).catch(() => {});
    const candidate = page.locator("div.grid button").first();
    if (await candidate.isVisible().catch(() => false)) {
      slotButton = candidate;
      break;
    }
  }
  expect(slotButton, "No se encontro ningun dia con horarios libres en 7 dias").not.toBeNull();
  await slotButton!.click();

  // Paso 4 — confirmar.
  await expect(page.getByRole("heading", { name: "Confirma tu reserva" })).toBeVisible();
  await page.getByLabel("Nombre completo", { exact: true }).fill("Cliente E2E Reservar");
  await page.getByLabel("Telefono", { exact: true }).fill(uniqueRdPhone());
  await page.getByRole("button", { name: "Confirmar reserva" }).click();

  // Confirmacion: titulo "¡Listo!" + codigo corto de reserva (D-F2-16).
  await expect(page.getByRole("heading", { name: "¡Listo!" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Codigo de reserva")).toBeVisible();
});
