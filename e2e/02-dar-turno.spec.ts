import { test, expect } from "@playwright/test";
import { loginAs, SEED } from "./helpers";
import {
  findE2eClientIds,
  purgeClients,
  restoreQueue,
  snapshotQueue,
  type QueueSnapshot,
} from "./db-helpers";

/**
 * F2-25 · Flujo critico 2/4 (PRD §15): DAR TURNO.
 *
 * Login como gerente de Naco, ir a La Fila (`/sede/<locationId>/queue`),
 * agregar un walk-in nuevo y confirmar que aparece en la lista (F2-16/F2-17).
 *
 * Limpieza: `joinQueue` crea un cliente "Walkin E2E <ts>" y un turno, y
 * ademas `recalcQueueState` REESCRIBE position/estimated_wait_minutes de los
 * turnos hermanos del seed. Por eso se toma una foto de la fila de Naco antes
 * (`snapshotQueue`) y `afterAll` borra lo nuevo y restaura lo que ya existia.
 */
const clientName = `Walkin E2E ${Date.now()}`;
let queueBefore: QueueSnapshot;

test.beforeAll(async () => {
  queueBefore = await snapshotQueue();
});

test.afterAll(async () => {
  await purgeClients(await findE2eClientIds({ fullName: clientName }));
  await restoreQueue(queueBefore);
});

test("un gerente agrega un walk-in nuevo a la fila y lo ve en pantalla", async ({ page }) => {
  await loginAs(page, SEED.adminNaco);

  await page.goto(`/sede/${SEED.naco}/queue`);
  await expect(page.getByRole("heading", { name: /La Fila/ })).toBeVisible();

  await page.getByRole("button", { name: "Dar turno" }).click();

  await page.getByLabel("Nombre del cliente", { exact: true }).fill(clientName);

  // Select de servicio (base-ui): abrir el combobox y elegir la primera opcion real.
  await page.getByRole("combobox", { name: "Servicio" }).click();
  await page.getByRole("option").first().click();

  await page.getByRole("button", { name: "Agregar a la fila" }).click();

  // El sheet se cierra y el walk-in aparece en la lista de turnos visibles.
  await expect(page.getByText(clientName)).toBeVisible({ timeout: 10_000 });
});
