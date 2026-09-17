# BACKLOG F2 — Kortex · Fase 2 (Operación: agenda, reserva, fila, cobro, caja)

**Proyecto:** Kortex — SaaS de gestión operativa multi-sede para cadenas de barberías (W-Tech)
**Documento:** backlog técnico de Fase 2 · v1.0 · 17 sep 2026
**Fuente de verdad de producto:** `PRD-BarberShop.md` (aprobado). Este backlog extrae y
congela lo necesario para F2; **el desarrollador no necesita leer el PRD completo para
ejecutar esta fase**. Si algo no está en este documento, no es F2.
**Documento previo:** `BACKLOG-BACKEND.md` (Sprint 1, ya ejecutado) — sigue vigente como
contrato de esquema y de seguridad. `CHANGELOG.md` describe el estado real del repo.
**Autoridad:** las decisiones de producto de este documento las toma el PM. El
desarrollador decide el *cómo* técnico; no decide *qué* se construye, ni renombra
columnas, ni amplía alcance por su cuenta. Cualquier ambigüedad se escala al PM, no se
asume.

---

## 1. Alcance de F2 (resumen)

Sprint 1 dejó el sistema sabiendo **quién eres, de qué cadena eres y a qué sede puedes
entrar**. F2 hace que **una sede pueda operar un día real completo**: el gerente abre la
sede y ve la agenda del día por barbero; un cliente reserva solo, desde la calle, por
sede o por su barbero, sin poder pisar un turno ya tomado; recepción da turnos de walk-in
y la pantalla del mostrador y la del barbero se actualizan en vivo sin recargar; al
terminar el servicio se cobra (efectivo / tarjeta / transferencia, con propina y
descuento auditado); y al final del día se cierra la caja con esperado vs. contado y el
descuadre registrado.

En términos del PRD: **F2 del roadmap §11** y las features **1.7, 1.8, 1.9 (parte de
booking), 1.10, 1.11, 1.12 y 1.15** de §8.1. Cubre los criterios de aceptación del MVP
**§16.4, §16.5, §16.6 y §16.7**, y re-verifica el §16.11 (403 cross-sede) ahora que hay
datos de negocio reales detrás de las rutas.

Al cerrar F2 **todavía no** se calcula una comisión, **no** existe el dashboard
consolidado de la cadena y **no** se envía un solo email. Eso es F3 (§7 de este
documento). El valor entregado por F2 es operativo, no analítico: *el local funciona
encima de Kortex durante un día entero*.

**Lo que F2 NO arregla y hay que tener presente:** las pantallas CRUD de F1 parte 2
(sedes, equipo, servicios, horarios — PRD 1.2/1.4/1.5/1.6) siguen siendo placeholders.
F2 se desarrolla y se valida **contra el seed**, que ya crea cadena, 3 sedes, barberos,
horarios, servicios y overrides. Construir esas pantallas **no es parte de F2**; se
agendan después, y son requisito para el piloto (F4), no para F2. Ver riesgo F en §8.

---

## 2. Punto de partida — qué ya existe y se reutiliza (no reinventar)

Verificado contra el repo el 17 sep 2026. **Nada de esta lista se rehace.**

| Pieza | Dónde vive | Cómo se usa en F2 |
|---|---|---|
| Esquema completo de 26 tablas (Drizzle) | `src/lib/db/schema/` (`core.ts`, `catalog.ts`, `money.ts`, `inventory.ts`, `platform.ts`, `enums.ts`) | Se consume tal cual. Columnas literales del PRD §10 |
| Migración inicial + RLS | `src/lib/db/migrations/0000_init_schema.sql`, `0001_rls_policies.sql` | No se editan. F2 añade `0002` y `0003` (ver §5) |
| Guards de ámbito | `src/lib/auth/guards.ts` — `requireChainScope`, `requireLocationScope(locationId)`, `requireBarberScope`, `requireClientScope` | **Obligatorio** al inicio de toda Server Action y de todo layout de F2. No se crean guards nuevos |
| Contexto de sesión cacheado | `src/lib/auth/session.ts` — `getSessionContext()` | Fuente única de `userId`, memberships y `barberLocations` |
| Convención de Server Actions | `src/types/action-result.ts` (`ActionResult<T>`, `actionOk`, `actionError`) + ejemplo completo en `src/lib/actions/example-audit-action.ts` | Patrón obligatorio: Zod → guard → transacción → `ActionResult` |
| Auditoría | `src/lib/auth/audit.ts` — `writeAuditLog({chainId, locationId, actorUserId, action, entity, entityId, before, after})` | Obligatorio en todo lo que toque dinero, descuentos, anulaciones o cierre de caja |
| Cliente Drizzle server-side | `src/lib/db/client.ts` (`db`, `postgres.js`, `prepare:false`) | Toda lectura/escritura de servidor. **Bypassa RLS por diseño** → el guard es la defensa real |
| Clientes Supabase | `src/lib/supabase/server.ts` (sesión), `browser.ts` (anon, Realtime), `admin.ts` (service role, solo tareas de sistema) | `browser.ts` es el único autorizado para la suscripción Realtime de La Fila |
| Design system completo | `DESIGN-SYSTEM.md`, `src/components/ui/*`, `src/components/kortex/*` | Los 12 componentes ya existen: `QueueCard`, `MoneyDisplay`, `Badge`, `DataTable`, `Sheet`, `EmptyState`, `Skeleton`, `LocationCard`, `ScopeBanner`, `TrendIndicator` |
| UI mock de La Fila | `src/app/(location)/sede/[locationId]/queue/page.tsx` | Se conserva el layout y el copy; se reemplazan `queueMock`/`setQueue`/`attendingMock` por datos reales + Realtime |
| UI mock de Mi Silla | `src/app/(barber)/mi-silla/page.tsx` | En F2 solo se conecta el bloque "Mi Día" (agenda de hoy). "Lo mío" (dinero de la quincena) es F3 |
| Wireframes de las 5 pantallas de F2 | `UX-BRIEF-Kortex.md` §4.2 (El Día), §4.3 (La Fila), §4.4 (Cobrar), §4.7 (wizard de reserva) | Son **especificación**, no inspiración. Copy y jerarquía salen de ahí |
| Seed idempotente | `src/lib/db/seed.ts`, `npm run db:seed` | Se extiende en F2-24, no se reescribe |
| Ruta de sede | `/sede/[locationId]/...` (no `/[locationId]`) | Decisión ya tomada en S1 para no colisionar con `/[chainSlug]`. Se respeta |

