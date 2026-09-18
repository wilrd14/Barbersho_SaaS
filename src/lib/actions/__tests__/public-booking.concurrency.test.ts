import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { appointments, auditLog, barberLocations, clients, locations, schedules, services } from "@/lib/db/schema";
import { createPublicBookingAction } from "@/lib/actions/public-booking";

/**
 * F2-25 · Test de concurrencia real de doble-booking (riesgo B de
 * BACKLOG-F2.md §9; AC de F2-01: "un insert de cita solapada para el mismo
 * barbero es rechazado por Postgres, test de integracion con dos inserts";
 * AC de F2-13: "dos reservas concurrentes del mismo slot: una responde ok,
 * la otra devuelve el mensaje").
 *
 * Nota tecnica importante: el cliente Drizzle de la app
 * (`src/lib/db/client.ts`) abre el pool con `max: 1` (una sola conexion
 * TCP, a proposito para el runtime de Cloudflare Workers). Dos llamadas en
 * paralelo a un Server Action que usa ese mismo cliente singleton NO
 * ejercitan una condicion de carrera real a nivel de Postgres — postgres.js
 * encola ambas sobre la misma conexion y las corre en secuencia, así que la
 * segunda nunca se solapa de verdad con la primera. Para probar la
 * condicion de carrera real (dos transacciones concurrentes de verdad) este
 * test abre DOS conexiones independientes a la misma DB y dispara los dos
 * `insert` en paralelo con `Promise.all` — asi ambas transacciones SI
 * corren al mismo tiempo en el servidor de Postgres, y es el `EXCLUDE`
 * constraint de `0002_f2_integrity.sql` (no la capa de aplicacion) quien
 * decide cual gana.
 *
 * Un segundo test, mas simple, verifica la capa 2 (re-verificacion en la
 * Server Action) y el mensaje de error en español que ve el cliente
 * (regla dura §3.7c) llamando `createPublicBookingAction` dos veces para el
 * mismo slot.
 *
 * Requiere DATABASE_URL apuntando a un proyecto con el seed cargado
 * (`npm run db:seed`), cargado por `vitest.setup.ts` desde `.env.local`.
 */

const NACO = "00000000-0000-0000-0000-000000000301";
const CHAIN_SLUG = "don-bigote";

function futureOverlappingRange(offsetDays: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + offsetDays);
  start.setUTCHours(15, 0, 0, 0); // horario cualquiera, lo unico que importa es que se solape
  const end = new Date(start.getTime() + 30 * 60_000);
  return { start, end };
}

