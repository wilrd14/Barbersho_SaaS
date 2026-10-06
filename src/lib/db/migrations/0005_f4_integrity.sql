-- F4-00 · Integridad de F4 (BACKLOG-F4.md §5, `0005`).
-- Cero columnas nuevas, cero renombres, cero policies nuevas.
--
-- RLS: NO se anade ninguna policy en esta migracion. `notifications`,
-- `memberships`, `barber_locations` y `time_off` ya tienen aislamiento por
-- chain_id en 0001_rls_policies.sql (se confirma contra pg_policies al aplicar,
-- como hicieron F2-02 y F3-00; si alguna no lo estuviera, se escala al PM).
--
-- Cada sentencia es re-ejecutable por si sola (IF NOT EXISTS / DO $$ que
-- consulta el catalogo). Drizzle ejecuta cada migracion dentro de una
-- transaccion, asi que NO se usa `create index concurrently` (no puede correr
-- dentro de una transaccion ni de un bloque DO): el cambio del indice de
-- `sales` es atomico en la misma transaccion y no deja ventana sin proteccion.

-- ---------------------------------------------------------------------------
-- 1. notifications.recipient_user_id pasa a nullable (D-F4-7): el cliente de la
-- reserva publica no tiene cuenta. Una notificacion sin a quien enviarla no
-- puede existir: si no hay destinatario-usuario, el payload debe traer `email`.
-- ---------------------------------------------------------------------------
alter table public.notifications
  alter column recipient_user_id drop not null;
--> statement-breakpoint

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_recipient_or_email_chk'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_recipient_or_email_chk
      check (recipient_user_id is not null or payload ? 'email');
  end if;
end $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Idempotencia del email: un solo email de cada plantilla por cita.
-- Indice sobre una expresion de jsonb existente (no es una columna nueva).
-- ---------------------------------------------------------------------------
create unique index if not exists notifications_template_appointment_uq
  on public.notifications (template, (payload ->> 'appointmentId'))
  where payload ? 'appointmentId' and status <> 'cancelled';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. sales_appointment_id_uq excluye ventas anuladas (D-F4-15c): una cita cuya
-- venta se anulo puede volver a cobrarse; solo una venta vigente por cita.
-- Re-ejecutable: solo se recrea si el indice actual no excluye 'refunded'.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'sales_appointment_id_uq'
      and indexdef like '%refunded%'
  ) then
    drop index if exists public.sales_appointment_id_uq;
    create unique index sales_appointment_id_uq
      on public.sales (appointment_id)
      where appointment_id is not null and status <> 'refunded';
  end if;
end $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Indices de rendimiento que F4 necesita.
-- ---------------------------------------------------------------------------
create index if not exists notifications_status_scheduled_idx
  on public.notifications (status, scheduled_for);
--> statement-breakpoint

create index if not exists memberships_chain_active_idx
  on public.memberships (chain_id, is_active);
--> statement-breakpoint

create index if not exists barber_locations_location_active_idx
  on public.barber_locations (location_id, is_active);
--> statement-breakpoint

create index if not exists time_off_location_starts_idx
  on public.time_off (location_id, starts_at);