**Confirmación de RLS pedida por el PM (revisado `0001_rls_policies.sql` línea por línea):**

- `sales` → aislada por `chain_id` **directo** (policy `sales_tenant_isolation`).
- `sale_items` → por **join** a `sales.chain_id`.
- `cash_sessions`, `walk_in_queue`, `schedules` → por **join** a `locations.chain_id`.
- `appointments` → por `chain_id` directo **+** `appointments_self_select` para que un
  cliente autenticado vea sus propias citas (`client_id ∈ clients where user_id = auth.uid()`).
- `location_service_overrides` → por join a `locations`.

⇒ **Las 4 tablas de F2 ya están cubiertas. No se escriben policies nuevas de tenant.**
La única excepción operativa está documentada como regla dura #5 en §3: **el rol `anon`
no tiene ninguna policy**, así que la reserva pública **no puede** leer ni escribir vía
`supabase-js` anónimo — se sirve entera desde el servidor con Drizzle.

---

## 3. Reglas NO NEGOCIABLES de F2

Las 10 reglas de `BACKLOG-BACKEND.md` §3 siguen vigentes. Estas se suman y son
específicas de esta fase. Violarlas es motivo de rechazo del PR.

1. **Guard antes que query, sin excepción.** Toda Server Action de F2 empieza con
   `requireLocationScope(locationId)` (o el guard que corresponda) **antes** de la
   primera lectura. El `locationId` llega por la URL; el `chainId` sale **siempre** del
   contexto devuelto por el guard, nunca del input del cliente.
2. **El dinero se calcula solo en el servidor, en enteros.** El cliente envía intención
   (servicio, barbero, método de pago, % de propina elegido, motivo de descuento), nunca
   montos. Los cálculos internos se hacen en **centavos enteros** y se persisten como
   `numeric(12,2)`. Está prohibido operar montos con `Number` en punto flotante o
   construir totales en un componente `"use client"`.
3. **Toda operación de dinero escribe `audit_log`.** Cobro, descuento, anulación,
   apertura y cierre de caja. Sin `writeAuditLog()` en el mismo camino, la tarea no está
   terminada.
4. **Toda operación multi-tabla va en una sola transacción** (`db.transaction`). Aplica a:
   crear reserva, crear cita desde consola, servir un turno, cobrar, anular, cerrar caja
   y renumerar la fila. Un fallo a mitad no puede dejar una venta sin líneas ni una cita
   sin cliente.
5. **La superficie pública no usa `anon` de Supabase.** `/[chainSlug]`, el perfil del
   barbero y el wizard se renderizan en Server Components y escriben por Server Actions
   con Drizzle, seleccionando **listas blancas de columnas** (jamás `select *` sobre
   `clients`, `users` o `sales`). No se añaden policies de RLS para `anon` en F2.
6. **Realtime va con el JWT del usuario.** La suscripción de La Fila usa
   `src/lib/supabase/browser.ts` con la sesión del usuario y filtro
   `location_id=eq.<id>`. **Nunca** service role en el navegador. Ahí RLS es la única
   defensa, y ya está en su sitio.
7. **El anti doble-booking tiene tres capas y la autoridad es la base de datos.**
   (a) la UI **no muestra** el slot ocupado (nunca clickeable-deshabilitado);
   (b) la Server Action re-verifica disponibilidad **dentro** de la transacción;
   (c) un `EXCLUDE` constraint en Postgres rechaza el solapamiento (F2-01). Si (c)
   dispara, el usuario recibe un error en español legible, no un stack trace.
8. **Zod en todo input**, incluidos los `searchParams` del wizard (`?sede=`, `?barbero=`,
   `?servicio=`, `?fecha=`) y el `params` de las rutas públicas.
9. **Toda la lógica de agenda se calcula en la zona horaria de la sede**
   (`locations.timezone`), se persiste en UTC (`timestamptz`) y se formatea en el
   servidor. El navegador no convierte horas ni decide qué día es "hoy".
10. **`lib/scheduling`, `lib/queue` y `lib/pos` son módulos puros y 100% testeados**
    (PRD §15): reciben datos, devuelven datos, no importan `db` ni `next/*`. La
    cobertura 100% en `lib/scheduling` es requisito explícito del PRD.
11. **Sin dependencias nuevas pesadas.** La rejilla de agenda se construye con CSS grid y
    los tokens del design system: **prohibido** FullCalendar, react-big-calendar o
    similares. Permitido lo que ya declara el PRD §9.2: TanStack Query para el estado de
    servidor de agenda y fila. Framer Motion: **no se adopta en F2** (ver D-F2-18).
12. **Migraciones solo las de §5.** Cero columnas nuevas fuera de lo aprobado aquí. Si
    una feature parece exigir una columna que no existe, **se para y se escala al PM**.

---

## 4. Decisiones de producto de F2 (el PRD las dejaba abiertas)

Numeradas como D-F2-*, en la misma línea que D-S1-1..6. **El desarrollador no decide
ninguna de estas; ya están decididas.**

**D-F2-1 · Granularidad y resolución de duración/precio.**
La rejilla de slots es de **15 minutos**. La duración efectiva de un servicio se resuelve
en este orden de precedencia: `barber_services.custom_duration` →
`location_service_overrides.duration_minutes` → `services.default_duration_minutes`.
El precio efectivo: `location_service_overrides.price` → `services.default_price`.
Un servicio con `location_service_overrides.is_active = false` **no se ofrece en esa sede**
(ni en la consola ni en el wizard). *Motivo: reproduce el criterio 1.6 del PRD sin
duplicar catálogo.*

**D-F2-2 · Estado y ventana de una reserva online.**
Una reserva pública nace `status = 'confirmed'`, `source = 'online'` — **sin aprobación
manual y sin depósito** (el depósito de garantía es PRD §8.2 2.7, fase posterior).
Ventana: mínimo **30 minutos** de anticipación (lead time), máximo **30 días** de
horizonte. El cliente puede cancelar hasta `chains.cancellation_hours` antes del inicio;
si esa columna es `null`, se asume **2 horas**. *Motivo: el ICP es una barbería de
volumen; pedir aprobación manual mata la promesa de "reservar en < 60s".*

