import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";

import { db } from "./client";
import {
  appointments,
  barberLocations,
  cashSessions,
  chains,
  clients,
  commissionRules,
  locationServiceOverrides,
  locations,
  memberships,
  saleItems,
  sales,
  schedules,
  services,
  subscriptions,
  users,
  walkInQueue,
} from "./schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Seed de datos de prueba (S1-15). Idempotente: usa UUIDs fijos y
 * onConflictDoUpdate/onConflictDoNothing, asi que correrlo dos veces no
 * duplica filas ni falla.
 *
 * Password para TODOS los usuarios de prueba: ver SEED_PASSWORD abajo.
 */
const SEED_PASSWORD = "Kortex#2026!";

const CHAIN_ID = "00000000-0000-0000-0000-000000000001";
const SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000601";

const LOCATION_NACO = "00000000-0000-0000-0000-000000000301";
const LOCATION_BELLA_VISTA = "00000000-0000-0000-0000-000000000302";
const LOCATION_SAN_CRISTOBAL = "00000000-0000-0000-0000-000000000303";

const OWNER_ID = "00000000-0000-0000-0000-000000000010";
const ADMIN_NACO_ID = "00000000-0000-0000-0000-000000000011";
const ADMIN_BV_ID = "00000000-0000-0000-0000-000000000012";

const BARBER_IDS = [
  "00000000-0000-0000-0000-000000000101", // b1 - Naco
  "00000000-0000-0000-0000-000000000102", // b2 - Naco
  "00000000-0000-0000-0000-000000000103", // b3 - Naco + Bella Vista (multi-sede)
  "00000000-0000-0000-0000-000000000104", // b4 - Bella Vista
  "00000000-0000-0000-0000-000000000105", // b5 - Bella Vista
  "00000000-0000-0000-0000-000000000106", // b6 - San Cristobal
];
const MULTI_LOCATION_BARBER_ID = BARBER_IDS[2];

const CLIENT_USER_IDS = [
  "00000000-0000-0000-0000-000000000201",
  "00000000-0000-0000-0000-000000000202",
];

const SERVICE_CORTE = "00000000-0000-0000-0000-000000000401";
const SERVICE_FADE = "00000000-0000-0000-0000-000000000402";
const SERVICE_BARBA = "00000000-0000-0000-0000-000000000403";
const SERVICE_FADE_BARBA = "00000000-0000-0000-0000-000000000404";
const SERVICE_TINTE = "00000000-0000-0000-0000-000000000405";

const COMMISSION_RULE_ID = "00000000-0000-0000-0000-000000000501";

const WALK_IN_CLIENT_IDS = [
  "00000000-0000-0000-0000-000000000701",
  "00000000-0000-0000-0000-000000000702",
  "00000000-0000-0000-0000-000000000703",
];

// F2-24: dia operativo de hoy/ayer en Naco. IDs fijos nuevos, sin chocar con
// los de arriba (que llegan hasta ...703 / ...601).
const APPOINTMENT_TODAY_IDS = [
  "00000000-0000-0000-0000-000000000801", // b1 completed
  "00000000-0000-0000-0000-000000000802", // b1 in_progress
  "00000000-0000-0000-0000-000000000803", // b1 confirmed
  "00000000-0000-0000-0000-000000000804", // b2 completed
  "00000000-0000-0000-0000-000000000805", // b2 completed
  "00000000-0000-0000-0000-000000000806", // b2 confirmed
  "00000000-0000-0000-0000-000000000807", // b3 in_progress
  "00000000-0000-0000-0000-000000000808", // b3 confirmed
];

const WALK_IN_QUEUE_IDS = [
  "00000000-0000-0000-0000-000000000901",
  "00000000-0000-0000-0000-000000000902",
  "00000000-0000-0000-0000-000000000903",
];

const CASH_SESSION_TODAY_ID = "00000000-0000-0000-0000-000000001001";
const CASH_SESSION_YESTERDAY_ID = "00000000-0000-0000-0000-000000001002";

const SALE_YESTERDAY_IDS = [
  "00000000-0000-0000-0000-000000001101",
  "00000000-0000-0000-0000-000000001102",
  "00000000-0000-0000-0000-000000001103",
  "00000000-0000-0000-0000-000000001104",
  "00000000-0000-0000-0000-000000001105",
];

const SALE_ITEM_YESTERDAY_IDS = [
  "00000000-0000-0000-0000-000000001201",
  "00000000-0000-0000-0000-000000001202",
  "00000000-0000-0000-0000-000000001203",
  "00000000-0000-0000-0000-000000001204",
  "00000000-0000-0000-0000-000000001205",
];

