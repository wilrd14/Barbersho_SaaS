# BACKLOG BACKEND — Kortex · Sprint 1 (Fundación)

**Proyecto:** Kortex — SaaS de gestión operativa multi-sede para cadenas de barberías (W-Tech)
**Documento:** backlog técnico de Sprint 1 · v1.0 · 16 sep 2026
**Fuente de verdad de producto:** `PRD-BarberShop.md` (aprobado). Este backlog extrae y
congela lo necesario para Sprint 1; **el desarrollador no necesita leer el PRD completo
para ejecutar este sprint**. Si algo no está en este documento, no es Sprint 1.
**Autoridad:** las decisiones de producto de este documento las toma el PM. El
desarrollador decide el *cómo* técnico; no decide *qué* se construye ni cambia nombres,
columnas o alcance por su cuenta. Cualquier ambigüedad se escala al PM, no se asume.

---

## 1. Alcance de Sprint 1 (resumen)

Sprint 1 construye **la base técnica del producto, antes de cualquier feature de
negocio**: inicializar el proyecto Next.js 15 (App Router) + TypeScript + Tailwind v4 +
shadcn/ui con la estructura de carpetas definida en §9.3 del PRD; conectar Supabase
(Postgres + Auth + Realtime) y Drizzle ORM con migraciones versionadas en el repo;
declarar **el esquema de datos completo de §10 del PRD (las 26 tablas, todas, aunque las
features que las usan lleguen en sprints posteriores)** y aplicar la migración inicial;
implementar la autenticación multi-rol (`superuser` / `admin` / `barber` / `client`) con
el modelo de `memberships` por cadena; implementar el guard de autorización por
`chain_id` / `location_id` donde **la ruta declara el ámbito** (`(chain)`,
`(location)/[locationId]`, `(barber)`, `(client)`, `(public)`) y un middleware valida el
ámbito *antes* de cualquier consulta; habilitar RLS por `chain_id` como red de seguridad;
y dejar un seed de datos de prueba (1 cadena, 3 sedes, 6 barberos —uno de ellos en 2
sedes—, catálogo de servicios con override de precio por sede) que permita desarrollar y
probar todo lo que viene después. Al cerrar Sprint 1 nadie puede cobrar, encolar ni ver
un dashboard: lo que se puede hacer es **registrarse, iniciar sesión, y que el sistema
responda 403 cuando un usuario intenta salirse de su ámbito** — que es el criterio de
aceptación 1.3 y el #11 de §16 del PRD.

---

## 2. Stack congelado (no discutible)

| Capa | Decisión |
|---|---|
| Framework | Next.js 15+, App Router, React Server Components |
| Lenguaje | TypeScript (`strict: true`) |
| UI | Tailwind CSS v4 + shadcn/ui |
| DB / Auth / Realtime / Storage | Supabase (PostgreSQL) |
| ORM / migraciones | Drizzle ORM + drizzle-kit (migraciones SQL versionadas en el repo) |
| Validación | Zod (todo input, sin excepción) |
| Tests | Vitest (unit) · Playwright (E2E, se configura en sprints posteriores) |
| Deploy | Cloudflare Workers vía `@opennextjs/cloudflare` (OpenNext) |
| Errores | Sentry (se cablea en Sprint 1, aunque sin tráfico real) |

**Prohibido en Sprint 1:** cambiar de ORM, añadir un state manager global, añadir
librerías de UI alternativas, usar el editor web de Supabase para modificar el esquema
(el esquema vive en Drizzle y solo en Drizzle).

---

## 3. Reglas de seguridad NO NEGOCIABLES

Estas reglas aplican a todo el proyecto, no solo a Sprint 1. Violarlas es motivo de
rechazo del PR.

1. **Doble capa obligatoria.** (a) **RLS en Postgres por `chain_id`** como red de
   seguridad / aislamiento de tenant. (b) **Autorización explícita en el servidor** por
   rol y `location_id` para los permisos finos. **Nunca solo RLS** — las reglas de la
   matriz de permisos (§6.2 del PRD) son inmantenibles en políticas SQL.
2. **Ninguna consulta cruza cadenas, nunca.** Todo registro de negocio lleva `chain_id`
   directo o lo hereda por su `location_id`. Toda query de Drizzle debe filtrar por el
   `chain_id` **de la sesión**, nunca por un `chain_id` recibido del cliente.
