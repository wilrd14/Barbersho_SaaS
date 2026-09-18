import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { fieldInput, loginAs, SEED } from "./helpers";
import { testDb, SEED_IDS } from "./db-helpers";
import { appointments, auditLog, barberLocations, clients, schedules, users } from "../src/lib/db/schema";

/**
 * Auditoria post-F2-25: F2-09, reprogramar Y reasignar una cita desde el
 * sheet de detalle de "El Dia" (`rescheduleAppointmentAction`,
 * `src/lib/actions/appointments.ts`), otro camino de escritura/auditoria
 * dentro de una transaccion que los 4 E2E originales de F2-25 no cubrian.
 *
 * Para que este test sea determinista sin pelear con los horarios ya
 * sembrados en Naco (F2-24, anclados al momento en que se corrio el seed
 * por ultima vez, no al momento en que corre este test), se crean DOS
 * barberos temporales dedicados solo a este test (sin ninguna cita previa),
 * con `schedules` que cubren el dia completo — asi la cita nueva y el
 * horario de reprogramacion nunca chocan con datos de otro origen. Se
 * verifica en la DB real que: (a) `barber_id` y `starts_at` cambiaron al
 * nuevo barbero/horario, y (b) `audit_log` tiene una fila
 * `appointment.reschedule` con `before`/`after`. Timeout explicito de 20s
 * como red contra un deadlock silencioso (regresion del bug de F2-25).
 */
test.describe("Reprogramar y reasignar cita — F2-09", () => {
  const barberAId = "10000000-0000-0000-0000-0000000000a1";
  const barberBId = "10000000-0000-0000-0000-0000000000b1";
  let clientId: string;
  let appointmentId: string;
  let todayISO: string;

  test.beforeAll(async () => {
    todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());

    await testDb
      .insert(users)
      .values([
        { id: barberAId, email: "e2e-reprogramar-a@donbigote.test", fullName: "E2E Reprogramar Barbero A" },
        { id: barberBId, email: "e2e-reprogramar-b@donbigote.test", fullName: "E2E Reprogramar Barbero B" },
      ])
      .onConflictDoNothing();

    await testDb
      .insert(barberLocations)
      .values([
        { userId: barberAId, locationId: SEED_IDS.naco, isPrimary: false, isActive: true },
        { userId: barberBId, locationId: SEED_IDS.naco, isPrimary: false, isActive: true },
      ])
      .onConflictDoNothing();

    // Cubre los 7 dias de la semana (0=domingo..6=sabado) para no depender
    // de en que dia de la semana real corre este test.
    const scheduleRows = [barberAId, barberBId].flatMap((userId) =>
      Array.from({ length: 7 }, (_, dayOfWeek) => ({
        userId,
        locationId: SEED_IDS.naco,
        dayOfWeek,
        startTime: "00:00",
        endTime: "23:59",
        isActive: true,
      })),
    );
    await testDb.insert(schedules).values(scheduleRows);

    const [client] = await testDb
      .insert(clients)
      .values({
        chainId: SEED_IDS.chainId,
        fullName: "E2E Reprogramar Cliente",
        phone: `809555${Date.now().toString().slice(-4)}`,
      })
      .returning({ id: clients.id });
    clientId = client!.id;

    // America/Santo_Domingo es UTC-4 fijo (sin horario de verano).
    const startsAt = new Date(`${todayISO}T14:00:00-04:00`);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

    const [created] = await testDb
      .insert(appointments)
      .values({
        chainId: SEED_IDS.chainId,
        locationId: SEED_IDS.naco,
        clientId,
        barberId: barberAId,
        serviceId: SEED_IDS.serviceCorte,
        startsAt,
        endsAt,
        status: "confirmed",
        source: "admin",
        priceAtBooking: "350.00",
        notes: "E2E reprogramar-cita",
      })
      .returning({ id: appointments.id });
    appointmentId = created!.id;
  });

  test.afterAll(async () => {
    if (appointmentId) {
      await testDb.delete(auditLog).where(eq(auditLog.entityId, appointmentId));
      await testDb.delete(appointments).where(eq(appointments.id, appointmentId));
    }
    if (clientId) await testDb.delete(clients).where(eq(clients.id, clientId));
    await testDb.delete(schedules).where(eq(schedules.userId, barberAId));
    await testDb.delete(schedules).where(eq(schedules.userId, barberBId));
    await testDb.delete(barberLocations).where(eq(barberLocations.userId, barberAId));
    await testDb.delete(barberLocations).where(eq(barberLocations.userId, barberBId));
    await testDb.delete(users).where(eq(users.id, barberAId));
    await testDb.delete(users).where(eq(users.id, barberBId));
    // No cerramos `pgConn` aqui: `db-helpers.ts` es un modulo compartido por
    // TODOS los specs de este worker de Playwright (un solo proceso Node,
    // `workers: 1`) — cerrarlo desde un spec rompe la conexion de los que
    // corren despues en el mismo proceso. El socket se limpia solo al
    // terminar el proceso de test.
  });

  test("un admin reprograma la hora y reasigna la cita a otro barbero desde el sheet de El Dia", async ({ page }) => {
    // Red de seguridad explicita contra un deadlock silencioso (regresion
    // del bug de F2-25): si `writeAuditLog` vuelve a colgarse, este test
    // falla rapido con un timeout claro en vez de quedarse esperando.
    test.setTimeout(20_000);
    await loginAs(page, SEED.adminNaco);
    await page.goto(`/sede/${SEED_IDS.naco}/today`);

    // Abre el sheet de detalle clickeando el bloque de la cita en la rejilla.
    await page.getByRole("button", { name: /E2E Reprogramar Cliente/ }).click();
    await expect(page.getByRole("heading", { name: "E2E Reprogramar Cliente" })).toBeVisible();

    await page.getByRole("button", { name: "Reprogramar" }).click();

    await fieldInput(page, "Hora").fill("16:00");

    await page.getByLabel("Barbero").click();
    await page.getByRole("option", { name: "E2E Reprogramar Barbero B" }).click();

    await page.getByRole("button", { name: "Guardar cambios" }).click();

    // El sheet se cierra tras un reprogramar exitoso (onOpenChange(false)).
    await expect(page.getByRole("heading", { name: "E2E Reprogramar Cliente" })).toBeHidden({ timeout: 15_000 });

    // Verificacion contra la DB real.
    const [row] = await testDb
      .select({ barberId: appointments.barberId, startsAt: appointments.startsAt })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    expect(row?.barberId).toBe(barberBId);
    const localHour = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Santo_Domingo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(row!.startsAt);
    expect(localHour).toBe("16:00");

    const [audit] = await testDb
      .select({ before: auditLog.before, after: auditLog.after })
      .from(auditLog)
      .where(eq(auditLog.entityId, appointmentId))
      .limit(1);
    expect(audit).toBeTruthy();
    expect((audit?.before as { barberId?: string } | null)?.barberId).toBe(barberAId);
    expect((audit?.after as { barberId?: string } | null)?.barberId).toBe(barberBId);
  });
});
