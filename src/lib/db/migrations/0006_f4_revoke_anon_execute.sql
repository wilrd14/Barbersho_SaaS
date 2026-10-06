-- F4-00 · Revocar EXECUTE a `anon` en funciones SECURITY DEFINER (D-F4-13,
-- BACKLOG-F4.md §5, `0006`; aprobada por Williams en Notion el 6 oct 2026).
--
-- `auth_chain_ids()` (0001) y `rls_auto_enable()` (la crea Supabase) son
-- SECURITY DEFINER y los advisors de Supabase avisan de que `anon` las puede
-- ejecutar. `auth_chain_ids()` es parte del diseno de RLS y la usan los
-- usuarios autenticados; `anon` no la necesita (la superficie publica se sirve
-- con Drizzle desde el servidor, regla dura §3.5 de F2).
--
-- Efecto a tener en cuenta: las policies de 0001 no declaran `to <rol>`, asi que
-- aplican a PUBLIC; tras esta migracion una consulta como `anon` a una tabla
-- con RLS falla con "permission denied for function auth_chain_ids" en vez de
-- devolver 0 filas. Es lo esperado: `anon` no debe leer datos de negocio.
--
-- RLS: no se anade ni se modifica ninguna policy. Re-ejecutable.

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'auth_chain_ids'
  ) then
    revoke execute on function public.auth_chain_ids() from anon, public;
    grant execute on function public.auth_chain_ids() to authenticated, service_role;
  end if;
end $$;
--> statement-breakpoint

-- rls_auto_enable() no se crea en este repo (la instala Supabase): se protege
-- con el catalogo para que la migracion no falle en una base donde no exista.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
      and p.pronargs = 0
  ) then
    revoke execute on function public.rls_auto_enable() from anon, public;
    grant execute on function public.rls_auto_enable() to authenticated, service_role;
  end if;
end $$;
