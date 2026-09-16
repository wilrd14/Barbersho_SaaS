import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { membershipRole } from "./enums";
import { commissionRules } from "./money";

// ---------------------------------------------------------------------------
// §4.1 Nucleo de tenant
// ---------------------------------------------------------------------------

/** Espejo de auth.users (D-S1-2): mismo UUID como id, sincronizado en el alta. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  phone: text("phone"),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  // Reservado para staff interno de W-Tech. Sin uso en Sprint 1.
  globalRole: text("global_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chains = pgTable("chains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  rnc: text("rnc"),
  country: text("country").notNull().default("DO"),
  currency: text("currency").notNull().default("DOP"),
  timezone: text("timezone").notNull().default("America/Santo_Domingo"),
  allowCrossLocationBooking: boolean("allow_cross_location_booking")
    .notNull()
    .default(true),
  maxBarberDiscountPct: numeric("max_barber_discount_pct", { precision: 5, scale: 2 }),
  cancellationHours: smallint("cancellation_hours"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * D-S1-1: business_hours es JSON (no tabla aparte). Forma:
 * { "mon": { "opens_at": "09:00", "closes_at": "20:00", "closed": false }, ... }
 */
export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chainId: uuid("chain_id")
      .notNull()
      .references(() => chains.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    address: text("address"),
    city: text("city"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    phone: text("phone"),
    email: text("email"),
    chairsCount: smallint("chairs_count").notNull(),
    timezone: text("timezone").notNull().default("America/Santo_Domingo"),
    isActive: boolean("is_active").notNull().default(true),
    businessHours: jsonb("business_hours"),
    photos: jsonb("photos"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("locations_chain_slug_uq").on(table.chainId, table.slug),
    index("locations_chain_id_idx").on(table.chainId),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chainId: uuid("chain_id")
      .notNull()
      .references(() => chains.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // NOTA (desviacion documentada, ver README de sprint): §4.1 del backlog no
    // lista created_at para memberships, pero D-S1-6 exige desempatar la
    // cadena activa "por created_at" cuando hay >1 membership. Sin esta
    // columna esa regla no es implementable (el uuid es aleatorio, no
    // cronologico). Se anade la columna minima necesaria para cumplir D-S1-6
    // y se escala al PM para confirmarla o reemplazarla en un sprint futuro.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("memberships_user_chain_uq").on(table.userId, table.chainId),
    index("memberships_chain_id_idx").on(table.chainId),
  ],
);

/**
 * Un usuario puede tener maximo un is_primary = true por user_id.
 * Constraint reforzado en aplicacion (S1); un indice parcial unico se puede
 * anadir mas adelante si se detectan condiciones de carrera reales.
 */
export const barberLocations = pgTable(
  "barber_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    commissionRuleId: uuid("commission_rule_id").references(() => commissionRules.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("barber_locations_user_location_uq").on(table.userId, table.locationId),
    index("barber_locations_location_id_idx").on(table.locationId),
  ],
);