3. **El ámbito viene de la ruta y se valida antes de consultar.** `(chain)` ⇒ requiere
   rol `superuser` en esa cadena. `(location)/[locationId]` ⇒ requiere que
   `locationId` pertenezca a la cadena de la sesión **y** que el usuario tenga
   `superuser` en la cadena o `admin`/`barber` asignado a esa sede
   (`barber_locations`). Si no ⇒ **403**, incluso por URL directa.
4. **Ningún identificador de ámbito se confía desde el cliente.** `chain_id` se deriva
   siempre de la sesión/membership. `location_id` puede venir de la URL, pero se
   verifica contra la membership **antes** de cualquier lectura o escritura.
5. **El cálculo de dinero nunca ocurre en el cliente.** Totales, descuentos, propinas,
   comisiones, cuadre de caja: solo en Server Actions / Route Handlers. El cliente envía
   intención (qué servicio, qué método de pago), nunca montos calculados. *(Aplica a
   sprints posteriores; la regla se establece aquí para que la arquitectura la permita.)*
6. **Zod en todo input** — Server Actions, Route Handlers, params de URL y search params.
   Sin parseo Zod no hay acceso a la DB.
7. **`audit_log` en toda operación de dinero, permisos o anulación.** En Sprint 1 se crea
   la tabla y el helper de escritura; su uso es obligatorio desde la primera feature de
   dinero.
8. **Secretos jamás en el cliente.** Solo `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` son públicos. `SUPABASE_SERVICE_ROLE_KEY` y
   `DATABASE_URL` son exclusivamente server-side y nunca se importan desde un
   componente `"use client"`.
9. **Realtime va con el JWT del usuario, nunca con service role.** Las suscripciones
   Realtime (cola de walk-ins, sprint posterior) usan `supabase-js` con la sesión del
   usuario ⇒ ahí **RLS es la única defensa**, por eso las políticas deben estar bien
   desde Sprint 1.
10. **Exportar la base de clientes es solo `superuser`.** Regla de producto (§6.3 del
    PRD): un gerente que se va no puede llevarse el activo de la cadena.

---

## 4. Esquema de datos — tablas Drizzle a crear

**Regla dura:** las columnas se toman **literal del PRD §10**. No se inventan columnas,
no se renombran, no se "mejoran". Lo único que se añade sin permiso: claves foráneas
implícitas por el nombre (`*_id`), índices, y constraints. Si una columna parece
faltar para una feature futura, **se escala al PM** y se añade con una migración propia.

**Convención:** `snake_case` en la DB, `camelCase` en TS. `id` = `uuid` con
`defaultRandom()` salvo indicación. Todos los enums se declaran como `pgEnum`.

### 4.1 Núcleo de tenant

**`chains`** — `id, name, slug, owner_id, logo_url, cover_url, primary_color,
secondary_color, rnc (tax id), country, currency (DOP), timezone,
allow_cross_location_booking (bool, default true), max_barber_discount_pct,
cancellation_hours, created_at`
- `slug` único global (URL pública `kortexbarber.com/[chainSlug]`).
- `owner_id` → `users.id`. `currency` default `'DOP'`, `country` default `'DO'`,
  `timezone` default `'America/Santo_Domingo'`.

**`locations`** — `id, chain_id, name, slug, address, city, lat, lng, phone, email,
chairs_count, timezone, is_active, business_hours (JSON: opens_at/closes_at por día),
photos, created_at`
- `chairs_count` es **obligatorio (NOT NULL)**: sin él no se calcula *ingreso por silla*,
  la métrica de normalización que hace útil la comparación entre sedes.
- `slug` único por `chain_id`.
- **Decisión PM (D-S1-1):** el PRD ofrece "opens_at/closes_at por día (JSON o tabla
  aparte)". Se resuelve **JSON** en una columna `business_hours jsonb`, con forma
  `{ "mon": { "opens_at": "09:00", "closes_at": "20:00", "closed": false }, ... }`
  (claves `mon|tue|wed|thu|fri|sat|sun`). Motivo: el horario de sede se lee siempre
  completo y nunca se consulta por día suelto; una tabla aparte añade joins sin valor.
