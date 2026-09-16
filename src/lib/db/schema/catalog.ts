import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { chains, locations, users } from "./core";
import {
  appointmentSource,
  appointmentStatus,
  queueStatus,
  serviceCategory,
  timeOffStatus,
} from "./enums";

// ---------------------------------------------------------------------------
// §4.2 Servicios y agenda
// ---------------------------------------------------------------------------

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .references(() => chains.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  category: serviceCategory("category").notNull(),
  defaultDurationMinutes: integer("default_duration_minutes").notNull(),
  defaultPrice: numeric("default_price", { precision: 12, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => [index("services_chain_id_idx").on(table.chainId)]);

export const locationServiceOverrides = pgTable(
  "location_service_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 12, scale: 2 }),
    durationMinutes: integer("duration_minutes"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("location_service_overrides_location_service_uq").on(
      table.locationId,
      table.serviceId,
    ),
  ],
);

/** Que hace cada barbero y cuanto tarda; via services.chain_id resuelve el tenant. */
export const barberServices = pgTable(
  "barber_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    customDuration: integer("custom_duration"),
  },
  (table) => [
    uniqueIndex("barber_services_user_service_uq").on(table.userId, table.serviceId),
  ],
);

/**
 * day_of_week: 0-6, 0 = domingo. La validacion de solapamiento entre sedes
 * vive en lib/scheduling/ y se implementa en el sprint de horarios (no S1).
 */
export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  dayOfWeek: smallint("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => [
  index("schedules_user_day_idx").on(table.userId, table.dayOfWeek),
  index("schedules_location_id_idx").on(table.locationId),
]);

/** D-S1-3: status fijado a pending|approved|rejected|cancelled (enum time_off_status). */
export const timeOff = pgTable("time_off", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, {
    onDelete: "set null",
  }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  status: timeOffStatus("status").notNull().default("pending"),
}, (table) => [
  index("time_off_user_id_idx").on(table.userId),
  index("time_off_location_id_idx").on(table.locationId),
]);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainId: uuid("chain_id")
      .notNull()
      .references(() => chains.id, { onDelete: "restrict" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references((): AnyPgColumn => clients.id, { onDelete: "restrict" }),
    barberId: uuid("barber_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: appointmentStatus("status").notNull().default("pending"),
    source: appointmentSource("source").notNull().default("online"),
    priceAtBooking: numeric("price_at_booking", { precision: 12, scale: 2 }),
    notes: text("notes"),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointments_location_starts_idx").on(table.locationId, table.startsAt),
    index("appointments_barber_starts_idx").on(table.barberId, table.startsAt),
    index("appointments_chain_id_idx").on(table.chainId),
  ],
);

export const walkInQueue = pgTable("walk_in_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references((): AnyPgColumn => clients.id, {
    onDelete: "set null",
  }),
  clientNameTemp: text("client_name_temp"),
  phone: text("phone"),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "restrict" }),
  preferredBarberId: uuid("preferred_barber_id").references(() => users.id, {
    onDelete: "set null",
  }),
  status: queueStatus("status").notNull().default("waiting"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  estimatedWaitMinutes: integer("estimated_wait_minutes"),
  position: integer("position"),
  calledAt: timestamp("called_at", { withTimezone: true }),
}, (table) => [
  index("walk_in_queue_location_status_position_idx").on(
    table.locationId,
    table.status,
    table.position,
  ),
]);

/** El cliente pertenece a la cadena, no a la sede. */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainId: uuid("chain_id")
      .notNull()
      .references(() => chains.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    birthday: text("birthday"),
    preferredLocationId: uuid("preferred_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    preferredBarberId: uuid("preferred_barber_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cutNotes: text("cut_notes"),
    tags: text("tags").array(),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    totalVisits: integer("total_visits").notNull().default(0),
    totalSpent: numeric("total_spent", { precision: 12, scale: 2 }).notNull().default("0"),
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
    noShowCount: integer("no_show_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("clients_chain_phone_uq").on(table.chainId, table.phone),
    index("clients_chain_id_idx").on(table.chainId),
  ],
);