// Precios efectivos ya sembrados para Naco (D-F2-1): Fade tiene override a
// RD$500 en Naco (seedServiceOverrides); el resto usa el precio de catalogo.
const NACO_PRICE = {
  corte: "350.00",
  fade: "500.00",
  barba: "250.00",
  fadeBarba: "650.00",
};

function minutesFromNow(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

interface SeedAuthUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
}

const SEED_USERS: SeedAuthUser[] = [
  { id: OWNER_ID, email: "owner@donbigote.test", fullName: "Ramon Bigote (Owner)" },
  { id: ADMIN_NACO_ID, email: "admin.naco@donbigote.test", fullName: "Admin Naco" },
  { id: ADMIN_BV_ID, email: "admin.bellavista@donbigote.test", fullName: "Admin Bella Vista" },
  { id: BARBER_IDS[0], email: "barbero1@donbigote.test", fullName: "Barbero Uno" },
  { id: BARBER_IDS[1], email: "barbero2@donbigote.test", fullName: "Barbero Dos" },
  {
    id: BARBER_IDS[2],
    email: "barbero3@donbigote.test",
    fullName: "Barbero Tres (multi-sede)",
  },
  { id: BARBER_IDS[3], email: "barbero4@donbigote.test", fullName: "Barbero Cuatro" },
  { id: BARBER_IDS[4], email: "barbero5@donbigote.test", fullName: "Barbero Cinco" },
  { id: BARBER_IDS[5], email: "barbero6@donbigote.test", fullName: "Barbero Seis" },
  { id: CLIENT_USER_IDS[0], email: "cliente1@donbigote.test", fullName: "Cliente Uno" },
  { id: CLIENT_USER_IDS[1], email: "cliente2@donbigote.test", fullName: "Cliente Dos" },
];

const businessHoursMonToSat = {
  mon: { opens_at: "09:00", closes_at: "20:00", closed: false },
  tue: { opens_at: "09:00", closes_at: "20:00", closed: false },
  wed: { opens_at: "09:00", closes_at: "20:00", closed: false },
  thu: { opens_at: "09:00", closes_at: "20:00", closed: false },
  fri: { opens_at: "09:00", closes_at: "20:00", closed: false },
  sat: { opens_at: "09:00", closes_at: "20:00", closed: false },
  sun: { opens_at: null, closes_at: null, closed: true },
};

async function ensureAuthUsers() {
  const admin = createSupabaseAdminClient();

  for (const seedUser of SEED_USERS) {
    const { data: existing } = await admin.auth.admin.getUserById(seedUser.id);

    if (!existing?.user) {
      const { error } = await admin.auth.admin.createUser({
        id: seedUser.id,
        email: seedUser.email,
        password: SEED_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: seedUser.fullName },
      });

      if (error) {
        throw new Error(
          `No se pudo crear el usuario de seed ${seedUser.email}: ${error.message}`,
        );
      }
    }
  }
}

async function upsertAppUsers() {
  for (const seedUser of SEED_USERS) {
    await db
      .insert(users)
      .values({
        id: seedUser.id,
        email: seedUser.email,
        fullName: seedUser.fullName,
        phone: seedUser.phone ?? null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: seedUser.email, fullName: seedUser.fullName },
      });
  }
}

async function seedChainAndSubscription() {
  await db
    .insert(chains)
    .values({
      id: CHAIN_ID,
      name: "Don Bigote Barbershop",
      slug: "don-bigote",
      ownerId: OWNER_ID,
      currency: "DOP",
      country: "DO",
      timezone: "America/Santo_Domingo",
      allowCrossLocationBooking: true,
      maxBarberDiscountPct: "10",
      cancellationHours: 4,
    })
    .onConflictDoUpdate({
      target: chains.id,
      set: {
        name: "Don Bigote Barbershop",
        allowCrossLocationBooking: true,
        maxBarberDiscountPct: "10",
        cancellationHours: 4,
      },
    });

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 21);

  await db
    .insert(subscriptions)
    .values({
      id: SUBSCRIPTION_ID,
      chainId: CHAIN_ID,
      plan: "chain",
      status: "trialing",
      includedLocations: 3,
      extraLocations: 0,
      billingCycle: "monthly",
      trialEndsAt,
    })
    .onConflictDoUpdate({
      target: subscriptions.chainId,
      set: { plan: "chain", status: "trialing", includedLocations: 3, trialEndsAt },
    });
}

