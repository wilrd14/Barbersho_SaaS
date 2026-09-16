-- S1-10 · RLS por chain_id (red de seguridad; la autorizacion fina por rol y
-- location_id vive en el guard de servidor, src/lib/auth — nunca solo RLS).
--
-- Requiere ejecutarse contra un proyecto Supabase real (usa auth.uid()).
-- No es generado por drizzle-kit: drizzle solo declara columnas/tablas; las
-- politicas de RLS se versionan aqui a mano, como recomienda Drizzle para
-- Postgres avanzado (RLS, funciones, triggers).

-- ---------------------------------------------------------------------------
-- Funcion: chain_id de las memberships activas del usuario autenticado.
-- SECURITY DEFINER: evita que la propia RLS de "memberships" bloquee la
-- funcion cuando las policies de otras tablas la invocan (si no, recursion).
-- ---------------------------------------------------------------------------
create or replace function public.auth_chain_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select m.chain_id
  from public.memberships m
  where m.user_id = auth.uid()
    and m.is_active = true
$$;
--> statement-breakpoint

grant execute on function public.auth_chain_ids() to authenticated, anon;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- chains: el "chain_id" de esta tabla es su propio id.
-- ---------------------------------------------------------------------------
alter table public.chains enable row level security;
--> statement-breakpoint

create policy "chains_tenant_isolation" on public.chains
  for all
  using (id in (select public.auth_chain_ids()))
  with check (id in (select public.auth_chain_ids()));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Tablas con chain_id directo (§4.8).
-- ---------------------------------------------------------------------------
alter table public.locations enable row level security;
--> statement-breakpoint
create policy "locations_tenant_isolation" on public.locations
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.memberships enable row level security;
--> statement-breakpoint
create policy "memberships_tenant_isolation" on public.memberships
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.services enable row level security;
--> statement-breakpoint
create policy "services_tenant_isolation" on public.services
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.clients enable row level security;
--> statement-breakpoint
create policy "clients_tenant_isolation" on public.clients
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint
-- Un cliente autenticado puede ver (solo lectura) su propia fila.
create policy "clients_self_select" on public.clients
  for select
  using (user_id = auth.uid());
--> statement-breakpoint

alter table public.appointments enable row level security;
--> statement-breakpoint
create policy "appointments_tenant_isolation" on public.appointments
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint
-- Un cliente autenticado puede ver (solo lectura) sus propias citas.
create policy "appointments_self_select" on public.appointments
  for select
  using (
    client_id in (select id from public.clients where user_id = auth.uid())
  );
--> statement-breakpoint

alter table public.commission_rules enable row level security;
--> statement-breakpoint
create policy "commission_rules_tenant_isolation" on public.commission_rules
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.payout_periods enable row level security;
--> statement-breakpoint
create policy "payout_periods_tenant_isolation" on public.payout_periods
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.products enable row level security;
--> statement-breakpoint
create policy "products_tenant_isolation" on public.products
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.subscriptions enable row level security;
--> statement-breakpoint
create policy "subscriptions_tenant_isolation" on public.subscriptions
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.notifications enable row level security;
--> statement-breakpoint
create policy "notifications_tenant_isolation" on public.notifications
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.audit_log enable row level security;
--> statement-breakpoint
create policy "audit_log_tenant_isolation" on public.audit_log
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

alter table public.sales enable row level security;
--> statement-breakpoint
create policy "sales_tenant_isolation" on public.sales
  for all
  using (chain_id in (select public.auth_chain_ids()))
  with check (chain_id in (select public.auth_chain_ids()));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Tablas que resuelven tenant por join (§4.8).
-- ---------------------------------------------------------------------------

alter table public.location_service_overrides enable row level security;
--> statement-breakpoint
create policy "location_service_overrides_tenant_isolation" on public.location_service_overrides
  for all
  using (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.barber_locations enable row level security;
--> statement-breakpoint
create policy "barber_locations_tenant_isolation" on public.barber_locations
  for all
  using (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.schedules enable row level security;
--> statement-breakpoint
create policy "schedules_tenant_isolation" on public.schedules
  for all
  using (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.walk_in_queue enable row level security;
--> statement-breakpoint
create policy "walk_in_queue_tenant_isolation" on public.walk_in_queue
  for all
  using (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.inventory_items enable row level security;
--> statement-breakpoint
create policy "inventory_items_tenant_isolation" on public.inventory_items
  for all
  using (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.stock_movements enable row level security;
--> statement-breakpoint
create policy "stock_movements_tenant_isolation" on public.stock_movements
  for all
  using (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.cash_sessions enable row level security;
--> statement-breakpoint
create policy "cash_sessions_tenant_isolation" on public.cash_sessions
  for all
  using (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.location_daily_metrics enable row level security;
--> statement-breakpoint
create policy "location_daily_metrics_tenant_isolation" on public.location_daily_metrics
  for all
  using (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    location_id in (
      select id from public.locations where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.sale_items enable row level security;
--> statement-breakpoint
create policy "sale_items_tenant_isolation" on public.sale_items
  for all
  using (
    sale_id in (
      select id from public.sales where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    sale_id in (
      select id from public.sales where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.payout_lines enable row level security;
--> statement-breakpoint
create policy "payout_lines_tenant_isolation" on public.payout_lines
  for all
  using (
    payout_period_id in (
      select id from public.payout_periods where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    payout_period_id in (
      select id from public.payout_periods where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.barber_services enable row level security;
--> statement-breakpoint
create policy "barber_services_tenant_isolation" on public.barber_services
  for all
  using (
    service_id in (
      select id from public.services where chain_id in (select public.auth_chain_ids())
    )
  )
  with check (
    service_id in (
      select id from public.services where chain_id in (select public.auth_chain_ids())
    )
  );
--> statement-breakpoint

alter table public.time_off enable row level security;
--> statement-breakpoint
create policy "time_off_tenant_isolation" on public.time_off
  for all
  using (
    (
      location_id is not null
      and location_id in (
        select id from public.locations where chain_id in (select public.auth_chain_ids())
      )
    )
    or (
      location_id is null
      and user_id in (
        select user_id from public.memberships
        where chain_id in (select public.auth_chain_ids()) and is_active = true
      )
    )
  )
  with check (
    (
      location_id is not null
      and location_id in (
        select id from public.locations where chain_id in (select public.auth_chain_ids())
      )
    )
    or (
      location_id is null
      and user_id in (
        select user_id from public.memberships
        where chain_id in (select public.auth_chain_ids()) and is_active = true
      )
    )
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- users: espejo de auth.users (D-S1-2). No tiene chain_id; el aislamiento es
-- a nivel de fila propia, salvo para companeros de una misma cadena
-- (necesario para que un admin/superuser pueda ver nombre/telefono de un
-- barbero de su equipo via join).
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
--> statement-breakpoint

create policy "users_select_self_or_same_chain" on public.users
  for select
  using (
    id = auth.uid()
    or id in (
      select m.user_id from public.memberships m
      where m.chain_id in (select public.auth_chain_ids()) and m.is_active = true
    )
  );
--> statement-breakpoint

create policy "users_update_self" on public.users
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
--> statement-breakpoint

-- No se define policy de insert/delete para "authenticated": el alta se hace
-- via Server Action con el cliente admin (service role), que bypassa RLS por
-- diseno (S1-11). Sin policy => denegado por defecto para roles normales.