- `photos jsonb` = array de URLs de Supabase Storage.

**`users`** — `id, email, phone, full_name, avatar_url, global_role (nullable), created_at`
- **Decisión PM (D-S1-2):** `public.users` es una tabla propia **espejo de
  `auth.users`**, con el **mismo UUID** como `id`. Motivo: Drizzle y las FKs del dominio
  no deben apuntar a un esquema gestionado por Supabase, y necesitamos `full_name`,
  `phone` y `avatar_url` consultables con joins. La sincronización en alta se define en
  la tarea S1-12.
- `global_role` queda nullable y **sin uso en Sprint 1** (reservado para staff interno de
  W-Tech). El rol funcional del producto vive en `memberships`.

**`memberships`** — `id, user_id, chain_id, role (superuser|admin|barber), is_active`
- Único `(user_id, chain_id)`. Un usuario puede tener un rol distinto en otra cadena.
- **Nota de producto:** `client` **no** se modela como membership. Un cliente es una fila
  en `clients` (ligada opcionalmente a `users.user_id`); si un usuario autenticado no
  tiene membership activa en ninguna cadena, su ámbito es `(client)`.

**`barber_locations`** — `id, user_id, location_id, is_primary, commission_rule_id
(override opcional), is_active`
- Único `(user_id, location_id)`. Máximo un `is_primary = true` por `user_id`
  (validación de aplicación en Sprint 1; se puede reforzar con índice parcial único).

### 4.2 Servicios y agenda

**`services`** — `id, chain_id, name, description, category (corte|barba|color|combo|otro),
default_duration_minutes, default_price, image_url, is_active`

**`location_service_overrides`** — `id, location_id, service_id, price, duration_minutes,
is_active`
- Único `(location_id, service_id)`.

**`barber_services`** — `id, user_id, service_id, custom_duration`
- Único `(user_id, service_id)`. *(Qué hace cada barbero y cuánto tarda — el barbero
  rápido no debe bloquear 45 min.)*

**`schedules`** — `id, user_id, location_id, day_of_week, start_time, end_time, is_active`
- `day_of_week` `smallint` 0-6 (0 = domingo). `start_time`/`end_time` tipo `time`.
- **Constraint de aplicación (no de DB):** un barbero no puede tener bloques solapados en
  dos `location_id` distintos el mismo día/hora. La validación vive en
  `lib/scheduling/` y **se implementa en el sprint de horarios, no en Sprint 1** — pero
  la tabla se crea ahora.

**`time_off`** — `id, user_id, location_id (nullable), starts_at, ends_at, reason, status`
- **Decisión PM (D-S1-3):** el PRD no enumera los valores de `status`. Se fija
  `pending | approved | rejected | cancelled` (enum `time_off_status`), porque §6.2 dice
  que el barbero *solicita* y el admin/superuser *aprueba*.

**`appointments`** — `id, chain_id, location_id, client_id, barber_id, service_id,
starts_at, ends_at, status (pending|confirmed|in_progress|completed|cancelled|no_show),
source (online|walk_in|phone|admin), price_at_booking, notes, cancellation_reason,
created_at, updated_at`

**`walk_in_queue`** — `id, location_id, client_id (nullable), client_name_temp, phone,
service_id, preferred_barber_id (nullable), status (waiting|called|serving|done|left),
joined_at, estimated_wait_minutes, position, called_at`

**`clients`** — `id, chain_id, user_id (nullable), full_name, phone, email, birthday,
preferred_location_id, preferred_barber_id, cut_notes (text), tags, loyalty_points,
total_visits, total_spent, last_visit_at, no_show_count, created_at`
- El cliente pertenece a **la cadena**, no a la sede. `tags` = `text[]`.
- Único `(chain_id, phone)` cuando `phone` no es null (el teléfono es el identificador
  real en RD).

### 4.3 Dinero

**`sales`** *(ticket / checkout)* — `id, chain_id, location_id, appointment_id (nullable),
client_id, barber_id, cash_session_id, subtotal, discount_amount, discount_reason,
tip_amount, total, payment_method (cash|card|transfer|mixed|online),
status (open|paid|refunded), created_by, created_at`
- Todos los montos: `numeric(12,2)`. **Nunca `float`.**