**D-F2-3 · URL canónica del wizard.**
El wizard vive en **`/[chainSlug]/book`** (tal como especifica `UX-BRIEF` §4.7), no en
`/book`. `src/app/(public)/book/` se conserva **solo como redirect** a la landing de
selección de cadena y queda marcado como legacy. `book`, `api`, `login`, `register`,
`sede`, `admin` y `_next` son **slugs reservados**: el onboarding no puede asignarlos a
una cadena (validación en la Zod del slug). *Motivo: sin `chainSlug` en la URL no hay
tenant ni branding, y un segmento estático en la raíz se come el slug de una cadena real.*

**D-F2-4 · Identificación pública del barbero.**
En F2 el perfil público del barbero es **`/[chainSlug]/barber/[barberId]`** usando el
`users.id` (uuid). **No se añade columna `slug` a `users`.** El vanity slug del barbero se
evalúa en fase posterior junto con el portafolio (PRD 3.9). *Motivo: una columna de slug
exige reglas de unicidad, colisiones y renombres que no aportan al criterio §16.4.*

**D-F2-5 · Anti doble-booking.**
Tres capas (regla dura §3.7). La autoridad es el `EXCLUDE` constraint de Postgres sobre
`(barber_id, rango de tiempo)` para los estados activos (`pending`, `confirmed`,
`in_progress`). *Motivo: dos clientes tocando el mismo slot a la vez es un caso real, y
una verificación en aplicación sola no lo cubre.*

**D-F2-6 · `walk_in_queue.position` es derivado, no autoritativo.**
El orden real de la fila es **FIFO por `joined_at`** dentro de `status = 'waiting'` para
una sede. `position` se **rematerializa en bloque dentro de la misma transacción** de cada
escritura de la fila, y existe para mostrarse y para viajar por Realtime. **No lleva
índice único** (un renumerado en bloque chocaría con una unicidad no diferible).
*Motivo: la UI necesita un número estable que enviar por Realtime, pero el orden de
negocio debe ser reconstruible sin confiar en un contador.*

**D-F2-7 · Fórmula de espera estimada (ETA), congelada.**
Se calcula en el servidor en cada escritura de la fila y se persiste en
`estimated_wait_minutes`. El cliente **nunca** la calcula.
- `barberosDisponibles(sede, ahora)` = barberos con `barber_locations.is_active` en esa
  sede **y** un bloque de `schedules` activo que cubre la hora actual **y** sin `time_off`
  aprobado vigente.
- Turno **sin** `preferred_barber_id`:
  `ETA = ceil( (Σ duración efectiva de los turnos en 'waiting' delante + Σ minutos
  restantes de los servicios en curso) / max(1, barberosDisponibles) )`.
- Turno **con** `preferred_barber_id`: solo cuentan los turnos delante que prefieren a ese
  barbero, más el tiempo restante de lo que ese barbero está atendiendo; divisor = 1.
- Si `barberosDisponibles = 0` (fuera de horario), `estimated_wait_minutes = null` y la UI
  muestra "sin barberos en turno".
*Motivo: es la cifra que el cliente escucha en la puerta; tiene que ser explicable en una
frase por el gerente, no un modelo.*