async function seedLocations() {
  const rows = [
    {
      id: LOCATION_NACO,
      name: "Naco",
      slug: "naco",
      address: "Av. Tiradentes, Naco",
      city: "Santo Domingo",
      phone: "809-555-0101",
      chairsCount: 6,
    },
    {
      id: LOCATION_BELLA_VISTA,
      name: "Bella Vista",
      slug: "bella-vista",
      address: "Av. Bolivar, Bella Vista",
      city: "Santo Domingo",
      phone: "809-555-0102",
      chairsCount: 4,
    },
    {
      id: LOCATION_SAN_CRISTOBAL,
      name: "San Cristobal",
      slug: "san-cristobal",
      address: "Calle Duarte, San Cristobal",
      city: "San Cristobal",
      phone: "809-555-0103",
      chairsCount: 5,
    },
  ];

  for (const row of rows) {
    await db
      .insert(locations)
      .values({
        id: row.id,
        chainId: CHAIN_ID,
        name: row.name,
        slug: row.slug,
        address: row.address,
        city: row.city,
        phone: row.phone,
        chairsCount: row.chairsCount,
        timezone: "America/Santo_Domingo",
        isActive: true,
        businessHours: businessHoursMonToSat,
      })
      .onConflictDoUpdate({
        target: locations.id,
        set: { name: row.name, chairsCount: row.chairsCount, isActive: true },
      });
  }
}

async function seedMemberships() {
  const rows: { userId: string; role: "superuser" | "admin" | "barber" }[] = [
    { userId: OWNER_ID, role: "superuser" },
    { userId: ADMIN_NACO_ID, role: "admin" },
    { userId: ADMIN_BV_ID, role: "admin" },
    ...BARBER_IDS.map((userId) => ({ userId, role: "barber" as const })),
  ];

  for (const row of rows) {
    await db
      .insert(memberships)
      .values({ userId: row.userId, chainId: CHAIN_ID, role: row.role, isActive: true })
      .onConflictDoUpdate({
        target: [memberships.userId, memberships.chainId],
        set: { role: row.role, isActive: true },
      });
  }
}

async function seedBarberLocations() {
  const assignments: {
    userId: string;
    locationId: string;
    isPrimary: boolean;
  }[] = [
    { userId: BARBER_IDS[0], locationId: LOCATION_NACO, isPrimary: true },
    { userId: BARBER_IDS[1], locationId: LOCATION_NACO, isPrimary: true },
    { userId: BARBER_IDS[2], locationId: LOCATION_NACO, isPrimary: true },
    { userId: BARBER_IDS[3], locationId: LOCATION_BELLA_VISTA, isPrimary: true },
    { userId: BARBER_IDS[4], locationId: LOCATION_BELLA_VISTA, isPrimary: true },
    { userId: BARBER_IDS[5], locationId: LOCATION_SAN_CRISTOBAL, isPrimary: true },
    // Barbero multi-sede: asignacion secundaria a Bella Vista.
    { userId: MULTI_LOCATION_BARBER_ID, locationId: LOCATION_BELLA_VISTA, isPrimary: false },
    // Admins asignados a su sede (para que el guard de S1-13 los reconozca).
    { userId: ADMIN_NACO_ID, locationId: LOCATION_NACO, isPrimary: true },
    { userId: ADMIN_BV_ID, locationId: LOCATION_BELLA_VISTA, isPrimary: true },
  ];

  for (const row of assignments) {
    await db
      .insert(barberLocations)
      .values({
        userId: row.userId,
        locationId: row.locationId,
        isPrimary: row.isPrimary,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [barberLocations.userId, barberLocations.locationId],
        set: { isPrimary: row.isPrimary, isActive: true },
      });
  }
}

