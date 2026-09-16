import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { chains, locations, users } from "./core";
import { clients, services } from "./catalog";
import {
  boothRentFrequency,
  commissionAppliesTo,
  commissionType,
  paymentMethod,
  payoutPeriodStatus,
  saleItemType,
  saleStatus,
  tipHandling,
} from "./enums";

// ---------------------------------------------------------------------------
// §4.3 Dinero — todos los montos numeric(12,2), nunca float/real.
// ---------------------------------------------------------------------------

export const commissionRules = pgTable("commission_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .references(() => chains.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  type: commissionType("type").notNull(),
  serviceCommissionPct: numeric("service_commission_pct", { precision: 5, scale: 2 }),
  productCommissionPct: numeric("product_commission_pct", { precision: 5, scale: 2 }),
  boothRentAmount: numeric("booth_rent_amount", { precision: 12, scale: 2 }),
  boothRentFrequency: boothRentFrequency("booth_rent_frequency"),
  tipHandling: tipHandling("tip_handling"),
  appliesTo: commissionAppliesTo("applies_to").notNull().default("chain"),
}, (table) => [index("commission_rules_chain_id_idx").on(table.chainId)]);

export const cashSessions = pgTable("cash_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "restrict" }),
  openedBy: uuid("opened_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  openingAmount: numeric("opening_amount", { precision: 12, scale: 2 }).notNull(),
  closedBy: uuid("closed_by").references(() => users.id, { onDelete: "restrict" }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }),
  countedCash: numeric("counted_cash", { precision: 12, scale: 2 }),
  difference: numeric("difference", { precision: 12, scale: 2 }),
  notes: text("notes"),
}, (table) => [index("cash_sessions_location_id_idx").on(table.locationId)]);

export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .references(() => chains.id, { onDelete: "restrict" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "restrict" }),
  appointmentId: uuid("appointment_id"),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  barberId: uuid("barber_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, {
    onDelete: "set null",
  }),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  discountReason: text("discount_reason"),
  tipAmount: numeric("tip_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: paymentMethod("payment_method").notNull(),
  status: saleStatus("status").notNull().default("open"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sales_location_created_idx").on(table.locationId, table.createdAt),
  index("sales_chain_id_idx").on(table.chainId),
]);

/** El barbero va por linea: un ticket puede tener el corte de uno y la barba de otro. */
export const saleItems = pgTable("sale_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  type: saleItemType("type").notNull(),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "restrict" }),
  productId: uuid("product_id"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  barberId: uuid("barber_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
});

export const payoutPeriods = pgTable("payout_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .references(() => chains.id, { onDelete: "restrict" }),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  status: payoutPeriodStatus("status").notNull().default("open"),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => [index("payout_periods_chain_id_idx").on(table.chainId)]);

/** Una linea por barbero y por sede. */
export const payoutLines = pgTable("payout_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  payoutPeriodId: uuid("payout_period_id")
    .notNull()
    .references(() => payoutPeriods.id, { onDelete: "cascade" }),
  barberId: uuid("barber_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "restrict" }),
  servicesCount: integer("services_count").notNull().default(0),
  servicesRevenue: numeric("services_revenue", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  productRevenue: numeric("product_revenue", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  boothRentDeducted: numeric("booth_rent_deducted", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  tipsAmount: numeric("tips_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  adjustments: numeric("adjustments", { precision: 12, scale: 2 }).notNull().default("0"),
  netPayable: numeric("net_payable", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
}, (table) => [index("payout_lines_location_id_idx").on(table.locationId)]);
