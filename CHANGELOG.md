# CHANGELOG — Kortex

## 2026-09-17 — F2 Bloque E: cobro y caja (F2-20..F2-23)

Server Actions y pantallas de `(location)/sede/[locationId]/checkout` y
`.../register`, sobre el modulo puro `lib/pos` (F2-19, ya existente y sin
tocar) y las migraciones de integridad ya aplicadas (`0002_f2_integrity.sql`:
caja abierta unica por sede, venta unica por cita).

**Construido:**
- `src/lib/actions/cash-register.ts` — `openCashSessionAction` (F2-20,
  solo admin/superuser, D-F2-9), `closeCashSessionAction` (F2-23: esperado en
  efectivo = apertura + ventas `cash` no anuladas de la sesion; tarjeta y
  transferencia se listan aparte, informativas; bloquea el cierre si queda
  una venta `status = 'open'`), `loadCashRegisterState` para pintar el estado
  de la caja en la pantalla.
- `src/lib/actions/checkout.ts` — `createSaleAction` (F2-21): recalcula todo
  con `lib/pos#computeSaleTotals`, exige caja abierta, resuelve el precio
  efectivo en el servidor (D-F2-1, nunca del cliente), aplica el tope de
  descuento por rol (D-F2-10), fija `sales.barber_id` a la linea de mayor
  `line_total` (D-F2-12), marca la cita `completed`, actualiza
  `clients.total_visits/total_spent/last_visit_at`, y escribe `audit_log`.
  `voidSaleAction` (F2-22, P1 del backlog: se incluyo completo): anula una
  venta solo si la caja de esa venta sigue abierta, solo admin/superuser,
  motivo obligatorio, `audit_log` con `before`/`after`.
- `checkout/page.tsx` (Cobrar) y `register/page.tsx` (Caja) reemplazan los
  placeholders de Sprint 1, con `CheckoutForm` y `CashRegisterPanel`
  (`src/components/kortex/`) sobre el design system existente (`MoneyDisplay`,
  `Button`, `Select`, `Sheet`-compatible layout, `EmptyState`).

**Anti doble-submit/doble-cobro (regla dura adicional del encargo):** no se
agrego ninguna tabla de idempotencia nueva (fuera de las migraciones
autorizadas por BACKLOG-F2.md §5). Se reutilizo `audit_log`, que ya es
obligatoria en este camino: el cliente genera un `idempotencyKey` (uuid) una
sola vez por intento de venta; el servidor busca en `audit_log`
(`action = 'sale.create'`, `after.idempotencyKey`) antes de insertar nada. Si
la clave ya existe, se devuelve la venta ya creada como respuesta exitosa
(replay), sin duplicar — esto cubre tanto el doble-click como el "reintentar
tras error de red" que pide el AC de F2-21. Como segunda capa, el indice
unico parcial `sales_appointment_id_uq` rechaza en la base de datos un
segundo cobro de la misma cita.

**Conversion dinero <-> `numeric(12,2)`:** `centsFromDecimalString`/
`decimalStringFromCents` en `checkout.ts` parsean/forman el string decimal
directamente (particion en `intPart`/`fracPart`), nunca `Number(x) * 100`
— evita la imprecision de punto flotante en esa conversion. El unico calculo
de negocio (subtotal, descuento, propina, total) sigue siendo
`lib/pos#computeSaleTotals`, sin tocar. El preview de monto que ve el
usuario ANTES de cobrar (en `CheckoutForm`) es aritmetica entera en centavos
solo para UX (el boton "Cobrar RD$X" del UX-BRIEF necesita mostrar un
numero); no se persiste ni se envia al servidor — el servidor jamas confia
en el, recalcula todo desde cero.

**Decisiones de producto tomadas sin respaldo explicito en BACKLOG-F2.md**
(documentadas aqui para que el PM las confirme o las corrija):
1. Un barbero (`effectiveRole = "barber_assigned"`) solo puede cobrar lineas
   donde el es el barbero de esa linea — no puede cobrar el servicio de otro
   barbero en el mismo ticket. El backlog no lo dice explicitamente; se
   infirio de la matriz §6.2 (un barbero opera "sus propias" citas/turnos) y
   parecia el default mas seguro contra fraude. Si el piloto necesita que un
   barbero cobre un ticket con otro barbero en la linea, hay que ampliar
   esto con un admin presente o revisar la regla.
