import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { chains, locations, users } from "./core";
import {
  billingCycle,
  notificationChannel,
  notificationStatus,
  subscriptionPlan,
  subscriptionStatus,
} from "./enums";

// ---------------------------------------------------------------------------
// §4.5 Plataforma
// ---------------------------------------------------------------------------

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .unique()
    .references(() => chains.id, { onDelete: "restrict" }),
  plan: subscriptionPlan("plan").notNull(),
  status: subscriptionStatus("status").notNull().default("trialing"),
  includedLocations: integer("included_locations").notNull().default(1),
  extraLocations: integer("extra_locations").notNull().default(0),
  billingCycle: billingCycle("billing_cycle").notNull().default("monthly"),
  amountDop: numeric("amount_dop", { precision: 12, scale: 2 }),
  paypalSubscriptionId: text("paypal_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
});

/** D-S1-4: status fijado a pending|sent|failed|cancelled (enum notification_status). */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .references(() => chains.id, { onDelete: "restrict" }),
  // F4 (0005, D-F4-7): nullable. El cliente de la reserva publica no tiene cuenta;
  // un CHECK exige `payload.email` cuando no hay destinatario-usuario.
  recipientUserId: uuid("recipient_user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  channel: notificationChannel("channel").notNull(),
  template: text("template").notNull(),
  payload: jsonb("payload"),
  status: notificationStatus("status").notNull().default("pending"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [index("notifications_chain_id_idx").on(table.chainId)]);

/** Obligatorio desde el MVP: toda operacion de dinero, permisos o anulacion. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .references(() => chains.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, {
    onDelete: "set null",
  }),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_log_chain_created_idx").on(table.chainId, table.createdAt)]);

/** Agregados poblados por job nocturno en sprint posterior. Tabla se crea ahora. */
export const locationDailyMetrics = pgTable(
  "location_daily_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    revenue: numeric("revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    servicesCount: integer("services_count").notNull().default(0),
    productsRevenue: numeric("products_revenue", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    uniqueClients: integer("unique_clients").notNull().default(0),
    newClients: integer("new_clients").notNull().default(0),
    noShows: integer("no_shows").notNull().default(0),
    avgTicket: numeric("avg_ticket", { precision: 12, scale: 2 }),
    chairUtilizationPct: numeric("chair_utilization_pct", { precision: 5, scale: 2 }),
    barberHours: numeric("barber_hours", { precision: 8, scale: 2 }),
  },
  (table) => [
    uniqueIndex("location_daily_metrics_location_date_uq").on(
      table.locationId,
      table.date,
    ),
    index("location_daily_metrics_location_id_idx").on(table.locationId),
  ],
);