**`sale_items`** — `id, sale_id, type (service|product), service_id, product_id, quantity,
unit_price, line_total, barber_id`
- El barbero va **por línea**: un ticket puede tener el corte de uno y la barba de otro.

**`commission_rules`** — `id, chain_id, name, type (percentage|fixed_per_service|
booth_rent|hybrid), service_commission_pct, product_commission_pct,
booth_rent_amount, booth_rent_frequency (weekly|biweekly|monthly),
tip_handling (barber_keeps_all|split_pct), applies_to (chain|location|barber)`

**`payout_periods`** — `id, chain_id, starts_on, ends_on, status (open|calculated|
approved|paid), calculated_at, approved_by`

**`payout_lines`** — `id, payout_period_id, barber_id, location_id, services_count,
services_revenue, product_revenue, commission_amount, booth_rent_deducted,
tips_amount, adjustments, net_payable, notes`
- Una línea **por barbero y por sede**.

**`cash_sessions`** — `id, location_id, opened_by, opened_at, opening_amount,
closed_by, closed_at, expected_cash, counted_cash, difference, notes`

### 4.4 Inventario

**`products`** — `id, chain_id, name, sku, brand, category, cost_price, sale_price,
is_for_sale (bool), is_consumable (bool), image_url`

**`inventory_items`** — `id, location_id, product_id, quantity, min_threshold, updated_at`
- Único `(location_id, product_id)`.

**`stock_movements`** — `id, location_id, product_id, type (purchase|sale|consumption|
adjustment|transfer_in|transfer_out), quantity, reference_id, from_location_id,
to_location_id, created_by, created_at`

### 4.5 Plataforma

**`subscriptions`** — `id, chain_id, plan (local|chain|franchise), status (trialing|
active|past_due|cancelled), included_locations, extra_locations, billing_cycle
(monthly|annual), amount_dop, paypal_subscription_id, trial_ends_at,
current_period_start, current_period_end`
- Una por cadena (`chain_id` único).

**`notifications`** — `id, chain_id, recipient_user_id, channel (email|sms|whatsapp),
template, payload, status, scheduled_for, sent_at`
- **Decisión PM (D-S1-4):** el PRD no enumera `status`. Se fija
  `pending | sent | failed | cancelled` (enum `notification_status`).

**`audit_log`** — `id, chain_id, location_id, actor_user_id, action, entity, entity_id,
before, after, created_at`
- `before` / `after` = `jsonb`. **Obligatorio desde el MVP.**

**`location_daily_metrics`** *(agregados, poblada por job nocturno en sprint posterior)* —
`id, location_id, date, revenue, services_count, products_revenue, unique_clients,
new_clients, no_shows, avg_ticket, chair_utilization_pct, barber_hours`
- Único `(location_id, date)`.

### 4.6 Nota sobre `chain_settings`

El diagrama de §10 menciona `chain_settings`, pero el PRD **no define sus columnas** y
los tres ajustes de cadena que sí existen (`allow_cross_location_booking`,
`max_barber_discount_pct`, `cancellation_hours`) ya viven en `chains`.
**Decisión PM (D-S1-5): NO se crea `chain_settings` en Sprint 1.** Se añadirá cuando
haya un ajuste real que no quepa en `chains`.

### 4.7 Enums a declarar (`pgEnum`)

`membership_role`, `service_category`, `time_off_status`, `appointment_status`,
`appointment_source`, `queue_status`, `payment_method`, `sale_status`, `sale_item_type`,
`commission_type`, `booth_rent_frequency`, `tip_handling`, `commission_applies_to`,
`payout_period_status`, `stock_movement_type`, `subscription_plan`,
`subscription_status`, `billing_cycle`, `notification_channel`, `notification_status`.

### 4.8 Herencia de `chain_id` (para RLS)

| Llevan `chain_id` directo | Resuelven tenant por join |
|---|---|
| `locations`, `memberships`, `services`, `clients`, `appointments`, `sales`, `commission_rules`, `payout_periods`, `products`, `subscriptions`, `notifications`, `audit_log` | `location_service_overrides`, `barber_locations`, `schedules`, `walk_in_queue`, `inventory_items`, `stock_movements`, `cash_sessions`, `location_daily_metrics` → vía `locations.chain_id` · `sale_items` → vía `sales` · `payout_lines` → vía `payout_periods` · `barber_services` → vía `services` · `time_off` → vía `memberships` del `user_id` |

