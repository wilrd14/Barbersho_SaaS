import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Comprobaciones ESTATICAS de 0005/0006 (no tocan la DB): la verificacion real
// contra Postgres la hace quien aplica las migraciones con `npm run db:migrate`.
const dir = path.resolve(__dirname, "../migrations");
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
const stripComments = (sql: string) => sql.replace(/--.*$/gm, "");
const journal = JSON.parse(read("meta/_journal.json")) as {
  entries: { idx: number; when: number; tag: string }[];
};

describe("journal de drizzle", () => {
  it("indices consecutivos, `when` creciente y un .sql por entrada", () => {
    journal.entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      if (i > 0) expect(e.when).toBeGreaterThan(journal.entries[i - 1].when);
      expect(() => read(`${e.tag}.sql`)).not.toThrow();
    });
    expect(journal.entries.slice(-2).map((e) => e.tag)).toEqual([
      "0005_f4_integrity",
      "0006_f4_revoke_anon_execute",
    ]);
  });
});

describe("0005_f4_integrity.sql", () => {
  const sql = read("0005_f4_integrity.sql");
  const code = stripComments(sql);
  it("sin columnas nuevas, sin policies, sin CONCURRENTLY (corre dentro de transaccion)", () => {
    expect(code).not.toMatch(/add column/i);
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/concurrently/i);
  });
  it("hace nullable el destinatario y exige email en el payload sin destinatario", () => {
    expect(code).toMatch(/alter column recipient_user_id drop not null/i);
    expect(code).toMatch(/check \(recipient_user_id is not null or payload \? 'email'\)/i);
  });
  it("indice unico de idempotencia por plantilla y cita", () => {
    expect(code).toMatch(/create unique index if not exists notifications_template_appointment_uq/i);
    expect(code).toContain("(template, (payload ->> 'appointmentId'))");
  });
  it("sales_appointment_id_uq excluye ventas anuladas", () => {
    expect(code).toMatch(/where appointment_id is not null and status <> 'refunded'/i);
  });
  it("crea los 4 indices de rendimiento y separa las sentencias con breakpoint", () => {
    for (const idx of [
      "notifications_status_scheduled_idx",
      "memberships_chain_active_idx",
      "barber_locations_location_active_idx",
      "time_off_location_starts_idx",
    ]) {
      expect(code).toContain(idx);
    }
    expect(sql.split("--> statement-breakpoint").length).toBeGreaterThanOrEqual(8);
  });
  it("los bloques $$ estan balanceados", () => {
    expect((code.match(/\$\$/g) ?? []).length % 2).toBe(0);
  });
});

describe("0006_f4_revoke_anon_execute.sql", () => {
  const code = stripComments(read("0006_f4_revoke_anon_execute.sql"));
  it("revoca a anon y public y concede a authenticated y service_role", () => {
    for (const fn of ["auth_chain_ids", "rls_auto_enable"]) {
      expect(code).toContain(`revoke execute on function public.${fn}() from anon, public;`);
      expect(code).toContain(`grant execute on function public.${fn}() to authenticated, service_role;`);
    }
  });
  it("no toca policies ni datos y los bloques $$ estan balanceados", () => {
    expect(code).not.toMatch(/create policy|drop policy|insert into|delete from|update public/i);
    expect((code.match(/\$\$/g) ?? []).length % 2).toBe(0);
  });
});
