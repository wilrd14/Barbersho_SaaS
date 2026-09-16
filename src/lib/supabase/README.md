# src/lib/supabase

Tres clientes Supabase, cada uno con un uso estricto:

- `server.ts` — cliente para Server Components / Server Actions / Route Handlers. Usa
  las cookies de la request para resolver la sesion del usuario (JWT). Es el que se usa
  para RLS "real" (test de S1-10) y para leer `auth.getUser()`.
- `browser.ts` — cliente anon para el navegador (`"use client"`), usado solo para
  Realtime en sprints posteriores. Nunca importa `SUPABASE_SERVICE_ROLE_KEY`.
- `admin.ts` — cliente con `service role key`, **bypassa RLS por completo**. Se usa
  **solo** para tareas de sistema explicitas y server-only: el seed (S1-15), la
  sincronizacion `auth.users` -> `public.users` en el alta (S1-11), y jobs internos.
  **Nunca se importa desde un Server Action que responde directamente a input de
  usuario sin haber pasado antes por el guard de autorizacion (S1-13).**

Regla dura (§3.8 del backlog): `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` son
exclusivamente server-side. Convencion de este repo para hacerlo verificable:

- `admin.ts` y `server.ts` tienen `import "server-only";` en la primera linea. Si algun
  archivo `"use client"` los importa (directa o transitivamente), el build de Next
  falla. Esa es la barrera real, no una convencion de nombres.
- `browser.ts` es el unico cliente Supabase importable desde codigo de cliente.
