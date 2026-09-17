-- F2-02 · Habilita Supabase Realtime sobre walk_in_queue para La Fila.
-- No se anade ninguna policy de RLS nueva: la policy de "walk_in_queue" ya
-- existe desde 0001_rls_policies.sql (aislamiento por join a locations.chain_id)
-- y es la que filtra el canal Realtime para el JWT del usuario suscrito.

alter publication supabase_realtime add table public.walk_in_queue;
--> statement-breakpoint

-- REPLICA IDENTITY FULL: para que los eventos UPDATE/DELETE lleguen con la
-- fila anterior completa y el filtro `location_id=eq.<id>` del cliente pueda
-- evaluarse tambien en DELETE (donde solo viaja la PK por defecto).
alter table public.walk_in_queue replica identity full;
