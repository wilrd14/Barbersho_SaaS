# BACKLOG F4 — Kortex · Fase 4 (Piloto + lo que falta del MVP: configurarse solo, email, endurecer)

**Proyecto:** Kortex — SaaS de gestión operativa multi-sede para cadenas de barberías (W-Tech)
**Documento:** backlog técnico de Fase 4 · v1.0 · 6 oct 2026
**Fuente de verdad de producto:** `PRD-BarberShop.md` (aprobado). Este backlog extrae y
congela lo necesario para F4; **el desarrollador no necesita leer el PRD completo para
ejecutar esta fase**. Si algo no está en este documento, no es F4.
**Documentos previos:** `BACKLOG-BACKEND.md` (Sprint 1), `BACKLOG-F2.md`, `BACKLOG-F3.md`,
todos ya ejecutados y vigentes como contrato de esquema, de seguridad y de convenciones.
`CHANGELOG.md` (entrada del 6 oct 2026) describe el estado real del repo, **verificado contra
la DB real**: 402 tests de Vitest, 13 E2E de Playwright, build de 27 rutas.
**Autoridad:** las decisiones de producto de este documento las toma el PM. El
desarrollador decide el *cómo* técnico; no decide *qué* se construye, ni renombra
columnas, ni amplía alcance por su cuenta. Las decisiones marcadas **"pendiente de
confirmar"** tienen una recomendación del PM, pero **solo Williams las cierra**: el
desarrollador no las asume como resueltas (ver §4.5).

---

## 1. Alcance de F4 (resumen)

F3 dejó el sistema calculando **dinero e insight** (El Corte, Vista Cadena, plan). Pero F3
**no es "MVP vendible"** (BACKLOG-F3 §1, D-F3-19, riesgo A): un desconocido todavía **no
puede configurarse solo** y nadie recibe un **email**. Hoy las sedes, el equipo, los
servicios y el onboarding son placeholders (`"Placeholder Sprint 1 — sin UI de negocio
todavia."` en `(chain)/locations`, `/team`, `/services`, `(onboarding)`), y toda la
operación se valida contra el **seed**. F4 cierra esa brecha y prepara el piloto:

1. **Montar tu cadena (A):** registro → alta de cadena + primera sede + branding, en un
   wizard de 3 pasos, con la suscripción `trialing` de 21 días creada de forma atómica.
2. **Configurar sin el seed (B, C, D):** CRUD de sedes (con cupo por plan y upsell), equipo
   (barberos y gerentes, multi-sede, horarios, días libres con aprobación) y catálogo de
   servicios con override por sede.
3. **Email transaccional (E):** confirmación, recordatorios de 24 h y 2 h y cancelación
   desde el email con enlace firmado (PRD 1.16, criterio §16.10).
4. **Decisión de pasarela (F):** un spike documentado; **no** se implementa cobro real
   salvo que la decisión de Williams (D11) lo cierre.
5. **Endurecer el piloto (G):** cerrar las advertencias de seguridad, despliegue real y
   actualizado en Cloudflare, backups probados, límite de abuso en la reserva pública,
   importador CSV (riesgo R9) y los huecos de producto que F3 dejó abiertos.

En términos del PRD: **F4 del roadmap §11** ("piloto + hardening") **más lo que F3
reasignó**: features **1.1, 1.2, 1.4, 1.5, 1.6, 1.16, 1.19** de §8.1 y los criterios de
aceptación **§16.1, §16.2, §16.3, §16.10** (y el punto **§16.12** completo si D-F4-11 se
resuelve a favor de cobro automático; si no, sigue siendo parcial y declarado).

**Qué significa "MVP vendible" al cerrar F4 (definición operativa):** un dueño que no
conoce el producto se registra, monta su cadena de 3 sedes con 8 barberos y su catálogo en
**< 45 min sin ayuda** (PRD §12.1, §16.1), sus clientes reservan y reciben el email, y el
primer corte de quincena sale con **datos reales**. Mientras eso no se cumpla, no se
vende — se pilota.

---

## 2. Punto de partida — qué ya existe y se reutiliza (no reinventar)

Verificado contra el repo el 6 oct 2026. **Nada de esta lista se rehace.**

| Pieza | Dónde vive | Cómo se usa en F4 |
|---|---|---|
| Esquema de las 26 tablas | `src/lib/db/schema/` (`core.ts`, `catalog.ts`, `money.ts`, `inventory.ts`, `platform.ts`) | Se consume tal cual. `chains`, `locations`, `users`, `memberships`, `barber_locations`, `services`, `location_service_overrides`, `barber_services`, `schedules`, `time_off`, `notifications`, `subscriptions` **ya existen** con todas las columnas que F4 necesita, salvo los dos ajustes de §5 |
| Migraciones aplicadas | `src/lib/db/migrations/0000..0004` (aplicadas a la DB real y registradas en `drizzle.__drizzle_migrations`, 0001-0004) | No se editan. F4 añade `0005` y `0006` (§5) |
| Registro / login / recuperar | `src/lib/auth/actions.ts` (`registerAction`, `loginAction`, `logoutAction`, `forgotPasswordAction`, `resetPasswordAction`), `(auth)/*`, `app/api/auth/callback/route.ts` | `registerAction` **solo** crea `auth.users` + `public.users` (compensación si falla el insert). **No** crea cadena: F4-01 la extiende, no la reemplaza |
| Guards y sesión | `src/lib/auth/guards.ts` (`requireChainScope`, `requireLocationScope`, `requireBarberScope`, `requireClientScope`), `src/lib/auth/session.ts` (`getSessionContext`, cadena activa = primera membership por `created_at`, D-S1-6) | **Obligatorio** al inicio de toda Server Action nueva. No se crean guards de ámbito nuevos |
| Layout de onboarding | `(onboarding)/layout.tsx` — exige sesión, no exige rol; hoy `redirect("/login")` si no hay sesión | F4-01 le añade la regla inversa: si el usuario **ya** tiene cadena activa, redirige a `/overview` |
| Slugs reservados | `RESERVED_CHAIN_SLUGS` en `src/lib/public/directory.ts` (`book`, `api`, `login`, `register`, `sede`, `admin`, `_next`) | Se **reutiliza y amplía** (D-F4-3). El comentario del archivo ya anticipa que "la validación definitiva vive en el Zod del alta de cadena" — eso es F4-01 |
| Cupo de sedes | `src/lib/billing/index.ts` — `assertLocationQuota(plan, locationsAfter)`, `PLAN_QUOTAS`; `src/lib/billing/gate.ts` (`loadChainAccess`, `assertAreaAllowed`) | F4-03 lo **conecta** al crear sede (D-F3-17: "el bloqueo efectivo se conecta cuando exista el CRUD de sedes") |
| Validador de solapamiento entre sedes | `src/lib/scheduling/index.ts` — `hasBarberScheduleOverlapAcrossLocations({ proposed, existingBlocks })` (puro, 100% testeado) | F4-05 lo invoca al guardar horarios (PRD 1.4 / §16.2). **No se reimplementa** |
| Disponibilidad y agenda | `src/lib/scheduling/availability.ts`, `agenda.ts`, `effective-service.ts` | Los horarios, `time_off` y overrides que F4 crea son **la entrada** de estos módulos; sus tests existentes siguen verdes |
| Convención de Server Actions | `src/types/action-result.ts`, `src/lib/validation/id.ts` (`zUuid`) | Patrón obligatorio: Zod (`zUuid`) → guard → transacción con `tx` → `ActionResult` |
| Auditoría | `src/lib/auth/audit.ts` — `writeAuditLog(payload, executor)` | Obligatoria en alta/baja/cambio de sedes, equipo, precios y reglas (§3.8) |
| Tests estáticos de guards | `src/lib/actions/__tests__/use-server-guards.test.ts` | Toda función exportada de un `"use server"` nueva debe pasarlo (o declararse pública por diseño) |
| Gate de suscripción | `src/lib/billing/gate.ts` + un `layout.tsx` por sección de `(chain)` y `(location)/sede/[locationId]` | Las pantallas nuevas **heredan** el gate; las acciones nuevas llaman `assertAreaAllowed` según D-F3-16 |
| Design system | `DESIGN-SYSTEM.md`, `src/components/ui/*` (incl. `Input`, `Select`, `Combobox`, `Textarea`, `FormField` con `htmlFor` ya asociado), `src/components/kortex/*` (`DataTable`, `Sheet`, `Badge`, `EmptyState`, `Skeleton`, `ScopeBanner`, `LocationCard`) | Todo el CRUD se construye con estos componentes. `LocationCard` ya existe para `/locations` |
| Perfil público de barbero y sede | `(public)/[chainSlug]/barber/[barberId]`, `(public)/[chainSlug]/[locationSlug]`, `src/lib/public/coverage.ts`, `hours.ts` | Leen `locations.is_active`, `barber_locations`, `schedules`: **lo que F4 edita se refleja solo** |
| Sentry cableado | `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation*.ts`, `global-error.tsx`; `SENTRY_DSN` vacío en `.env.example` | F4-18 solo **activa y verifica** con un DSN real (S1-14 ya lo dejó cableado) |
| Cloudflare | `wrangler.jsonc` (`workers_dev: false`), `npm run deploy` / `preview`; `src/lib/db/client.ts` (cliente `postgres.js` por request en Workers) | F4-19 redespliega y evalúa Hyperdrive; **el Worker desplegado está desactualizado** (CHANGELOG 18 sep) |
| Seed y E2E | `npm run db:seed` (idempotente), `e2e/01..09`, `e2e/db-helpers.ts`, `playwright.config.ts` (puerto 3100) | F4 **añade** E2E (§6 F4-21); los 13 existentes siguen pasando |
| Scripts operativos | `metrics:backfill`, `metrics:measure`, `billing:set-status`, `scripts/db-baseline.ts` | Se reutilizan; el cupo y el estado del plan siguen moviéndose con `billing:set-status` hasta D-F4-11 |

**Lo que ya se sabe que NO existe y F4 no puede asumir:**
- **No hay paquete de email** (`resend` no está en `package.json`) **ni** `src/lib/notifications/`.
  `notifications` (tabla) existe y **nunca se ha escrito**.
- **`notifications.recipient_user_id` es `NOT NULL` con FK a `users`**, pero el cliente típico
  de la reserva pública **no tiene cuenta** (`clients.user_id = null`, D-F2-15). Con el
  esquema tal cual, **no se puede registrar un email a un cliente sin cuenta**. Es un bloqueo
  real de diseño: se resuelve con la migración `0005` (D-F4-7). *Esto es lo que el PM
  descubrió al verificar el repo; no estaba en F3.*
- **No hay scheduler**: ni `pg_cron` configurado ni Cron Triggers de Cloudflare (D-F3-12 lo
  descartó para F3). Los recordatorios de 24 h y 2 h **sí lo exigen** (D-F4-8).
