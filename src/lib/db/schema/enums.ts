import { pgEnum } from "drizzle-orm/pg-core";

// §4.1 memberships.role
export const membershipRole = pgEnum("membership_role", [
  "superuser",
  "admin",
  "barber",
]);

// §4.2 services.category
export const serviceCategory = pgEnum("service_category", [
  "corte",
  "barba",
  "color",
  "combo",
  "otro",
]);

// §4.2 time_off.status — Decision PM D-S1-3
export const timeOffStatus = pgEnum("time_off_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// §4.2 appointments.status
export const appointmentStatus = pgEnum("appointment_status", [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

// §4.2 appointments.source
export const appointmentSource = pgEnum("appointment_source", [
  "online",
  "walk_in",
  "phone",
  "admin",
]);

// §4.2 walk_in_queue.status
export const queueStatus = pgEnum("queue_status", [
  "waiting",
  "called",
  "serving",
  "done",
  "left",
]);

// §4.3 sales.payment_method
export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "card",
  "transfer",
  "mixed",
  "online",
]);

// §4.3 sales.status
export const saleStatus = pgEnum("sale_status", ["open", "paid", "refunded"]);

// §4.3 sale_items.type
export const saleItemType = pgEnum("sale_item_type", ["service", "product"]);

// §4.3 commission_rules.type
export const commissionType = pgEnum("commission_type", [
  "percentage",
  "fixed_per_service",
  "booth_rent",
  "hybrid",
]);

// §4.3 commission_rules.booth_rent_frequency
export const boothRentFrequency = pgEnum("booth_rent_frequency", [
  "weekly",
  "biweekly",
  "monthly",
]);

// §4.3 commission_rules.tip_handling
export const tipHandling = pgEnum("tip_handling", [
  "barber_keeps_all",
  "split_pct",
]);

// §4.3 commission_rules.applies_to
export const commissionAppliesTo = pgEnum("commission_applies_to", [
  "chain",
  "location",
  "barber",
]);

// §4.3 payout_periods.status
export const payoutPeriodStatus = pgEnum("payout_period_status", [
  "open",
  "calculated",
  "approved",
  "paid",
]);

// §4.4 stock_movements.type
export const stockMovementType = pgEnum("stock_movement_type", [
  "purchase",
  "sale",
  "consumption",
  "adjustment",
  "transfer_in",
  "transfer_out",
]);

// §4.5 subscriptions.plan
export const subscriptionPlan = pgEnum("subscription_plan", [
  "local",
  "chain",
  "franchise",
]);

// §4.5 subscriptions.status
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
]);

// §4.5 subscriptions.billing_cycle
export const billingCycle = pgEnum("billing_cycle", ["monthly", "annual"]);

// §4.5 notifications.channel
export const notificationChannel = pgEnum("notification_channel", [
  "email",
  "sms",
  "whatsapp",
]);

// §4.5 notifications.status — Decision PM D-S1-4
export const notificationStatus = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
  "cancelled",
]);
