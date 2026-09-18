-- F3-00 · Integridad del dinero de F3 (BACKLOG-F3.md §5).
-- Cero columnas nuevas, cero renombres — solo constraints e indices.
--
-- RLS: NO se anade ninguna policy de tenant en esta migracion. Las 5 tablas de
-- F3 ya tienen aislamiento por chain_id desde 0001_rls_policies.sql
-- (verificado linea por linea el 18 sep 2026 y re-verificado contra pg_policies
-- al aplicar esta migracion):
--   commission_rules       -> "commission_rules_tenant_isolation"   (chain_id)
--   payout_periods         -> "payout_periods_tenant_isolation"     (chain_id)
--   payout_lines           -> "payout_lines_tenant_isolation"       (join a payout_periods.chain_id)
--   location_daily_metrics -> "location_daily_metrics_tenant_isolation" (join a locations.chain_id)
--   subscriptions          -> "subscriptions_tenant_isolation"      (chain_id)
--
-- Cada sentencia es re-ejecutable por si sola (DO $$ ... $$ / IF NOT EXISTS):
-- el tracking de drizzle ya evita correrla dos veces, pero asi tampoco rompe si
-- se aplica a mano sobre una base a medias.

-- ---------------------------------------------------------------------------
-- 1. Un periodo de pago no puede solaparse con otro de la MISMA cadena.
-- daterange(starts_on, ends_on, '[]') es inclusivo en ambos extremos (D-F3-2).
-- btree_gist ya lo instala 0002_f2_integrity.sql (se repite el `if not exists`
-- por si esta migracion se aplica sola).
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;
--> statement-breakpoint

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payout_periods_no_overlap_per_chain'
      and conrelid = 'public.payout_periods'::regclass
  ) then
    alter table public.payout_periods
      add constraint payout_periods_no_overlap_per_chain
      exclude using gist (
        chain_id with =,
        daterange(starts_on, ends_on, '[]') with &&
      );
  end if;
end
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Una linea por barbero y por sede por periodo (PRD §10). Un recalculo mal
-- implementado se convierte en error de base de datos, no en dos pagos.
-- ---------------------------------------------------------------------------
create unique index if not exists payout_lines_period_barber_location_uq
  on public.payout_lines (payout_period_id, barber_id, location_id);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Una sola regla default (applies_to = 'chain') por cadena: hace
-- determinista la resolucion de D-F3-3.
-- ---------------------------------------------------------------------------
create unique index if not exists commission_rules_chain_default_uq
  on public.commission_rules (chain_id)
  where applies_to = 'chain';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Indices de rendimiento de F3.
-- ---------------------------------------------------------------------------
create index if not exists sale_items_barber_id_idx
  on public.sale_items (barber_id);
--> statement-breakpoint

-- El calculo del periodo siempre filtra status = 'paid'; el existente
-- sales_location_created_idx (location_id, created_at) no lo cubre.
create index if not exists sales_location_status_created_idx
  on public.sales (location_id, status, created_at);
--> statement-breakpoint

create index if not exists payout_lines_barber_id_idx
  on public.payout_lines (barber_id);
--> statement-breakpoint

create index if not exists payout_lines_payout_period_id_idx
  on public.payout_lines (payout_period_id);
