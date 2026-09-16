import {
  type AnyPgColumn,
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { chains, locations, users } from "./core";
import { stockMovementType } from "./enums";

// ---------------------------------------------------------------------------
// §4.4 Inventario
// ---------------------------------------------------------------------------

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: uuid("chain_id")
    .notNull()
    .references(() => chains.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  sku: text("sku"),
  brand: text("brand"),
  category: text("category"),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }),
  isForSale: boolean("is_for_sale").notNull().default(true),
  isConsumable: boolean("is_consumable").notNull().default(false),
  imageUrl: text("image_url"),
}, (table) => [index("products_chain_id_idx").on(table.chainId)]);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
    minThreshold: numeric("min_threshold", { precision: 12, scale: 2 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_items_location_product_uq").on(
      table.locationId,
      table.productId,
    ),
    index("inventory_items_location_id_idx").on(table.locationId),
  ],
);

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "restrict" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  type: stockMovementType("type").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  referenceId: uuid("reference_id"),
  fromLocationId: uuid("from_location_id").references((): AnyPgColumn => locations.id, {
    onDelete: "set null",
  }),
  toLocationId: uuid("to_location_id").references((): AnyPgColumn => locations.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("stock_movements_location_id_idx").on(table.locationId)]);