async function seedSchedules() {
  // Barbero multi-sede: lun-mie en Naco, jue-sab en Bella Vista (sin solapamiento).
  // F2-24: se corrige aqui un bug de idempotencia pre-existente — el chequeo
  // grueso original consultaba "el usuario ya tiene ALGUNA fila" en cada dia
  // del loop, asi que tras insertar el primer dia ya encontraba una fila y
  // saltaba el resto (en la practica, el barbero multi-sede solo terminaba
  // con lunes en Naco, nunca el bloque completo). Ahora se chequea la fila
  // exacta (userId, locationId, dayOfWeek) antes de cada insert: es idempotente
  // corrida a corrida **y** autorepara bases ya afectadas por el bug viejo.
  // Tambien se completan b1 y b2 (Naco, mono-sede), que no tenian NINGUN
  // horario sembrado y por eso nunca aparecian como columna en la rejilla de
  // agenda (F2-06 lee `schedules` para saber que barberos tienen turno ese dia).
  const blocksByUser = new Map<string, { locationId: string; days: number[] }[]>([
    [
      MULTI_LOCATION_BARBER_ID,
      [
        { locationId: LOCATION_NACO, days: [1, 2, 3] },
        { locationId: LOCATION_BELLA_VISTA, days: [4, 5, 6] },
      ],
    ],
    [BARBER_IDS[0], [{ locationId: LOCATION_NACO, days: [1, 2, 3, 4, 5, 6] }]],
    [BARBER_IDS[1], [{ locationId: LOCATION_NACO, days: [1, 2, 3, 4, 5, 6] }]],
  ]);

  for (const [userId, blocks] of blocksByUser) {
    for (const block of blocks) {
      for (const dayOfWeek of block.days) {
        const existing = await db
          .select({ id: schedules.id })
          .from(schedules)
          .where(
            and(
              eq(schedules.userId, userId),
              eq(schedules.locationId, block.locationId),
              eq(schedules.dayOfWeek, dayOfWeek),
            ),
          )
          .limit(1);

        if (existing.length > 0) continue; // ya sembrado en una corrida anterior

        await db.insert(schedules).values({
          userId,
          locationId: block.locationId,
          dayOfWeek,
          startTime: "09:00",
          endTime: "20:00",
          isActive: true,
        });
      }
    }
  }
}

async function seedServices() {
  const rows = [
    {
      id: SERVICE_CORTE,
      name: "Corte clasico",
      category: "corte" as const,
      defaultDurationMinutes: 30,
      defaultPrice: "350",
    },
    {
      id: SERVICE_FADE,
      name: "Fade",
      category: "corte" as const,
      defaultDurationMinutes: 40,
      defaultPrice: "450",
    },
    {
      id: SERVICE_BARBA,
      name: "Barba",
      category: "barba" as const,
      defaultDurationMinutes: 20,
      defaultPrice: "250",
    },
    {
      id: SERVICE_FADE_BARBA,
      name: "Fade + Barba",
      category: "combo" as const,
      defaultDurationMinutes: 55,
      defaultPrice: "650",
    },
    {
      id: SERVICE_TINTE,
      name: "Tinte",
      category: "color" as const,
      defaultDurationMinutes: 60,
      defaultPrice: "800",
    },
  ];

  for (const row of rows) {
    await db
      .insert(services)
      .values({
        id: row.id,
        chainId: CHAIN_ID,
        name: row.name,
        category: row.category,
        defaultDurationMinutes: row.defaultDurationMinutes,
        defaultPrice: row.defaultPrice,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: services.id,
        set: { name: row.name, defaultPrice: row.defaultPrice },
      });
  }
}

async function seedServiceOverrides() {
  // Criterio 1.6 del PRD: Fade a RD$500 en Naco y RD$400 en San Cristobal.
  const rows = [
    { locationId: LOCATION_NACO, serviceId: SERVICE_FADE, price: "500" },
    { locationId: LOCATION_SAN_CRISTOBAL, serviceId: SERVICE_FADE, price: "400" },
  ];

  for (const row of rows) {
    await db
      .insert(locationServiceOverrides)
      .values({
        locationId: row.locationId,
        serviceId: row.serviceId,
        price: row.price,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [locationServiceOverrides.locationId, locationServiceOverrides.serviceId],
        set: { price: row.price, isActive: true },
      });
  }
}

async function seedCommissionRule() {
  await db
    .insert(commissionRules)
    .values({
      id: COMMISSION_RULE_ID,
      chainId: CHAIN_ID,
      name: "Comision estandar 50%",
      type: "percentage",
      serviceCommissionPct: "50",
      appliesTo: "chain",
    })
    .onConflictDoUpdate({
      target: commissionRules.id,
      set: { serviceCommissionPct: "50", appliesTo: "chain" },
    });
}

