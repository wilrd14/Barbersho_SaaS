import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { loginAs, SEED } from "./helpers";
import { testDb, SEED_IDS } from "./db-helpers";
import { appointments, auditLog, clients } from "../src/lib/db/schema";

/**
 * Auditoria post-F2-25: F2-14, cancelar cita del cliente
 * (`cancelMyAppointmentAction`, `src/lib/actions/client-appointments.ts`),
 * un camino de escritura/auditoria dentro de una transaccion que los 4 E2E
 * originales de F2-25 nunca ejercitaron. El bug de F2-25 (deadlock por
 * `writeAuditLog` sin `tx`) bloqueaba este camino tanto como los otros 12 —
 * este test es la red de seguridad permanente que faltaba.
 *
 * Se siembra una cita futura (mas alla de `cancellation_hours = 4` de la
 * cadena Don Bigote) directamente en la DB para `cliente1@donbigote.test`
 * (el seed no crea ninguna cita futura para un cliente con cuenta), se
 * cancela desde la UI real de `/appointments`, y se verifica en la DB real
 * que: (a) el estado queda `cancelled`, y (b) `audit_log` tiene una fila
 * `appointment.cancel_client` con `before.status` y `after.status`
 * correctos. El timeout explicito de 20s es la red contra un deadlock
 * silencioso (regresion del bug ya corregido).
 */
test.describe("Cancelar cita del cliente — F2-14", () => {
  let appointmentId: string;

  test.beforeAll(async () => {
    const [client] = await testDb
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.chainId, SEED_IDS.chainId), eq(clients.userId, SEED_IDS.cliente1UserId)))
      .limit(1);
    if (!client) {
      throw new Error("No se encontro el registro de `clients` de cliente1@donbigote.test — revisa el seed.");
    }

    const startsAt = new Date(Date.now() + 48 * 60 * 60_000); // 48h en el futuro, muy por encima de las 4h de cancellation_hours
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

    const [created] = await testDb
      .insert(appointments)
      .values({
        chainId: SEED_IDS.chainId,
        locationId: SEED_IDS.naco,
        clientId: client.id,
        barberId: SEED_IDS.barbero1Id,
        serviceId: SEED_IDS.serviceCorte,
        startsAt,
        endsAt,
        status: "confirmed",
        source: "online",
        priceAtBooking: "350.00",
        notes: "E2E cancelar-cita-cliente",
      })
      .returning({ id: appointments.id });
    appointmentId = created!.id;
  });

  test.afterAll(async () => {
    if (appointmentId) {
      await testDb.delete(auditLog).where(eq(auditLog.entityId, appointmentId));
      await testDb.delete(appointments).where(eq(appointments.id, appointmentId));
    }
    // No cerramos `pgConn` aqui: `db-helpers.ts` es un modulo compartido por
    // TODOS los specs de este worker de Playwright (un solo proceso Node,
    // `workers: 1`) — cerrarlo desde un spec rompe la conexion de los que
    // corren despues en el mismo proceso. El socket se limpia solo al
    // terminar el proceso de test.
  });

  test("el cliente cancela su cita desde /appointments y queda cancelled con audit_log", async ({ page }) => {
    // Red de seguridad explicita contra un deadlock silencioso (regresion
    // del bug de F2-25): si `writeAuditLog` vuelve a colgarse, este test
    // falla rapido con un timeout claro en vez de quedarse esperando.
    test.setTimeout(20_000);
    await loginAs(page, "cliente1@donbigote.test", SEED.password);
    await page.goto("/appointments");

    await expect(page.getByRole("heading", { name: "Proximas" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Confirmar cancelacion" }).click();

    // La UI hace `router.refresh()`; el badge de la fila debe pasar a "Cancelada".
    await expect(page.getByText("Cancelada")).toBeVisible({ timeout: 15_000 });

    // Verificacion contra la DB real: no solo lo que muestra la UI.
    const [row] = await testDb
      .select({ status: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    expect(row?.status).toBe("cancelled");

    const [audit] = await testDb
      .select({ before: auditLog.before, after: auditLog.after, action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.entityId, appointmentId), eq(auditLog.action, "appointment.cancel_client")))
      .limit(1);
    expect(audit).toBeTruthy();
    expect((audit?.before as { status?: string } | null)?.status).toBe("confirmed");
    expect((audit?.after as { status?: string } | null)?.status).toBe("cancelled");
  });
});
