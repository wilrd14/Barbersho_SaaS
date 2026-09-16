import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "./client";
import {
  barberLocations,
  chains,
  clients,
  commissionRules,
  locationServiceOverrides,
  locations,
  memberships,
  schedules,
  services,
  subscriptions,
  users,
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
  const rows = [
    { locationId: LOCATION_NACO, days: [1, 2, 3] },
    { locationId: LOCATION_BELLA_VISTA, days: [4, 5, 6] },
  ];

  for (const block of rows) {
    for (const dayOfWeek of block.days) {
      const existing = await db
        .select({ id: schedules.id })
        .from(schedules)
        .where(eq(schedules.userId, MULTI_LOCATION_BARBER_ID))
        .limit(1000);

      const alreadyHasDay = existing.length > 0; // simplificado: chequeo grueso de idempotencia
      if (alreadyHasDay) continue;

      await db.insert(schedules).values({
        userId: MULTI_LOCATION_BARBER_ID,
        locationId: block.locationId,
        dayOfWeek,
        startTime: "09:00",
        endTime: "20:00",
        isActive: true,
      });
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
