/**
 * Foto de la BD de pruebas: `count(*)` y md5 del contenido de cada tabla
 * (filas ordenadas por id). Sirve para comprobar que el seed es idempotente y
 * que una corrida de tests/E2E deja la BD identica a la linea base.
 *
 *   npx tsx scripts/db-baseline.ts
 *
 * Nota: no incluye columnas que dependen del reloj del seed (createdAt de las
 * ventas/clientes de historia, horas de citas): usa `count(*)` + md5 de las
 * columnas estables. Solo lee; no modifica nada.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

const TABLES: { table: string; cols: string }[] = [
  { table: "appointments", cols: "id, status, barber_id, price_at_booking" },
  { table: "walk_in_queue", cols: "id, status, position, estimated_wait_minutes" },
  { table: "cash_sessions", cols: "id, location_id, opening_amount, closed_at is null as open, expected_cash, counted_cash, difference" },
  { table: "sales", cols: "id, location_id, barber_id, subtotal, discount_amount, discount_reason, tip_amount, total, payment_method, status" },
  { table: "sale_items", cols: "id, sale_id, unit_price, line_total, barber_id" },
  { table: "clients", cols: "id, full_name, phone" },
  { table: "audit_log", cols: "id, action, entity" },
  { table: "time_off", cols: "id" },
  { table: "commission_rules", cols: "id, name, type, service_commission_pct, booth_rent_amount, booth_rent_frequency, applies_to" },
  { table: "barber_locations", cols: "id, user_id, location_id, commission_rule_id" },
  { table: "payout_periods", cols: "id, starts_on, ends_on, status" },
  { table: "payout_lines", cols: "id" },
  { table: "location_daily_metrics", cols: "id, location_id, date, revenue" },
  { table: "notifications", cols: "id" },
  { table: "stock_movements", cols: "id" },
  { table: "subscriptions", cols: "id, plan, status" },
];

async function main() {
  for (const { table, cols } of TABLES) {
    const q = `select count(*)::int as n, coalesce(md5(string_agg(t::text, '|' order by id)), '-') as h
      from (select ${cols} from public.${table}) t`;
    const rows = await sql.unsafe(q);
    console.log(`${table.padEnd(24)} ${String(rows[0].n).padStart(5)}  ${rows[0].h}`);
  }
  await sql.end();
}
main();