async function seedClients() {
  // 2 clientes con user_id (login funcional).
  const withUser = [
    { userId: CLIENT_USER_IDS[0], fullName: "Cliente Uno", phone: "809-555-0201" },
    { userId: CLIENT_USER_IDS[1], fullName: "Cliente Dos", phone: "809-555-0202" },
  ];

  for (const row of withUser) {
    await db
      .insert(clients)
      .values({
        chainId: CHAIN_ID,
        userId: row.userId,
        fullName: row.fullName,
        phone: row.phone,
      })
      .onConflictDoNothing({ target: [clients.chainId, clients.phone] });
  }

  // 3 clientes sin user_id (walk-in tipico), ids fijos para idempotencia.
  const walkIns = [
    { id: WALK_IN_CLIENT_IDS[0], fullName: "Cliente Walk-in Uno", phone: "809-555-0301" },
    { id: WALK_IN_CLIENT_IDS[1], fullName: "Cliente Walk-in Dos", phone: "809-555-0302" },
    { id: WALK_IN_CLIENT_IDS[2], fullName: "Cliente Walk-in Tres", phone: "809-555-0303" },
  ];

  for (const row of walkIns) {
    await db
      .insert(clients)
      .values({
        id: row.id,
        chainId: CHAIN_ID,
        fullName: row.fullName,
        phone: row.phone,
      })
      .onConflictDoUpdate({
        target: clients.id,
        set: { fullName: row.fullName, phone: row.phone },
      });
  }
}

/**
 * F2-24: dia operativo de hoy para Naco. 8 citas repartidas entre los 3
 * barberos de Naco, ancladas a `now` (nunca a una fecha fija) para que el
 * seed siga siendo util corriendolo cualquier dia:
 *  - completed: ya terminaron antes de `now` (KPI de ingreso del dia).
 *  - in_progress: `now` cae dentro de [startsAt, endsAt) (KPI de sillas
 *    ocupadas ahora).
 *  - confirmed: empiezan despues de `now` (agenda del resto del dia).
 * Los rangos por barbero no se solapan entre si (respeta el EXCLUDE
 * constraint de 0002_f2_integrity.sql).
 */
async function seedTodayAppointments(now: Date) {
  const barberNaco1 = BARBER_IDS[0];
  const barberNaco2 = BARBER_IDS[1];
  const barberNaco3 = MULTI_LOCATION_BARBER_ID; // primario en Naco

  const rows: {
    id: string;
    barberId: string;
    clientId: string;
    serviceId: string;
    price: string;
    durationMinutes: number;
    startOffsetMinutes: number;
    status: "confirmed" | "in_progress" | "completed";
  }[] = [
    // Barbero 1
    {
      id: APPOINTMENT_TODAY_IDS[0],
      barberId: barberNaco1,
      clientId: WALK_IN_CLIENT_IDS[0],
      serviceId: SERVICE_FADE,
      price: NACO_PRICE.fade,
      durationMinutes: 40,
      startOffsetMinutes: -180,
      status: "completed",
    },
    {
      id: APPOINTMENT_TODAY_IDS[1],
      barberId: barberNaco1,
      clientId: WALK_IN_CLIENT_IDS[1],
      serviceId: SERVICE_CORTE,
      price: NACO_PRICE.corte,
      durationMinutes: 30,
      startOffsetMinutes: -10,
      status: "in_progress",
    },
    {
      id: APPOINTMENT_TODAY_IDS[2],
      barberId: barberNaco1,
      clientId: WALK_IN_CLIENT_IDS[2],
      serviceId: SERVICE_BARBA,
      price: NACO_PRICE.barba,
      durationMinutes: 20,
      startOffsetMinutes: 120,
      status: "confirmed",
    },
    // Barbero 2
    {
      id: APPOINTMENT_TODAY_IDS[3],
      barberId: barberNaco2,
      clientId: WALK_IN_CLIENT_IDS[1],
      serviceId: SERVICE_CORTE,
      price: NACO_PRICE.corte,
      durationMinutes: 30,
      startOffsetMinutes: -240,
      status: "completed",
    },
    {
      id: APPOINTMENT_TODAY_IDS[4],
      barberId: barberNaco2,
      clientId: WALK_IN_CLIENT_IDS[2],
      serviceId: SERVICE_BARBA,
      price: NACO_PRICE.barba,
      durationMinutes: 20,
      startOffsetMinutes: -120,
      status: "completed",
    },
    {
      id: APPOINTMENT_TODAY_IDS[5],
      barberId: barberNaco2,
      clientId: WALK_IN_CLIENT_IDS[0],
      serviceId: SERVICE_FADE_BARBA,
      price: NACO_PRICE.fadeBarba,
      durationMinutes: 55,
      startOffsetMinutes: 180,
      status: "confirmed",
    },
    // Barbero 3 (multi-sede, primario en Naco)
    {
      id: APPOINTMENT_TODAY_IDS[6],
      barberId: barberNaco3,
      // Los clientes con user_id (CLIENT_USER_IDS) se insertan con id
      // aleatorio (onConflictDoNothing por telefono en seedClients) — no hay
      // un id fijo para referenciar via FK. Se usan los walk-in, que si
      // tienen id fijo (clients.id = WALK_IN_CLIENT_IDS[n]).
      clientId: WALK_IN_CLIENT_IDS[0],
      serviceId: SERVICE_FADE,
      price: NACO_PRICE.fade,
      durationMinutes: 40,
      startOffsetMinutes: -5,
      status: "in_progress",
    },
    {
      id: APPOINTMENT_TODAY_IDS[7],
      barberId: barberNaco3,
      clientId: WALK_IN_CLIENT_IDS[1],
      serviceId: SERVICE_CORTE,
      price: NACO_PRICE.corte,
      durationMinutes: 30,
      startOffsetMinutes: 60,
      status: "confirmed",
    },
  ];

  for (const row of rows) {
    const startsAt = minutesFromNow(now, row.startOffsetMinutes);
    const endsAt = minutesFromNow(now, row.startOffsetMinutes + row.durationMinutes);

    await db
      .insert(appointments)
      .values({
        id: row.id,
        chainId: CHAIN_ID,
        locationId: LOCATION_NACO,
        clientId: row.clientId,
        barberId: row.barberId,
        serviceId: row.serviceId,
        startsAt,
        endsAt,
        status: row.status,
        source: "admin",
        priceAtBooking: row.price,
      })
      .onConflictDoUpdate({
        target: appointments.id,
        set: {
          startsAt,
          endsAt,
          status: row.status,
          priceAtBooking: row.price,
          updatedAt: new Date(),
        },
      });
  }
}