2. `sales.status` se fija a `'paid'` directamente en `createSale` (nunca
   `'open'`): el checkout de F2-21 es de un solo paso (no hay "ticket
   abierto" que se cierra despues), asi que no existe un camino que deje una
   venta en `'open'`. El guard de F2-23 que bloquea el cierre si hay ventas
   `'open'` se implemento de todas formas como red de seguridad explicita
   (tal como pide el AC), pero en operacion normal esa lista siempre esta
   vacia con este flujo.
3. F2-22 (anulacion) se implemento completo aunque el backlog lo marca P1
   con "si se corta, se documenta como deuda tecnica" — no hizo falta
   cortarlo, se incluyo dentro del tiempo de la tarea.
4. El "monto cobrado por la terminal" de tarjeta (D-F2-13) se ingresa como
   parte del total de la venta (no hay campo separado de "monto de terminal"
   en el schema); el copy obligatorio se muestra como nota bajo el selector
   de metodo de pago, tal como especifica el UX-BRIEF.
5. La seccion "la caja abierta se muestra en El Dia con quien la abrio y a
   que hora" (AC de F2-20) **no se implemento**: `today/page.tsx` esta fuera
   del alcance de archivos asignado a este bloque (pertenece a Bloque B/D).
   `loadCashRegisterState` en `cash-register.ts` ya expone todo lo necesario
   (`openedByName`, `openedAt`) para que quien tenga ese archivo en su
   alcance lo conecte sin tocar la logica de caja.

**Pendiente / riesgos abiertos de este bloque:**
- Sin tests de integracion propios para `checkout.ts`/`cash-register.ts`
  (mismo patron que Bloque B/D: `appointments.ts` y `queue.ts` tampoco los
  tienen — son Server Actions con DB real, no modulos puros; `lib/pos`
  mantiene su 100% de cobertura sin tocar). La cobertura de estos flujos
  (cobrar en los 3 metodos, doble-submit, cierre de caja) queda para F2-25
  (Playwright E2E), fuera del alcance de este bloque.
- No se verifico contra una base de datos real (Supabase) en esta sesion —
  no hay credenciales disponibles en este entorno. `typecheck`, `lint` y
  `test` (Vitest, 99 tests) pasan en verde; falta la verificacion end-to-end
  de `npm run db:migrate` + un cobro real que el equipo debe correr con el
  proyecto Supabase conectado antes de dar F2-21/22/23 por cerrado en
  produccion.
- No se conecto "Cobrar" como boton desde una fila `serving` de La Fila con
  el `appointmentId` real que crea `startServing` (D-F2-8) — `queue.ts` esta
  fuera de mi alcance de archivos. El checkout ya soporta
  `?appointmentId=<uuid>` como entrada, asi que conectar ese enlace desde la
  UI de La Fila es un cambio de una linea en un archivo fuera de mi alcance.

## 2026-09-17 — F2-00: spike de Cloudflare Workers validado

Antes de construir features de dinero de F2 (POS/caja), se cerró el riesgo abierto
de Sprint 1 sobre el runtime de Cloudflare (ver pendiente #1 del sprint anterior).

- Build local con `opennextjs-cloudflare` + `wrangler dev` (runtime real de
  Workers, no Node): rutas verificadas — pública `200`, `/login` `200`, ruta
  protegida de sede sin sesión → `403`. Drizzle + `postgres.js` sobre TCP
  funcionan correctamente en `workerd`.
- Deploy real a producción: **https://kortex.williamsvillavizar204.workers.dev**
  — mismas verificaciones, mismos resultados. El spike S1-04 queda **validado**,
  ya no es un riesgo abierto.
- Nota técnica: en Windows, `opennextjs-cloudflare build` puede fallar con
  `EPERM` al borrar `.open-next` si un `wrangler dev`/`preview` anterior quedó
  con procesos `node`/`esbuild` huérfanos reteniendo el directorio. Solución:
  cerrar esos procesos (`Stop-Process`) antes de reintentar el build.

**Pendiente aparte, no bloqueante:** rotar el `service_role` key de Supabase
que quedó expuesto en el chat de Sprint 1 — ninguna herramienta MCP disponible
expone esa acción por API; requiere Project Settings → API → Reset
service_role secret en el dashboard.

## 2026-09-16 — Sprint 1: fundación del proyecto (backend + design system)

### Contexto de arranque

El repo llegó a esta sesión con un scaffold antiguo (Express + React + Vite) que ya
no correspondía a la decisión de stack del PRD. Se limpió y se partió de cero sobre
el stack aprobado: **Next.js 15/16 (App Router) + TypeScript + Supabase (Postgres/
Auth/Realtime) + Drizzle ORM + Tailwind v4 + shadcn/ui**, deploy previsto en
Cloudflare Workers vía OpenNext.

Documentos de planeación ya existentes al iniciar (no se tocaron durante el sprint):
`PRD-BarberShop.md`, `BRAND-BRIEF-Kortex.md`, `UX-BRIEF-Kortex.md`.

### Equipo y flujo usado (a repetir en sprints futuros)

1. **product-manager** → `BACKLOG-BACKEND.md`: backlog técnico de Sprint 1 derivado
   literal del PRD (26 tablas, reglas de seguridad, decisiones de producto que el
   PRD dejaba abiertas, documentadas como D-S1-1 a D-S1-6).
2. **graphic-designer** → `DESIGN-SYSTEM.md`: tokens Tailwind v4 (ambos temas),
   tipografía Archivo+Inter+IBM Plex Mono, y especificación de API de los 12
   componentes reutilizables del UX brief.
3. **developer-builder (backend)** → implementación del backlog: proyecto Next.js,
   esquema Drizzle, migraciones, RLS, auth multi-rol, guards, seed.
4. **developer-builder (frontend)** → implementación del design system sobre el
   scaffold anterior: tema, tipografía, los 12 componentes, y 2 pantallas de
   referencia con datos mock.

### Backend — qué quedó construido

- Proyecto Next.js 16 inicializado (App Router, TypeScript estricto, ESLint,
  Vitest), con la estructura de rutas por ámbito del PRD §9.3:
  `(auth)`, `(onboarding)`, `(chain)`, `(location)/sede/[locationId]`, `(barber)`,
  `(client)`, `(public)`.
- Esquema Drizzle completo: **26 tablas** + 20 enums, fiel a PRD §10 (columnas
  literales, sin inventar nombres). Migración inicial aplicada.
- **RLS por `chain_id`** en Postgres (función `auth_chain_ids()` + políticas por
  tabla, directas o por join) como red de seguridad, **más** autorización
  explícita de servidor por rol/`location_id` en `src/lib/auth/guards.ts`
  (`requireChainScope`, `requireLocationScope`, `requireBarberScope`,
  `requireClientScope`) — las dos capas, ninguna sustituye a la otra.
- Auth multi-rol con Supabase Auth: login, registro, recuperar/reset de clave.
  Modelo `memberships` (superuser/admin/barber por cadena); un usuario sin
  membership activa cae en el ámbito `(client)`.
- Auditoría (`audit_log`) y convención `ActionResult<T>` para Server Actions.
  Sentry inicializado (DSN vacío por defecto).
- Seed de datos de prueba, idempotente: 1 cadena ("Don Bigote"), 3 sedes (Naco,
  Bella Vista, San Cristóbal), 8 usuarios de equipo + 2 clientes con cuenta + 3
  walk-in, 1 barbero multi-sede con horarios sin solapar, 5 servicios con
  overrides de precio por sede, 1 regla de comisión.
- 15 tests (Vitest) en verde: guards de autorización, resolución de sesión,
  idempotencia del seed.

**Bug real encontrado y corregido durante el sprint:** `(location)/[locationId]` y
`(public)/[chainSlug]` colisionaban en la misma ruta raíz de Next.js (ambos son el
único segmento dinámico de su route group). Se resolvió moviendo la ruta de sede a
`/sede/[locationId]/...` para no tocar la URL pública `/[chainSlug]` que el PRD
exige como vanity URL. Documentado en `src/app/README.md`.

**Decisiones de producto cerradas que el PRD dejaba abiertas** (ver detalle en
`BACKLOG-BACKEND.md`): horario de sede en JSON (no tabla aparte), `public.users`
como espejo de `auth.users`, enums de `time_off.status` y `notifications.status`,
no se crea `chain_settings` (sin columnas definidas en el PRD), cadena activa =
primera membership por `created_at` cuando hay varias (selector de cadena queda
pendiente).

### Frontend — qué quedó construido

- Tokens de color Tailwind v4 (`globals.css`) para ambos temas — oscuro por
  defecto en consola (`chain`/`location`/`barber`), claro fijo en `(public)` —
  activados por `data-theme` según segmento de ruta (no `prefers-color-scheme`).
- Tipografía Archivo (700/800) + Inter (variable) + IBM Plex Mono (400/500),
  self-hosted vía `next/font/local`, con la escala completa como utilidades
  Tailwind (`display-xl`…`num-m`, tabulares en montos).
- Los 12 componentes reutilizables del UX brief: Botón, Input/Select/Combobox,
  Badge de estado, Tabla de datos densa, Tarjeta de sede, `MoneyDisplay`,
  `TrendIndicator`, `QueueCard`, `ScopeBanner`, Sheet inferior, Skeleton loader,
  Empty state esquemático — en `src/components/ui/` y `src/components/kortex/`.
- 2 pantallas de referencia montadas con datos mock (sin conectar a Supabase
  todavía): **La Fila** (`(location)/sede/[locationId]/queue`) y **Mi Silla**
  (`(barber)/mi-silla`).
- El resto de las rutas de `(chain)`, `(location)`, `(client)` existen como
  placeholders vacíos ("Placeholder Sprint 1 — sin UI de negocio todavía") — solo
  la ruta y el guard, sin funcionalidad de negocio.
- Wordmark/isotipo: sin asset final todavía; placeholder en texto plano (Archivo
  800, minúsculas) hasta que se produzca el logo en una herramienta de diseño.

### Infraestructura

- Proyecto Supabase real conectado: **`Barbersho_SaaS`**, ref `eklezrodjrofyxhlakwe`
  (región `ca-central-1`). MCP server `supabase` agregado a nivel de proyecto
  (`.mcp.json`) para administrarlo desde Claude Code en sesiones futuras.
- Esquema + políticas RLS aplicados contra ese proyecto real (verificado con
  `get_advisors`: sin tablas sin RLS).
- Seed corrido contra la base real — usuarios de prueba reales en Supabase Auth.
- Verificado end-to-end con el servidor de desarrollo: página pública `200`,
  `/login` `200`, ruta protegida de sede sin sesión → `403` correcto.
- Fix de los scripts `db:seed`/`db:migrate`: no cargaban `.env.local` (usaban
  `dotenv/config` a secas, que solo lee `.env`) y fallaban por el guard
  `server-only` al correr fuera del bundler de Next.js. Se agregó
  `scripts/stub-server-only.cjs` (solo para estos scripts de CLI) y se cambió la
  carga de env a `dotenv.config({ path: ".env.local" })`.
- `next.config.ts`: `agentRules: false` para que `next dev` no regenere
  `AGENTS.md`/`CLAUDE.md` en cada arranque.

### Cómo retomar el proyecto

```bash
npm install
# .env.local ya existe localmente con las credenciales del proyecto Supabase real
# (no está en git). Si se recrea el repo desde cero, ver .env.example.
npm run dev
```

Usuarios de prueba (contraseña para todos: `Kortex#2026!`):
- `owner@donbigote.test` — superuser (dueño de la cadena)
- `admin.naco@donbigote.test`, `admin.bellavista@donbigote.test` — admins de sede
- `barbero1@donbigote.test` … `barbero6@donbigote.test` — barberos
- `cliente1@donbigote.test`, `cliente2@donbigote.test` — clientes

Sede Naco: `00000000-0000-0000-0000-000000000301` (usar en rutas
`/sede/[locationId]/...`).

### Pendiente / riesgos abiertos para retomar

1. **No verificado en Cloudflare Workers real** (spike S1-04): el driver Drizzle
   (`postgres.js` sobre TCP) sigue el patrón documentado de OpenNext, pero falta
   desplegar un preview real y confirmar que corre en el runtime de Workers.
2. **Rotar el `service_role` key** de Supabase — quedó expuesto en el chat de esta
   sesión en algún momento; rotarlo en Project Settings → API antes de ir a
   producción.
3. **Selector de cadena** cuando un usuario tiene varias memberships — hoy se
   usa la primera por `created_at` (D-S1-6), sin UI para cambiar.
4. Confirmar si se adopta Framer Motion para la animación de reacomodo de
   vecinos en `QueueCard` (hoy es CSS puro, sin ese detalle).
5. Falta el asset final del wordmark/isotipo (ver `DESIGN-SYSTEM.md` §6).

### Próximo paso: Fase 2 (F2 del PRD, roadmap §11)

Agenda real (vista día/semana por barbero), reserva pública funcional, cola de
walk-ins conectada a Supabase Realtime, POS/checkout, cierre de caja diario. Se
seguirá el mismo flujo de equipo: product-manager para el backlog técnico de F2,
developer-builder para implementarlo; UI/UX ya tiene el sistema de diseño listo,
así que el frontend de F2 es mayormente conectar las pantallas ya montadas (y las
que falten) a datos reales.