- **No hay enlace público con token firmado** (D-F2-16 lo dejó para F3; F3-19 lo reasignó):
  hoy cancelar/reprogramar fuera de la app exige cuenta de cliente.
- **No hay selector de cadena** (D-S1-6 sigue vigente: primera membership por `created_at`).
- **No hay subida de imágenes**: `logo_url`, `cover_url`, `photos` existen como columnas pero
  ningún flujo escribe a Supabase Storage (D-F4-5 decide el alcance).
- **No hay alta de usuarios internos**: crear un barbero o gerente exige crear un usuario de
  Supabase Auth con la **service role** (`createSupabaseAdminClient`), solo en servidor y
  detrás del guard (D-F4-4).

---

## 3. Reglas NO NEGOCIABLES de F4

Las 10 reglas de `BACKLOG-BACKEND.md` §3, las 12 de `BACKLOG-F2.md` §3 y las 15 de
`BACKLOG-F3.md` §3 siguen vigentes (en particular: **ejecutor `tx` explícito** en toda función
auxiliar dentro de una transacción, **nada de `Date` crudo** en templates `sql`, **`zUuid`**,
**nada de `Promise.all` con consultas a la DB**, centavos enteros, guard antes que query,
`audit_log`, "una función `"use server"` exportada es un endpoint"). Estas se suman y son
específicas de esta fase. Violarlas es motivo de rechazo del PR.

1. **El `chain_id` nunca viene del cliente — tampoco al crear la cadena.** En el alta de
   cadena el `chain_id` lo genera el servidor; el `ownerId` y la membership `superuser`
   salen de la **sesión** (`getSessionContext().userId`), jamás del payload. En todo CRUD
   posterior el `chain_id` sale del guard (`requireChainScope`/`requireLocationScope`), y
   toda lectura/escritura de un recurso por `id` se **re-verifica contra el `chain_id` de la
   sesión** (un `locationId`, `serviceId` o `userId` ajeno devuelve "no encontrado", nunca
   "prohibido": no se confirma que el id existe en otra cadena).

2. **El alta de cadena es atómica, en una sola transacción de DB.** `chains` + `memberships`
   (superuser) + `subscriptions` (`trialing`, 21 días, plan según D-F4-1) + `locations`
   (primera sede) + `audit_log`. Un fallo a mitad **no** puede dejar una cadena sin
   suscripción ni una membership sin cadena. (La compensación de `auth.users` es la que ya
   existe en `registerAction`; el alta de cadena **no** crea usuarios de Auth.)

3. **El cupo de sedes se aplica en el servidor, dentro de la transacción de creación.**
   `assertLocationQuota(plan, sedesActivasDespués)` se llama **dentro** de `db.transaction`
   con el conteo leído con `tx` y bloqueo (`select ... for update` sobre la fila de
   `subscriptions` de la cadena) para que dos altas simultáneas no sobrepasen el cupo. Ocultar
   un botón **no** cuenta como control.

4. **Crear un usuario interno (barbero/gerente) requiere rol y no escala privilegios.**
   Solo `superuser` crea `admin`; `superuser` **o** `admin` de esa sede crean `barber`
   (matriz §6.2: "Crear/editar barberos: ✅ / 🟡"), pero **solo `superuser`** asigna un barbero
   a **más de una sede** o a una sede ajena. Un `admin` **nunca** puede crear ni elevar a
   `superuser` ni a `admin`. El cliente **no envía** el rol efectivo de otro: el servidor lo
   deriva del guard.

5. **La service role solo toca Auth, y solo detrás del guard.** `createSupabaseAdminClient`
   se usa exclusivamente para `auth.admin.inviteUserByEmail`/`createUser`/`deleteUser` en el
   alta de equipo, **después** de `requireChainScope`/`requireLocationScope` y de Zod. Nunca
   se usa para leer o escribir tablas de negocio (para eso, Drizzle con `tx`). Toda llamada
   a `auth.admin` va acompañada de su compensación (patrón de `registerAction`).

6. **Los emails no cuelgan transacciones ni se envían dentro de ellas.** Una transacción de
   negocio **inserta** la fila `notifications` (`pending`) y termina; el **envío** ocurre
   **fuera** de la transacción (o en el worker del cron). Prohibido llamar a Resend
   (`fetch`) dentro de `db.transaction`: retiene la única conexión del pool (`max: 1`) durante
   la latencia de red (bug de clase del §3.2 de F3, en versión de I/O externo).

7. **Idempotencia de la notificación.** Reintentar un envío, reprocesar el cron o doble clic
   **nunca** produce dos emails de la misma plantilla para la misma cita: lo garantiza el
   índice único de `0005` (D-F4-7), no la memoria del proceso (que en Workers no existe).

8. **Todo cambio de permisos, precios, sedes y reglas escribe `audit_log`** con `tx`:
   crear/editar/desactivar sede, alta/baja/cambio de rol o de sedes de un usuario, cambio de
   horario, aprobación/rechazo de `time_off`, cambio de precio o de override de un servicio,
   cambio de ajustes de la cadena, y toda importación CSV. Sin `writeAuditLog(..., tx)`, la
   tarea no está terminada.

9. **El token de cancelación es firmado, de un solo uso funcional y con expiración.**
   HMAC-SHA256 con un secreto de servidor (`APP_SIGNING_SECRET`), payload mínimo
   (`appointmentId`, `exp`), comparación en tiempo constante. **Nunca** contiene datos
   personales ni el teléfono. Cancelar con un token válido sobre una cita ya cancelada o
   pasada devuelve un mensaje legible, no un error. La cancelación respeta
   `chains.cancellation_hours` (D-F2-2) igual que la del cliente autenticado.

10. **Las rutas públicas nuevas no filtran nada.** Toda ruta o acción pública (cancelar por
    token, wizard) usa listas blancas de columnas, `zUuid`/Zod en params y `searchParams`,
    y **no usa `anon` de Supabase** (regla §3.5 de F2 vigente).

11. **Una sede desactivada sale de lo público pero no destruye historia.** Desactivar
    (`is_active = false`) nunca borra citas, ventas ni métricas; **no existe "eliminar sede"**
    en F4. Una sede con citas futuras activas **exige confirmación explícita** con el conteo
    (copy de BRAND-BRIEF §2.2) y **no cancela** esas citas (se mantienen, como pide el copy
    oficial).

