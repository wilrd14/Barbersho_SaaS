# Kortex — Backend Sprint 1

SaaS de gestion operativa multi-sede para cadenas de barberias (W-Tech).
Este repo contiene el scaffold de **Sprint 1** (fundacion tecnica): Next.js 15+
(App Router) + TypeScript + Tailwind v4 + shadcn/ui, Drizzle ORM con las 26
tablas de `PRD-BarberShop.md` §10, autenticacion multi-rol sobre Supabase Auth
y el guard de autorizacion por ambito de ruta. Ver `BACKLOG-BACKEND.md` para
el detalle completo de alcance, decisiones y checklist de este sprint.

## Stack

Next.js 15+ (App Router, RSC) · TypeScript `strict` · Tailwind v4 + shadcn/ui ·
Supabase (Postgres + Auth) · Drizzle ORM + drizzle-kit · Zod · Vitest ·
Cloudflare Workers via `@opennextjs/cloudflare` · Sentry.

## Levantar el proyecto desde cero

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Crear un proyecto Supabase** (si no tienes uno) en
   [supabase.com](https://supabase.com), region mas cercana a Republica
   Dominicana.

3. **Configurar variables de entorno**: copia `.env.example` a `.env.local` y
   completa con los valores de tu proyecto Supabase (URL, anon key, service
   role key) y las cadenas de conexion Postgres (`DATABASE_URL` con pooler,
   `DIRECT_URL` sin pooler, para migraciones). `SENTRY_DSN` y
   `RESEND_API_KEY` pueden quedar vacios en Sprint 1.
   ```bash
   cp .env.example .env.local
   ```

4. **Aplicar las migraciones** (crea las 26 tablas + RLS por `chain_id`):
   ```bash
   npm run db:migrate
   ```
   Esto ejecuta, en orden, `src/lib/db/migrations/0000_init_schema.sql`
   (esquema) y `0001_rls_policies.sql` (RLS, requiere Supabase real por el uso
   de `auth.uid()`).

5. **Poblar datos de prueba** (1 cadena, 3 sedes, 6 barberos, servicios con
   override de precio):
   ```bash
   npm run db:seed
   ```
   Password para todos los usuarios de prueba: `Kortex#2026!` (ver
   `src/lib/db/seed.ts` para la lista de correos: `owner@donbigote.test`,
   `admin.naco@donbigote.test`, `barbero1@donbigote.test`,
   `cliente1@donbigote.test`, etc.)

6. **Levantar el servidor de desarrollo**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000).

7. **Iniciar sesion** en `/login` con cualquiera de los usuarios de prueba
   del seed para verificar el ambito correspondiente (superuser -> `(chain)`,
   admin/barber -> `(location)/sede/[locationId]` segun su asignacion,
   cliente -> `(client)`).

8. **Verificar el guard de autorizacion**: como `admin.naco@donbigote.test`,
   intenta abrir la URL de una sede que no es la suya (ej. Bella Vista) —
   debe responder 403 (pagina en espanol, `src/app/forbidden.tsx`).

9. **Correr la suite de calidad**:
   ```bash
   npm run typecheck && npm run lint && npm run test && npm run build
   ```

10. **(Opcional) Preview en Cloudflare Workers**:
    ```bash
    npm run preview   # build OpenNext + wrangler preview local
    npm run deploy    # build OpenNext + wrangler deploy (requiere cuenta Cloudflare)
    ```

## Estructura relevante

- `src/app/` — rutas por ambito (`(auth)`, `(chain)`, `(location)/sede/[locationId]`,
  `(barber)`, `(client)`, `(public)`). Ver `src/app/README.md` para el
  principio rector y una desviacion tecnica documentada sobre rutas dinamicas.
- `src/lib/db/schema/` — esquema Drizzle (26 tablas, enums en `enums.ts`).
- `src/lib/db/migrations/` — migracion inicial + politicas RLS (SQL versionado).
- `src/lib/db/seed.ts` — seed idempotente de datos de prueba.
- `src/lib/auth/` — resolvedor de sesion (`session.ts`), guards por ambito
  (`guards.ts`), Server Actions de auth (`actions.ts`), auditoria (`audit.ts`).
- `src/lib/supabase/` — clientes Supabase (server, browser, admin) — ver el
  README de esa carpeta para las reglas de uso de cada uno.
- `src/types/action-result.ts` — convencion de resultado para Server Actions.

## Suscripcion de la cadena (piloto)

El cobro del piloto se hace fuera de Kortex (transferencia). Al recibir el
pago, mueve el estado con:

```bash
npm run billing:set-status -- --chain=don-bigote --status=active --period-end=2026-11-18
```

`--status` acepta `trialing|active|past_due|cancelled`; `--trial-ends` y
`--period-end` (YYYY-MM-DD, fin de ese dia en hora de Santo Domingo) son
opcionales. El cambio escribe `audit_log` (`billing.set_status`) y se ve en
`/billing` sin redeploy. No hay pasarela de pago integrada.

## Medir el P95 de Vista Cadena

PRD §15 exige P95 < 2 s con la tabla `location_daily_metrics` materializada:

```bash
npm run metrics:measure -- --chain=don-bigote --runs=30
DEBUG_DB_ROUNDTRIPS=1 npm run metrics:measure -- --runs=1 --skip-backfill   # round-trips de una corrida
```

Materializa los ultimos 35 dias cerrados (idempotente), corre `loadChainOverview`
para hoy / semana / mes, imprime p50, p95 y max, y sale con codigo 1 si el P95 de
algun rango llega a `--limit-ms` (2000 por defecto). Requiere `.env.local` real.

## Estado de Sprint 1

Ver el reporte de cierre de sprint (entregado por el desarrollador al PM) para
el detalle de que tareas del checklist S1-01..S1-16 quedaron completas, cuales
no, y por que.
