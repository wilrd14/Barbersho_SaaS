# CHANGELOG — Kortex

## 2026-09-18 — Cierre de sesión: F2 realmente cerrado, backlog de F3 listo

**Estado al cerrar hoy:** F2 queda cerrado de verdad — los 6 E2E de Playwright
en verde (los 4 originales de F2-25 + los 2 de la auditoría de rutas sin
cubrir), 103 tests de Vitest, typecheck/lint/build en verde, todo commiteado
en `main` hasta `8032dc3`. `BACKLOG-F3.md` ya está escrito y listo para
implementar, pero **la implementación de F3 todavía NO empezó** — es lo
primero que toca en la próxima sesión.

**Resumen de lo hecho hoy** (ver entradas detalladas más abajo en este mismo
archivo para cada una):
1. F2-25: Playwright configurado, 4 E2E críticos, test de concurrencia real
   de doble-booking, medición honesta del AC de round-trips (8, no ≤3).
   Encontró y arregló 2 bugs graves (deadlock de `writeAuditLog` dentro de
   transacciones, y Zod v4 rechazando los UUID del seed).
2. Auditoría de los 3 caminos que F2-25 no cubrió (cancelar cita, anular
   venta, reprogramar/reasignar): los 2 primeros ya estaban sanos, el
   tercero tenía el mismo deadlock de clase (`resolveEffectiveServiceFor`
   sin `tx`) — corregido.
3. Un tercer bug real, de clase distinta, encontrado al correr la suite
   completa: `time_off` crasheaba por interpolar un `Date` crudo en un
   template `sql` de Drizzle — corregido, más una fragilidad de re-seed
   documentada (no resuelta) por el `EXCLUDE` constraint no diferido.
4. `BACKLOG-F3.md`: motor de comisiones ("El Corte"), dashboard consolidado
   ("Vista Cadena"/"Tabla de Posiciones"), suscripción/billing sin pasarela
   real. Aclara que **"F3 = MVP vendible" no es cierto tal como está el
   repo** — faltan las pantallas CRUD de F1 (sedes/equipo/servicios, hoy
   placeholders) y el email transaccional, movidos a F4.

**Primer paso de la próxima sesión:** implementar `BACKLOG-F3.md` con el
mismo esquema de equipo (developer-builder por bloques, verificando
`npm run build` completo antes de dar cada bloque por cerrado — no solo
typecheck/lint/test, que ya demostraron no ser suficiente 3 veces esta
semana).

## 2026-09-18 — Tercer bug real: crash pre-existente en La Fila (time_off)

Al correr la suite Playwright completa para cerrar la auditoria de arriba,
`02-dar-turno.spec.ts` (uno de los 4 E2E originales de F2-25, no tocado por
esa auditoria) fallo. Confirmado como bug pre-existente, no relacionado con
el deadlock de `resolveEffectiveServiceFor`/`writeAuditLog` (bug de clase
distinta):

- **Causa:** `getAvailableBarbers()` en `src/lib/actions/queue.ts`
  interpolaba un objeto `Date` crudo dentro de un template `sql` de
  Drizzle (`sql`${timeOff.startsAt} <= ${now}``). El `sql` de Drizzle no
  hace la auto-serializacion de `Date` que si hace el `sql` propio de
  `postgres.js` cuando se usa como template tag directo — el driver recibe
  el `Date` en su path de bajo nivel de bind de parametros, que exige
  string/Buffer, y lanza `TypeError [ERR_INVALID_ARG_TYPE]`. Drizzle lo
  envuelve como un "Failed query" generico sin pista de la causa real;
  se aislo reproduciendo la query exacta fuera de la app.
- **Fix:** interpolar `now.toISOString()` en vez del `Date` crudo. Se
  revisaron todos los demas usos de `sql\`` en `src/lib` — ningun otro
  interpola un `Date` sin convertir.
