-- F2-01 · Integridad de F2: anti doble-booking, FK faltante, unicidad de cobro
-- y de caja abierta, e indices de rendimiento que faltan (BACKLOG-F2.md §5).
-- Cero columnas nuevas, cero renombres — solo constraints e indices.

-- ---------------------------------------------------------------------------
-- 1. Extension requerida por el EXCLUDE constraint de rango + igualdad.
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Anti doble-booking (D-F2-5): un barbero no puede tener dos citas activas
-- que se solapen. Solo bloquean los estados activos; una cita cancelled,
-- no_show o completed no ocupa la silla.
-- ---------------------------------------------------------------------------
alter table public.appointments
  add constraint appointments_no_overlap_per_barber
  exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('pending', 'confirmed', 'in_progress'));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. FK faltante: sales.appointment_id se declaro sin references() en S1.
-- on delete set null: borrar una cita (no deberia pasar en operacion normal)
-- no debe arrastrar la venta ya cobrada.
-- ---------------------------------------------------------------------------
alter table public.sales
  add constraint sales_appointment_id_appointments_id_fk
  foreign key (appointment_id) references public.appointments(id)
  on delete set null;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Una cita no se puede cobrar dos veces.
-- ---------------------------------------------------------------------------
create unique index sales_appointment_id_uq
  on public.sales (appointment_id)
  where appointment_id is not null;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Una sola caja abierta por sede a la vez (D-F2-9).
-- ---------------------------------------------------------------------------
create unique index cash_sessions_location_open_uq
  on public.cash_sessions (location_id)
  where closed_at is null;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. Indices de rendimiento que faltan para F2.
-- ---------------------------------------------------------------------------
create index sale_items_sale_id_idx on public.sale_items (sale_id);
--> statement-breakpoint

create index sales_cash_session_id_idx on public.sales (cash_session_id);
--> statement-breakpoint

create index appointments_location_status_starts_idx
  on public.appointments (location_id, status, starts_at);
--> statement-breakpoint

create index walk_in_queue_location_joined_idx
  on public.walk_in_queue (location_id, joined_at);