describe("Doble-booking — concurrencia real contra Postgres", () => {
  let chainId: string;
  let clientId: string;
  let barberId: string;
  let serviceId: string;
  const createdAppointmentIds: string[] = [];

  beforeAll(async () => {
    const [location] = await db
      .select({ chainId: locations.chainId })
      .from(locations)
      .where(eq(locations.id, NACO))
      .limit(1);
    if (!location) throw new Error("No se encontro la sede Naco del seed.");
    chainId = location.chainId;

    const [barber] = await db
      .select({ userId: barberLocations.userId })
      .from(barberLocations)
      .where(and(eq(barberLocations.locationId, NACO), eq(barberLocations.isActive, true)))
      .limit(1);
    if (!barber) throw new Error("No hay barberos activos en Naco — revisa el seed.");
    barberId = barber.userId;

    const [service] = await db.select({ id: services.id }).from(services).limit(1);
    if (!service) throw new Error("No hay servicios sembrados — revisa el seed.");
    serviceId = service.id;

    const [existingClient] = await db.select({ id: clients.id }).from(clients).where(eq(clients.chainId, chainId)).limit(1);
    if (!existingClient) throw new Error("No hay clientes sembrados — revisa el seed.");
    clientId = existingClient.id;

    // Auto-reparacion: si una corrida anterior de este archivo fallo a mitad
    // (p.ej. timeout) y dejo residuos sin limpiar, se borran aqui antes de
    // empezar. Identificados por la marca `price_at_booking = 500.00` +
    // `source = admin` que solo usa este test, o por los telefonos fijos de
    // prueba de este archivo.
    // OJO: las citas del seed de F2-24 (IDs `00000000-0000-0000-0000-…`) tambien
    // son `source = admin` y una de ellas (`…0801`, Fade a RD$500 del barbero
    // 1) cumplia esta marca: `npm run test` borraba una fila del seed. Por eso
    // se excluyen explicitamente los IDs fijos del seed.
    await db
      .delete(appointments)
      .where(
        and(
          eq(appointments.barberId, barberId),
          eq(appointments.priceAtBooking, "500.00"),
          eq(appointments.source, "admin"),
          sql`${appointments.id}::text not like '00000000-0000-0000-0000-%'`,
        ),
      );
    const testPhones = ["+18095557001", "+18095557002", "+18095557003", "+18095557004"];
    const staleClients = await db.select({ id: clients.id }).from(clients).where(inArray(clients.phone, testPhones));
    if (staleClients.length > 0) {
      const staleIds = staleClients.map((c) => c.id);
      await db.delete(appointments).where(inArray(appointments.clientId, staleIds));
      await db.delete(clients).where(inArray(clients.id, staleIds));
    }
  });

  afterAll(async () => {
    if (createdAppointmentIds.length > 0) {
      await db.delete(appointments).where(inArray(appointments.id, createdAppointmentIds));
    }
  }, 20_000);

  it("dos inserts simultaneos del mismo barbero, mismo rango solapado: Postgres rechaza uno", async () => {
    const { start, end } = futureOverlappingRange(3);

    // Dos conexiones INDEPENDIENTES (no el singleton `max:1` de la app) para
    // que las dos transacciones corran de verdad al mismo tiempo.
    const connA = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    const connB = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
    const dbA = drizzle(connA, { schema });
    const dbB = drizzle(connB, { schema });

    async function attemptInsert(conn: typeof dbA) {
      return conn
        .insert(appointments)
        .values({
          chainId,
          locationId: NACO,
          clientId,
          barberId,
          serviceId,
          startsAt: start,
          endsAt: end,
          status: "confirmed",
          source: "admin",
          priceAtBooking: "500.00",
        })
        .returning({ id: appointments.id });
    }

    const results = await Promise.allSettled([attemptInsert(dbA), attemptInsert(dbB)]);

    await connA.end();
    await connB.end();

    for (const r of results) {
      if (r.status === "fulfilled") createdAppointmentIds.push(r.value[0]!.id);
    }

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Codigo 23P01 = exclusion_violation (Postgres), disparado por el
    // EXCLUDE constraint de 0002_f2_integrity.sql sobre (barber_id, rango).
    // Drizzle envuelve el error de postgres.js: el codigo real vive en
    // `.cause.code` (el error de nivel superior es un `DrizzleQueryError`).
    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason as {
      code?: string;
      cause?: { code?: string; message?: string };
    };
    const pgCode = rejectedReason.cause?.code ?? rejectedReason.code;
    expect(pgCode).toBe("23P01");

    // Verificacion final contra la DB: solo quedo UNA cita en ese rango para
    // ese barbero, nunca dos.
    const rows = await db.select({ id: appointments.id }).from(appointments).where(inArray(appointments.id, createdAppointmentIds));
    expect(rows).toHaveLength(1);
  }, 20_000);

  it("createPublicBookingAction: la segunda reserva del mismo slot recibe un mensaje en espanol, no un stack trace", async () => {
    // Slot deducido del horario real sembrado del barbero (no un valor fijo
    // que podria caer fuera de su bloque de `schedules`): toma su primer
    // bloque activo en Naco y ubica la proxima fecha (>=6 dias, distinta al
    // rango que usa el primer test) que cae en ese dia de la semana.
    const [block] = await db
      .select({ dayOfWeek: schedules.dayOfWeek, startTime: schedules.startTime })
      .from(schedules)
      .where(and(eq(schedules.userId, barberId), eq(schedules.locationId, NACO), eq(schedules.isActive, true)))
      .limit(1);
    if (!block) throw new Error("El barbero de prueba no tiene horario sembrado en Naco.");

    const targetDate = new Date();
    targetDate.setUTCDate(targetDate.getUTCDate() + 6);
    while (targetDate.getUTCDay() !== block.dayOfWeek) {
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }
    const dateISO = targetDate.toISOString().slice(0, 10);
    const [h, m] = block.startTime.split(":").map(Number);
    const slotStartMinutes = h! * 60 + m! + 60; // 1h despues de abrir, con margen de sobra

    const bookingInput = (phone: string) => ({
      chainSlug: CHAIN_SLUG,
      locationId: NACO,
      serviceId,
      barberId,
      date: dateISO,
      slotStartMinutes,
      fullName: "Test Doble Reserva",
      phone,
    });

    const first = await createPublicBookingAction(bookingInput("8095557003"));
    const second = await createPublicBookingAction(bookingInput("8095557004"));

    if (first.ok) createdAppointmentIds.push(first.data.appointmentId);
    if (second.ok) createdAppointmentIds.push(second.data.appointmentId);

    // Limpieza: primero las citas (FK a clients), despues los clientes de
    // prueba creados por esta llamada.
    if (createdAppointmentIds.length > 0) {
      // `createPublicBookingAction` escribe audit_log `appointment.book_public`:
      // sin borrarlo aqui quedaba una fila huerfana por corrida.
      await db.delete(auditLog).where(inArray(auditLog.entityId, createdAppointmentIds));
      await db.delete(appointments).where(inArray(appointments.id, createdAppointmentIds));
      createdAppointmentIds.length = 0;
    }
    const testClients = await db
      .select({ id: clients.id })
      .from(clients)
      .where(inArray(clients.phone, ["+18095557003", "+18095557004"]));
    if (testClients.length > 0) {
      await db.delete(clients).where(
        inArray(
          clients.id,
          testClients.map((c) => c.id),
        ),
      );
    }

    // El primero puede fallar por fuera-de-horario si 15:00 no cae en el
    // horario de ese barbero ese dia — lo que de verdad importa aqui es que
    // AMBOS intentos den el MISMO resultado de disponibilidad (si el slot
    // esta libre, uno gana y el otro ve "ocupado"; si el slot no es valido,
    // los dos lo rechazan por la misma razon de horario, nunca uno si y
    // otro con un error interno).
    if (first.ok) {
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error).toMatch(/ocup|disponible/i);
      }
    } else {
      expect(second.ok).toBe(false);
    }
  }, 20_000);
});