- Efecto secundario detectado y limpiado (no arreglado de raiz): correr
  `npm run db:seed` en un dia distinto al del ultimo seed puede chocar con
  el `EXCLUDE` constraint de forma transitoria, porque el seed actualiza
  las citas de F2-24 (ancladas a "ahora") fila por fila dentro de una sola
  transaccion y el constraint no es `DEFERRABLE` — una fila recien
  actualizada puede solaparse momentaneamente con una hermana que todavia
  no se actualizo. Se limpiaron las dos filas afectadas a mano en Supabase
  para poder re-sembrar; **queda como deuda tecnica documentada, no
  resuelta**: la forma correcta es o declarar el constraint
  `DEFERRABLE INITIALLY DEFERRED`, o reescribir el seed para borrar e
  insertar esas filas en vez de actualizarlas en el mismo orden cada vez.
- Verificado: los 6 E2E de Playwright (los 4 originales + los 2 de la
  auditoria de abajo) en verde, 103 tests de Vitest, typecheck, lint y
  `npm run build` completo, todos en verde.

## 2026-09-18 — Auditoria post-F2-25: los 3 caminos de dinero/auditoria que faltaban por probar

F2-25 (arriba) cerro 4 flujos criticos con E2E reales y corrigio 2 bugs de
deadlock/validacion que bloqueaban toda operacion de dinero/auditoria — pero
el propio cierre de F2-25 advertia que **solo esos 4 flujos se habian
probado de punta a punta contra la DB real**. Esta sesion es esa auditoria
pendiente: los otros 3 caminos de escritura/auditoria dentro de una
transaccion que ningun E2E ejercitaba todavia.

**Los 3 caminos auditados, cada uno con test permanente en verde:**

1. **Cancelar cita del cliente** (F2-14, `cancelMyAppointmentAction`,
   `src/lib/actions/client-appointments.ts`) — Playwright real
   (`e2e/05-cancelar-cita-cliente.spec.ts`): la UI de `/appointments` ya
   funciona, asi que se probo tal cual la usa un cliente real. Se siembra
   una cita futura para `cliente1@donbigote.test` directo en la DB (el seed
   no crea ninguna cita futura para un cliente con cuenta), se cancela desde
   el boton real, y se verifica en la DB (no solo en pantalla) que
   `status = 'cancelled'` y que `audit_log` tiene la fila
   `appointment.cancel_client` con `before`/`after` correctos. **Sano, sin
   cambios de codigo.**
2. **Anular venta el mismo dia** (F2-22, `voidSaleAction`,
   `src/lib/actions/checkout.ts`) — Vitest de integracion contra la DB real
   (`src/lib/actions/__tests__/void-sale.integration.test.ts`), no
   Playwright: se confirmo con `grep "voidSaleAction" src/` que **ningun
   componente de UI llama esta funcion todavia** (existe desde F2-22 pero
   nunca se conecto un boton). Sin pantalla que ejercitar, se mockeo solo
   `getSessionContext` (la capa que lee la cookie de Supabase Auth en
   produccion — mismo patron que `guards.test.ts`) para simular la sesion
   de `admin.naco`, y se llamo `createSaleAction`/`voidSaleAction` de verdad
   contra Supabase real. Verifica `sales.status = 'refunded'` y
   `audit_log` (`sale.refund`) con `before.status = 'paid'`/
   `after.status = 'refunded'`, mas un segundo intento de anular la misma
   venta (debe fallar con mensaje legible, no colgarse). **Sano, sin
   cambios de codigo — pero queda como deuda de producto que anular una
   venta no tiene boton en ninguna pantalla (ver mas abajo).**
3. **Reprogramar y reasignar cita** (F2-09, `rescheduleAppointmentAction`,
   `src/lib/actions/appointments.ts`) — Playwright real
   (`e2e/06-reprogramar-cita.spec.ts`) contra el sheet de detalle de "El
   Dia". Para que fuera determinista sin pelear con los horarios ya
   sembrados de F2-24 (anclados al momento en que se corrio el seed, no al
   momento en que corre el test), se crean dos barberos temporales
   dedicados solo a este test (sin ninguna cita previa) con horario que
   cubre el dia completo. El test cambia la hora Y reasigna a otro barbero
   desde el sheet real, y verifica en la DB que `barber_id`/`starts_at`
   cambiaron y que `audit_log` (`appointment.reschedule`) tiene
   `before`/`after` correctos. **Aqui SI aparecio un bug real — ver abajo.**