12. **Horarios: el solapamiento entre sedes se rechaza en el servidor.** Todo guardado de
    `schedules` carga los bloques del barbero en **todas** sus sedes con `tx` y llama a
    `hasBarberScheduleOverlapAcrossLocations`; si solapa, rechaza con el mensaje de
    BRAND-BRIEF §2.2 que **nombra al barbero, la sede y el rango** ("Kelvin ya trabaja los
    jueves de 9:00 a 6:00 en Naco. Un barbero no puede estar en dos sedes a la misma hora").
    Se valida con el conjunto **resultante** de la edición (no solo el bloque nuevo), para
    que editar o borrar un bloque no deje una combinación inválida.

13. **Migraciones solo las de §5.** Solo se tocan dos cosas de esquema (una restricción y un
    índice) y una revocación de permisos; **cero columnas nuevas, cero renombres, cero
    policies de tenant nuevas**. Si una feature parece exigir una columna que no existe, **se
    para y se escala al PM** — en F4 esto ya se evaluó con el avatar/foto, la invitación de
    equipo y el token (D-F4-5, D-F4-4, D-F4-9) y la respuesta fue *recortar o usar lo que
    existe*.

14. **Dependencias nuevas: solo las listadas.** Se autoriza **únicamente** `resend` (cliente
    HTTP de email; o `fetch` directo a su API REST, decisión del desarrollador, preferida si
    evita una dependencia) y, si D-F4-5 se aprueba, nada más para imágenes (Supabase Storage
    ya está en `@supabase/supabase-js`). Parser de CSV: **escrito a mano o `papaparse`**, a
    elección del desarrollador con justificación en el PR; ninguna otra librería.

15. **Copy en español con el léxico oficial** (BRAND-BRIEF §2.5 y §4): *sede, fila, turno,
    corte, cuadre, silla, cadena*. Prohibidos en la UI: *sucursal, colaborador, onboarding,
    dashboard, override*. En particular los nombres visibles son **"Montar tu cadena"**,
    **"Tu plan"**, **"Reglas de Pago"**, **"Traer tus datos"** (importador). Cero emoji en
    pantallas de producto; los emails siguen el tono de BRAND-BRIEF §2.4 (cálido y breve para
    el cliente; imperativo para el gerente).

16. **Todo flujo nuevo trae su E2E o su test de integración contra la DB real, y deja la base
    como la encontró** (patrón `e2e/db-helpers.ts` + `scripts/db-baseline.ts`). F3 demostró que
    "verificado por build" no es evidencia: los bugs reales (deadlocks, `Date`, UUID) solo
    aparecieron al correr contra la DB.

---

## 4. Decisiones de producto de F4 (el PRD las dejaba abiertas)

Numeradas D-F4-*, en la línea de D-S1-*, D-F2-* y D-F3-*. Las que **no** llevan marca están
decididas por el PM; las marcadas **⏳ pendiente de confirmar** llevan recomendación y las
cierra Williams (§4.5 las lista juntas).

### Onboarding y registro (A)

**D-F4-1 · Qué plan nace con la cadena nueva.**
Toda cadena creada por onboarding nace con `subscriptions.plan = 'chain'`,
`status = 'trialing'`, `included_locations = 3`, `extra_locations = 0`,
`billing_cycle = 'monthly'`, `amount_dop = 9500.00`, `trial_ends_at = ahora + 21 días` (los
mismos valores que el seed de S1-15 y PRD §7.2). El plan `local` y `franchise` **no se
eligen en el wizard**: se asignan con `billing:set-status`/venta consultiva (D-F3-16). El
wizard **no pide tarjeta**. *Motivo: es el plan que contiene la propuesta de valor (Vista
Cadena, El Corte) y la prueba de 21 días existe para que la cadena viva un cierre de
quincena (PRD §7.2); ofrecer `local` en la entrada la dejaría sin el producto.*

**D-F4-2 · El registro y el onboarding son dos pasos separados, con una regla de entrada.**
`/register` sigue creando solo la cuenta (D-F2: el cliente final también se registra ahí).
El usuario autenticado **sin membership activa** que entra a `(onboarding)` ve el wizard;
si ya tiene cadena, `(onboarding)` redirige a `/overview`. El enlace "Montar tu cadena" se
ofrece **solo** en la pantalla de bienvenida del registro y en la página de ámbito
`(client)` vacía; **no se crea una cadena automáticamente al registrarse** (un cliente final
que se registra para reservar no debe terminar siendo "dueño"). *Motivo: sin esta
separación, cada cliente de la reserva pública sería un tenant fantasma con una prueba de
21 días corriendo.*

**D-F4-3 · Slug de cadena: formato, unicidad y lista reservada ampliada.**
Slug = minúsculas, dígitos y guiones, 3 a 40 caracteres, sin guion al inicio ni al final ni
guiones dobles, derivado del nombre y editable en el paso 1 con **disponibilidad verificada
en el servidor** (`select` por `slug`; el `unique` de `chains.slug` es la autoridad final y su
violación se traduce a un mensaje legible, no a un error crudo). La lista **reservada** se
amplía respecto de la de F2 y se mueve a un módulo único `src/lib/public/reserved-slugs.ts`
(que `directory.ts` y `public-booking.ts` reexportan, sin romper imports): `book, api, login,
register, forgot-password, reset-password, sede, admin, _next, overview, compare, locations,
team, services, commissions, reports, settings, billing, clients, mi-silla, schedule, earnings,
appointments, profile, onboarding, cancelar, favicon.ico, robots.txt, sitemap.xml, health` y
`www`, `app`, `kortex`, `kortexbarber`. El **slug de sede** (`locations.slug`, único por
cadena) sigue la misma regla de formato y **no puede** ser `barber` ni `book`
(colisionan con `/[chainSlug]/barber/...` y `/[chainSlug]/book`). *Motivo: el slug es la URL
pública que Ramón comparte (`kortexbarber.com/[cadena]`); un slug que choca con una ruta
estática "se come" a la cadena (D-F2-3).*

**D-F4-5 · Branding en el wizard: colores y nombre sí; subida de logo/portada NO en F4 (P1
opcional).**
El paso 3 captura `primary_color` y `secondary_color` (selector hex validado con Zod, con
**verificación de contraste mínimo 4.5:1 del color primario contra blanco**, porque se usa de
fondo del botón "Reservar" en `(public)`; si no cumple, se avisa y se propone el oscurecido
más cercano) y la zona horaria/país/moneda quedan en los defaults de la cadena
(`America/Santo_Domingo`, `DO`, `DOP`). **Subida de imágenes** (`logo_url`, `cover_url`,
`photos`) es **P1**: solo si sobra tiempo, con Supabase Storage y un bucket público de lectura
y escritura **solo por el servidor** (la acción sube con la service role tras el guard,
límite 2 MB, `image/png|jpeg|webp`, nombre generado por el servidor). Sin ella, la página
pública usa el wordmark de texto y el color de la cadena. *Motivo: Storage añade política de
acceso, límites y limpieza; no aporta al criterio §16.1 y el logo real de la cadena se
puede cargar por soporte durante el piloto.*

### Sedes y equipo (B, C)

**D-F4-4 · Cómo se da de alta a un barbero o gerente (usuario interno).**
El superuser/admin ingresa **nombre, email y teléfono** del miembro. El servidor (service
role, tras el guard) llama a `auth.admin.inviteUserByEmail(email, { data: { full_name } })`,
crea `public.users` con el **mismo UUID**, la `memberships` (`admin|barber`, `is_active`) y,
para un barbero, su `barber_locations` primaria. El invitado recibe el correo de Supabase Auth
(plantilla de invitación personalizada en español, ver F4-15), fija su clave por el enlace y
cae en su ámbito (`(location)` para admin, `(barber)` para barbero). **No hay contraseña
temporal compartida ni se ve la contraseña de nadie.** Si el email **ya existe** en Auth (p.
ej. un barbero que ya es cliente de la cadena o trabaja en otra cadena), se **reutiliza** ese
`users.id` y solo se crea la membership (el modelo de `memberships` ya lo soporta, PRD §10);
nunca se crea un segundo `auth.users`. Un miembro **no se borra**: se desactiva
(`memberships.is_active = false` y sus `barber_locations.is_active = false`), conservando su
historia de ventas y citas. *Motivo: invitar por email evita manejar contraseñas ajenas y el
modelo de `memberships` ya separa usuario de rol.*

**D-F4-6 · Quién aprueba un día libre y qué hace.**
El barbero **solicita** `time_off` desde Mi Silla (`status = 'pending'`); el `admin` de esa
sede o el `superuser` lo **aprueba o rechaza** (`approved|rejected`); el barbero puede
**cancelar** el suyo mientras sea `pending` o futuro (`cancelled`). Solo `approved` bloquea
disponibilidad (`lib/scheduling` ya lo resta). `admin` y `superuser` pueden **crear un
`time_off` ya aprobado** a nombre del barbero (caso real: el gerente lo anota de pie).
Aprobar **no cancela** citas existentes en ese rango: si hay citas activas del barbero en el
rango, la aprobación **se bloquea con la lista de esas citas** (el gerente las reprograma o
cancela primero), con el copy "Jandy tiene 2 citas el jueves de 2:00 a 5:00 — reprográmalas
antes de aprobar el día libre." *Motivo: aprobar en silencio dejaría clientes con una cita sobre
una silla sin barbero, que es la peor experiencia de la cadena.*

### Email (E)

**D-F4-7 · Esquema de notificaciones: una restricción y un índice (migración `0005`).**
`notifications.recipient_user_id` pasa a **nullable** (los clientes sin cuenta no son
`users`) y se añade el **índice único parcial** que da la idempotencia de la regla §3.7. El
destinatario sin cuenta se guarda **en `payload`** (`{ "email": "...", "name": "...",
"appointmentId": "..." }`, `jsonb` ya existente); no se añade ninguna columna. `channel` es
`email` en F4 (WhatsApp es fase posterior). Estados: `pending → sent | failed | cancelled`
(D-S1-4); un envío fallido se reintenta hasta **3 veces** con espera creciente (contador en
`payload.attempts`) y luego queda `failed` con el error resumido en `payload.error`, visible
para soporte. *Motivo: sin esto no se puede notificar a un cliente de la reserva pública, que
es el 100% del caso del PRD 1.16.*

**D-F4-8 · ⏳ Scheduler de recordatorios — pendiente de confirmar.**
Los recordatorios de 24 h y 2 h **no se pueden resolver con el patrón perezoso** de D-F3-12:
ese patrón calcula "al leer", y un recordatorio debe salir **aunque nadie abra la app**. Se
necesita un disparador temporal. Opciones evaluadas:
1. **Supabase `pg_cron` + `pg_net`** (extensiones del propio Postgres de Supabase): un job
   cada 5 min hace `net.http_post` a `POST /api/cron/notifications` con un secreto. **Cero
   infraestructura nueva** (la DB ya existe), se configura con SQL versionado, y el endpoint
   es idempotente (§3.7).
2. **Cron Trigger de Cloudflare** (`triggers.crons` en `wrangler.jsonc`): requiere un handler
   `scheduled` que el worker generado por OpenNext **no exporta por defecto** → hay que
   envolver el worker (más superficie y riesgo en el adapter).
3. **Trigger.dev**: dependencia y cuenta nuevas (PRD §14 lo lista, pero para dos cadenas
   piloto es infraestructura que nadie mantiene).

**Recomendación del PM: opción 1 (`pg_cron` + `pg_net` llamando a un Route Handler
protegido).** Justificación: no añade ningún servicio, no toca el adaptador de Cloudflare y es
reemplazable por cualquiera de las otras dos sin cambiar el endpoint. Requisito: verificar en
F4-14 que `pg_cron`/`pg_net` están disponibles y habilitados en el plan de Supabase del
proyecto; **si no lo están, se escala a Williams** (la alternativa 2 pasa a P0 y cambia el
estimado). Mientras Williams no confirme, **F4-14 se ejecuta como spike de 1 día** y el
endpoint se construye de forma independiente del scheduler.

**D-F4-9 · Token de cancelación: sin columna, con HMAC.**
`/cancelar/[token]` (ruta pública nueva) recibe un token `base64url(payload).base64url(hmac)`
con `payload = { a: <appointmentId>, e: <exp unix> }`, firmado con `APP_SIGNING_SECRET`
(variable de entorno de servidor, **obligatoria**, ≥ 32 bytes aleatorios, nunca en el
cliente). Expira **a la hora de inicio de la cita** (después no hay nada que cancelar). El
enlace va en los emails de confirmación y recordatorio. La página muestra los datos de la cita
(lista blanca: servicio, sede, barbero, hora, **sin** teléfono ni email) y un botón
"Cancelar mi cita"; cancelar respeta `cancellation_hours`. Cancelar libera el slot
(`status = 'cancelled'`, `cancellation_reason = 'Cancelada por el cliente desde el email'`) y
cancela las notificaciones `pending` de esa cita. Reprogramar **no** entra en F4 (solo
cancelar y volver a reservar). *Motivo: PRD 1.16 pide "cancelar desde el email"; un token
sin estado evita una tabla de tokens y una columna.*

**D-F4-10 · Qué emails se envían y a quién.**
Plantillas (`notifications.template`): `booking_confirmation` (al reservar, **inmediato**),
`reminder_24h`, `reminder_2h`, `booking_cancelled` (al cancelar el cliente o la cadena),
y para el equipo: `team_invitation` (la de Supabase Auth personalizada) y
`timeoff_decision` (aprobación/rechazo al barbero). Solo se notifica a clientes con **email**
(el teléfono es el identificador real en RD, D-F2-15: sin email, no hay notificación y **no se
inventa un canal**; el wizard hace el email **opcional** pero lo recomienda con copy
"para recordarte tu cita"). El **remitente** es `Kortex <citas@kortexbarber.com>` (dominio
verificado en Resend: **acción de Williams**, ver riesgo C); el contenido lleva el **nombre y
el color de la cadena**, no el de Kortex (Kortex es infraestructura, UX-BRIEF §1). Una cita
creada por el gerente (`source = 'admin'|'phone'`) notifica solo si el cliente tiene email. Los
recordatorios **no se envían** a citas `cancelled`/`no_show`/`completed`, ni de una hora ya
pasada (un cron caído no genera avalancha: ventana de tolerancia de 15 min).

### Pagos y plan (F)

**D-F4-11 · ⏳ Pasarela de pago de la suscripción (PRD D11) — pendiente de confirmar.**
F4 **no implementa** cobro automático por defecto. Se entrega un **spike documentado**
(F4-17) con la evaluación de **Azul/CardNet**, **PayPal Subscriptions** y **Stripe** frente a:
tiempo de integración, requisitos legales/comerciales de comercio en RD, soporte de cobro
recurrente en DOP, comisión y compatibilidad con Workers. **Recomendación del PM:** mantener
el **cobro manual por transferencia** durante todo el piloto (ya funciona con
`billing:set-status`, D-F3-16), **no integrar ninguna pasarela hasta tener 2 cadenas
pilotando**, y entonces elegir con datos: PayPal como fallback ya conocido (probado en
Agendalo) si Azul/CardNet no es viable en el timeline. **Williams decide** si (a) se mantiene
manual en F4 (recomendado), (b) se integra PayPal ya, o (c) se inicia el trámite comercial con
Azul/CardNet en paralelo. Mientras no decida, el criterio §16.12 sigue **parcial y declarado**
(acceso restringido al vencer; sin cobro automático).

**D-F4-12 · Auto-servicio de plan: ninguno en F4.**
"Tu plan" (F3-19) sigue en solo lectura con CTA a WhatsApp. Lo único nuevo es que **crear una
sede que excede el cupo** muestra el copy de upsell de `assertLocationQuota` con el mismo CTA
(el cambio de plan lo hace Williams con `billing:set-status`). *Motivo: D-F3-16; no se
construye un flujo de pago sin pasarela decidida.*

### Hardening y deuda (G)

**D-F4-13 · Revocar `EXECUTE` a `anon` en las funciones `SECURITY DEFINER` (migración `0006`).**
`auth_chain_ids()` y `rls_auto_enable()` son `SECURITY DEFINER` y ejecutables por `anon`
(advertencia del linter de Supabase, CHANGELOG 6 oct). `0006` hace `REVOKE EXECUTE ... FROM
anon` (y `FROM PUBLIC`) y mantiene `EXECUTE` para `authenticated` y `service_role` — **las
políticas RLS de `0001` invocan `auth_chain_ids()` como `authenticated`**, así que el cambio
**no** puede romperlas; se verifica con la prueba de RLS de S1-10 (JWT de la cadena A no ve la
cadena B) **antes y después**. `btree_gist` en `public` se **mueve a un esquema `extensions`**
solo si Supabase lo permite sin recrear los `EXCLUDE` de `0002`/`0004`; si implica
recrearlos, **se deja y se documenta** (riesgo bajo, no vale una migración destructiva).
"Leaked password protection" se activa en el panel de Auth (configuración, no código;
**acción de Williams**).

**D-F4-14 · Rate limiting de la reserva pública y del cancelar por token.**
Misma decisión que D-F2-17, ahora ejecutada: reglas de **rate limiting de Cloudflare**
(WAF → Rate limiting) sobre `/*/book`, `/cancelar/*` y `/api/cron/*` (esta última además
exige secreto). Es **configuración documentada** en el repo (`docs/ops/rate-limiting.md` con
las reglas exactas), no código. El límite de negocio de **3 citas activas futuras por
teléfono y cadena** (D-F2-17) ya existe y no cambia. *Motivo: en Workers no hay memoria de
proceso; el límite correcto vive en el borde.*

**D-F4-15 · Huecos de producto que F3 dejó abiertos — decisiones propuestas.**
Cuatro huecos documentados en el CHANGELOG. Cada uno lleva su decisión; los dos que cambian
**dinero de terceros** quedan ⏳ **pendientes de confirmar**:

- **(a) ⏳ Alquiler de silla sin ventas.** *Hoy:* un barbero de silla fija (`booth_rent`/
  `hybrid`) que no vendió nada en la quincena **no genera línea y no se le imputa renta**
  (el motor solo crea líneas para pares con actividad). *Decisión propuesta (recomendada):*
  **la renta se imputa siempre** que exista una asignación `barber_locations` activa con regla
  `booth_rent`/`hybrid` durante la quincena, generando una línea con `services_count = 0`,
  `commission = 0`, `booth_rent_deducted = renta`, `net_payable` **negativo** ("debe RD$X a la
  barbería", D-F3-6). *Motivo:* el alquiler es un cobro fijo del local, no depende de que el
  barbero trabaje; no imputarlo regala dinero y rompe la lógica del modelo de PRD §7. *Costo:*
  cambia `lib/commissions` (el motor recibe la lista de asignaciones) y su invariante.
  **Williams confirma** porque modifica lo que se le cobra a un barbero.
- **(b) ⏳ Ajustes que se pierden al recalcular.** *Hoy:* `computePayoutLines` devuelve
  `adjustments = 0` y recalcular borra e inserta las líneas, así que un ajuste manual
  (`adjustPayoutLine`) se pierde al recalcular. *Decisión propuesta (recomendada):* **los
  ajustes se re-aplican al recalcular** — la acción lee los `adjustments` y `notes` de las
  líneas existentes **antes** del `delete`, los vuelve a insertar sobre la línea del mismo
  (barbero, sede) y recompone el neto con `netPayableCents`; un ajuste cuyo par ya no tiene
  línea queda **huérfano visible** en el resumen (no se descarta en silencio). Alternativa
  descartada: prohibir recalcular tras ajustar (obliga a deshacer a mano). **Williams
  confirma.**
- **(c) `voidSaleAction` vs totales del cliente.** *Decisión:* anular una venta **revierte**
  en la misma transacción `clients.total_visits` (−1, mínimo 0), `clients.total_spent` (−total)
  y recalcula `last_visit_at` como la fecha de la última venta `paid` restante del cliente (o
  `null`); **y** el índice único `sales_appointment_id_uq` se vuelve **parcial excluyendo
  `refunded`** para que la cita pueda volver a cobrarse (la cita regresa a `in_progress`/
  `confirmed` según su hora; decisión del desarrollador documentada en el PR). Esto exige
  **tocar un índice** → entra en `0005` (§5). Escribe `audit_log` con `before/after` de los
  totales del cliente.
- **(d) `lookupClientHistoryAction` enumera clientes.** *Decisión:* la respuesta pública
  devuelve **solo el nombre de pila** y la **fecha relativa** de la última visita ("Última
  visita: hace 15 días en Naco"), **nunca** el nombre completo, el servicio ni datos
  de contacto, y **solo después** de que el cliente tecleó su nombre completo en el wizard y
  este **coincide** (case-insensitive, sin acentos) con el del registro; si no coincide, se
  responde **igual que si no existiera** (anti-enumeración). Más el rate limiting de D-F4-14.

**D-F4-16 · Importador CSV: "Traer tus datos".**
Importa **clientes** (nombre, teléfono, email, cumpleaños, notas de corte) y **servicios**
(nombre, categoría, duración, precio) desde CSV (UTF-8, separador `,` o `;`, con cabecera;
plantilla descargable), **solo `superuser`** (el cliente es "el activo más valioso", regla
§3.10 de Sprint 1). Flujo en **dos pasos**: (1) **vista previa** que valida cada fila con Zod
y muestra aceptadas/rechazadas con el motivo por fila, **sin escribir nada**; (2) **confirmar**,
que inserta las válidas en **una transacción** (todo o nada por archivo, tope de **2,000 filas**
por importación), con `audit_log` (`import.clients`/`import.services`, conteos y nombre del
archivo, no el contenido). Teléfono normalizado como en D-F2-15; duplicado por
`(chain_id, phone)` **se omite** (no sobrescribe) y se reporta. *Motivo: el riesgo R9 del PRD
(la migración desde Excel bloquea el onboarding); el servicio de migración pagado (RD$8,000)
se apoya en esta herramienta.*

**D-F4-17 · Despliegue y datos del piloto.**
El Worker de Cloudflare **se redespliega** con el código actual **antes** de cualquier
piloto y se verifica el flujo de dinero en el Worker desplegado (el desplegado hoy es una
versión anterior con el bug del cliente por request, CHANGELOG 18 sep). **Hyperdrive** se
evalúa con una medición (F4-19): si baja el costo de conexión por request (~0.4 s medido) lo
suficiente, se adopta; si no, se documenta y se difiere. El **dominio** `kortexbarber.com`
se activa (`workers_dev: false` + ruta/dominio personalizado) solo cuando F4-19 pase su
verificación. Los **datos de prueba** (cadena `don-bigote`, usuarios `*@donbigote.test`) **no
se mezclan con datos reales**: el piloto corre en un **proyecto Supabase aparte** o en la misma
base con cadenas reales aisladas por `chain_id` — **⏳ pendiente de confirmar** (D-F4-18).

**D-F4-18 · ⏳ Un proyecto de Supabase para el piloto — pendiente de confirmar.**
**Recomendación del PM:** el piloto usa el **mismo proyecto** mientras sean ≤ 2 cadenas
(el aislamiento por `chain_id` + RLS ya está probado y es el diseño del producto), pero **se
retira el seed de producción**: `db:seed` queda **prohibido contra la base del piloto**
(guard en el script: exige `ALLOW_SEED=1` y un nombre de proyecto de desarrollo en una
variable) y las cadenas reales se crean **solo** por el onboarding. Alternativa: proyecto
nuevo para producción (más limpio, pero duplica migraciones y credenciales). **Williams
decide** antes de F4-19.

### 4.5 Resumen de decisiones pendientes de confirmar por Williams

| # | Decisión | Recomendación del PM | Bloquea |
|---|---|---|---|
| **D-F4-8** | Scheduler de recordatorios (`pg_cron`+`pg_net` vs Cron de Cloudflare vs Trigger.dev) | `pg_cron` + `pg_net` → Route Handler protegido | F4-14 (cuál se implementa) |
| **D-F4-11** | Pasarela de pago (D11): manual / PayPal ya / iniciar Azul-CardNet | Cobro manual durante el piloto; decidir con 2 cadenas | F4-17 (alcance del spike) |
| **D-F4-15a** | Imputar alquiler de silla aunque no haya ventas | Sí, imputar siempre | F4-23 |
| **D-F4-15b** | Re-aplicar ajustes manuales al recalcular | Sí, re-aplicar con huérfanos visibles | F4-23 |
| **D-F4-18** | Mismo proyecto de Supabase para el piloto o uno nuevo | Mismo proyecto, sin seed en producción | F4-19 |
| **(acción)** | Dominio de envío verificado en Resend, remitente `citas@kortexbarber.com` | Verificar SPF/DKIM en Cloudflare DNS | F4-13 (envío real) |
| **(acción)** | Activar "Leaked password protection" en Auth | Activar | F4-18 |
| **(acción)** | Rotar la `service_role`/`sb_secret` originales expuestas el 16 sep | Rotar | F4-19 (antes del piloto) |

---

## 5. Migraciones nuevas autorizadas (y solo estas)

Se versionan **a mano** en `src/lib/db/migrations/`, siguiendo la convención de `0001`-`0004`
(SQL escrito a mano, con `--> statement-breakpoint`, cada sentencia re-ejecutable por sí sola
con `if not exists`/bloques `DO $$`). **Cero columnas nuevas. Cero renombres. Cero policies de
tenant nuevas.** Se aplican con `npm run db:migrate` (el flujo oficial del repo, que además
registra el hash en `drizzle.__drizzle_migrations`); **no** con el editor web de Supabase
(regla de Sprint 1).

### `0005_f4_integrity.sql`

1. **`notifications.recipient_user_id` → nullable** (`alter column ... drop not null`) y se
   actualiza el schema Drizzle de `platform.ts`. **`CHECK`** que exige que, si el destinatario
   es nulo, `payload` traiga `email` (`recipient_user_id is not null or payload ? 'email'`):
   una notificación sin a quién enviarla no puede existir. (D-F4-7)
2. **Índice único parcial de idempotencia**: `notifications (template, (payload->>'appointmentId'))
   where payload ? 'appointmentId' and status <> 'cancelled'` — un solo email de cada plantilla
   por cita (regla §3.7). Es un índice sobre una expresión de `jsonb` existente, **no** una
   columna nueva.
3. **`sales_appointment_id_uq` pasa a excluir ventas anuladas**: se recrea como índice único
   parcial `on sales (appointment_id) where appointment_id is not null and status <> 'refunded'`
   (D-F4-15c). Se hace con `create unique index concurrently ... ; drop index ...` en ese
   orden dentro de bloques `DO $$` para no dejar una ventana sin protección.
4. **Índices de rendimiento que F4 necesita:** `notifications (status, scheduled_for)` (el cron
   recorre `pending` vencidas), `memberships (chain_id, is_active)`, `barber_locations
   (location_id, is_active)`, `time_off (location_id, starts_at)`.
5. **Comentario en el archivo** dejando explícito que **no se añade ninguna policy nueva**:
   `notifications`, `memberships`, `barber_locations`, `time_off` ya están aisladas por
   `chain_id` en `0001_rls_policies.sql` (se **confirma** línea por línea el día de la
   migración, como hicieron F2-02 y F3-00; si alguna no lo estuviera, se escala).

**AC:** `npm run db:migrate` corre limpio y es idempotente (dos veces seguidas); insertar una
`notifications` con `recipient_user_id` nulo y sin `payload.email` es rechazado; insertar dos
`notifications` con la misma (`template`, `appointmentId`) es rechazado; con una venta
`refunded` de una cita, **cobrarla de nuevo** es aceptado y cobrarla una **tercera** vez
(con otra `paid` vigente) es rechazado; `npm run typecheck` en verde; los 402 tests y los 13 E2E
siguen verdes.

### `0006_f4_revoke_anon_execute.sql`

1. `revoke execute on function public.auth_chain_ids() from anon, public;` y lo mismo para
   `public.rls_auto_enable()`; `grant execute ... to authenticated, service_role` explícito.
   (D-F4-13)
2. **Verificación incluida en el PR:** la prueba de RLS de S1-10 (JWT de la cadena A sobre
   `locations` devuelve **0 filas** de la cadena B y rechaza un `insert` con `chain_id` de B)
   **antes y después**, y el linter de seguridad de Supabase (`get_advisors`) sin la
   advertencia de `SECURITY DEFINER` ejecutable por `anon` para estas dos funciones.

**AC:** como arriba; además, una consulta como `anon` a `select auth_chain_ids()` falla con
permiso denegado y la **suite de RLS sigue en verde**.

**Si aparece la necesidad de una columna nueva durante F4** (ej. `users.slug` para el barbero,
`chains.onboarding_completed_at`, un `token` en `appointments`, `paid_at` en `payout_periods`):
**se para y se escala al PM.** Ya se evaluaron las tres primeras y la resolución fue
*usar lo que existe* (D-F2-4, D-F4-2, D-F4-9).

---

## 6. Checklist de F4

Ejecutar los **bloques en el orden indicado**; **dentro de un bloque las tareas marcadas
"∥" son paralelizables** (archivos disjuntos, ver §6.1). Cada tarea termina solo cuando su
criterio de aceptación (AC) es verificable por otra persona. `P0` = bloquea la fase;
`P1` = se corta si el tiempo aprieta.

### 6.1 Reparto sugerido entre subagentes (archivos disjuntos)

| Bloque | Dueño exclusivo de estos archivos (no los toca nadie más) | Depende de |
|---|---|---|
| **0 · Base** (F4-00, F4-01) | `src/lib/db/migrations/0005*`, `0006*`, `src/lib/db/schema/platform.ts`, `src/lib/public/reserved-slugs.ts` | — |
| **A · Onboarding** (F4-02, F4-03) | `src/app/(onboarding)/**`, `src/app/(chain)/settings/**`, `src/lib/onboarding/**`, `src/lib/validation/chain.ts`, `src/components/forms/register-form.tsx`, `src/lib/auth/actions.ts` | Bloque 0 |
| **B · Sedes** (F4-04, F4-05) ∥ | `src/app/(chain)/locations/**`, `src/lib/locations/**`, `src/components/kortex/location-*` | Bloque 0 |
| **C · Equipo** (F4-06..F4-09) ∥ | `src/app/(chain)/team/**`, `src/app/(location)/sede/[locationId]/team/**`, `src/app/(barber)/schedule/**`, `src/lib/team/**` | Bloque 0, B (sedes existen) |
| **D · Servicios** (F4-10, F4-11) ∥ | `src/app/(chain)/services/**`, `src/lib/catalog/**` | Bloque 0 |
| **E · Email** (F4-12..F4-16) ∥ | `src/lib/notifications/**`, `src/app/api/cron/**`, `src/app/(public)/cancelar/**`, `src/lib/actions/public-booking.ts`, `src/lib/actions/client-appointments.ts`, `src/lib/actions/appointments.ts` (solo los *hooks* de notificar), `src/lib/auth/email-templates/**` | Bloque 0 (migración `0005`) |
| **F · Pasarela** (F4-17) ∥ | `docs/spikes/pasarela-de-pago.md` | — |
| **G · Hardening** (F4-18..F4-23) ∥ | `src/lib/import/**`, `src/app/(chain)/settings/import/**` (ruta hija propia), `docs/ops/**`, `wrangler.jsonc`, `sentry.*.ts`, `src/lib/commissions/**`, `src/lib/actions/payout-periods.ts`, `src/lib/actions/checkout.ts` (solo `voidSaleAction`) | Bloque 0; F4-23 espera D-F4-15a/b |
| **H · Cierre** (F4-24, F4-25) | `e2e/**`, `CHANGELOG.md`, `README.md` | Todos |

**Conflictos conocidos que el reparto resuelve:** `public-booking.ts` y `client-appointments.ts`
los **posee el Bloque E** (los hooks de email **y** la corrección de `lookupClientHistoryAction`,
F4-22, se hacen **ahí**, no en G); `src/lib/auth/actions.ts` lo posee el Bloque A; `(chain)/settings`
tiene dos dueños **solo por rutas distintas** (A: la raíz y branding; G: `/settings/import`).
Quien necesite tocar un archivo de otro bloque **lo pide al orquestador**, no lo edita.

### Bloque 0 — Preflight (integridad antes de construir encima)

#### F4-00 · Migraciones `0005` y `0006` + confirmación de RLS · **P0**
Implementar §5 punto por punto, aplicar con `npm run db:migrate`, dejar en el PR el resultado
de confirmar (no reescribir) las policies de las tablas afectadas, correr la prueba de RLS de
S1-10 antes y después de `0006`, y actualizar `platform.ts`.
**AC:** el de §5 (ambas migraciones); los 402 tests y los 13 E2E siguen verdes; `get_advisors`
sin la advertencia de `anon` ejecutable.

#### F4-01 · Módulo único de slugs reservados y validación de slug · **P0**
`src/lib/public/reserved-slugs.ts` con la lista ampliada de D-F4-3 y funciones puras
`normalizeSlug(name)`, `validateSlug(slug)`, `isReservedSlug(slug)` (100% testeadas);
`directory.ts` y `public-booking.ts` reexportan sin cambiar su contrato.
**AC:** tests con casos de formato (mayúsculas, acentos, espacios, guiones dobles, longitud
2/3/40/41), cada slug reservado rechazado, `barber`/`book` rechazados como slug de sede;
`directory.ts` sigue exportando `RESERVED_CHAIN_SLUGS` (los tests existentes no cambian).

### Bloque A — Montar tu cadena (PRD 1.1 · §16.1)

#### F4-02 · `createChainAction` — alta atómica de cadena · **P0**
Server Action `createChainAction` en `src/lib/onboarding/`: Zod (`chainSchema` con nombre,
slug, RNC opcional con formato RD, colores validados con contraste de D-F4-5, primera sede
con nombre, slug de sede, dirección, ciudad, teléfono, `chairs_count` ≥ 1, horario de la
tabla D-S1-1) → `getSessionContext` (autenticado y **sin** membership activa; si ya tiene,
error legible) → **una transacción** (regla §3.2): `chains` (`ownerId` = usuario de la sesión)
+ `memberships` (superuser) + `subscriptions` (D-F4-1) + `locations` (primera sede, plan
validado con `assertLocationQuota(…, 1)`) + `writeAuditLog(..., tx)` (`chain.create`).
`slug` duplicado se traduce a mensaje legible (D-F4-3).
**AC:** tras crearla, el usuario aterriza en `/overview` con su cadena como activa; **un fallo
forzado a mitad de la transacción no deja ningún registro** (test que lanza al insertar la
sede); dos altas simultáneas con el mismo slug: una gana y la otra recibe el mensaje legible;
un `chain_id`/`ownerId` enviado en el payload **se ignora** (test); la suscripción queda
`trialing` con `trial_ends_at` = ahora + 21 días (test con tolerancia); `audit_log` correcto.

#### F4-03 · Wizard "Montar tu cadena" (3 pasos) y `(chain)/settings` · **P0**
`(onboarding)/page.tsx`: paso 1 **datos de la cadena** (nombre, slug con disponibilidad en
vivo, RNC opcional), paso 2 **primera sede** (datos y horario con un editor de horario por día
usable en móvil), paso 3 **marca** (colores con vista previa del botón "Reservar" y el aviso de
contraste). Barra de progreso, volver atrás sin perder datos, copy de BRAND-BRIEF ("Listo,
<nombre>. Vamos a montar tu primera sede."), borrador **en estado de cliente solo hasta enviar**.
`(onboarding)/layout.tsx` redirige a `/overview` si ya hay cadena (D-F4-2). `(chain)/settings`
pasa de placeholder a la edición de nombre, branding, política de descuentos de barbero
(`max_barber_discount_pct`), reserva cross-sede (`allow_cross_location_booking`) y horas de
cancelación (`cancellation_hours`), solo `superuser`, con `audit_log` `before/after`.
**AC (PRD §16.1):** un dueño nuevo crea su cadena y su primera sede **en < 10 min sin
ayuda** (PRD 1.1), **cronometrado y documentado**; el wizard funciona en un teléfono; un
usuario que ya tiene cadena no ve el wizard; un `admin` o `barber` que abre `/settings` recibe
403; cada cambio de ajustes deja su fila en `audit_log`.

### Bloque B — Sedes (PRD 1.2 · §16.1)

#### F4-04 · CRUD de sedes con cupo por plan · **P0**
`(chain)/locations` (lista con `LocationCard` y estado), `/locations/nueva`, `/locations/[id]`:
crear, editar (nombre, slug, dirección, ciudad, teléfono, email, `chairs_count`, horario por
día, zona horaria) y **desactivar/reactivar**. Server Actions con Zod + `requireChainScope` +
`assertAreaAllowed` + **transacción con bloqueo** (regla §3.3): crear la sede N+1 llama
`assertLocationQuota(plan, sedesActivas + 1)` y, si rechaza, **no inserta** y muestra el
upsell ("El plan Cadena incluye 3 sedes. Para abrir la sede 4 son RD$2,500 más al mes — escríbele
a Williams…" con el CTA de WhatsApp de F3-19). Reactivar también valida el cupo. Desactivar una
sede con citas futuras activas exige confirmación con el conteo y **no cancela** las citas
(regla §3.11).
**AC (PRD 1.2 / 1.19):** el superuser crea, edita y desactiva sedes; **una sede desactivada
no aparece** en `/[chainSlug]` ni en el wizard de reserva (verificado en las dos rutas
públicas); con el plan `chain` y 3 sedes activas, crear la 4.ª **se rechaza en el servidor**
(llamando la acción directamente, no solo por UI) y la 4.ª simultánea de dos pestañas **no**
sobrepasa el cupo (test de concurrencia); un `admin` recibe 403; `audit_log` de cada cambio;
el `slug` de sede duplicado dentro de la cadena se rechaza con mensaje legible.

#### F4-05 · Detalle de sede: página pública y datos operativos · **P1**
Desde `/locations/[id]`: vista previa de cómo se ve en la página pública, estado de la sede y
sus barberos asignados con enlace a Equipo. **Sin** edición de fotos (D-F4-5).
**AC:** la vista previa coincide con `/[chainSlug]/[locationSlug]`; una sede sin barberos
muestra el aviso "Esta sede no tiene barberos con horario: nadie podrá reservar ahí".

### Bloque C — Equipo, horarios y días libres (PRD 1.4, 1.5 · §16.2)

#### F4-06 · Alta, edición y baja de miembros del equipo · **P0**
`(chain)/team` (lista unificada con filtros por sede y rol) y `(chain)/team/nuevo`;
`(location)/sede/[id]/team` (el admin ve y gestiona **solo su sede**). `createTeamMemberAction`
según D-F4-4 y reglas §3.4-§3.5: invitación por email (service role **tras** el guard, con
compensación si falla el insert), reutilización de `users` existente, membership y
`barber_locations` primaria en **una transacción de DB** (la llamada a Auth va fuera, antes,
con compensación). Edición: nombre, teléfono, rol (solo superuser), sedes asignadas y cuál es
la **primaria** (máximo una `is_primary` por usuario, validación de aplicación como pidió
S1-05 y refuerzo con índice parcial si el desarrollador lo propone **a través del PM**),
**servicios que hace** (`barber_services`, con duración propia opcional). Baja = desactivar
(D-F4-4), con el bloqueo de §D-F4-6 si tiene citas futuras (se muestran para reprogramar).
**AC (PRD §16.2, primera parte):** el superuser crea **8 barberos** y asigna **1 de ellos a 2
sedes**; el invitado recibe el email, fija su clave y aterriza en su ámbito; un `admin` de
Naco **no puede** crear un barbero en Bella Vista ni elevar a nadie a `admin` ni asignar a una
2.ª sede (llamando la acción directamente, test); un email ya existente reutiliza el `users.id`
(no duplica Auth); un fallo del insert tras crear el usuario de Auth **borra** ese usuario
(compensación, test con fallo forzado); toda alta/cambio/baja deja `audit_log`.

#### F4-07 · Editor de horarios por barbero y por sede · **P0**
En el detalle del barbero: horario semanal por sede (`schedules`: día, inicio, fin, activo),
bloques múltiples por día, copiar a otros días. Al guardar, el servidor carga **todos** los
bloques del barbero en **todas** sus sedes con `tx` y valida **el conjunto resultante** con
`hasBarberScheduleOverlapAcrossLocations` (regla §3.12), además de que cada bloque caiga
**dentro del horario de la sede** y que `start < end`. El rechazo usa el copy de BRAND-BRIEF
§2.2 con nombre, sede y rango.
**AC (PRD 1.5 / §16.2):** el sistema **rechaza** un horario solapado entre sedes (Naco
lun-mié y Bella Vista mar → rechazo con el copy, test directo a la acción); un horario válido
(lun-mié Naco, jue-sáb Bella Vista, como el seed) se guarda; un bloque fuera del horario de la
sede se rechaza; editar un bloque no deja una combinación inválida; el calendario y el wizard
de reserva reflejan el cambio **sin redeploy**; el perfil público muestra "en qué sede está
cada día" según lo guardado.

#### F4-08 · Días libres: solicitud, aprobación y bloqueo · **P0**
Mi Silla: "Pedir día libre" (rango, motivo) → `pending`. `(location)/sede/[id]/team` y
`(chain)/team`: bandeja de solicitudes con **aprobar/rechazar** (D-F4-6), alta directa ya
aprobada por el gerente, y el bloqueo de aprobación con la lista de citas en conflicto.
Cancelación por el barbero mientras `pending`. Los permisos siguen la matriz §6.2: el barbero
solo toca los suyos; el admin, los de su sede; el superuser, todos.
**AC (PRD 1.5):** un `time_off` aprobado **impide reservar ese slot** (verificado en el wizard
público y en `getAvailability`); aprobar con citas en conflicto se bloquea mostrando cuáles;
un barbero no puede aprobar el suyo ni ver el de otro; cada decisión deja `audit_log` y genera
la notificación `timeoff_decision` (F4-13); el `time_off` con `location_id` nulo bloquea al
barbero en **todas** sus sedes.

#### F4-09 · Cobertura de un barbero entre sedes (vista) · **P1**
En el detalle del barbero, una grilla semanal consolidada (día × sede) con su "cobertura"
("Jandy cubre en Naco los jueves", léxico oficial) y los conflictos señalados.
**AC:** la grilla del barbero multi-sede del seed muestra Naco lun-mié y Bella Vista jue-sáb;
coincide con el perfil público.

### Bloque D — Catálogo de servicios (PRD 1.6 · §16.3)

#### F4-10 · CRUD del catálogo maestro y override por sede · **P0**
`(chain)/services` (lista, `/services/nuevo`, `/services/[id]`): crear/editar/desactivar
servicios de la cadena (nombre, descripción, categoría del enum, duración default, precio
default) y, en el detalle, **override por sede** (`location_service_overrides`: precio,
duración, activo) con la regla de D-F2-1 (un servicio con override `is_active = false` **no se
ofrece** en esa sede). Solo `superuser` edita el catálogo; el **`admin` edita el override de su
sede** (matriz §6.2: "Override de precio/duración en su sede: 🟡"). Dinero en centavos enteros
con `centsFromDecimalString`/`decimalStringFromCents`; el precio de una cita **ya creada** no
cambia (`price_at_booking` está congelado, D-F2-1). Desactivar un servicio no borra historia.
**AC (PRD §16.3):** "Fade" cuesta RD$500 en Naco y RD$400 en San Cristóbal **desde un solo
catálogo creado por la UI** (sin seed); un override con `is_active = false` oculta el servicio
en esa sede en la consola **y** en el wizard público; cambiar un precio **no altera** las citas
ni ventas existentes (test); un `admin` solo edita overrides de **su** sede (403 en otra) y no
el catálogo; dinero sin float (grep del módulo); `audit_log` con `before/after` del precio.

#### F4-11 · Servicios por barbero (qué hace cada uno) · **P1**
En el detalle del barbero (compartido con F4-06 vía un componente propio de este bloque):
marcar los servicios que hace y su duración personalizada (`barber_services`, D-F2-1).
**AC:** un servicio que el barbero no hace no se ofrece con él en el wizard; la duración propia
cambia los slots disponibles (test contra `getAvailability`).

### Bloque E — Email transaccional (PRD 1.16 · §16.10)

#### F4-12 · `src/lib/notifications/` — módulo de plantillas, puro · **P0**
Módulo **puro** (sin `db`, `next/*`, `Date`, reloj): construye el asunto y el cuerpo (HTML +
texto plano) de cada plantilla de D-F4-10 a partir de datos ya cargados (cita, sede, barbero,
cadena con nombre y color, `cancelUrl`), con hora y fecha **ya formateadas en la tz de la
sede** por la capa de lectura, y la función pura `reminderWindow(startsAt, now)` →
`{ send24h, send2h }` con la tolerancia de 15 min (D-F4-10). Tono de BRAND-BRIEF §2.4.
**AC:** cobertura completa en Vitest; cada plantilla en español con el léxico oficial (test que
falla si aparece una palabra prohibida: *sucursal, colaborador, booking, dashboard*); el HTML
no incluye teléfono ni email de nadie; `reminderWindow` cubre: antes de la ventana, dentro,
justo en el borde de 15 min, cita ya pasada, cita cancelada (no envía).

#### F4-13 · Envío con Resend y registro en `notifications` · **P0**
`src/lib/notifications/send.ts` (`import "server-only"`): `enqueueNotification(input, tx)`
(inserta `pending` con `scheduled_for`, idempotente por el índice de `0005` con
`onConflictDoNothing`, **dentro** de la transacción de negocio) y `deliverNotification(id)`
(**fuera** de transacciones, regla §3.6: lee la fila, llama a Resend por HTTPS con el
remitente de D-F4-10, marca `sent`/`failed` con reintentos y `payload.attempts`). Variables
`RESEND_API_KEY` y `EMAIL_FROM` (documentadas en `.env.example`); **sin la clave, el módulo
no falla**: deja `pending`, loguea una advertencia y las pruebas usan un transporte falso
inyectado. Hooks en `createPublicBookingAction`, `createAppointmentAction` (cuando hay email),
la cancelación del cliente y la cancelación por token → encolan `booking_confirmation` /
`booking_cancelled` y entregan **después** del commit.
**AC (PRD §16.10, primera mitad):** al reservar con email llega la confirmación **y queda una
fila** en `notifications` (`sent`); reservar dos veces el mismo slot no genera dos emails (el
segundo falla antes); reintentar `deliverNotification` sobre una fila `sent` **no** reenvía
(idempotencia, test); un fallo de Resend deja `failed`/reintento sin romper la reserva (la
reserva **siempre** se confirma aunque el email falle, test); **ningún `fetch` a Resend ocurre
dentro de `db.transaction`** (test estático/grep); la función se llama **desde dentro de una
transacción** (`enqueue`) y no se cuelga (regla §3.2 de F3).

#### F4-14 · Recordatorios de 24 h y 2 h — scheduler y endpoint · **P0**
`POST /api/cron/notifications` (Route Handler, protegido por `Authorization: Bearer
CRON_SECRET`, comparación en tiempo constante, 401 sin él): carga las citas activas con
cliente con email cuyo inicio cae en la ventana de 24 h o de 2 h (`reminderWindow`),
**encola** (idempotente) y **entrega** las `pending` vencidas, en lotes acotados (tope 100 por
corrida) y **secuencialmente** (sin `Promise.all` con DB). Se programa con **`pg_cron` +
`pg_net`** cada 5 minutos **si Williams confirma D-F4-8** (spike de 1 día para verificar
disponibilidad de extensiones y el plan); la definición del job vive en SQL versionado en
`docs/ops/cron-notifications.sql`. El endpoint **no depende** del scheduler elegido.
**AC (PRD §16.10, segunda mitad):** con una cita creada a +24 h el recordatorio sale **una vez**
al correr el endpoint dos veces seguidas (idempotencia); a +2 h sale el de 2 h; una cita
cancelada o de otro día **no** genera recordatorio; sin el `Bearer` correcto responde 401;
una corrida con 150 citas pendientes procesa 100 y deja el resto para la siguiente (sin
duplicar); el spike deja por escrito qué extensiones están habilitadas y el plan elegido.

#### F4-15 · Cancelar desde el email: token firmado y página pública · **P0**
`src/lib/notifications/token.ts` (puro: `signCancelToken`, `verifyCancelToken`, HMAC-SHA256,
comparación en tiempo constante, expiración a la hora de inicio — D-F4-9) y la ruta pública
`(public)/cancelar/[token]`: muestra los datos de la cita (lista blanca) y el botón; la acción
`cancelByTokenAction` (**pública por diseño**: se agrega a `PUBLIC_BY_DESIGN` del test de
guards con su justificación) valida el token, respeta `cancellation_hours` con el mensaje
"Faltan 2 h; esta cadena permite cancelar hasta 4 h antes" (igual que F2-14), cancela, libera
el slot y cancela las notificaciones `pending` de esa cita (D-F4-9). Además se personaliza la
**plantilla de invitación** de Supabase Auth para `team_invitation` (HTML en
`src/lib/auth/email-templates/`, aplicada por configuración documentada).
**AC (PRD §16.10 y 1.16):** el cliente cancela **desde el enlace del email** sin tener cuenta;
un token alterado (un carácter), expirado o de otra cita se rechaza con un mensaje legible y
**sin revelar** si la cita existe; cancelar fuera de la ventana está bloqueado con el motivo;
cancelar dos veces con el mismo token devuelve "esa cita ya está cancelada"; el slot liberado
**vuelve a estar disponible** en el wizard; la página no muestra teléfono ni email; el token se
verifica con `APP_SIGNING_SECRET` (si falta la variable, la ruta falla cerrada, no abierta);
`audit_log` (`appointment.cancel_token`).

#### F4-16 · Notificaciones del equipo: decisión de día libre · **P1**
Plantilla `timeoff_decision` al barbero (aprobado/rechazado, con quién y por qué) enlazada a
F4-08.
**AC:** aprobar o rechazar un `time_off` encola y envía el email al barbero; un barbero sin
email (no debería existir: la invitación es por email) no rompe la decisión.

### Bloque F — Pasarela de pago (D11)

#### F4-17 · Spike documentado de pasarela · **P1**
`docs/spikes/pasarela-de-pago.md`: comparación de **Azul/CardNet, PayPal Subscriptions y
Stripe** (D-F4-11) con los criterios allí listados, requisitos del trámite comercial en RD,
estimado de integración en días, riesgos de Workers, y **una recomendación final con la
pregunta explícita para Williams**. **No se escribe una línea de integración de pago.**
**AC:** el documento existe, responde cada criterio con fuente (documentación oficial citada),
termina con la decisión pedida a Williams y su estimado; `paypal_subscription_id` sigue nulo y
no hay ninguna llamada a una pasarela en el código (grep).
**Si Williams elige integrar PayPal en F4** (opción b de D-F4-11), se abre un **backlog
aparte** `BACKLOG-F4-PAGOS.md`; esa integración **no** cabe en el presupuesto de esta fase.

### Bloque G — Hardening, despliegue y deuda

#### F4-18 · Sentry activo y verificado, y revocar `anon` · **P0**
Configurar `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (acción de Williams: crear el proyecto),
verificar que un error provocado en servidor **y** en cliente aparece en Sentry con la `release`
y **sin** secretos ni PII en el evento (scrub de `Authorization`, `cookie`, `password`, cuerpos
de acciones de dinero), y registrar el `chain_id` como tag. Confirmar `0006` en producción y
documentar la activación manual de "Leaked password protection".
**AC:** un error forzado aparece en Sentry; un evento de una acción de cobro **no** contiene
montos de clientes ni cuerpos de formularios; `get_advisors` limpio de `SECURITY DEFINER` para
`anon`.

#### F4-19 · Despliegue real en Cloudflare, backups probados y rotación de claves · **P0**
(a) **Redesplegar** el Worker con `npm run deploy` (con memoria libre y sin procesos huérfanos
de `wrangler`/`esbuild`/`workerd`, CHANGELOG 18 sep) y **verificar el flujo de dinero en el
Worker desplegado** (reservar, cobrar, cerrar caja, cerrar corte) con la suite de Playwright
apuntando a él (`E2E_BASE_URL`); (b) **medir Hyperdrive**: costo de conexión por request con y
sin él, y decidir/documentar (D-F4-17); (c) **backup y restauración probados**: restaurar un
backup a una base temporal y comprobar conteos (PRD §15: "plan de restauración **probado**
antes del primer cliente pagando"), documentado en `docs/ops/restauracion.md`; (d) **rotar** la
`service_role` y la `sb_secret` originales (acción de Williams) y actualizar `.env.local`,
`.dev.vars` y los secretos del Worker (`wrangler secret put`); (e) activar el **dominio**
`kortexbarber.com` solo si (a) pasa; (f) guard de `db:seed` según D-F4-18; (g) borrar el
residuo de `location_daily_metrics` (21 filas, dic-2025..ene-2026) **con confirmación de
Williams**; (h) variables nuevas (`APP_SIGNING_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`,
`EMAIL_FROM`) cargadas como secretos del Worker.
**AC:** los E2E de dinero pasan **contra el Worker desplegado**; hay una medición documentada
de Hyperdrive con decisión; la restauración se ejecutó y se comparó (conteos por tabla);
las claves viejas **ya no autentican** (`GET /rest/v1/chains` devuelve 401 con la vieja);
`seed` rechaza correr sin `ALLOW_SEED=1`; ningún secreto en el repo (`git grep`).

#### F4-20 · Rate limiting del borde · **P1**
Configurar las reglas de D-F4-14 en Cloudflare y documentarlas en `docs/ops/rate-limiting.md`
(ruta, umbral, acción) con una **prueba de humo** (ráfaga contra `/<slug>/book` que dispara el
límite).
**AC:** una ráfaga de N peticiones a una ruta protegida recibe 429; el uso normal (un cliente
reservando) no se ve afectado; `/api/cron/*` sin secreto da 401 y con ráfagas 429.

#### F4-21 · Importador CSV "Traer tus datos" · **P1**
`(chain)/settings/import` (ruta hija propia) y `src/lib/import/`: parser, validación Zod por
fila, vista previa, confirmación transaccional (D-F4-16), plantillas descargables de clientes
y servicios. Solo `superuser`.
**AC (riesgo R9):** importar un CSV de 200 clientes con 10 filas inválidas muestra 190 válidas
y las 10 con su motivo **sin escribir** hasta confirmar; al confirmar entran 190 en una
transacción (un fallo forzado deja 0); un teléfono ya existente en la cadena **se omite** y se
reporta; el mismo archivo importado dos veces **no duplica**; un `admin` recibe 403; el CSV
abre/se importa con `;` y con tildes (UTF-8 con y sin BOM); `audit_log` con conteos.

#### F4-22 · Cierre de los huecos de la reserva pública · **P0**
En `public-booking.ts` (dueño: Bloque E): corregir `lookupClientHistoryAction` según D-F4-15d
(solo nombre de pila y fecha relativa, tras coincidir el nombre completo, respuesta idéntica si
no coincide). Y, en `voidSaleAction` (`checkout.ts`), revertir los totales del cliente y
permitir recobrar la cita (D-F4-15c, apoyado en `0005`).
**AC:** un anónimo que prueba 50 teléfonos **no obtiene** ningún nombre completo ni distingue
cuáles existen (test: la respuesta para teléfono inexistente y para nombre no coincidente es
**idéntica**, también en tiempo de respuesta dentro de un margen); anular una venta deja
`total_visits`/`total_spent`/`last_visit_at` como si no hubiera ocurrido (test con valores
antes/después) y la cita puede cobrarse de nuevo; `audit_log` con `before/after`.

#### F4-23 · Huecos de El Corte: alquiler sin ventas y ajustes que se pierden · **P0, ⏳ depende de D-F4-15a/b**
**Solo se ejecuta cuando Williams confirme D-F4-15a y D-F4-15b** (modifican lo que se paga a
terceros). (a) `lib/commissions` recibe la lista de asignaciones con regla `booth_rent`/
`hybrid` y genera la línea de renta aunque no haya ventas (D-F4-15a), actualizando el
invariante de D-F3-11 (los ingresos siguen cuadrando; la renta no suma al ingreso) y los 70
tests del motor, manteniendo **cobertura 100%**; (b) `calculatePayoutPeriod` re-aplica los
`adjustments` y `notes` de las líneas existentes antes del `delete` (D-F4-15b) y muestra los
ajustes huérfanos.
**AC:** un barbero de silla fija **sin ventas** en la quincena aparece con su renta imputada y
`net_payable` negativo ("debe RD$X a la barbería"); recalcular **conserva** un ajuste manual
(antes/después idénticos salvo lo recalculado) y un ajuste sin línea correspondiente aparece
como huérfano; `lib/commissions` sigue en **100%** (`npm run test:coverage`); la suite de
integridad de F3 (invariante al centavo, idempotencia, concurrencia) **sigue verde**; **ningún
período `approved`/`paid` cambia** (regla §3.10 de F3: la corrección solo aplica a períodos
`open|calculated`).

### Bloque H — Cierre de fase

#### F4-24 · E2E de los flujos nuevos · **P0**
Playwright (patrón de `e2e/` y `db-helpers.ts`, limpieza propia, base idéntica al terminar):
**10 · montar-cadena** (registro → wizard de 3 pasos → `/overview`, con la cadena y el usuario
limpiados por ID), **11 · equipo-y-horarios** (alta de barbero, asignación a 2 sedes, horario
solapado rechazado, día libre aprobado que bloquea el slot), **12 · servicios-y-sedes** (crear
sede, rechazo de la 4.ª por cupo, override de precio, sede desactivada fuera de lo público),
**13 · cancelar-por-email** (reservar con email usando el **transporte falso**, extraer el
enlace del `notifications`/capturar, cancelar con el token y comprobar que el slot se libera).
**AC:** los 4 E2E nuevos pasan contra el seed **y** contra el Worker desplegado (F4-19); los 13
existentes siguen pasando; la base queda idéntica (`scripts/db-baseline.ts`).

#### F4-25 · Tests, medición y cierre de F4 · **P0**
Vitest: cobertura completa de `lib/notifications` (puro), tests de integración contra la DB real
de **cada acción nueva** (`createChainAction`, alta de equipo, horarios, `time_off`, servicios,
sedes con cupo) incluyendo la llamada **desde dentro de una transacción** (regla §3.2 de F3),
aislamiento (un `admin` no gestiona otra sede; otra cadena no ve nada) y el test estático de
guards actualizado. Medir y documentar el tiempo de **onboarding de una cadena de 3 sedes con 8
barberos y catálogo** (PRD §12.1: < 45 min; §16.1: < 45 min para sedes+branding), cronometrado
por una persona que **no sea quien lo construyó**. Actualizar `README.md` (levantar el proyecto
desde cero **incluyendo** las variables nuevas) y `CHANGELOG.md` (lo construido, lo decidido,
los riesgos abiertos de F4).
**AC:** `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build` en verde (los
cuatro, **en ese orden**); los E2E existentes y los 4 nuevos pasan; `CHANGELOG.md` actualizado;
la medición de onboarding está **documentada con su tiempo real** (no declarada).

---

## 7. Definición de Done de F4

F4 está terminada cuando, en el **Worker desplegado en Cloudflare**, con una cadena creada
**por el onboarding** (no por el seed):

1. Un dueño nuevo **se registra, monta su cadena, crea 3 sedes** y configura su marca en
   **< 45 min sin ayuda** (PRD §16.1), y la 4.ª sede en el plan Cadena **se rechaza en el
   servidor** con el copy de upsell (PRD 1.19).
2. Crea **8 barberos** con invitación por email, asigna **1 de ellos a 2 sedes** con horarios
   distintos, y el sistema **rechaza** un horario solapado entre sedes (PRD §16.2). Un día libre
   aprobado **bloquea el slot** en el wizard.
3. Define un catálogo de servicios con **precio distinto en cada sede** desde la UI
   (PRD §16.3); una sede desactivada **no aparece** en lo público.
4. Un cliente reserva con email y **recibe la confirmación**, **recibe los recordatorios de 24 h
   y 2 h**, y puede **cancelar desde el enlace del email** sin cuenta; todo queda registrado en
   `notifications` y **no se duplica un solo email** (PRD §16.10, 1.16).
5. Un `admin` **solo** gestiona su sede y **no** puede crear ni elevar `admin`/`superuser`; una
   cadena **no** ve ni toca otra (PRD §16.11 re-verificado sobre las acciones nuevas).
6. Toda alta, cambio de rol/sedes, horario, aprobación, precio, ajuste de cadena e importación
   deja su fila en `audit_log` con `before`/`after`.
7. La reserva pública **no permite enumerar clientes**; anular una venta **revierte** los
   totales del cliente y permite recobrar la cita.
8. `get_advisors` **sin** la advertencia de `SECURITY DEFINER` para `anon`; Sentry recibe errores
   **sin PII**; las claves originales expuestas **ya no autentican**.
9. El backup se **restauró y comparó** en una base temporal; Hyperdrive está **medido** y
   decidido; hay reglas de rate limiting **documentadas y probadas**.
10. `typecheck`, `lint`, `test`, los E2E de Playwright (los 13 existentes **más** los 4 nuevos) y
    `build` pasan **también contra el Worker desplegado**.
11. *(Condicional a la confirmación de Williams)* El alquiler de silla se imputa sin ventas y los
    ajustes sobreviven al recálculo (D-F4-15a/b), con `lib/commissions` en **100%**.
12. La decisión de la pasarela (D11) está **documentada y decidida por Williams**, con su
    estimado (el cobro **real** puede ser un backlog siguiente).

---

## 8. FUERA DE ALCANCE de F4 (no lo construyas)

**De fases posteriores (PRD §8.2 / §8.3 / roadmap §11 — F5 en adelante):**
- **WhatsApp/SMS** (PRD 2.1), **PWA del barbero y offline** (2.5), **inventario completo y venta
  de producto** (2.2-2.4), **reportes exportables generales/PDF** (2.6), **alertas automáticas**
  (2.10), **lealtad, reseñas, lista de espera, depósito anti-no-show, política de no-show
  automática, gastos por sede** (2.7-2.13).
- **White-label, constructor de roles, turnos y asistencia, metas, campañas, forecasting, API
  pública, tarjeta presente (Azul/CardNet POS), portafolio de barberos, multi-país, módulo de
  franquicias, asistente IA** (PRD §8.3).

**Decidido explícitamente fuera de F4 en este documento:**
- **Cobro automático de la suscripción** (D-F4-11): solo el spike. Sin autoservicio de upgrade
  (D-F4-12).
- **Subida de logo, portada y fotos** (D-F4-5): P1 opcional, no criterio de cierre.
- **Reprogramar desde el email** (D-F4-9): solo cancelar.
- **Selector de cadena** para usuarios con varias memberships (D-S1-6 sigue vigente).
- **"Eliminar sede" o "eliminar miembro"** (regla §3.11, D-F4-4): solo desactivar.
- **Editar el rol de un usuario a/desde `client`** o fusionar cuentas.
- **Plantillas de email editables por el dueño** y emails de marketing (PRD 3.5).
- **Notificar a clientes sin email** (D-F4-10): no se inventa un canal.
- **Importar otra cosa que clientes y servicios** (citas, ventas, historial) (D-F4-16).
- **Migrar `btree_gist` de esquema** si exige recrear los `EXCLUDE` (D-F4-13).
- **Optimizaciones de latencia más allá de medir Hyperdrive.**
- **Landing de marketing** de Kortex (post-MVP, nota del CHANGELOG).

**Regla anti-scope-creep:** si una tarea de F4 empieza a necesitar WhatsApp, una pasarela de
pago, almacenamiento de imágenes, una columna nueva o una librería no listada, **está fuera de
alcance. Para y escala al PM.** El único trabajo de producto de esta fase es: *que un dueño que
no conoce el producto pueda montar su cadena y operarla solo, y que sus clientes reciban su
cita por email.*

---

## 9. Riesgos vigentes de esta fase

| # | Riesgo | Mitigación en la fase |
|---|---|---|
| A | **F4 se vuelve "otro MVP completo" y se abandona** (R3 del PRD, probabilidad alta): son ~25 tareas y 8 bloques | Bloques con **archivos disjuntos** para repartir en paralelo (§6.1); P1 explícitos que se cortan primero (F4-05, F4-09, F4-11, F4-16, F4-17, F4-20, F4-21); §8 con lista cerrada; las 5 decisiones pendientes de §4.5 se piden **antes** de empezar el bloque que bloquean, no al final |
| B | **El onboarding crea cadenas fantasma** (clientes finales que se registran y quedan como dueños) | D-F4-2: la cadena **no** se crea al registrarse; el wizard es una acción explícita |
| C | **El dominio de envío no está verificado en Resend** y los emails caen en spam o no salen | Es **acción de Williams** (SPF/DKIM en Cloudflare DNS) listada en §4.5; F4-13 funciona con transporte falso y marca `pending` sin clave; el E2E usa el transporte falso, no depende de la entrega real |
| D | **`pg_cron`/`pg_net` no disponibles** en el plan de Supabase (D-F4-8) | Spike de 1 día **antes** de comprometer F4-14; el endpoint es independiente del scheduler; si falla, se escala a Williams y la opción Cloudflare pasa a P0 con su propio riesgo (el adaptador OpenNext no exporta `scheduled`) |
| E | **Un email dentro de una transacción cuelga el pool `max: 1`** (clase del §3.2 de F3, versión I/O externo) | Regla §3.6 + test que lo busca; el envío siempre **después** del commit; `enqueue` con `tx` y `deliver` sin él |
| F | **Dos altas simultáneas sobrepasan el cupo de sedes** | Regla §3.3: conteo con `tx` y `select ... for update` sobre `subscriptions`; test de concurrencia en F4-04 |
| G | **Escalada de privilegios en el alta de equipo** (un admin se crea un superuser, o crea barberos en otra sede) | Regla §3.4: el rol efectivo lo deriva el servidor del guard; tests de llamada directa a la acción en F4-06; nadie fuera de `superuser` asigna multi-sede |
| H | **La service role se usa mal** (lectura de tablas de negocio, o sin guard) | Regla §3.5: solo `auth.admin.*` y solo tras el guard; el test estático de guards y revisión de PR; compensación de cada llamada a Auth |
| I | **Un horario inválido (solapamiento entre sedes) se cuela por edición o borrado de un bloque** | Regla §3.12: se valida el **conjunto resultante** con la función pura ya testeada; caso de edición explícito en el AC de F4-07 |
| J | **El token de cancelación se filtra o es adivinable** | HMAC con secreto de servidor ≥ 32 bytes, expiración, comparación en tiempo constante, **falla cerrada** si falta el secreto (F4-15); sin PII en el token ni en la página |
| K | **Cambiar el cálculo del alquiler o los ajustes (F4-23) rompe El Corte, "la razón de compra"** (R2 del PRD: un error aquí pierde al cliente para siempre) | Solo se ejecuta con **confirmación de Williams**; `lib/commissions` mantiene **100%**, el invariante al centavo, idempotencia y concurrencia de F3 **siguen verdes**; no toca períodos `approved`/`paid` (§3.10 de F3) |
| L | **`0006` rompe RLS** (las políticas invocan `auth_chain_ids()`) | Se mantiene `EXECUTE` para `authenticated`/`service_role`; prueba de RLS de S1-10 **antes y después** como AC; si falla, se revierte esa sentencia |
| M | **Se mezclan datos de prueba y reales** al abrir el piloto | D-F4-18 (⏳): guard de `db:seed`, cadenas reales solo por onboarding, `chain_id` + RLS como aislamiento |
| N | **Latencia en Workers (~0.4 s por request por abrir conexión)** degrada el onboarding y el wizard en producción | F4-19 mide Hyperdrive con y sin él y decide con datos; no se optimiza a ciegas |
| O | **La decisión de pasarela (D11) sigue abierta y se arrastra a F5** sin cobrar a nadie | Spike F4-17 con recomendación y estimado; el cobro manual del piloto funciona (D-F3-16); la decisión de Williams se pide con fecha en el cierre de F4 |
| P | **El piloto encuentra que "configurarse solo" aún no se puede** (el criterio §16.1 de < 45 min no se cumple) | F4-25 exige la **medición real** por alguien que no construyó el producto; si no se cumple, se registra qué paso se atasca y es la primera tarea del siguiente ciclo, no se declara cumplido |