**D-F2-8 · Un turno de la fila que se empieza a atender **crea** una cita.**
Al pasar un turno a `serving` se crea en la misma transacción una fila en `appointments`
con `source = 'walk_in'`, `status = 'in_progress'`, `starts_at = now()`,
`ends_at = now() + duración efectiva`, y `price_at_booking` congelado.
**No se añade columna de enlace** entre `walk_in_queue` y `appointments`: el vínculo queda
en `audit_log` (`action = 'queue.serve'`, `entity = 'appointments'`). Si la silla del
barbero elegido está ocupada por una cita reservada, el `EXCLUDE` constraint rechaza y la
acción devuelve un error accionable ("Jandy tiene una cita reservada hasta las 3:00 —
elegí otro barbero o cerrá la cita en curso"), con las dos salidas a un toque.
*Motivo: sin cita, ni la agenda muestra la silla ocupada ni el walk-in cuenta como
servicio, y el checkout tendría dos caminos distintos. Si el piloto demuestra que hace
falta la FK, se escala al PM (candidata a `walk_in_queue.appointment_id` en F3).*

**D-F2-9 · Una sola caja abierta por sede a la vez, y cobrar exige caja abierta.**
Cualquier cobro —efectivo, tarjeta o transferencia— requiere una `cash_sessions` abierta
en esa sede; si no la hay, la UI ofrece "Abrir caja" (solo `superuser`/`admin`, según
matriz §6.2 del PRD: el barbero **no** abre ni cierra caja). *Motivo: si la tarjeta no
queda atada a una sesión, el reporte del día no cuadra con lo que el gerente cuenta.*

**D-F2-10 · Descuentos.**
`barber` está topado por `chains.max_barber_discount_pct` (si es `null`, el barbero **no**
puede descontar). `admin`/`superuser` no tienen tope. **Cualquier descuento > 0 exige
motivo de texto** (`sales.discount_reason`) y escribe `audit_log`. El tope se valida en el
servidor; la UI solo lo refleja. *Motivo: control anti-fraude pedido explícitamente por
el perfil de Ramón (PRD §6.3).*

**D-F2-11 · Propina.**
Se registra en `sales.tip_amount` y se atribuye al `sales.barber_id`. El reparto según
`commission_rules.tip_handling` es **F3**; F2 no calcula ni reparte nada. Chips de propina
de la UI: 0 / 10% / 15% / 20% / otro — el porcentaje viaja como intención y el monto lo
calcula el servidor sobre el subtotal después de descuento.

**D-F2-12 · `sales.barber_id` cuando el ticket tiene varios barberos.**
La verdad por línea vive en `sale_items.barber_id`. `sales.barber_id` se fija al barbero
de la **línea de servicio de mayor `line_total`** (desempate: la primera línea creada).
*Motivo: la columna existe en el PRD y hay que llenarla de forma determinista; el motor de
comisiones de F3 leerá `sale_items`, no `sales`.*

**D-F2-13 · Métodos de pago activos en F2.**
Se habilitan `cash`, `card` y `transfer`. **`mixed` queda deshabilitado** (dividir un
ticket entre métodos exigiría columnas de desglose que el PRD no define) y **`online`**
queda reservado para cuando exista pasarela (PRD §9.2 / D11). Copy obligatorio en
"Tarjeta": *"Registra el monto cobrado por la terminal"* — Kortex no procesa la tarjeta
(UX-BRIEF §4.4).

**D-F2-14 · Reserva cross-sede.**
Se respeta `chains.allow_cross_location_booking`. Si es `true` (default), el wizard
permite cualquier sede y la ruta "por barbero" muestra **todas** las sedes donde ese
barbero atiende. Si es `false`, el flujo queda **acotado a una sola sede** elegida en el
paso 1, y la ruta por barbero solo ofrece la disponibilidad de ese barbero en esa sede.
En ambos casos el **historial del cliente sigue siendo de la cadena** (PRD §5.3 y criterio
§16.5): nunca se oculta el historial cross-sede.

**D-F2-15 · Identificación del cliente en la reserva pública.**
**No se exige login para reservar.** Identificador de negocio: **teléfono normalizado**
(formato RD: `+1` + 809/829/849 + 7 dígitos; se normaliza en el servidor antes de
comparar). El match se hace dentro de `(chain_id, phone)` — el índice único ya existe. Si
hay match, se reutiliza el `clients.id` y se muestra el historial breve ("Última visita:
hace 15 días en Naco, Fade + barba"). Si no, se crea el cliente con `full_name` + `phone`
(email opcional) y `user_id = null`. Nombre y teléfono son obligatorios.

**D-F2-16 · Gestión posterior de la reserva sin email.**
F2 no envía notificaciones. La pantalla de confirmación muestra un **código corto de
reserva** (primeros 8 caracteres del uuid, en mayúsculas) y los datos de la cita. Cancelar
o reprogramar desde fuera solo es posible para el **cliente autenticado** en
`(client)/appointments`. El enlace público con token firmado llega en F3, junto con el
email de confirmación (PRD 1.16).

**D-F2-17 · Límites de la superficie pública (en lugar de una tabla de rate limit).**
No se crea tabla nueva. Se aplican dos controles: (a) regla de rate limiting de Cloudflare
sobre las rutas `/[chainSlug]/book` y sus Server Actions (configuración, no código);
(b) **límite de negocio verificable en DB: máximo 3 citas activas futuras por teléfono y
por cadena**, validado dentro de la transacción de reserva, con mensaje explícito.
*Motivo: cumple PRD §15 sin inventar esquema ni depender de memoria de proceso, que no
sobrevive en Workers.*

**D-F2-18 · Framer Motion: no se adopta en F2** (cierra el pendiente #4 del CHANGELOG).
La animación CSS actual de `QueueCard` (entrada + pulso) cumple; el reacomodo `layout` de
vecinos se evalúa en F4 con feedback del piloto. *Motivo: no se añade una dependencia de
animación antes de que un usuario real la pida.*

**D-F2-19 · Reprogramar: sheet es P0, arrastrar es P1.**
El criterio 1.7 del PRD menciona arrastrar una cita. Se cumple el objetivo (reprogramar
rápido) con el **sheet de detalle** en ≤ 3 toques, que además es el único camino usable en
móvil —y el gerente opera de pie. El drag-and-drop en desktop/tablet queda como **P1
dentro de F2**: si el tiempo aprieta, **se corta el drag, nunca el sheet**. Trade-off
aceptado y documentado por el PM.

**D-F2-20 · En el POS de F2 solo se venden servicios.**
`sale_items.type = 'product'` queda deshabilitado en la UI (el inventario y la venta de
producto son PRD §8.2 2.2/2.3, fase posterior). El tipo se mantiene en el enum y el
cálculo de `lib/pos` ya lo contempla, pero no hay camino de UI para crearlo.

---

## 5. Migraciones nuevas autorizadas (y solo estas)

Se versionan a mano en `src/lib/db/migrations/`, siguiendo la convención ya establecida
por `0001_rls_policies.sql` (SQL escrito a mano, con `--> statement-breakpoint`).
**Cero columnas nuevas. Cero renombres.**

### `0002_f2_integrity.sql`
1. `create extension if not exists btree_gist;`
2. **`EXCLUDE` constraint en `appointments`** que impide dos citas solapadas del mismo
   barbero cuando el estado es activo (`pending`, `confirmed`, `in_progress`):
   excluye por `barber_id` (igualdad) y por el rango `[starts_at, ends_at)` (solapamiento),
   con `WHERE` sobre los estados activos. Una cita `cancelled`/`no_show`/`completed` no
   bloquea la silla.
3. **FK faltante:** `sales.appointment_id` se declaró sin `references()` en S1. Se añade la
   FK a `appointments(id)` con `on delete set null`, y la columna correspondiente en el
   schema Drizzle (`money.ts`) para que el tipo lo refleje.
4. **Índice único parcial `sales (appointment_id) where appointment_id is not null`** — una
   cita no se puede cobrar dos veces.
5. **Índice único parcial `cash_sessions (location_id) where closed_at is null`** — una sola
   caja abierta por sede (D-F2-9).
6. Índices de rendimiento que faltan para F2: `sale_items (sale_id)`,
   `sales (cash_session_id)`, `appointments (location_id, status, starts_at)`,
   `walk_in_queue (location_id, joined_at)`.

**AC:** `npm run db:migrate` corre limpio y es idempotente; un `insert` de cita solapada
para el mismo barbero es rechazado por Postgres (test de integración con dos inserts);
cobrar dos veces la misma cita es rechazado por el índice único; abrir una segunda caja en
una sede con caja abierta es rechazado.

### `0003_realtime_walk_in_queue.sql`
1. Añadir `public.walk_in_queue` a la publicación `supabase_realtime`.
2. `alter table public.walk_in_queue replica identity full` (para que los eventos de
   `UPDATE`/`DELETE` lleguen con la fila anterior y el filtro por `location_id` funcione en
   todos los eventos).
3. Comentario en el archivo dejando explícito que **no se añade ninguna policy nueva**: la
   RLS de `walk_in_queue` por join a `locations.chain_id` (ya existente en `0001`) es la que
   filtra el canal Realtime.

**AC:** dos navegadores con sesiones distintas de la misma sede ven el mismo turno nuevo en
< 1 s; una sesión de **otra cadena** suscrita al mismo canal **no recibe nada** (prueba
manual documentada en el PR, con el JWT real, no con Drizzle).

---

## 6. Checklist de F2

Ejecutar **en orden**. Cada tarea termina solo cuando su criterio de aceptación (AC) es
verificable por otra persona. `P0` = bloquea la fase; `P1` = se corta si el tiempo aprieta.

### Bloque 0 — Preflight (cerrar riesgos antes de tocar dinero)

#### F2-00 · Cerrar los riesgos abiertos de Sprint 1 · **P0**
(a) **Cerrar el spike S1-04 de verdad:** desplegar un preview real en Cloudflare Workers
vía OpenNext y confirmar que una query Drizzle y un Server Action funcionan ahí. Esto
estaba pendiente y **no se puede construir el POS encima de un supuesto**.
(b) **Rotar el `SUPABASE_SERVICE_ROLE_KEY`** (quedó expuesto en la sesión de S1) y
actualizar `.env.local`.
**AC:** URL de preview funcionando, con el resultado de una query real documentado en 5
líneas en el PR; la key vieja ya no autentica contra el proyecto.
**Si el spike falla:** parar F2 y escalar al PM el mismo día — impacta PRD §9.2 y no lo
decide el desarrollador solo.

#### F2-01 · Migración `0002_f2_integrity.sql` · **P0**
Implementar §5 punto por punto. Actualizar `money.ts` con la FK de `appointment_id`.
**AC:** el de §5 `0002`, más `npm run typecheck` en verde.

#### F2-02 · Migración `0003_realtime_walk_in_queue.sql` + verificación de RLS · **P0**
**AC:** el de §5 `0003`. Además, dejar escrito en el PR el resultado de revisar que
`sales`, `sale_items`, `cash_sessions`, `walk_in_queue` y `appointments` ya tienen policy
de aislamiento (están en `0001`; esta tarea **confirma**, no reescribe).

### Bloque A — Núcleo de agenda

#### F2-03 · `src/lib/scheduling/` — motor de disponibilidad puro · **P0**
Módulo **sin acceso a DB ni a `next/*`**: recibe datos ya cargados y devuelve slots.
Debe resolver: bloques de `schedules` del barbero en esa sede y día → restar `time_off`
aprobado → restar citas activas existentes → intersectar con `locations.business_hours`
(D-S1-1, claves `mon..sun`) → cortar en rejilla de 15 min (D-F2-1) → descartar los slots
que no caben para la duración efectiva del servicio → aplicar lead time y horizonte
(D-F2-2). Todo en la timezone de la sede (regla dura §3.9). Incluir también el validador
de **solapamiento del mismo barbero entre dos sedes** (PRD 1.4 / §16.2), que S1 dejó
declarado pero sin implementar.
**AC:** cobertura **100%** del módulo en Vitest (requisito PRD §15), con casos: día sin
horario; `time_off` parcial a mitad del bloque; cita existente que parte el bloque en dos;
servicio que no cabe antes del cierre; lead time que elimina los slots inmediatos;
solapamiento entre sedes rechazado; cruce de medianoche y cambio de día en tz de la sede.

#### F2-04 · Capa de lectura de disponibilidad (servidor) · **P0**
`getAvailability({ locationId, serviceId, barberId?, fromDate, toDate })` en
`src/lib/scheduling/` (parte con acceso a DB, separada del núcleo puro): carga en el
mínimo de queries barberos de la sede, `schedules`, `time_off`, citas activas del rango,
override de precio/duración y `barber_services`, y delega el cálculo al módulo puro.
Devuelve, por día y por barbero, los slots libres **y el precio efectivo**.
**AC:** para la sede Naco del seed devuelve slots coherentes con los horarios sembrados;
un slot con cita existente **no aparece**; el precio de `Fade` difiere entre Naco y San
Cristóbal (criterio 1.6 del PRD); la consulta de un día completo no supera **3 round-trips
a la DB** (verificado con log).

### Bloque B — Agenda real por sede (PRD 1.7, reemplaza placeholders)

#### F2-05 · "El Día" — shell de la sede · **P0**
Reemplaza `(location)/sede/[locationId]/today`. Según `UX-BRIEF` §4.2: KPI compacto arriba
(ingreso de hoy en la sede, servicios completados hoy, sillas ocupadas ahora sobre
`locations.chairs_count`), tabs **Agenda / La Fila** (con badge de conteo en vivo), y las
dos acciones rápidas fijas en el tercio inferior en móvil: **Dar turno** y **Cobrar**.
Datos solo de esa sede — el consolidado de cadena es F3.
**AC:** con el seed cargado, la pantalla muestra cifras reales de hoy; en móvil los dos
botones quedan alcanzables con el pulgar sin scroll; un `admin` de otra sede sigue
recibiendo 403 (re-verificación de §16.11 con datos reales).

#### F2-06 · Rejilla de agenda (día por barbero + semana) · **P0**
Rejilla CSS (regla dura §3.11): filas = franjas de 30 min, columnas = barberos con turno
ese día en esa sede; scroll horizontal en móvil; línea de "ahora"; bloque ocupado = tarjeta
con cliente + servicio; hueco libre clickeable para crear cita. Vista **semana** filtrada
por un barbero (`calendar`), que además muestra en qué sede está cada día (PRD §5.2).
**AC:** con el seed, el gerente ve las columnas de sus barberos en una pantalla; el barbero
multi-sede aparece en la agenda de la sede correcta cada día y **no** en la otra; cambiar
de día/semana no recarga la página entera.

#### F2-07 · Sheet de detalle de cita + transiciones de estado · **P0**
Toque en un bloque abre el **sheet inferior** ya existente (`components/ui/sheet`) con
detalle y acciones: **confirmar**, **iniciar** (`in_progress`), **completar**,
**no-show**, **cancelar** (con motivo obligatorio → `cancellation_reason`).
Server Actions con guard + `ActionResult` + transición validada (no se puede completar una
cita cancelada, etc.). `no_show` incrementa `clients.no_show_count` en la misma
transacción.
**AC:** los 6 estados del enum se alcanzan solo por transiciones válidas (test de la
máquina de estados); marcar `no_show` sube el contador del cliente; cancelar exige motivo;
un `barber` solo puede operar **sus propias** citas (matriz §6.2), un `admin` las de su
sede.

#### F2-08 · Crear cita desde la consola · **P0**
Desde la rejilla o desde "Agregar cita": elegir cliente existente (búsqueda por teléfono o
nombre dentro de la cadena) o crear uno nuevo con nombre + teléfono; servicio, barbero,
fecha/hora entre los slots libres. `source = 'admin'` (o `'phone'` si el gerente marca "vino
por teléfono"), `status = 'confirmed'`, `price_at_booking` congelado por el servidor.
**AC:** una cita creada aparece de inmediato en la rejilla; intentar crearla sobre un slot
ocupado devuelve error legible en español y no crea nada; el cliente creado queda con
`chain_id` correcto y respeta el único `(chain_id, phone)`.

#### F2-09 · Reprogramar y reasignar · **P0 (sheet) / P1 (drag)**
Desde el sheet: cambiar fecha/hora y/o barbero, revalidando disponibilidad en servidor
dentro de la transacción. `updated_at` se actualiza. D-F2-19: el drag-and-drop en
desktop/tablet es P1.
**AC:** reprogramar toma ≤ 3 toques desde el bloque; mover a un slot que se acaba de ocupar
devuelve error y **deja la cita donde estaba**; el `EXCLUDE` constraint nunca llega al
usuario como error crudo.

### Bloque C — Reserva pública funcional (PRD 1.8, reemplaza placeholders)

#### F2-10 · Landing pública de la cadena y de la sede · **P0**
`(public)/[chainSlug]` real (hoy placeholder) + `(public)/[chainSlug]/[locationSlug]`:
SSR, tema claro fijo, branding de la cadena (`logo_url`, `primary_color`), lista de sedes
**activas** con dirección, horario, teléfono y botón reservar; la página de sede añade sus
barberos y su catálogo con precio de esa sede. Columnas en lista blanca (regla dura §3.5).
Slug inexistente o cadena inactiva → 404 propio, nunca un error de servidor.
**AC:** `/don-bigote` lista las 3 sedes del seed con su horario; una sede con
`is_active = false` **no aparece** (criterio 1.2 del PRD); LCP < 2.5 s en móvil simulado
(PRD §15); ninguna respuesta incluye datos de otra cadena ni columnas privadas de clientes.

#### F2-11 · Perfil público del barbero · **P0**
`(public)/[chainSlug]/barber/[barberId]` (D-F2-4): nombre, foto, servicios que hace, y
**en qué sede está cada día de la semana** con copy explícito tipo *"Jandy atiende en Naco
lun–mié y en Bella Vista jue–sáb"* (PRD §5.2). Botón "Reservar con él" → wizard en ruta 2.
**AC:** el barbero multi-sede del seed muestra sus dos sedes con los días correctos; un
barbero inactivo o de otra cadena devuelve 404.

#### F2-12 · Wizard de reserva — 4 pasos, 2 rutas · **P0**
`/[chainSlug]/book` (D-F2-3), mobile-first, contenedor 640px, CTA en `--client-brand`
(UX-BRIEF §4.7). **Ruta 1 (por sede):** sede → servicio → fecha/hora (+ barbero opcional)
→ confirmar. **Ruta 2 (por barbero):** barbero fijado → sede/día donde atiende → servicio →
fecha/hora → confirmar. Barra de progreso de 4 pasos; volver atrás no pierde selección
(estado en `searchParams`, validados con Zod). **Un slot ocupado no se muestra** (regla
dura §3.7a). Respeta `allow_cross_location_booking` (D-F2-14). Si el teléfono tecleado
coincide con un cliente de la cadena, el paso 4 muestra su historial breve.
**AC:** un cliente completa la reserva por cada ruta en **< 60 s y ≤ 4 pasos** (criterio
§12.1 y §16.4, cronometrado y documentado); **ningún slot ocupado es visible ni
clickeable**; el historial cross-sede aparece al reservar en una sede distinta a la última
visita (criterio §16.5).

#### F2-13 · Server Action de reserva pública · **P0**
`createPublicBooking`: Zod → resolver cadena por slug → normalizar teléfono (D-F2-15) →
**transacción**: match/creación de cliente, re-verificación del slot, chequeo del límite de
3 citas activas por teléfono (D-F2-17), `insert` de la cita con `price_at_booking` y
duración calculados **en el servidor**, `audit_log` (`action = 'appointment.book_public'`).
Errores traducidos: slot tomado, fuera de horario, fuera de ventana, límite alcanzado.
**AC:** un test dispara **dos reservas concurrentes del mismo slot**: una responde ok, la
otra devuelve "ese horario acaba de ocuparse" y **no** se crea una segunda cita (esto es
§16.4 del PRD); ningún monto llega desde el cliente (verificado leyendo el payload); la
acción nunca confía en `chain_id` ni en precios del input.

#### F2-14 · Mis citas del cliente + cancelación · **P1**
`(client)/appointments` real: próximas y pasadas (cross-sede), con cancelar sujeto a
`cancellation_hours` (D-F2-2). Guard `requireClientScope`.
**AC:** un cliente autenticado ve sus citas de las 3 sedes; cancelar dentro de la ventana
prohibida está bloqueado con el motivo escrito ("Faltan 2 h; esta cadena permite cancelar
hasta 4 h antes"); la cita cancelada libera el slot de inmediato en la agenda de la sede.

### Bloque D — La Fila conectada a Realtime (PRD 1.10)

#### F2-15 · `src/lib/queue/` — posición y ETA, puro · **P0**
Implementa D-F2-6 (renumeración FIFO) y D-F2-7 (fórmula de ETA) como funciones puras.
**AC:** tests de: fila vacía; 3 en espera sin preferencia con 2 barberos; turno con barbero
preferido ocupado; 0 barberos disponibles → `null`; un turno que sale de la fila renumera a
los siguientes sin huecos.

#### F2-16 · Server Actions de la fila · **P0**
`joinQueue` (dar turno: nombre + teléfono opcional, servicio, barbero preferido opcional;
cliente existente o `client_name_temp`), `callTicket` (→ `called`, sella `called_at`),
`startServing` (→ `serving` **+ crea la cita**, D-F2-8), `markDone` (→ `done`),
`markLeft` (→ `left`), `reassignBarber`. Todas: guard de sede, transacción, renumeración y
recálculo de ETA dentro de la misma transacción. `markLeft` y `reassignBarber` escriben
`audit_log` (son intervenciones manuales sobre el orden de atención).
**AC:** los 5 estados del enum `queue_status` se alcanzan solo por transiciones válidas;
`startServing` sobre un barbero con cita reservada encima devuelve el error accionable de
D-F2-8; tras cualquier acción, las posiciones quedan 1..n sin huecos.

#### F2-17 · Conectar La Fila a Supabase Realtime · **P0**
Reemplazar `queueMock`/`setQueue` en `(location)/sede/[locationId]/queue` por: carga
inicial en el Server Component (guard ya aplicado en el layout) + suscripción
`postgres_changes` sobre `walk_in_queue` filtrada por `location_id`, usando
`src/lib/supabase/browser.ts` con el JWT del usuario (regla dura §3.6). Optimistic UI en
"Llamar turno", reconexión automática y **refetch completo al reconectar** (el internet del
local se cae, PRD §15). Conservar copy, orden visual y `QueueCard` tal como están.
**AC (criterio §16.6 del PRD):** recepción agrega **3 walk-ins** y la pantalla de otro
dispositivo se actualiza **sin recargar en < 1 s**; al matar la conexión y restaurarla, la
lista queda consistente con la DB; una sesión de otra cadena no recibe ningún evento.

#### F2-18 · "Atendiendo ahora" + badge en vivo en El Día · **P0**
Sección "Atendiendo ahora" con datos reales (barberos con turno hoy en la sede y qué están
atendiendo, con rango horario); badge de conteo de la fila en el tab de El Día, que pasa a
`--data-warn` si algún turno excede su espera estimada (UX-BRIEF §4.2/§4.3). Conectar
además el bloque **"Mi Día"** de `(barber)/mi-silla` a la agenda real del barbero (su cita
actual y la siguiente). "Lo mío" (dinero) sigue mock hasta F3 — dejarlo marcado.
**AC:** al llamar un turno, la tarjeta pasa a "Atendiendo ahora" en todas las pantallas
conectadas; el badge refleja el conteo real; la pantalla del barbero muestra su cliente
actual sin recargar.

### Bloque E — Cobro y caja (PRD 1.11 y 1.12)

#### F2-19 · `src/lib/pos/` — cálculo de totales, puro · **P0**
Entrada: líneas (servicio, barbero, cantidad, precio unitario en centavos), descuento
(monto o %) con tope aplicable, propina (% o monto). Salida: `subtotal`,
`discount_amount`, `tip_amount`, `total`, y las líneas con `line_total`. Todo en **centavos
enteros** (regla dura §3.2); redondeo bancario documentado en el módulo.
**AC:** tests con casos de redondeo (15% sobre RD$733.33), descuento que excede el tope del
barbero (rechazado), descuento mayor que el subtotal (rechazado), propina 0, ticket de 2
barberos; **cero uso de float** (verificable con grep en el módulo).

#### F2-20 · Apertura de caja · **P0**
`openCashSession({ locationId, openingAmount })`: guard de sede **y** rol
`superuser`/`admin` (matriz §6.2 — el barbero no abre caja), respeta el único parcial de
una caja abierta por sede (D-F2-9), `audit_log` (`cash.open`).
**AC:** un `barber` recibe error de permiso; abrir una segunda caja en la misma sede es
rechazado con mensaje legible; la caja abierta se muestra en El Día con quién la abrió y a
qué hora.

#### F2-21 · Checkout / cobro · **P0**
Pantalla `(location)/sede/[locationId]/checkout` según UX-BRIEF §4.4: entra desde una cita
(`?appointmentId=`) o desde un turno servido, o como venta libre; líneas con **barbero por
línea**; descuento con motivo (D-F2-10); chips de propina (D-F2-11); métodos `cash`/`card`/
`transfer` (D-F2-13); botón "Cobrar RD$X" con bloqueo de doble-submit y token de
idempotencia. Server Action `createSale` en **una transacción**: recalcula todo con
`lib/pos`, valida el tope de descuento contra el rol, exige caja abierta (D-F2-9), inserta
`sales` + `sale_items`, fija `sales.barber_id` (D-F2-12), marca la cita `completed`,
actualiza `clients.total_visits/total_spent/last_visit_at`, y escribe `audit_log`
(`sale.create`, con el desglose en `after`).
**AC (criterio §16.7, primera mitad):** se cobra en los 3 métodos con propina y el ticket
queda con sus líneas correctas; un error de red **no pierde** los datos del formulario y
"Reintentar" no duplica la venta (verificado disparando el mismo payload dos veces);
cobrar dos veces la misma cita es rechazado; un barbero que intenta un descuento sobre el
tope recibe error del servidor aunque manipule el payload; toda venta deja fila en
`audit_log`.

#### F2-22 · Anulación de venta el mismo día · **P1**
Solo `superuser`/`admin`, solo si la caja de esa venta **sigue abierta**: pasa
`sales.status = 'refunded'`, exige motivo, escribe `audit_log` (`sale.refund`, con
`before`/`after`), y el esperado de caja se recalcula excluyéndola.
**AC:** un `barber` no puede anular; anular una venta de una caja ya cerrada está bloqueado
con el motivo escrito; tras anular, el esperado del cierre baja exactamente ese monto.
**Si se corta:** el cierre de caja permite registrar el descuadre con nota (F2-23), pero se
documenta como deuda técnica para el piloto.

#### F2-23 · Cierre de caja diario · **P0**
`(location)/sede/[locationId]/register`: muestra esperado vs. contado. **Esperado** =
`opening_amount` + ventas `cash` de esa sesión (excluyendo `refunded`); tarjeta y
transferencia se listan aparte como informativo, no suman al efectivo esperado. El gerente
teclea lo contado; el servidor calcula `difference`, sella `closed_by`/`closed_at`, guarda
`notes` y escribe `audit_log` (`cash.close`). **No se puede cerrar** si queda alguna venta
`status = 'open'` en esa sesión — mensaje explícito con el link a esas ventas.
**AC (criterio §16.7, segunda mitad):** el gerente cierra el día, ve esperado vs. contado y
**el descuadre queda registrado**; la diferencia la calcula el servidor (manipular el
payload no la cambia); con una venta abierta, el botón explica por qué no puede cerrar
(no solo `disabled`, regla del UX brief §2.5); una caja cerrada queda en solo lectura.

### Bloque F — Cierre de fase

#### F2-24 · Extender el seed con un día operativo · **P0**
`npm run db:seed` sigue siendo **idempotente** y añade, para la sede Naco: 6-8 citas de hoy
repartidas entre 3 barberos (mezcla de `confirmed`, `in_progress`, `completed`), 3 turnos en
`walk_in_queue` en `waiting`, 1 `cash_session` abierta hoy, y 4-5 `sales` de ayer con sus
`sale_items` (efectivo, tarjeta y transferencia) contra una caja de ayer ya cerrada.
**AC:** tras `db:seed` en base limpia, El Día muestra KPIs distintos de cero, La Fila tiene
3 turnos y el cierre de caja tiene con qué cuadrar; correr el seed dos veces no duplica ni
falla.

#### F2-25 · Tests y cierre de F2 · **P0**
Vitest: 100% en `lib/scheduling`, cobertura completa de `lib/queue` y `lib/pos`, test de
concurrencia de doble-booking, test de la máquina de estados de citas y de la fila.
**Playwright** (configurarlo ahora, se difirió en S1) para los 4 flujos críticos que exige
el PRD §15: **reservar**, **dar turno**, **cobrar**, **cerrar caja**.
**AC:** `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build` en verde; los
4 E2E pasan contra el seed; `CHANGELOG.md` actualizado con lo construido, lo decidido y los
riesgos abiertos de F2.

---

## 7. Definición de Done de F2

F2 está terminada cuando, en un preview desplegado en Cloudflare, con el seed cargado:

1. El gerente de Naco abre **El Día** y ve la agenda de sus barberos, la fila y el ingreso
   del día de **su sede**.
2. Un cliente reserva desde `/don-bigote/book` **eligiendo sede**, y otro **eligiendo
   barbero**; ninguno de los dos puede reservar un slot ocupado, y el ocupado **ni siquiera
   se muestra** (PRD §16.4).
3. Un cliente que se cortó en Naco ve su historial al reservar en Bella Vista (PRD §16.5).
4. Recepción agrega **3 walk-ins** y la pantalla del barbero se actualiza **en tiempo real
   sin recargar** (PRD §16.6).
5. Se cobran servicios en **efectivo, tarjeta y transferencia con propina**, se cierra la
   caja del día y **el descuadre queda registrado** (PRD §16.7).
6. Toda venta, descuento, anulación, apertura y cierre de caja tiene su fila en
   `audit_log`.
7. Un `admin` de Naco sigue recibiendo **403** en `/sede/<BellaVista>/checkout` por URL
   directa, y una sesión de otra cadena no recibe eventos Realtime de esta (PRD §16.11).
8. `typecheck`, `lint`, `test`, los 4 E2E de Playwright y `build` pasan.

---

## 8. FUERA DE ALCANCE de F2 (no lo construyas)

Las tablas existen desde Sprint 1, pero **su lógica y su UI no son de esta fase**:

- ❌ **Motor de comisiones y cierre de período** (`commission_rules`, `payout_periods`,
  `payout_lines`, pantalla "El Corte de Quincena") — **F3**. En F2 no se calcula ni se
  muestra una comisión; `tip_handling` no se aplica.
- ❌ **Dashboard consolidado multi-sede y comparativa** (`(chain)/overview`,
  `(chain)/compare`, `location_daily_metrics`, job nocturno) — **F3**. El único dashboard
  de F2 es el de **una** sede (El Día).
- ❌ **Notificaciones por email** (confirmación, recordatorios 24h/2h, cancelación desde el
  email, Resend, tabla `notifications`) — **F3**. F2 confirma en pantalla (D-F2-16).
- ❌ Venta de **productos** en el POS e inventario (`products`, `inventory_items`,
  `stock_movements`) — fase posterior (D-F2-20).
- ❌ **Suscripción y billing** (`subscriptions`, pasarela, bloqueo por vencimiento, control
  de sedes por plan) — F3.
- ❌ **Pantallas CRUD de F1 parte 2**: sedes, equipo/barberos, servicios, horarios,
  onboarding de cadena. F2 se valida contra el seed (ver riesgo F).
- ❌ **WhatsApp/SMS, PWA offline, reseñas, lealtad, lista de espera, depósito anti-no-show,
  política de no-show automática** — fases posteriores (PRD §8.2).
- ❌ **Pago mixto, cobro online con pasarela, refund de días anteriores** (D-F2-13, F2-22).
- ❌ **Selector de cadena** para usuarios con varias memberships (sigue D-S1-6: la primera
  por `created_at`).

**Regla anti-scope-creep:** si una tarea de F2 empieza a necesitar comisiones, métricas
agregadas de la cadena o envío de emails, **está fuera de alcance**. Para y escala al PM.
El único trabajo de producto de esta fase es que **una sede opere un día completo dentro de
Kortex**.

---

## 9. Riesgos vigentes de esta fase

| # | Riesgo | Mitigación en la fase |
|---|---|---|
| A | El spike de Cloudflare/OpenNext sigue sin verificarse (riesgo #1 del CHANGELOG) y falla justo cuando ya hay POS encima | **F2-00 es la primera tarea y bloquea todo el bloque E.** Si falla, se para y se escala al PM el mismo día (impacta PRD §9.2) |
| B | Doble-booking por concurrencia real (dos clientes, mismo slot, mismo segundo) | Tres capas (D-F2-5) con la **base de datos como autoridad** (`EXCLUDE`, F2-01) + test de concurrencia obligatorio en F2-13 |
| C | Bugs de zona horaria: "hoy" del servidor ≠ "hoy" de la sede | Regla dura §3.9 + casos límite de tz obligatorios en los tests de F2-03 |
| D | Realtime se cae con el internet del local y la fila queda desincronizada (escenario frecuente en RD) | Refetch completo al reconectar (F2-17) y AC explícito de consistencia tras corte |
| E | La agenda semanal con drag-and-drop se come el tiempo de la fase | D-F2-19: el drag es **P1** y se corta primero; el sheet cubre el criterio del PRD |
| F | Sin las pantallas CRUD de F1 parte 2, una cadena piloto no se puede configurar sin correr el seed a mano | Asumido por el PM: F2 se valida contra el seed. Las pantallas CRUD se agendan **antes del piloto (F4)**, no dentro de F2. No es excusa para meterlas aquí |
| G | El barbero no adopta la fila y sigue con papel (R4 del PRD) | La fila debe ser **más rápida que el papel**: "Dar turno" en ≤ 3 toques es AC de F2-16; se mide en el piloto |
| H | La reserva pública queda expuesta a abuso (spam de citas) | D-F2-17: rate limiting de Cloudflare + límite de 3 citas activas por teléfono y cadena validado en la transacción |