**Bug real encontrado y corregido: mismo patron de deadlock que F2-25 ya
habia corregido en `writeAuditLog`, esta vez en
`resolveEffectiveServiceFor`.** El primer intento de correr el E2E de
reprogramar se colgo (el boton "Guardar cambios" se quedaba girando para
siempre); un test de Vitest aislado (llamando `rescheduleAppointmentAction`
directo, sin navegador) confirmo el cuelgue con un timeout de 30s y
`pg_stat_activity` sin ninguna sesion en estado real de espera — deadlock de
aplicacion, no de Postgres, identico en forma al de F2-25. Causa:
`resolveEffectiveServiceFor` (`src/lib/scheduling/availability.ts`, usada
por F2-08/F2-09/F2-13) siempre corria sus tres `select` con el cliente `db`
singleton (pool `max: 1`), nunca con el `tx` de la transaccion que la
llama. `createAppointmentAction` (F2-08) y `createPublicBookingAction`
(F2-13) la llaman ANTES de abrir su transaccion, asi que a ellos nunca les
tocaba — pero `rescheduleAppointmentAction` (F2-09) la llama DENTRO de
`db.transaction(async (tx) => ...)`, y ahi la transaccion ya tenia
reservada la unica conexion del pool: el `select` esperaba para siempre una
conexion libre que la propia transaccion (bloqueada esperando ese mismo
`select`) nunca iba a soltar. **Fix:** `resolveEffectiveServiceFor` ahora
acepta el ejecutor Drizzle (`db` o `tx`) como cuarto parametro opcional,
mismo patron que el fix de `writeAuditLog`; el unico llamador dentro de una
transaccion (`rescheduleAppointmentAction`) le pasa `tx` explicitamente.
Verificado: el test de Vitest aislado paso de "timeout a los 30s" a
"resuelve en ~1.2s" con el fix, y el E2E de Playwright completo (login real,
click en el sheet, reprogramar, reasignar) pasa en ~10s.

**Riesgo que esto confirma (ya lo advertia el CHANGELOG de F2-25):** el
patron "una funcion que internamente usa el `db` singleton en vez de
recibir el ejecutor real" es un bug de clase, no un incidente aislado — van
dos apariciones (`writeAuditLog` en F2-25, `resolveEffectiveServiceFor`
aqui) y ambas solo se manifiestan cuando la funcion se llama DESDE DENTRO
de una transaccion, que es exactamente lo que ningun test automatizado
ejercitaba hasta ahora. Se grepeo el resto de `src/lib/actions/*.ts` en
busca de otros llamadores dentro de `db.transaction(async (tx) => ...)` que
no reciban `tx` explicitamente (`resolveServiceEffective`/`resolveClientId`/
`recalcQueueState`/`getTicketOrThrow` en `queue.ts`,
`resolveEffectivePriceCents`/`resolveMaxDiscountPct` en `checkout.ts`) — los
9 restantes SI reciben `tx` correctamente. No queda ningun otro caso
conocido de este patron en el codigo actual.

**Bug pre-existente encontrado por accidente, fuera del alcance de esta
tarea, NO corregido:** al correr la suite completa de Playwright para
confirmar que los especs nuevos no rompian nada, `e2e/02-dar-turno.spec.ts`
(uno de los 4 E2E originales de F2-25, sin tocar en esta sesion) fallo con
un error real visible en pantalla: `Failed query: select "user_id" from
"time_off" where (...)`. Se confirmo que **no es una regresion de esta
sesion** (`git stash` + correr el mismo spec contra el commit
`9976418` sin ningun cambio mio reproduce el mismo fallo). Es un bug real en
`recalcQueueState`/`queue.ts` (la consulta de `time_off` activo al calcular
disponibilidad de "dar turno"), pero queda **fuera del alcance de esta
tarea** (los 3 caminos asignados eran F2-14/F2-22/F2-09, no F2-16/17) y no
se investigo a fondo por disciplina de presupuesto de la sesion. Se
documenta aqui para que el equipo lo tome como proxima tarea — es
potencialmente el mismo tipo de bug de clase que los dos de arriba (una
consulta corriendo en el contexto equivocado), pero no se confirmo la causa
raiz.