/** F2-24: 3 turnos en espera en La Fila de Naco, unidos en orden FIFO. */
async function seedQueue(now: Date) {
  const rows: {
    id: string;
    joinedOffsetMinutes: number;
    clientName: string;
    phone: string;
    serviceId: string;
    preferredBarberId: string | null;
    position: number;
  }[] = [
    {
      id: WALK_IN_QUEUE_IDS[0],
      joinedOffsetMinutes: -15,
      clientName: "Turno Walk-in A",
      phone: "809-555-0401",
      serviceId: SERVICE_CORTE,
      preferredBarberId: BARBER_IDS[0],
      position: 1,
    },
    {
      id: WALK_IN_QUEUE_IDS[1],
      joinedOffsetMinutes: -10,
      clientName: "Turno Walk-in B",
      phone: "809-555-0402",
      serviceId: SERVICE_FADE,
      preferredBarberId: null,
      position: 2,
    },
    {
      id: WALK_IN_QUEUE_IDS[2],
      joinedOffsetMinutes: -5,
      clientName: "Turno Walk-in C",
      phone: "809-555-0403",
      serviceId: SERVICE_BARBA,
      preferredBarberId: null,
      position: 3,
    },
  ];

  for (const row of rows) {
    const joinedAt = minutesFromNow(now, row.joinedOffsetMinutes);

    await db
      .insert(walkInQueue)
      .values({
        id: row.id,
        locationId: LOCATION_NACO,
        clientId: null,
        clientNameTemp: row.clientName,
        phone: row.phone,
        serviceId: row.serviceId,
        preferredBarberId: row.preferredBarberId,
        status: "waiting",
        joinedAt,
        position: row.position,
      })
      .onConflictDoUpdate({
        target: walkInQueue.id,
        set: {
          status: "waiting",
          joinedAt,
          position: row.position,
        },
      });
  }
}

/**
 * F2-24: caja de hoy abierta (sin cerrar) y caja de ayer ya cerrada, con
 * esperado/contado/diferencia para que el cierre de caja tenga con que
 * cuadrar. El indice unico parcial de 0002 (una sola caja abierta por sede)
 * nunca se pisa porque ambas cajas tienen id fijo: la segunda corrida hace
 * `onConflictDoUpdate` sobre el mismo id, no un insert nuevo.
 */