---

## 5. Checklist de Sprint 1

Ejecutar **en orden**. Cada tarea se da por terminada solo cuando su criterio de
aceptación es verificable por otra persona.

### S1-01 · Inicializar el proyecto Next.js
Crear el proyecto en la raíz del repo (junto al PRD y los briefs, no en un subdirectorio):
Next.js 15+ App Router, TypeScript `strict`, Tailwind v4, ESLint + Prettier,
`src/` como raíz de código, alias `@/*`. Inicializar shadcn/ui. `package.json` con
scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:generate`, `db:migrate`,
`db:seed`, `preview` (OpenNext local), `deploy`.
**AC:** `npm run dev` levanta la app en `localhost:3000`; `npm run typecheck` y
`npm run lint` pasan sin errores; un componente de shadcn (`Button`) renderiza con
estilos de Tailwind v4.

### S1-02 · Estructura de carpetas (§9.3 del PRD)
Crear la estructura completa con route groups y placeholders (`page.tsx` mínimo por
ruta, sin UI real):
```
src/app/(auth)/{login,register,forgot-password,reset-password}
src/app/(onboarding)/
src/app/(chain)/{overview,locations,compare,team,services,commissions,reports,settings,billing}
src/app/(location)/[locationId]/{today,calendar,queue,checkout,register,team,inventory,clients,settings}
src/app/(barber)/{schedule,earnings}
src/app/(client)/{appointments,profile}
src/app/(public)/[chainSlug]/...  ·  src/app/(public)/book/
src/app/api/
src/components/{ui,scheduling,queue,pos,charts,forms}/
src/lib/{db,auth,commissions,scheduling,notifications,billing}/
src/types/
```
**AC:** todas las rutas listadas responden 200 (o 403/redirect, tras S1-14) y el árbol
de carpetas coincide 1:1 con §9.3. El principio rector queda escrito en un
`README` corto dentro de `src/app/`: **la ruta declara el ámbito**.

### S1-03 · Proyecto Supabase + variables de entorno
Crear el proyecto Supabase (región más cercana a RD). Definir `.env.example` con:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (sesión/pooler), `DIRECT_URL` (migraciones),
`SENTRY_DSN`, `RESEND_API_KEY` (vacío por ahora). Crear los helpers de cliente Supabase:
server (con cookies, para sesión), browser (anon, para Realtime), y admin (service role,
**solo** para tareas de sistema explícitas).
**AC:** `.env.example` commiteado sin valores reales; `.env.local` en `.gitignore`; una
página de servidor lee la sesión Supabase sin errores; el cliente admin no es importable
desde ningún archivo `"use client"` (verificado por lint rule o por convención en
`src/lib/db/README`).

### S1-04 · Drizzle + conexión + spike de runtime Cloudflare
Configurar `drizzle.config.ts` (dialect postgres, schema en `src/lib/db/schema/`,
migraciones en `src/lib/db/migrations/`) y el cliente Drizzle server-side.
**Spike obligatorio (riesgo técnico de §9.2 del PRD):** validar que una query Drizzle
real y un Server Action funcionan **desplegados en Cloudflare Workers vía OpenNext**, no
solo en `next dev`. Si el driver elegido no corre en Workers, resolverlo ahora — no
después de construir 26 tablas encima del supuesto.
**AC:** un Route Handler desplegado en un preview de Cloudflare ejecuta
`select now()` contra Supabase y devuelve el resultado; un Server Action de prueba
escribe y lee una fila. Resultado del spike documentado en 5 líneas en el PR (driver
elegido y por qué).

### S1-05 · Schema Drizzle — núcleo de tenant
Declarar enums (§4.7) y las tablas `chains`, `locations`, `users`, `memberships`,
`barber_locations` con las columnas exactas de §4.1.
**AC:** `npm run db:generate` produce SQL sin errores; los tipos inferidos
(`typeof chains.$inferSelect`) están disponibles; `chairs_count` es NOT NULL;
`memberships` tiene único `(user_id, chain_id)`.

### S1-06 · Schema Drizzle — servicios y agenda
`services`, `location_service_overrides`, `barber_services`, `schedules`, `time_off`,
`appointments`, `walk_in_queue`, `clients` (§4.2).
**AC:** columnas exactas del PRD; enums aplicados; único `(location_id, service_id)` en
overrides; `appointments.status` y `.source` como enums, no como texto libre.

### S1-07 · Schema Drizzle — dinero
`sales`, `sale_items`, `commission_rules`, `payout_periods`, `payout_lines`,
`cash_sessions` (§4.3).
**AC:** **todos los campos monetarios son `numeric(12,2)`; ningún `float`/`real`
en todo el esquema** (verificable con un grep en el SQL generado).
`sale_items.barber_id` existe (comisión por línea).

### S1-08 · Schema Drizzle — inventario y plataforma
`products`, `inventory_items`, `stock_movements`, `subscriptions`, `notifications`,
`audit_log`, `location_daily_metrics` (§4.4, §4.5).
**AC:** `audit_log.before`/`after` son `jsonb`; `location_daily_metrics` tiene único
`(location_id, date)`; `subscriptions.chain_id` único.

### S1-09 · Migración inicial + índices + FKs
Generar y aplicar la migración inicial. Añadir índices mínimos:
`chain_id` en toda tabla que lo tenga; `location_id` en toda tabla que lo tenga;
`appointments (location_id, starts_at)`; `appointments (barber_id, starts_at)`;
`walk_in_queue (location_id, status, position)`; `sales (location_id, created_at)`;
`clients (chain_id, phone)`; `schedules (user_id, day_of_week)`;
`audit_log (chain_id, created_at)`. FKs con `on delete` explícito y razonado
(`restrict` por defecto en datos de negocio; `cascade` solo en hijos puros como
`sale_items` y `payout_lines`).
**AC:** `npm run db:migrate` corre limpio sobre una base vacía; el archivo SQL de
migración está commiteado; las **26 tablas** existen en Supabase; re-ejecutar la
migración es idempotente (no falla).

### S1-10 · RLS por `chain_id`
Habilitar RLS en **todas** las tablas de negocio. Crear una función SQL
`auth_chain_ids()` (o equivalente) que devuelva los `chain_id` con membership activa del
`auth.uid()` actual, y políticas `select/insert/update/delete` que exijan que el
`chain_id` de la fila —directo o resuelto por join según §4.8— esté en ese conjunto.
Para `clients` y `appointments`, permitir además al usuario cliente ver **sus propias**
filas (`clients.user_id = auth.uid()`).
**AC (test manual documentado en el PR):** con el JWT de un usuario de la Cadena A,
una consulta vía `supabase-js` a `locations` devuelve **0 filas** de la Cadena B, y un
`insert` con `chain_id` de la Cadena B es **rechazado**. Ninguna tabla de negocio queda
con RLS deshabilitado (verificar en el linter de seguridad de Supabase: cero advertencias
de "RLS disabled").

### S1-11 · Autenticación: registro, login, recuperación
Implementar sobre Supabase Auth (email + password para Sprint 1; OAuth queda fuera):
`(auth)/register`, `(auth)/login`, `(auth)/forgot-password`, `(auth)/reset-password`,
logout, y el manejo de sesión con cookies en Server Components. Sincronizar
`auth.users` → `public.users` en el alta (trigger SQL o Server Action de alta; el
desarrollador elige, pero debe ser **atómico**: no puede existir un `auth.users` sin su
`public.users`). Todo formulario validado con Zod.
**AC:** un usuario se registra, recibe el email de verificación, inicia sesión y su fila
existe en `public.users` con el **mismo UUID** que `auth.users`; el flujo de recuperación
de clave funciona end-to-end; cerrar sesión invalida el acceso a rutas protegidas;
credenciales inválidas devuelven un error en español, sin filtrar si el email existe.

### S1-12 · Contexto de sesión y `memberships`
Implementar en `src/lib/auth/` un resolvedor de sesión de servidor, cacheado por request,
que devuelva: usuario, sus memberships activas (`chain_id`, `role`), sus
`barber_locations` activas y la cadena activa. Definir la regla de **cadena activa**
cuando el usuario tiene más de una membership.
**Decisión PM (D-S1-6):** en Sprint 1, si el usuario tiene más de una membership activa
se usa la **primera por `created_at`** y se deja un `TODO` marcado para el selector de
cadena; no se construye UI de cambio de cadena en este sprint.
**AC:** existe una función de servidor que, dado el request, devuelve el contexto
completo tipado; se ejecuta **una sola consulta** a la DB por request (verificado con
log); un usuario sin membership activa obtiene contexto de ámbito `client`.

### S1-13 · Guard de autorización por ámbito
Implementar en `src/lib/auth/` los guards que consumen el contexto de S1-12 y aplican las
reglas de §3. Contrato mínimo (firmas, el desarrollador decide la implementación):
- `requireChainScope()` → contexto con `chainId`; 403 si el rol no es `superuser`.
- `requireLocationScope(locationId)` → contexto con `chainId` + `locationId` + rol
  efectivo; 403 si la sede no pertenece a la cadena de la sesión, o si el usuario no es
  `superuser` de esa cadena ni tiene `barber_locations`/membership `admin` sobre esa sede.
- `requireBarberScope()`, `requireClientScope()`.
Añadir un layout/middleware por route group que invoque el guard correspondiente
**antes** de renderizar o consultar, y una página 403 en español.
**AC (este es el criterio 1.3 y el #11 de §16 del PRD):** un `admin` asignado solo a
Sede A recibe **403** al abrir `/[locationIdDeSedeB]/today` escribiendo la URL a mano; un
`barber` recibe 403 en cualquier ruta `(chain)`; un usuario `client` recibe 403 en
`(chain)` y `(location)`; un `superuser` accede a cualquier sede **de su cadena** y
recibe 403 en una sede de otra cadena. Los 5 casos están cubiertos por tests de Vitest.

### S1-14 · Base de validación, errores y auditoría
Convención única de Server Actions: input Zod → guard → lógica → resultado tipado
(`{ ok: true, data } | { ok: false, error }`), sin excepciones sin capturar hacia el
cliente. Helper `writeAuditLog()` que escribe en `audit_log` (actor, acción, entidad,
before/after). Sentry inicializado (server + client) con los secretos fuera del bundle.
**AC:** existe al menos una Server Action de ejemplo que usa el patrón completo; un error
provocado a propósito aparece en Sentry; una llamada al helper de auditoría inserta la
fila con `chain_id` correcto.

### S1-15 · Seed de datos de prueba
Script `npm run db:seed`, **idempotente** (se puede correr dos veces sin duplicar), que
crea exactamente:
- **1 cadena:** `Don Bigote Barbershop`, slug `don-bigote`, moneda DOP, timezone
  `America/Santo_Domingo`, `allow_cross_location_booking = true`,
  `max_barber_discount_pct = 10`, `cancellation_hours = 4`.
- **1 suscripción:** plan `chain`, estado `trialing`, `included_locations = 3`,
  `trial_ends_at` = hoy + 21 días.
- **3 sedes:** `Naco` (6 sillas), `Bella Vista` (4 sillas), `San Cristóbal` (5 sillas),
  con dirección, teléfono, `business_hours` L-S 9:00-20:00 / domingo cerrado, `is_active = true`.
- **Usuarios con login funcional** (password conocida, documentada en el README del seed):
  1 `superuser` (dueño), 2 `admin` (uno en Naco, uno en Bella Vista), 6 `barber`,
  2 usuarios `client` + 3 `clients` sin usuario (walk-in típico).
- **`barber_locations`:** 3 barberos en Naco, 2 en Bella Vista, 1 en San Cristóbal, y
  **uno de ellos asignado además a una segunda sede** con `is_primary` correcto — este
  caso es el que hace probable el resto del desarrollo multi-sede.
- **`schedules`:** el barbero multi-sede con bloques **sin solapamiento** entre sedes
  (ej. lun-mié en Naco, jue-sáb en Bella Vista).
- **Servicios de cadena:** `Corte clásico`, `Fade`, `Barba`, `Fade + Barba`, `Tinte`
  con duración y precio default; **override de precio:** `Fade` a RD$500 en Naco y
  RD$400 en San Cristóbal (esto reproduce el criterio 1.6 del PRD).
- **1 `commission_rule`** de tipo `percentage` al 50% a nivel cadena (no se calcula nada
  con ella en este sprint; existe para que el sprint de comisiones arranque con datos).
**AC:** tras `db:seed` en una base limpia, se puede iniciar sesión con los 4 roles; el
superuser ve 3 sedes en la DB; el barbero multi-sede aparece en 2 sedes; el override de
precio de `Fade` difiere entre Naco y San Cristóbal; correr el seed dos veces no duplica
filas ni falla.

### S1-16 · Tests y cierre del sprint
Configurar Vitest (unit, con DB de prueba o mocks para los guards). Tests obligatorios de
Sprint 1: los 5 casos del guard (S1-13), el resolvedor de sesión/memberships, y la
idempotencia del seed.
**AC:** `npm run test` pasa en verde; `npm run build` y el deploy a un preview de
Cloudflare funcionan; el README del repo documenta cómo levantar el proyecto desde cero
(env, migración, seed, login de prueba) en menos de 10 pasos.

---

## 6. Definición de Done de Sprint 1

Sprint 1 está terminado cuando, en un preview desplegado en Cloudflare:

1. `npm run db:migrate && npm run db:seed` deja una cadena de 3 sedes operable.
2. Los 4 roles inician sesión y aterrizan en su ámbito correcto.
3. Un `admin` de Sede A recibe **403** en Sede B por URL directa (PRD §16.11).
4. RLS bloquea el acceso cross-cadena vía `supabase-js` con JWT real.
5. Las 26 tablas de §10 existen con las columnas literales del PRD.
6. `typecheck`, `lint`, `test` y `build` pasan en CI local.

---

## 7. FUERA DE ALCANCE de Sprint 1 (no lo construyas)

Estas features son de sprints posteriores (F2/F3 del roadmap §11 del PRD). Sus **tablas
sí se crean** en Sprint 1 (para no re-migrar), pero **su lógica, sus rutas funcionales y
su UI no**:

- ❌ **POS / checkout / cobro** (`sales`, `sale_items`) — F2.
- ❌ **Cierre de caja diario** (`cash_sessions`) — F2.
- ❌ **Cola de walk-ins y Realtime** (`walk_in_queue`) — F2.
- ❌ **Motor de comisiones y cierre de período** (`commission_rules`, `payout_*`) — F3.
- ❌ **Dashboard consolidado y comparativa de sedes** (`location_daily_metrics`, job
  nocturno) — F3.
- ❌ **Agenda visual, flujo de reserva pública, disponibilidad y slots** — F2.
- ❌ **CRUD de sedes / barberos / servicios con UI** — sprint siguiente (F1, parte 2).
- ❌ **Inventario, notificaciones por email/WhatsApp, billing con pasarela real** — F2/F3.
- ❌ **PWA del barbero, offline, i18n inglés, white-label** — F5/F6.

**Regla anti-scope-creep:** si una tarea de Sprint 1 empieza a requerir lógica de
negocio de la lista anterior, **es señal de que el guard o el esquema se está
sobre-diseñando**. Para, y escala al PM. El único trabajo de producto de este sprint es
que el sistema sepa **quién eres, de qué cadena eres y a qué sede puedes entrar**.

---

## 8. Riesgos vigentes de este sprint

| # | Riesgo | Mitigación en el sprint |
|---|---|---|
| A | El adapter OpenNext/Cloudflare no soporta bien el driver de Postgres o los Server Actions | Spike **S1-04 antes** de escribir el esquema completo; si falla, escalar al PM el mismo día (impacta §9.2 del PRD, no lo decide el dev solo) |
| B | RLS con jerarquía cadena→sede→rol se vuelve inmantenible | Por diseño: RLS **solo** aísla por `chain_id`; los permisos finos por sede/rol viven en el guard de servidor (S1-13) |
| C | Drizzle conectando con un rol que **bypassa RLS** da falsa sensación de seguridad | La autorización de servidor es la capa real para queries de Drizzle; el test de RLS (S1-10) se hace explícitamente con JWT de usuario vía `supabase-js`, no con Drizzle |
| D | El esquema se desvía del PRD "por comodidad" | Revisión de PR columna por columna contra §4 de este documento |