**Deuda de producto confirmada (no es un bug, es una funcionalidad
inconclusa):** `voidSaleAction` (F2-22) funciona perfectamente contra la DB
real, pero no hay ningun boton en ninguna pantalla que la invoque — un
gerente no tiene forma de anular una venta desde la UI de Kortex hoy. El
backlog original (BACKLOG-F2.md) marcaba F2-22 como P1 "si se corta, se
documenta como deuda tecnica"; se implemento la Server Action completa pero
la conexion a la UI se quedo pendiente. Queda para una tarea futura de UI.

**Verificado en este orden, los 4 comandos completos en verde:**
`npm run typecheck`, `npm run lint` (0 errores), `npm run test` (103 tests,
11 archivos — 2 nuevos vs los 101 de F2-25), `npm run build` (25 rutas,
Turbopack). Los 6 E2E de Playwright (los 4 de F2-25 + los 2 nuevos) corridos
en secuencia: 5 en verde, `02-dar-turno.spec.ts` en rojo por el bug
pre-existente de arriba (confirmado no-regresion).

## 2026-09-18 — F2-25: tests y cierre de F2

Última tarea de F2 (`BACKLOG-F2.md` §6, Bloque F). Objetivo: 100% en
`lib/scheduling` (ya estaba, se confirma), cobertura completa de `lib/queue`
y `lib/pos` (ya estaba, se confirma), test de concurrencia real de
doble-booking, test de la máquina de estados de citas y de la fila (ya
existían como módulos puros 100% testeados), Playwright configurado con los
4 flujos críticos del PRD §15, y medir el AC de "≤3 round-trips" de F2-04.

**Estado final, verificado en este orden — los 4 comandos en verde:**
`npm run test` (101 tests, 10 archivos), `npm run typecheck`, `npm run lint`
(0 errores), `npm run build` (25 rutas, Turbopack). Los 4 E2E de Playwright
pasan corridos en secuencia contra el seed real (`npm run db:seed`, proyecto
Supabase real de `.env.local`), tanto sueltos como en el orden completo.

**Dos bugs reales de producción encontrados y corregidos al correr F2 en
serio por primera vez contra la DB real** (ninguno lo detectaba
typecheck/lint/test de módulos puros; ambos bloqueaban los 4 flujos críticos
por completo):