async function seedCashSessions(now: Date) {
  await db
    .insert(cashSessions)
    .values({
      id: CASH_SESSION_TODAY_ID,
      locationId: LOCATION_NACO,
      openedBy: ADMIN_NACO_ID,
      openedAt: minutesFromNow(now, -360),
      openingAmount: "2000.00",
      closedBy: null,
      closedAt: null,
    })
    .onConflictDoUpdate({
      target: cashSessions.id,
      set: {
        openedAt: minutesFromNow(now, -360),
        openingAmount: "2000.00",
        closedBy: null,
        closedAt: null,
        expectedCash: null,
        countedCash: null,
        difference: null,
      },
    });

  // Ventas en efectivo de ayer (ver seedYesterdaySales): 385.00 + 500.00 +
  // 402.50 = 1287.50. Esperado = apertura + efectivo = 3287.50. Se deja un
  // pequeno descuadre (-7.50) para que el cierre tenga algo real que
  // reconciliar, tal como pide el AC de F2-24.
  const openingAmount = 2000;
  const cashSalesTotal = 385 + 500 + 402.5;
  const expectedCash = openingAmount + cashSalesTotal;
  const countedCash = expectedCash - 7.5;
  const difference = countedCash - expectedCash;

  await db
    .insert(cashSessions)
    .values({
      id: CASH_SESSION_YESTERDAY_ID,
      locationId: LOCATION_NACO,
      openedBy: ADMIN_NACO_ID,
      openedAt: minutesFromNow(now, -24 * 60),
      openingAmount: openingAmount.toFixed(2),
      closedBy: ADMIN_NACO_ID,
      closedAt: minutesFromNow(now, -16 * 60),
      expectedCash: expectedCash.toFixed(2),
      countedCash: countedCash.toFixed(2),
      difference: difference.toFixed(2),
      notes: "Descuadre menor, seed de F2-24.",
    })
    .onConflictDoUpdate({
      target: cashSessions.id,
      set: {
        openedAt: minutesFromNow(now, -24 * 60),
        closedAt: minutesFromNow(now, -16 * 60),
        openingAmount: openingAmount.toFixed(2),
        expectedCash: expectedCash.toFixed(2),
        countedCash: countedCash.toFixed(2),
        difference: difference.toFixed(2),
        notes: "Descuadre menor, seed de F2-24.",
      },
    });
}

/**
 * F2-24: 4-5 ventas de ayer contra la caja ya cerrada, en los 3 metodos de
 * pago activos (D-F2-13). Ventas libres (sin `appointment_id`, walk-ins de
 * mostrador) para no depender de una cita `completed` de ayer. Montos como
 * strings decimales literales (regla dura §3.2 — nada de aritmetica float
 * persistida).
 */