1. **Deadlock de aplicación en toda operación de dinero/auditoría.**
   `writeAuditLog()` (`src/lib/auth/audit.ts`) siempre usaba el cliente `db`
   singleton (`src/lib/db/client.ts`, pool `max: 1`, a propósito para
   Cloudflare Workers), nunca el `tx` de la transacción en curso. Los 12
   llamadores dentro de `db.transaction(async (tx) => ...)` (reservar,
   cobrar, abrir/cerrar caja, dar turno, transicionar/crear/reprogramar
   cita, cancelar cita de cliente) quedaban colgados **para siempre, sin
   error**: la transacción reservaba la única conexión del pool, y el
   `insert` de auditoría esperaba una conexión libre que la propia
   transacción — bloqueada esperando ese mismo `insert` para poder hacer
   `COMMIT` — nunca iba a soltar. Confirmado con `pg_stat_activity`: la
   sesión quedaba en `idle in transaction`, sin ningún lock bloqueante — 100%
   deadlock de aplicación, no de Postgres. Esto nunca se detectó antes porque
   ningún Server Action de dinero se había corrido en serio contra la DB real
   (el CHANGELOG del cierre anterior ya lo advertía: "verificado
   manualmente/por build" no es evidencia suficiente). **Fix:** `writeAuditLog`
   ahora acepta el ejecutor Drizzle (`db` o `tx`) como segundo parámetro
   opcional; los 12 llamadores dentro de una transacción le pasan `tx`
   explícitamente. Nada de la lógica de negocio cambió — es un bug de
   plomería (conexión equivocada), no una regla de negocio distinta.
2. **Zod v4 rechazaba todos los IDs fijos del seed como "Invalid UUID".**
   Zod v4 endureció `.uuid()` para exigir los nibbles de versión ([1-8]) y
   variante ([89ab]) del RFC 9562 (con excepción explícita solo para el UUID
   nulo y el "todo F"). Los IDs fijos y legibles del seed
   (`src/lib/db/seed.ts`, ej. `00000000-0000-0000-0000-000000000301` para
   Naco) no cumplen esos nibbles, así que **cualquier** Server Action que
   validaba un `locationId`/`serviceId`/`barberId`/etc. con
   `z.string().uuid()` rechazaba con "Invalid UUID" toda llamada real contra
   el seed — 10 archivos, ~35 usos. **Fix:** `src/lib/validation/id.ts` define
   `zUuid` (valida el formato 8-4-4-4-12 hex, sin exigir version/variant
   nibbles — la autoridad real de que el ID exista y pertenezca al tenant
   sigue siendo el guard + la query a la DB, regla dura §3.1); reemplaza
   `z.string().uuid()` en los 10 archivos afectados (`public-booking.ts`,
   `queue.ts`, `checkout.ts`, `cash-register.ts`, `appointments.ts`,
   `client-appointments.ts`, `booking-wizard.tsx`, `calendar/page.tsx`,
   `[chainSlug]/book/page.tsx`, `[chainSlug]/barber/[barberId]/page.tsx`).
   No se tocaron los IDs del seed (cambiarlos habría sido una migración de
   datos fuera del alcance de F2-25).

**Sin ambos fixes, ninguno de los 4 flujos críticos del PRD §15 era
ejecutable contra el seed real — se habrían visto como "Invalid UUID" en
consola primero, y de haber pasado esa capa, colgados sin límite de tiempo
al segundo intento de escritura de auditoría.** Ambos se descubrieron
metódicamente: un script de diagnóstico aislado (`scripts/debug-booking.ts`,
ya borrado tras el fix) reprodujo el hang fuera de Playwright/Vitest,
confirmando que no era un artefacto del test runner.

**Playwright configurado** (`playwright.config.ts`, devDependency
`@playwright/test` + Chromium descargado): `baseURL` `localhost:3000`,
`webServer` levanta `next dev` automáticamente (`reuseExistingServer` fuera
de CI para no chocar con un dev server local ya corriendo), un solo worker
(los 4 flujos comparten el mismo seed/sede/caja, se corren en serie a
propósito). `npm run test:e2e` es el atajo.

**Los 4 E2E** (`e2e/01-reservar.spec.ts` .. `e2e/04-cerrar-caja.spec.ts`,
prefijo numérico para que corran en el orden en que un día real los
necesita — cobrar necesita caja abierta, cerrar-caja la cierra):
1. **Reservar** — cliente anónimo completa el wizard de 4 pasos en
   `/don-bigote/book` (sede → servicio → fecha/hora → confirmar) y verifica
   la pantalla "¡Listo!" con el código de reserva.
2. **Dar turno** — `admin.naco` agrega un walk-in nuevo en
   `/sede/<Naco>/queue` y lo ve aparecer en la lista sin recargar.
3. **Cobrar** — `admin.naco` cobra una venta libre en efectivo en
   `/sede/<Naco>/checkout` (abre caja primero si hace falta) y verifica
   "Cobro registrado.".
4. **Cerrar caja** — `admin.naco` abre caja si hace falta y la cierra en
   `/sede/<Naco>/register`, verificando que la pantalla de cierre muestra
   esperado/contado/descuadre.

**Decisión técnica no explícita en el backlog:** varios formularios de F2
(`booking-wizard.tsx`, `queue-realtime-list.tsx`, `checkout-form.tsx`,
`cash-register-panel.tsx`) usan `<FormField label="X"><Input/></FormField>`
sin pasar `htmlFor` a `FormField`, así que el `<label>` no queda asociado
programáticamente con su `<input>` (son hermanos en el DOM, no
`for`/`id`) — es una brecha real de accesibilidad (un lector de pantalla no
anuncia el campo correctamente), no un problema de los tests. Arreglarla
tocaría ~8 componentes de UI existentes, fuera del alcance de F2-25 (tarea
de testing y cierre, no de features/UI). Se documenta aquí como deuda
técnica de accesibilidad para una tarea futura; mientras tanto los E2E usan
un locator propio (`fieldInput()` en `e2e/helpers.ts`) que ubica el input
por el texto del `<label>` hermano.

**Test de concurrencia real de doble-booking**
(`src/lib/actions/__tests__/public-booking.concurrency.test.ts`, Vitest,
contra la DB real — `vitest.setup.ts` ahora carga `.env.local`): dos
inserts **verdaderamente simultáneos** (dos conexiones postgres.js
independientes, no el cliente `max: 1` de la app, que serializaría los dos
intentos sobre la misma conexión y no ejercitaría una condición de carrera
real) contra el mismo barbero y el mismo rango horario. Resultado: exactamente
uno de los dos gana; el otro es rechazado por Postgres con código `23P01`
(`exclusion_violation`, disparado por `appointments_no_overlap_per_barber`
de `0002_f2_integrity.sql`) — la autoridad real es la base de datos, tal
como exige la regla dura §3.7c y el AC de F2-01. Un segundo test, más
simple, llama `createPublicBookingAction` dos veces para el mismo slot y
confirma que el segundo intento recibe el mensaje en español ("Ese horario
acaba de ocuparse...") en vez de un stack trace o un colgado.

**AC de F2-04 medido, no solo declarado** (`scripts/measure-availability-roundtrips.ts`,
instrumentación de diagnóstico en `src/lib/db/client.ts` gateada por
`DEBUG_DB_ROUNDTRIPS=1`, sin efecto en producción/tests normales): correr
`getAvailability` para un día completo de la sede Naco contra la DB real
dispara **8 round-trips** (sede, barberos activos, servicio, override de
precio/duración, schedules, barber_services, time_off, citas activas del
rango), no ≤3 como pedía el AC original de F2-04. **Se documenta como deuda
técnica, no se optimiza en esta tarea:** F2-25 es de testing y cierre, no de
features; colapsar 8 queries en ≤3 exigiría SQL a mano con joins/CTEs
(viable — la mayoría son `select` independientes que podrían unirse — pero
es un cambio de la lógica interna de `lib/scheduling/availability.ts`, fuera
del alcance que se me asignó explícitamente ("no toques la lógica de negocio
de ningún Server Action"), y no bloquea ningún AC de UX medido (LCP de
`/don-bigote` y el wizard siguen dentro de los tiempos del PRD §15 en la
práctica). Queda para una tarea futura de performance si el piloto lo pide.

**Confirmado sin tocar nada** (ya estaban en verde al cierre de la sesión
anterior): 100% de cobertura en `lib/scheduling` (módulo puro:
`index.ts` + `appointment-state.ts` + `effective-service.ts` — `agenda.ts` y
`availability.ts` son la capa de lectura con DB, fuera del requisito de 100%
del PRD §15 por diseño), cobertura completa de `lib/queue` y `lib/pos`. La
máquina de estados de citas (`appointment-state.ts`,
`resolveAppointmentTransition`) y de la fila (`queue/index.ts`,
`isValidQueueTransition`) ya eran módulos puros 100% testeados desde los
bloques B y D — no hizo falta escribir tests nuevos para ese punto del AC,
solo confirmarlo.

**Riesgos abiertos que quedan para después de F2:**
- La deuda de accesibilidad de `FormField`/`htmlFor` (arriba) no es
  bloqueante para el piloto pero sí para una auditoría de accesibilidad
  real.
- El número real de round-trips de `getAvailability` (8, no ≤3) queda como
  deuda técnica documentada; no se midió su impacto real en latencia
  percibida contra el proyecto Supabase de producción bajo carga.
- Los 2 bugs de esta sesión (deadlock de auditoría, Zod UUID) sugieren que
  **ningún Server Action de dinero de F2 se había ejecutado nunca de
  extremo a extremo contra la DB real antes de esta sesión** — vale la pena
  que el equipo revise si hay más caminos (los que no cubren estos 4 E2E,
  ej. F2-14 cancelar cita de cliente, F2-22 anular venta, F2-09
  reprogramar/reasignar) que puedan tener bugs similares sin descubrir. No
  se auditaron exhaustivamente todos los caminos en esta sesión por tiempo.
- El spike de Cloudflare Workers (F2-00) fue validado en su momento contra
  un build sin estos dos fixes; no se redesplegó ni se reverificó en Workers
  real dentro de esta sesión — el próximo deploy a Cloudflare debería
  confirmar que el fix del deadlock también aplica ahí (el pool `max: 1` es
  precisamente la configuración pensada para ese runtime, así que el bug
  habría sido igual de grave o peor en producción).

**F2 queda formalmente cerrada** con este bloque: los 8 puntos de la
Definición de Done (`BACKLOG-F2.md` §7) están cubiertos por evidencia
automatizada (Vitest + Playwright) más el build limpio, no solo por
verificación manual.

## Pendiente a futuro (no es F2/F3, anotar para no olvidar)

- **Landing page de marketing** para promocionar Kortex como servicio (no la
  plataforma en sí): una página donde un dueño de barbería que no es cliente
  todavía pueda conocer el producto y ver una vista previa de lo que ofrece.
  Williams pidió explícitamente dejarlo para cuando el producto esté listo
  (post-MVP). Cuando se retome, probablemente conviene usar de nuevo
  `brand-strategist`/`graphic-designer` (ya tienen el brand brief) más un
  `copywriter` para el texto de venta.

## 2026-09-17 — Cierre de sesión F2: fix de build + deploy privado

Tras integrar los 4 bloques de F2 (agenda, reserva pública, fila realtime,
caja/checkout) y el seed extendido (F2-24), se corrió por primera vez
`npm run build` completo (los agentes de cada bloque solo habían corrido
typecheck/lint/test para ahorrar tiempo). Encontró un bug real que ningún
otro chequeo detecta:

- **Bug de build:** `src/lib/actions/checkout.ts` (`"use server"`) exportaba
  tres funciones sincronas puras (`centsFromDecimalString`,
  `decimalStringFromCents`, `assertManagerRole`). Next.js exige que **toda**
  funcion exportada de un modulo `"use server"` sea async (se trata como
  Server Action invocable) — `next build` fallaba con "Server Actions must
  be async functions". Se movieron las tres a
  `src/lib/actions/money-utils.ts` (sin `"use server"`), sin cambiar su
  logica. Lección para el equipo: correr `npm run build` completo antes de
  dar un bloque por cerrado, no solo typecheck/lint/test.
- Build de las 32 rutas verificado en verde tras el fix.

**Estado real de F2 al cierre de esta sesión** (ver detalle por bloque más
abajo en este changelog):
- ✅ Bloque A (fundación: migraciones, `lib/scheduling`/`queue`/`pos`)
- ✅ Bloque B (agenda real de sede — F2-04..09)
- ✅ Bloque C (reserva pública funcional — F2-10..14)
- ✅ Bloque D (La Fila con Supabase Realtime — F2-16..18)
- ✅ Bloque E (checkout/cobro y caja — F2-20..23)
- ✅ F2-24 (seed extendido con un día operativo en Naco, verificado contra
  Supabase real: 8 citas, 3 turnos en fila, caja de ayer cerrada + hoy
  abierta, 5 ventas)
- ⏸️ **F2-25 (Playwright E2E) NO se hizo** — los 4 flujos críticos (reservar,
  dar turno, cobrar, cerrar caja) están implementados y verificados
  manualmente/por build, pero sin la suite E2E automatizada que pide el
  backlog. Configurar Playwright y escribir esos 4 tests queda como primera
  tarea pendiente de la próxima sesión.
- ⏸️ Test de concurrencia real de doble-booking (dos inserts simultáneos
  contra el mismo slot) no se corrió contra la DB real — el `EXCLUDE`
  constraint está aplicado y se confía en él, pero no hay una prueba
  automatizada que lo ejercite bajo concurrencia real.
- ⏸️ AC de "≤3 round-trips" de F2-04 (capa de lectura de disponibilidad) no
  se midió empíricamente.

**Deploy:** redesplegado a Cloudflare con todo F2 integrado, pero con
`workers_dev: false` (ver `wrangler.jsonc`) — el Worker existe en la cuenta
para poder redesplegar rápido, pero sin ruta pública en `*.workers.dev`
hasta que el dominio real esté listo. Activar temporalmente: poner
`workers_dev: true`, `npm run deploy`, revisar, volver a `false` y
redesplegar.

## 2026-09-17 — F2 Bloque F: seed con dia operativo (F2-24)

Extiende `src/lib/db/seed.ts` (`npm run db:seed`) con un dia operativo real
para la sede Naco, siguiendo el mismo patron de idempotencia del resto del
archivo (UUIDs fijos + `onConflictDoUpdate`). No se toco ninguna migracion,
schema ni Server Action.

**Agregado, todo anclado a `now` (nunca a fecha/hora fija, regla dura §3.9):**
- **8 citas de hoy** en Naco, repartidas entre los 3 barberos de esa sede
  (`barbero1`, `barbero2`, y el barbero multi-sede `barbero3`): 3
  `confirmed` (empiezan despues de `now`), 2 `in_progress` (`now` cae dentro
  de `[starts_at, ends_at)`, para el KPI de sillas ocupadas) y 3 `completed`
  (ya terminaron, con `price_at_booking` congelado, para el KPI de ingreso
  del dia — `getLocationDayKpis` lee `appointments`, no `sales`). Los rangos
  por barbero no se solapan (respeta el `EXCLUDE` de `0002_f2_integrity.sql`).
- **3 turnos en `walk_in_queue`** en estado `waiting` para Naco, `joined_at`
  escalonado (-15/-10/-5 min de `now`) con `position` 1..3, uno con
  `preferred_barber_id`.
- **1 `cash_session` de hoy abierta** en Naco (`closed_at = null`) y **1 de
  ayer ya cerrada**, con `expected_cash`/`counted_cash`/`difference`
  calculados a mano en centavos-como-string (nunca `Number` en el monto
  persistido): apertura RD$2000.00 + RD$1287.50 en ventas `cash` de ayer =
  esperado RD$3287.50, contado RD$3280.00, descuadre de -RD$7.50 (para que
  el cierre tenga algo real que reconciliar).
- **5 `sales` de ayer** (efectivo x3, tarjeta x1, transferencia x1) con su
  `sale_item` cada una, todas `status = 'paid'` contra la caja de ayer ya
  cerrada, sin `appointment_id` (ventas libres de mostrador, permitido por la
  tarea). Una de ellas con descuento (`discount_reason` obligatorio, D-F2-10).

**Bug de idempotencia pre-existente corregido en `seedSchedules` (mismo
archivo, tocado porque F2-24 lo necesitaba):** el chequeo de "ya sembrado"
consultaba si el usuario tenia *alguna* fila en `schedules` en cada iteracion
del loop de dias, asi que tras insertar el primer dia el resto se saltaba
silenciosamente — en la practica, el barbero multi-sede (`barbero3`) solo
terminaba con **un** bloque (lunes en Naco) en vez de lun-mie Naco / jue-sab
Bella Vista. Se cambio el chequeo a la fila exacta
`(user_id, location_id, day_of_week)`: sigue siendo idempotente corrida a
corrida y ademas autorepara una base ya afectada por el bug viejo (verificado
contra el proyecto Supabase real: antes de este fix `barbero3` tenia 1 fila,
despues de correr el seed dos veces tiene las 6 correctas, sin duplicar).
De paso se completaron los horarios de `barbero1` y `barbero2` (Naco,
lun-sab) — no tenian **ninguno** sembrado, asi que nunca aparecian como
columna en la rejilla de agenda de F2-06 (que lee `schedules` para saber que
barberos tienen turno ese dia); sin esto, las citas de hoy que este seed les
asigna quedarian huerfanas de columna.

**Verificado contra el proyecto Supabase real de `.env.local`, no solo
localmente:** `npm run db:seed` corrido dos veces seguidas no duplica
ninguna fila (chequeado con `count(*)` agrupado por fila logica en
`appointments`, `walk_in_queue`, `cash_sessions`, `sales`, `sale_items` y
`schedules`) ni falla. `typecheck`, `lint` y `test` en verde.

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