async function seedYesterdaySales(now: Date) {
  const rows: {
    saleId: string;
    itemId: string;
    barberId: string;
    clientId: string;
    serviceId: string;
    unitPrice: string;
    discountAmount: string;
    discountReason: string | null;
    tipAmount: string;
    total: string;
    paymentMethod: "cash" | "card" | "transfer";
    createdOffsetMinutes: number;
  }[] = [
    {
      saleId: SALE_YESTERDAY_IDS[0],
      itemId: SALE_ITEM_YESTERDAY_IDS[0],
      barberId: BARBER_IDS[0],
      clientId: WALK_IN_CLIENT_IDS[0],
      serviceId: SERVICE_CORTE,
      unitPrice: NACO_PRICE.corte,
      discountAmount: "0.00",
      discountReason: null,
      tipAmount: "35.00", // 10% de 350
      total: "385.00",
      paymentMethod: "cash",
      createdOffsetMinutes: -20 * 60,
    },
    {
      saleId: SALE_YESTERDAY_IDS[1],
      itemId: SALE_ITEM_YESTERDAY_IDS[1],
      barberId: BARBER_IDS[1],
      clientId: WALK_IN_CLIENT_IDS[1],
      serviceId: SERVICE_FADE,
      unitPrice: NACO_PRICE.fade,
      discountAmount: "0.00",
      discountReason: null,
      tipAmount: "0.00",
      total: "500.00",
      paymentMethod: "cash",
      createdOffsetMinutes: -19 * 60,
    },
    {
      saleId: SALE_YESTERDAY_IDS[2],
      itemId: SALE_ITEM_YESTERDAY_IDS[2],
      barberId: MULTI_LOCATION_BARBER_ID,
      clientId: WALK_IN_CLIENT_IDS[0],
      serviceId: SERVICE_BARBA,
      unitPrice: NACO_PRICE.barba,
      discountAmount: "0.00",
      discountReason: null,
      tipAmount: "37.50", // 15% de 250
      total: "287.50",
      paymentMethod: "card",
      createdOffsetMinutes: -18 * 60,
    },
    {
      saleId: SALE_YESTERDAY_IDS[3],
      itemId: SALE_ITEM_YESTERDAY_IDS[3],
      barberId: BARBER_IDS[0],
      clientId: WALK_IN_CLIENT_IDS[1],
      serviceId: SERVICE_FADE_BARBA,
      unitPrice: NACO_PRICE.fadeBarba,
      discountAmount: "50.00",
      discountReason: "Cliente frecuente",
      tipAmount: "0.00",
      total: "600.00", // 650 - 50 de descuento
      paymentMethod: "transfer",
      createdOffsetMinutes: -17.5 * 60,
    },
    {
      saleId: SALE_YESTERDAY_IDS[4],
      itemId: SALE_ITEM_YESTERDAY_IDS[4],
      barberId: BARBER_IDS[1],
      clientId: WALK_IN_CLIENT_IDS[2],
      serviceId: SERVICE_CORTE,
      unitPrice: NACO_PRICE.corte,
      discountAmount: "0.00",
      discountReason: null,
      tipAmount: "52.50", // 15% de 350
      total: "402.50",
      paymentMethod: "cash",
      createdOffsetMinutes: -17 * 60,
    },
  ];

  for (const row of rows) {
    const createdAt = minutesFromNow(now, row.createdOffsetMinutes);
    const subtotal = row.unitPrice;

    await db
      .insert(sales)
      .values({
        id: row.saleId,
        chainId: CHAIN_ID,
        locationId: LOCATION_NACO,
        appointmentId: null,
        clientId: row.clientId,
        barberId: row.barberId,
        cashSessionId: CASH_SESSION_YESTERDAY_ID,
        subtotal,
        discountAmount: row.discountAmount,
        discountReason: row.discountReason,
        tipAmount: row.tipAmount,
        total: row.total,
        paymentMethod: row.paymentMethod,
        status: "paid",
        createdBy: ADMIN_NACO_ID,
        createdAt,
      })
      .onConflictDoUpdate({
        target: sales.id,
        set: {
          subtotal,
          discountAmount: row.discountAmount,
          discountReason: row.discountReason,
          tipAmount: row.tipAmount,
          total: row.total,
          paymentMethod: row.paymentMethod,
          status: "paid",
          cashSessionId: CASH_SESSION_YESTERDAY_ID,
        },
      });

    await db
      .insert(saleItems)
      .values({
        id: row.itemId,
        saleId: row.saleId,
        type: "service",
        serviceId: row.serviceId,
        productId: null,
        quantity: 1,
        unitPrice: row.unitPrice,
        lineTotal: row.unitPrice,
        barberId: row.barberId,
      })
      .onConflictDoUpdate({
        target: saleItems.id,
        set: {
          unitPrice: row.unitPrice,
          lineTotal: row.unitPrice,
          barberId: row.barberId,
        },
      });
  }
}

async function main() {
  console.log("Seed: creando/actualizando usuarios de Supabase Auth...");
  await ensureAuthUsers();

  console.log("Seed: sincronizando public.users...");
  await upsertAppUsers();

  console.log("Seed: cadena + suscripcion...");
  await seedChainAndSubscription();

  console.log("Seed: sedes...");
  await seedLocations();

  console.log("Seed: memberships...");
  await seedMemberships();

  console.log("Seed: barber_locations...");
  await seedBarberLocations();

  console.log("Seed: schedules del barbero multi-sede...");
  await seedSchedules();

  console.log("Seed: servicios de cadena...");
  await seedServices();

  console.log("Seed: overrides de precio por sede...");
  await seedServiceOverrides();

  console.log("Seed: regla de comision...");
  await seedCommissionRule();

  console.log("Seed: clientes...");
  await seedClients();

  const now = new Date();

  console.log("Seed: citas de hoy en Naco (F2-24)...");
  await seedTodayAppointments(now);

  console.log("Seed: turnos de La Fila en Naco (F2-24)...");
  await seedQueue(now);

  console.log("Seed: cajas de hoy (abierta) y de ayer (cerrada) en Naco (F2-24)...");
  await seedCashSessions(now);

  console.log("Seed: ventas de ayer en Naco (F2-24)...");
  await seedYesterdaySales(now);

  console.log("\nSeed completo.");
  console.log(`Password para todos los usuarios de prueba: ${SEED_PASSWORD}`);
  console.log("Usuarios:");
  for (const u of SEED_USERS) {
    console.log(`  - ${u.email}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error en el seed:", err);
    process.exit(1);
  });
