# BACKLOG F3 — Kortex · Fase 3 (Dinero e insight: El Corte, Vista Cadena, suscripción)

**Proyecto:** Kortex — SaaS de gestión operativa multi-sede para cadenas de barberías (W-Tech)
**Documento:** backlog técnico de Fase 3 · v1.0 · 18 sep 2026
**Fuente de verdad de producto:** `PRD-BarberShop.md` (aprobado). Este backlog extrae y
congela lo necesario para F3; **el desarrollador no necesita leer el PRD completo para
ejecutar esta fase**. Si algo no está en este documento, no es F3.
**Documentos previos:** `BACKLOG-BACKEND.md` (Sprint 1) y `BACKLOG-F2.md` (Fase 2), ambos
ya ejecutados y vigentes como contrato de esquema, de seguridad y de convenciones.
`CHANGELOG.md` describe el estado real del repo, incluidos **cuatro bugs reales de
producción** cuyos patrones esta fase no puede repetir (ver §3).
**Autoridad:** las decisiones de producto de este documento las toma el PM. El
desarrollador decide el *cómo* técnico; no decide *qué* se construye, ni renombra
columnas, ni amplía alcance por su cuenta. Cualquier ambigüedad se escala al PM, no se
asume. En una fase que calcula la nómina de terceros, **asumir es el error más caro
posible**.

---

## 1. Alcance de F3 (resumen)

Sprint 1 dejó el sistema sabiendo **quién eres y a qué sede puedes entrar**. F2 hizo que
**una sede pueda operar un día real completo** (agenda, reserva pública, fila en vivo,
cobro, cuadre de caja). F3 convierte esa operación en **dinero e insight**:

1. **El Corte** — al cerrar la quincena, Kortex dice **exactamente** cuánto se le debe a
   cada barbero, desglosado por sede, calculado sobre lo que realmente se cobró, con
   aprobación humana obligatoria antes de marcarse pagado, y todo auditado. Esto es lo que
   hoy se hace en Excel en 2-4 horas con errores y reclamos (PRD §2.1, §12.1).
2. **Vista Cadena + Tabla de Posiciones** — Ramón abre el teléfono a las 9pm y ve sus
   sedes comparadas por ingreso, ticket, ocupación e **ingreso por silla**, con drill-down
   a cualquier sede. Deja de pedir fotos de cuadernos por WhatsApp.
3. **Tu plan** — la cadena tiene una suscripción a Kortex con estado, prueba de 21 días y
   control de acceso; el cobro real por pasarela **no** entra (ver D-F3-16).

En términos del PRD: **F3 del roadmap §11** y las features **1.13, 1.14, 1.18 y 1.19** de
§8.1, más la parte de §5.4 (A, B, C y D) que no dependen de fase 2. Cubre los criterios de
aceptación del MVP **§16.8 y §16.9**, y el §16.12 de forma **parcial y declarada** (el
acceso se restringe al vencer; el cobro automático no se implementa — D-F3-16).

**Advertencia de producto que el equipo debe tener presente desde el primer día:** el
roadmap §11 llama a F3 "MVP vendible". **Eso era cierto asumiendo que F1 parte 2 estaba
completo, y no lo está.** Al cerrar F3 seguirán faltando, para poder vender de verdad:
(a) las pantallas CRUD de sedes/equipo/servicios/horarios y el onboarding (PRD 1.1/1.2/
1.4/1.5/1.6 — hoy placeholders, riesgo F de `BACKLOG-F2.md`), y (b) el email transaccional
(PRD 1.16, criterio §16.10). Ambos se reasignan formalmente a **F4** (ver D-F3-19 y riesgo
A de §9). F3 entrega el **valor diferenciador** del producto; no entrega todavía un
producto que un desconocido pueda configurar solo.

---

## 2. Punto de partida — qué ya existe y se reutiliza (no reinventar)

Verificado contra el repo el 18 sep 2026. **Nada de esta lista se rehace.**

| Pieza | Dónde vive | Cómo se usa en F3 |
|---|---|---|
| Tablas de comisiones y pago | `src/lib/db/schema/money.ts` — `commissionRules`, `payoutPeriods`, `payoutLines` | Se consumen **tal cual**, columnas literales del PRD §10. Cero columnas nuevas (§5) |
| Tabla de agregados | `src/lib/db/schema/platform.ts` — `locationDailyMetrics`, con único `(location_id, date)` | Base de la Tabla de Posiciones. El índice único ya permite el `upsert` idempotente de D-F3-12 |
| Suscripción | `src/lib/db/schema/platform.ts` — `subscriptions` (único por `chain_id`), enums `subscription_plan`/`subscription_status`/`billing_cycle` | Se consume tal cual. El seed ya crea una fila `trialing`, plan `chain`, 3 sedes incluidas |
| Override de regla por barbero-sede | `src/lib/db/schema/core.ts` — `barberLocations.commissionRuleId` | **Es el único mecanismo de "comisión distinta por sede"** (PRD §5.2). Ver D-F3-3 |
| RLS de las 5 tablas de F3 | `0001_rls_policies.sql` — `commission_rules`, `payout_periods`, `payout_lines` (por join a `payout_periods`), `location_daily_metrics` (por join a `locations`), `subscriptions` | **Ya están aisladas por `chain_id`. No se escriben policies nuevas de tenant en F3** (verificado línea por línea) |
| Módulo puro de venta | `src/lib/pos/index.ts` — `computeSaleTotals`, `roundHalfToEven` | `lib/commissions` es su **módulo hermano** y **importa `roundHalfToEven` de aquí** (D-F3-20). `lib/pos` **no se toca** |
| Conversión dinero ↔ `numeric(12,2)` | `src/lib/actions/money-utils.ts` — `centsFromDecimalString`, `decimalStringFromCents`, `assertManagerRole` | Único camino autorizado para entrar/salir de la DB con montos. Sin `Number(x)*100` en ningún lado |
| Guards de ámbito | `src/lib/auth/guards.ts` — `requireChainScope`, `requireLocationScope`, `requireBarberScope`, `requireClientScope` | **Obligatorio** al inicio de toda Server Action y todo layout. No se crean guards nuevos de ámbito (el gate de suscripción de F3-17 es una capa **adicional**, no un reemplazo) |
| Convención de Server Actions | `src/types/action-result.ts` (`ActionResult<T>`, `actionOk`, `actionError`) | Patrón obligatorio: Zod → guard → transacción → `ActionResult` |
| Auditoría | `src/lib/auth/audit.ts` — `writeAuditLog(payload, executor?)` | Obligatoria en **todo** el ciclo del período y en todo cambio de regla de pago. El 2º parámetro (`tx`) **no es opcional en la práctica** dentro de una transacción (§3.2) |
| Validación de UUID | `src/lib/validation/id.ts` — `zUuid` | **Obligatorio.** `z.string().uuid()` de Zod v4 rechaza los IDs del seed (bug real de F2-25) |
| Tabla de datos densa | `src/components/ui/data-table.tsx` — `DataTableColumn` con `type: money/number/percent/delta`, `trend`, `isDeviated`, `stickyFirstColumn`, `onRowClick` | **Es exactamente el componente de la Tabla de Posiciones y de El Corte.** Ya trae orden por columna, alineación monoespaciada tabular y borde de desviación. No se construye otra tabla |
| Componentes de dinero/tendencia | `src/components/kortex/money-display.tsx`, `trend-indicator.tsx` | KPI hero, celdas de monto y la columna Δ con flecha y semáforo |
| Banner de ámbito | `src/components/kortex/scope-banner.tsx` — variantes `readonly-visit`, `offline`, `trial-ending` | `readonly-visit` es el drill-down de D-F3-15; `trial-ending` es el aviso de suscripción de F3-17. **Las tres variantes ya existen** |
| Pantalla de sede completa | `src/app/(location)/sede/[locationId]/today` y hermanas | El drill-down del superuser **reutiliza estas pantallas con un banner**. No se duplica ni una |
| Rutas de `(chain)` | `src/app/(chain)/{overview,compare,commissions,billing,...}/page.tsx` + `layout.tsx` con `requireChainScope()` | Existen como placeholders con el guard ya puesto. F3 les pone contenido, no las crea |
| Seed idempotente | `src/lib/db/seed.ts`, `npm run db:seed` — ya crea 1 regla de comisión (`percentage` 50%, `applies_to='chain'`) y 1 suscripción `trialing` | Se **extiende** en F3-01, no se reescribe |
| Playwright | `playwright.config.ts`, `e2e/*.spec.ts` (6 specs), `e2e/helpers.ts` (`fieldInput()`) | F3 agrega el 4º flujo crítico del PRD §15: **cerrar período** |

**Lo que ya se sabe que NO existe y F3 no puede asumir:**
- No hay pantalla para **anular una venta** (`voidSaleAction` existe y funciona desde F2-22,
  pero ningún botón la invoca). Esto es material para F3: una venta anulada no debe pagar
  comisión, y hoy el gerente no tiene forma de anularla. Se corrige en **F3-09**.
- No hay venta de **productos** (D-F2-20), así que `product_revenue` y
  `product_commission_pct` van a dar **0** en todo el piloto. El motor los implementa igual
  (la columna existe y el día que entre inventario debe funcionar), pero no se construye UI.
- No hay **job programado** de ninguna clase (ni Supabase Cron ni Trigger.dev configurados).
  Ver D-F3-12.
- No hay **pasarela de pago** integrada ni decisión tomada sobre cuál (PRD D11 sigue
  abierta). Ver D-F3-16.

---

## 3. Reglas NO NEGOCIABLES de F3

Las 10 reglas de `BACKLOG-BACKEND.md` §3 y las 12 de `BACKLOG-F2.md` §3 siguen vigentes.
Estas se suman y son específicas de esta fase. Violarlas es motivo de rechazo del PR.

1. **El dinero se calcula en centavos enteros, en el servidor, y nunca en punto flotante.**
   Todo monto entra al módulo puro como entero de centavos y sale como entero de centavos;
   la conversión a `numeric(12,2)` ocurre **solo** en el borde de la DB, con
   `decimalStringFromCents`/`centsFromDecimalString`. Un `parseFloat`, un `Number(x) * 100`
   o un `.toFixed()` sobre un monto en `lib/commissions` o en cualquier Server Action de
   dinero es motivo de rechazo automático (verificable con grep).

2. **Toda función auxiliar llamada dentro de una transacción recibe el ejecutor (`tx`)
   explícitamente.** Este es el bug de clase que ya apareció **dos veces** en producción
   (`writeAuditLog` en F2-25, `resolveEffectiveServiceFor` en la auditoría posterior): el
   pool es `max: 1` a propósito (Cloudflare Workers), así que una función que use el `db`
   singleton dentro de una transacción **se cuelga para siempre, sin error y sin log**. El
   ciclo del período es la operación multi-tabla más grande del producto: si una sola de sus
   funciones auxiliares olvida el `tx`, el cierre de quincena se cuelga en producción.
   Regla: **toda función nueva de F3 que toque la DB acepta el ejecutor Drizzle como
   parámetro** (no opcional por defecto en la firma interna), y se escribe un test que la
   ejercite **desde dentro** de una transacción real.

3. **Nunca se interpola un `Date` crudo dentro de un template `sql` de Drizzle.** Se
   interpola `date.toISOString()`. El `sql` de Drizzle no serializa `Date` y el driver
   lanza `ERR_INVALID_ARG_TYPE` envuelto en un "Failed query" genérico sin pista de la causa
   (bug real del 18 sep). F3 hace muchas consultas por rango de fechas: es exactamente el
   camino donde este bug reaparece.

4. **`zUuid` (de `src/lib/validation/id.ts`), nunca `z.string().uuid()`.** Zod v4 rechaza
   los UUIDs legibles del seed. Toda Server Action de F3 valida con `zUuid`.

5. **El cálculo del período es una sola transacción y es idempotente.** Calcular dos veces
   el mismo período produce exactamente el mismo resultado y **no** duplica líneas
   (`delete` + `insert` de las `payout_lines` de ese período dentro de la misma
   transacción, más el único de D-F3-9). Un fallo a mitad no puede dejar un período en
   `calculated` con líneas incompletas.

6. **Bloqueo explícito del período antes de calcular o aprobar.** `select ... for update`
   sobre la fila de `payout_periods` dentro de la transacción. Dos gerentes apretando
   "Calcular" a la vez es un caso real, y el resultado tiene que ser uno de los dos, nunca
   una mezcla.

7. **El invariante de cuadre se verifica en runtime, no solo en tests** (D-F3-11). Si la
   suma de las líneas no coincide **al centavo** con el ingreso del período, la transacción
   **aborta** con un error explícito y el período **no** queda `calculated`. Un cálculo
   dudoso que se guarda es peor que un cálculo que falla ruidosamente: el PRD §12.1 exige
   cero discrepancias, no "casi siempre bien".

8. **Toda operación del ciclo del período escribe `audit_log`:** creación, cálculo (cada
   recálculo), ajuste manual de una línea, aprobación, marcado como pagado, y todo cambio de
   `commission_rules` o de `barber_locations.commission_rule_id`. Sin `writeAuditLog(...,
   tx)` en el mismo camino, la tarea no está terminada. Es el requisito #1 de confianza de
   un dueño de cadena (PRD §10, nota de `audit_log`).

9. **Aprobación humana obligatoria antes de "pagado".** Ningún camino automático puede
   llevar un período a `approved` ni a `paid`. Es mitigación explícita del riesgo R2 del PRD.

10. **Un período `approved` o `paid` es inmutable.** No se recalcula, no se edita, no se
    reabre — **nunca, por ningún camino, ni siquiera por el superuser**. Las correcciones
    van como `adjustments` en el período siguiente (D-F3-9). Un número que el barbero ya vio
    y firmó no puede cambiar a sus espaldas; ese es el único activo de confianza que tiene
    este módulo.

11. **`lib/commissions` es un módulo puro con cobertura 100%** (PRD §15 lo exige por
    nombre, junto a `lib/scheduling`): recibe datos ya cargados, devuelve datos; no importa
    `db`, ni `next/*`, ni `Date.now()`, ni la zona horaria del proceso. Las fechas entran
    ya resueltas por la capa de lectura. `lib/metrics` y `lib/billing` siguen el mismo
    patrón, con cobertura completa (no se exige el 100% estricto de `lib/commissions`).

12. **La Tabla de Posiciones no se calcula en vivo sobre `sales` para rangos históricos**
    (PRD §10, nota de `location_daily_metrics`; §15, P95 < 2s). Ver D-F3-12.

13. **Ningún dato de otra cadena, nunca — y ningún dato de otra sede para un `admin`.**
    El `chain_id` sale siempre del guard. Un `admin` de Naco no puede ver la línea de pago de
    un barbero de Bella Vista ni la fila de Bella Vista en ninguna tabla comparativa
    (D-F3-18). Se re-verifica en F3-20.

14. **Migraciones solo las de §5.** Cero columnas nuevas, cero renombres. Si una feature
    parece exigir una columna que no existe, **se para y se escala al PM** — en F3 esto pasó
    ya dos veces en la fase de análisis (ver D-F3-4 y D-F3-7) y en ambos casos la respuesta
    del PM fue *recortar el alcance*, no inventar la columna.

15. **Sin dependencias nuevas.** La analítica se dibuja con los componentes existentes y
    CSS. **Recharts está permitido por el PRD §9.2 pero no se adopta en F3** (D-F3-14): la
    Tabla de Posiciones es una tabla, no un gráfico, y el wireframe §4.1 no tiene ni un
    gráfico. Ningún paquete de fechas nuevo: se usa lo que ya usa `lib/scheduling`.

---

## 4. Decisiones de producto de F3 (el PRD las dejaba abiertas)

Numeradas D-F3-*, en la misma línea que D-S1-1..6 y D-F2-1..20. **El desarrollador no
decide ninguna de estas; ya están decididas.**

### Motor de comisiones

**D-F3-1 · La fuente de verdad del cálculo es lo cobrado, no lo agendado.**
La base del cálculo son las filas de **`sale_items`** de ventas con
`sales.status = 'paid'` (las `refunded` se excluyen por completo; las `open` no deberían
existir y si existen bloquean la aprobación, D-F3-10). La atribución del servicio es
`sale_items.barber_id` (**por línea**, nunca `sales.barber_id`), y la sede es
`sales.location_id`. `appointments` **no** participa del cálculo de comisión.
*Motivo: la comisión se paga sobre dinero que entró a la caja. Una cita `completed` que
nunca se cobró no genera pago, y un walk-in cobrado sí — y `sales` es el único lugar donde
ambos convergen. Además `sale_items.barber_id` es la única verdad cuando un ticket tiene
el corte de uno y la barba de otro (D-F2-12).*

**D-F3-2 · El período de pago es la quincena calendario, a nivel cadena.**
Dos períodos por mes: **1–15** y **16–fin de mes** (`payout_periods.starts_on` /
`ends_on`, ambos **inclusive**). Un período abarca **toda la cadena**, con una línea por
**barbero y por sede** (`payout_lines`, tal como exige PRD §10). La pertenencia de una
venta al período se decide convirtiendo `sales.created_at` a la **zona horaria de la
sede** (`locations.timezone`) y comparando la fecha resultante contra el rango — no la tz
del servidor ni la de la cadena.
*Motivo: "quincena" es el vocabulario real del gremio y es el nombre del producto (Corte
de Quincena, brand brief §4). Un cobro a las 11:30pm pertenece al día operativo de la sede
donde ocurrió, y en el momento en que la cadena abra una sede fuera de RD esa regla tiene
que estar ya escrita.*
*Nota: no se ofrece período semanal ni mensual configurable en F3. Si un piloto lo pide, se
escala al PM — el esquema lo soporta (son solo dos `date`), pero la UI y el naming no.*

**D-F3-3 · Resolución de la regla de pago: dos niveles, determinista, sin default
silencioso.**
Para cada par (barbero, sede) se resuelve en este orden:
1. `barber_locations.commission_rule_id` de esa fila exacta (barbero + sede) — es el
   **override por sede** que pide PRD §5.2 ("50% en su sede primaria, 60% cuando cubre").
2. La regla **default de la cadena**: la única fila de `commission_rules` con
   `applies_to = 'chain'` para ese `chain_id` (unicidad garantizada por índice, §5).

Si no hay ninguna de las dos, el cálculo **falla con un error que nombra al barbero y la
sede** ("Jandy R. no tiene regla de pago en Bella Vista") y el período no queda
`calculated`. **Prohibido asumir 0%, 50% ni ningún default implícito.**
`applies_to = 'location'` **no se usa en F3** y la UI de Reglas de Pago no lo ofrece: el
PRD §10 no define ninguna columna `location_id` en `commission_rules`, así que una regla
"de sede" no es expresable sin inventar esquema. El caso de uso real ("esta sede paga
distinto") se cubre asignando el override en `barber_locations` a los barberos de esa sede.
*Motivo: un motor de nómina que adivina es un motor que produce reclamos. Fallar ruidoso
con el nombre propio del barbero es exactamente lo que un gerente puede resolver en 30
segundos.*

**D-F3-4 · Tipos de regla soportados en F3: `percentage`, `booth_rent`, `hybrid`.**
`fixed_per_service` (monto fijo por servicio) **queda deshabilitado en la UI y rechazado por
el motor con un mensaje explícito**. Motivo: el PRD §10 define el enum con ese valor pero
**no define ninguna columna donde guardar el monto fijo**; implementarlo exigiría inventar
una columna, y la feature 1.13 del PRD nombra literalmente los otros cuatro conceptos
("% por servicio, % por producto, silla fija, mixto"), que sí quedan cubiertos por
`percentage` + `product_commission_pct` + `booth_rent` + `hybrid`. Se escala al PM como
candidato a migración de F4 **solo si un piloto real lo pide**.

**D-F3-5 · La base de comisión es el ingreso de servicios neto de descuento, sin propina,
prorrateado por línea.**
El descuento vive a nivel de venta (`sales.discount_amount`) pero la comisión se calcula por
línea y por barbero, así que el descuento **se prorratea entre las líneas de servicio en
proporción a su `line_total`**:

```
baseLínea = lineTotal - roundHalfToEven(descuentoVenta * lineTotal, subtotalVenta)
```

El **residuo de centavos** (la diferencia entre el descuento de la venta y la suma de los
descuentos prorrateados) se asigna íntegro a la línea de **mayor `line_total`**; desempate:
la primera línea por orden de creación. Así la suma de las bases de las líneas es **igual al
centavo** a `subtotal - discount_amount` de la venta, siempre.
La propina **nunca** entra en la base de comisión (se paga aparte, D-F3-7). Los impuestos no
existen en el modelo (PRD §8.4: Kortex no hace nómina fiscal).
*Motivo: sin una regla explícita de prorrateo y de residuo, dos implementaciones razonables
dan números distintos por 1 centavo, y ese centavo es exactamente la "discrepancia" que el
PRD §12.1 declara innegociable.*

**D-F3-6 · Qué escribe cada tipo de regla en `payout_lines`, y la fórmula del neto.**
Columnas (todas ya existentes): `services_count`, `services_revenue`, `product_revenue`,
`commission_amount`, `booth_rent_deducted`, `tips_amount`, `adjustments`, `net_payable`.

- `services_count` = cantidad de líneas de servicio (sumando `quantity`) de ese barbero en
  esa sede en el período.
- `services_revenue` = suma de las **bases netas de descuento** de D-F3-5. *(Esta columna
  representa lo que el barbero produjo, no lo que se le paga.)*
- `product_revenue` = 0 en todo F3 (no hay venta de producto, D-F2-20). El motor lo calcula
  igual si algún día hay líneas `type = 'product'`.
- Por tipo de regla:
  - **`percentage`**: `commission_amount = pct(service_commission_pct) × services_revenue`
    (+ `pct(product_commission_pct) × product_revenue`). `booth_rent_deducted = 0`.
  - **`booth_rent`**: `commission_amount = services_revenue` (el barbero se queda con el
    100% de lo que produjo, porque la barbería cobró en su nombre) y
    `booth_rent_deducted = ` la renta imputada del período (D-F3-8).
  - **`hybrid`**: `commission_amount` como en `percentage` **y** `booth_rent_deducted` como
    en `booth_rent`. Es el caso "comisión menor + renta menor".
- `tips_amount` = propinas atribuidas (D-F3-7).
- `adjustments` = ajustes manuales del período, default 0 (D-F3-9).
- **`net_payable = commission_amount + tips_amount + adjustments - booth_rent_deducted`.**
  Puede dar **negativo** (un barbero de silla fija que produjo menos que su renta): se
  guarda negativo, se muestra en rojo con el copy *"debe RD$X a la barbería"*, y **no** se
  trunca a cero. Truncarlo escondería una deuda real.

*Nota sobre el wireframe `UX-BRIEF-Kortex.md` §4.5: los números de la fila de ejemplo de
"Pedro R." (silla fija) no cuadran con ninguna fórmula consistente — son ilustrativos. La
fórmula normativa es la de arriba, y la columna "COMIS." de esa fila muestra un guion
porque en silla fija no hay porcentaje, no porque `commission_amount` sea 0 en la DB.*

**D-F3-7 · Propinas: solo `barber_keeps_all` en F3; atribución íntegra a `sales.barber_id`.**
`tips_amount` de una línea = suma de `sales.tip_amount` de las ventas del período donde
`sales.barber_id` es ese barbero y `sales.location_id` esa sede. **La propina no se
prorratea entre líneas** (el esquema la guarda a nivel de venta y `sales.barber_id` ya se
fija de forma determinista por D-F2-12).
`tip_handling = 'split_pct'` **queda fuera de F3**: el PRD §10 no define ninguna columna con
el porcentaje de reparto, así que no es expresable sin inventar esquema. La UI de Reglas de
Pago ofrece únicamente `barber_keeps_all` (y lo asume si la columna es `null`). Se escala al
PM si un piloto reparte propinas de verdad.
*Motivo: es el tratamiento dominante en RD (PRD §17 pregunta 5 sigue sin respuesta de F0) y
es el único que el esquema permite calcular sin ambigüedad.*

**D-F3-8 · Imputación del alquiler de silla, por frecuencia, explicable en una frase.**
`booth_rent_amount` con `booth_rent_frequency`:
- **`biweekly`** → se imputa **íntegro, una vez por período** (el período *es* la quincena).
- **`monthly`** → se imputa **la mitad en cada quincena del mes**; el centavo residual de
  una división impar va en la **segunda** quincena. Copy: *"tu renta mensual se cobra mitad
  y mitad"*.
- **`weekly`** → se imputa `booth_rent_amount × (cantidad de lunes dentro del período)`. En
  una quincena caen 2 o 3 lunes, y a lo largo de un año suman exactamente 52 semanas. Copy:
  *"se cobra una semana por cada lunes de la quincena"*.
- `booth_rent_frequency` nulo con tipo `booth_rent`/`hybrid` → **error bloqueante**, no se
  asume ninguna frecuencia.
*Motivo: el criterio del brand brief aplicado al dinero — si el gerente no puede
explicárselo al barbero en una frase de pie en el local, la regla está mal. El prorrateo
diario (× días/7) daba números como "2.14 semanas" y es indefendible frente a un reclamo.*

**D-F3-9 · Ciclo de vida del período, quién puede qué, y la inmutabilidad.**
Estados del enum ya existente: `open → calculated → approved → paid`.
- **Crear** (`open`): solo `superuser`. Un período no puede solaparse con otro de la misma
  cadena (EXCLUDE de §5). Se puede crear por adelantado.
- **Calcular** (`open|calculated → calculated`): `superuser` **o** `admin` (la matriz §6.2
  dice que el admin "propone"). Es **recalculable tantas veces como haga falta** mientras no
  esté aprobado: borra e inserta las líneas en la misma transacción, sella `calculated_at`,
  y escribe `audit_log` **en cada recálculo** (no solo la primera vez).
- **Aprobar** (`calculated → approved`): **solo `superuser`** (matriz §6.2: el admin propone,
  no aprueba). Sella `approved_by`. **Bloqueada** si hay cualquier bloqueador de D-F3-10, y
  bloqueada si `ends_on` todavía no pasó en la tz de la cadena (no se aprueba una quincena
  que aún está corriendo; calcularla como vista previa sí se permite).
- **Marcar pagado** (`approved → paid`): solo `superuser`, acción explícita y separada. **No
  se añade columna `paid_at`/`paid_by`**: el sello queda en `audit_log`
  (`action = 'payout.mark_paid'`), mismo criterio que D-F2-8. Kortex **no mueve dinero**; el
  pago ocurre fuera (efectivo, transferencia) y este estado solo registra que ya ocurrió.
- **Inmutabilidad (regla dura §3.10):** desde `approved`, las líneas no cambian nunca. Una
  corrección posterior se registra como `adjustments` (positivo o negativo, con `notes`
  obligatoria) en el período **siguiente**, con `audit_log`. No existe "reabrir período".
- **Ajustes manuales:** solo `superuser`, solo sobre un período en `calculated`, monto +
  nota obligatoria, `audit_log` con `before`/`after`. **P1**: si el tiempo aprieta se corta,
  y se documenta que la única corrección disponible es recalcular.

**D-F3-10 · Los bloqueadores de aprobación son una lista cerrada y verificable.**
El wireframe §4.5 exige que el botón "Cerrar el corte" diga **por qué** no puede cerrarse
(regla UX §2.5: nunca un `disabled` mudo). Los bloqueadores son exactamente estos cuatro,
cada uno con su texto, su conteo y su enlace a la lista:
1. **Ventas sin cerrar:** alguna venta con `status = 'open'` en el rango. *(No debería
   existir por el flujo de un paso de F2-21; es red de seguridad.)*
2. **Cajas sin cuadrar:** alguna `cash_sessions` con `closed_at is null` cuya fecha de
   apertura cae en el rango. Una caja abierta todavía puede recibir ventas que cambiarían el
   cálculo.
3. **Descuentos sin motivo:** alguna venta del rango con `discount_amount > 0` y
   `discount_reason` nulo o vacío. Es literalmente el "ajuste pendiente" del wireframe.
4. **Barberos sin regla de pago:** algún par (barbero, sede) con ventas en el rango y sin
   regla resoluble (D-F3-3). *(Este además impide el cálculo, no solo la aprobación.)*
Ningún bloqueador es "ignorable con un check". Se resuelven y se recalcula.

**D-F3-11 · Invariante de cuadre al centavo, verificado en runtime.**
Antes de sellar `calculated`, dentro de la misma transacción:
`Σ payout_lines.services_revenue` (por sede) **debe ser exactamente igual** a
`Σ (subtotal - discount_amount)` de las ventas `paid` de esa sede en el período, y
`Σ payout_lines.tips_amount` exactamente igual a `Σ sales.tip_amount` de esas mismas ventas.
Si no cuadra: **la transacción aborta**, se escribe `audit_log`
(`payout.calculate_failed`, con las dos cifras en `after`) y el período **no** cambia de
estado. *Motivo: PRD §12.1 — exactitud 100%, cero discrepancias. Un centavo perdido en el
prorrateo es un bug que este chequeo detecta el mismo día en vez de en el reclamo del
barbero tres quincenas después.*

### Dashboard consolidado

**D-F3-12 · Agregados: materialización perezosa en `location_daily_metrics`, sin job
nocturno en F3.**
No se configura Supabase Cron ni Trigger.dev en esta fase. En su lugar:
- Un día **cerrado** (fecha estrictamente anterior a "hoy" en la tz de la sede) se lee de
  `location_daily_metrics`. Si la fila no existe, se **calcula en ese momento y se escribe**
  (`upsert` sobre el único `(location_id, date)` ya existente) antes de responder. Primera
  consulta lenta, todas las siguientes instantáneas.
- El **día en curso** se calcula siempre en vivo y **nunca** se persiste (cambia con cada
  cobro).
- Se agrega `npm run metrics:backfill -- --from=YYYY-MM-DD [--to=...]` para sembrar o
  reparar un rango completo de una vez (y para poder medir el P95 con datos reales).
- Se expone `recomputeLocationDailyMetrics(locationId, date, tx)` y **se invoca desde
  cualquier escritura que modifique un día ya cerrado**. Hoy no existe ninguna (F2-22 solo
  permite anular ventas del mismo día, con la caja abierta), pero la función queda lista y
  documentada como el único punto de reparación.
*Motivo: el PRD §10 exige pre-agregar ("no escala más allá de unas pocas cadenas") y §15
exige P95 < 2s, pero montar y operar un scheduler para 2 cadenas piloto es infraestructura
que nadie va a mantener. La materialización perezosa cumple ambos requisitos con cero piezas
nuevas de infraestructura y es trivialmente reemplazable por un cron real en F4 si el
volumen lo pide (el cron llamaría exactamente a la misma función).*

**D-F3-13 · Definición canónica de cada métrica. No hay dos definiciones de "ingreso".**
Estas definiciones son normativas para `location_daily_metrics` y para toda la UI de F3:
- **`revenue` (ingreso)** = `Σ (sales.subtotal - sales.discount_amount)` de las ventas
  `paid` de esa sede y ese día. **La propina NO cuenta como ingreso de la cadena** (es del
  barbero), y las `refunded` se excluyen.
- **`services_count`** = `Σ sale_items.quantity` de líneas `type = 'service'` de esas ventas.
- **`products_revenue`** = 0 en F3.
- **`avg_ticket` (ticket promedio)** = `revenue / (nº de ventas paid)`. Por venta, no por
  línea ni por servicio.
- **`unique_clients`** = clientes distintos con al menos una venta `paid` ese día.
  **`new_clients`** = de esos, los que tienen `clients.created_at` en ese mismo día.
- **`no_shows`** = citas de esa sede con `status = 'no_show'` cuyo `starts_at` cae ese día.
  La **tasa de no-show** = `no_shows / (citas del día en estado terminal: completed +
  no_show + cancelled)`.
- **`barber_hours`** = horas de `schedules` activos de esa sede ese día de la semana, menos
  el `time_off` aprobado que las solape.
- **`chair_utilization_pct` (ocupación)** =
  `minutos de servicio atendidos / (chairs_count × minutos de apertura de la sede ese día,
  según business_hours) × 100`, **topado a 100** (si se pasa, se guarda 100 y se marca el día
  como anómalo en el log — significa que hay más barberos que sillas o un horario mal
  configurado).
- **`RD$/silla` (ingreso por silla)** = `revenue del período / locations.chairs_count`.
  **Columna obligatoria y siempre visible** en la Tabla de Posiciones (PRD §5.4.B, UX §4.1:
  nunca detrás de un toggle).
- **`RD$/barbero-hora`** = `revenue del período / Σ barber_hours del período`.
- **Δ vs. período anterior** = contra el bloque **inmediatamente anterior del mismo número
  de días** (hoy vs. ayer; semana vs. semana pasada; rango de 12 días vs. los 12 días
  previos). Si el período anterior tiene `revenue = 0`, se muestra "—", nunca "+∞%".
- **Semáforo:** verde/rojo por el signo del Δ; **borde izquierdo de 2px en `--data-neg`**
  (no fondo completo, UX §4.1) en la fila de toda sede cuyo ingreso esté **más de 10% por
  debajo del promedio de la cadena** en ese período.

**D-F3-14 · Rangos del selector global y ausencia de gráficos.**
El selector de fecha de Vista Cadena es **Hoy / Semana / Mes / Rango custom** (UX §4.1), es
uno solo y controla KPIs y tabla a la vez; su estado viaja en `searchParams` validados con
Zod, para que la URL sea compartible y el botón atrás funcione. "Semana" = últimos 7 días
incluido hoy; "Mes" = últimos 30 días incluido hoy (no el mes calendario — es lo que Ramón
quiere comparar a las 9pm y evita el escalón del día 1). **No se dibuja ningún gráfico en
F3** (Recharts no se adopta): el wireframe §4.1 no tiene ninguno, y la tabla + los KPI cards
cubren el criterio §16.9.

**D-F3-15 · Drill-down "lectura+": una sola implementación de las pantallas de sede.**
Clic en una fila de la Tabla de Posiciones navega a `(location)/sede/[locationId]/today`
**tal cual la ve Kelvin**, con `ScopeBanner variant="readonly-visit"` fijo arriba y el copy
exacto de UX §5.1: *"Estás viendo Sede Naco como superuser (modo lectura+) · [Volver a
Vista Cadena]"*. **No se construye ninguna pantalla nueva ni se duplica ninguna existente.**
El banner se activa por un `searchParam` (`?desde=cadena`) validado con Zod y por el hecho
de que el guard devolvió `effectiveRole = "superuser"`.
**Los permisos de servidor NO cambian:** por la matriz §6.2 el superuser ya puede hacer todo
lo que hace el admin en cualquier sede, y F3 no inventa un "modo lectura estricta" que el
PRD no pide. El banner es contexto, no una capa de permisos. *(La etiqueta "Acción de
gerente — normalmente la hace Kelvin" que sugiere UX §5.1 sobre las acciones de escritura
queda como **P2**, fuera de F3: es un refinamiento de copy sobre ~10 botones.)*

### Suscripción y billing de Kortex

**D-F3-16 · F3 implementa el estado y el control de acceso; NO implementa el cobro.**
El PRD deja **D11 explícitamente abierta** ("evaluar Azul/CardNet vs. PayPal antes de
comprometerse", §9.2 y §18). **No se inventa ninguna integración de pago.**
Lo que sí entra en F3:
- `subscriptions` como fuente de verdad del plan, el estado y la prueba de 21 días.
- **Estado efectivo** derivado en el servidor (módulo puro `lib/billing`), no leído crudo:
  `trialing` con `trial_ends_at` futuro y `active` ⇒ **acceso normal**.
- **Vencimiento con gracia de 7 días.** Al vencer la prueba o entrar en `past_due`, el
  acceso pasa a **restringido**: se sigue pudiendo **operar** (agenda, reserva pública, La
  Fila, Cobrar, El Cuadre) y se **bloquea lo analítico y lo administrativo**
  (`(chain)/overview`, `/compare`, `/commissions`), con banner `trial-ending` persistente y
  el copy del brand brief.
- Pasados los 7 días de gracia, o con `status = 'cancelled'`: **bloqueo total** salvo
  `(chain)/billing` y `(auth)`. Excepción dura, sin negociación: **una caja abierta siempre
  se puede cerrar** y **una venta en curso siempre se puede cobrar** — cortarle el cobro a un
  local a media tarde por una factura vencida es la forma más rápida de que un cliente hable
  mal del producto para siempre, y no recupera un peso.
- `(chain)/billing` ("Tu plan") en **modo lectura**: plan, estado, días restantes de prueba,
  sedes usadas vs. incluidas, precio según §7.2, y un CTA de contacto directo por WhatsApp
  para cambiar de plan (venta consultiva, PRD §7.4 CAC). **Sin autoservicio de upgrade.**
- El cobro del piloto se hace **fuera de Kortex** (transferencia) y el estado se mueve con un
  script operativo documentado (`npm run billing:set-status`), no con una pantalla de
  administración interna de W-Tech (que sería un producto aparte).
`paypal_subscription_id` queda nulo y la columna no se toca. La decisión de pasarela se
mantiene **abierta y asignada a F4**, con los datos del piloto como insumo.

**D-F3-17 · Cupo de sedes por plan: la regla se implementa, el punto de aplicación puede
esperar.**
`lib/billing` expone `assertLocationQuota(chain, subscription, sedesActivas)` con la
aritmética de §7.2 (plan `local`: 1 incluida + máx. 2 extra; `chain`: 3 + ilimitadas;
`franchise`: 10 + ilimitadas), y `(chain)/billing` muestra "3 de 3 sedes incluidas · la
siguiente cuesta RD$2,500/mes". **El bloqueo efectivo al crear la sede N+1 (PRD 1.19) se
conecta cuando exista el CRUD de sedes** (F1 parte 2, reasignado a F4): hoy no hay ningún
camino de UI que cree una sede. Se entrega la función + sus tests, no un botón muerto.

### Transversales

**D-F3-18 · Quién ve qué del dinero (matriz §6.2, aplicada).**
- `superuser`: todo — todas las sedes, todos los barberos, todos los períodos, reglas,
  aprobación y marcado de pagado.
- `admin`: **solo su sede**. Ve las líneas de pago de los barberos de su sede (matriz: "ver
  comisiones de todo el equipo de su sede"), puede disparar el cálculo (propone), **no**
  aprueba, **no** ve la Tabla de Posiciones ni ninguna cifra de otra sede. Su vista vive en
  `(location)/sede/[locationId]/payouts` (ruta nueva, **P1**), **no** en `(chain)`, porque
  `(chain)` está bajo `requireChainScope()` = solo superuser.
- `barber`: **solo su propia línea**, en `(barber)/mi-silla` → "Lo mío". Nunca ve la de otro
  barbero ni el total de la sede.
- `client`: nada.
La "comparativa anónima para el admin" que la matriz §6.2 marca como opcional (👁) **no se
implementa en F3** — es opcional en el PRD y filtrar un ranking anonimizado correctamente
cuesta más de lo que aporta al piloto.

**D-F3-19 · El email transaccional (PRD 1.16) NO entra en F3. Trade-off explícito del PM.**
El roadmap §11 asigna a F3 exactamente cinco entregables: *"motor de comisiones, cierre de
período, dashboard consolidado, comparativa de sedes, suscripción y billing"*. El email
(confirmación, recordatorios 24h/2h, cancelación desde el email) es **P0 del MVP** y su
criterio §16.10 seguirá sin cumplirse al cerrar F3 — se reasigna a **F4**, junto con las
pantallas CRUD de F1 parte 2, como el bloque de "lo que falta para poder vender".
*Motivo del trade-off: F3 es la fase que entrega la razón de compra del producto (nadie
compra Kortex por los emails; lo compran porque el Excel de comisiones desaparece). Meter
Resend, plantillas, jobs de recordatorio y el token firmado de cancelación dentro de F3
diluye la fase y arriesga el único módulo donde un bug pierde al cliente para siempre.
Costo aceptado y documentado: F3 no cierra el MVP por sí sola.*

**D-F3-20 · Redondeo y unidad monetaria: una sola convención en todo el producto.**
Centavos enteros en todo cálculo; **banker's rounding (round-half-to-even)** en toda
división, reutilizando `roundHalfToEven` **importado de `@/lib/pos`** (ambos son módulos
puros, y `lib/pos` ya tiene ese helper al 100% de cobertura). **No se duplica la función, no
se refactoriza `lib/pos` a un `lib/money` compartido, y no se toca `lib/pos`.** Los
porcentajes de `commission_rules` son `numeric(5,2)`: se convierten a **puntos básicos
enteros** (`pct × 100`, ej. 57.50% → 5750) antes de entrar al módulo puro, y el cálculo es
`roundHalfToEven(base × bps, 10000)`. Nunca se multiplica un monto por un `Number` decimal.

---

## 5. Migraciones nuevas autorizadas (y solo estas)

Se versionan a mano en `src/lib/db/migrations/`, siguiendo la convención de `0001`/`0002`
(SQL escrito a mano, con `--> statement-breakpoint`). **Cero columnas nuevas. Cero
renombres. Cero policies de tenant nuevas** (las 5 tablas de F3 ya están aisladas, ver §2).

### `0004_f3_money_integrity.sql`

1. **`EXCLUDE` en `payout_periods`**: dos períodos de la **misma cadena** no pueden solapar
   sus rangos de fecha. Excluye por `chain_id` (igualdad) y por
   `daterange(starts_on, ends_on, '[]')` (solapamiento). Usa `btree_gist`, ya instalado por
   `0002_f2_integrity.sql`.
2. **Índice único `payout_lines (payout_period_id, barber_id, location_id)`** — una línea
   por barbero y por sede por período (PRD §10). Convierte un recálculo mal implementado en
   un error de base de datos en vez de en dos pagos al mismo barbero.
3. **Índice único parcial `commission_rules (chain_id) where applies_to = 'chain'`** — una
   sola regla default por cadena, que es lo que hace determinista a D-F3-3.
   *Si el seed o los datos actuales violan este índice, se limpia primero; el seed actual
   crea exactamente una y no lo viola.*
4. **Índices de rendimiento que F3 necesita:** `sale_items (barber_id)`,
   `sales (location_id, status, created_at)` *(el existente `sales_location_created_idx` no
   incluye `status` y el cálculo siempre filtra por `paid`)*, `payout_lines (barber_id)`,
   `payout_lines (payout_period_id)`.
5. **Comentario en el archivo** dejando explícito que **no se añade ninguna policy nueva**:
   `commission_rules`, `payout_periods`, `payout_lines`, `location_daily_metrics` y
   `subscriptions` ya tienen aislamiento por `chain_id` en `0001_rls_policies.sql`
   (verificado línea por línea el 18 sep 2026).

**AC:** `npm run db:migrate` corre limpio y es idempotente (se puede correr dos veces);
insertar dos períodos solapados para la misma cadena es rechazado por Postgres; insertar dos
`payout_lines` del mismo (período, barbero, sede) es rechazado; insertar una segunda regla
`applies_to = 'chain'` en la misma cadena es rechazado; `npm run typecheck` en verde.

**Si aparece la necesidad de una columna nueva durante F3 (ej. para `fixed_per_service` o
`split_pct`): se para y se escala al PM.** Ya se evaluaron esos dos casos y la resolución
fue recortar el alcance (D-F3-4, D-F3-7), no migrar.

---

## 6. Checklist de F3

Ejecutar **en orden**. Cada tarea termina solo cuando su criterio de aceptación (AC) es
verificable por otra persona. `P0` = bloquea la fase; `P1` = se corta si el tiempo aprieta.

### Bloque 0 — Preflight (integridad y datos con qué probar)

#### F3-00 · Migración `0004_f3_money_integrity.sql` + confirmación de RLS · **P0**
Implementar §5 punto por punto. Dejar en el PR el resultado de confirmar (no reescribir) que
las 5 tablas de F3 ya tienen policy de aislamiento en `0001`.
**AC:** el de §5.

#### F3-01 · Extender el seed con una quincena real de datos · **P0**
`npm run db:seed` sigue siendo **idempotente** (UUIDs fijos + `onConflictDoUpdate`) y añade,
anclado a `now` y nunca a fechas fijas (regla dura §3.9 de F2):
- **Ventas de los últimos ~35 días** repartidas entre las **3 sedes** y entre al menos 5
  barberos (incluido el multi-sede `barbero3`, que **debe** tener ventas en sus dos sedes —
  es el caso que hoy se calcula mal a mano y el que valida el desglose cross-sede), con
  mezcla de métodos de pago, propinas, y **al menos una venta con descuento con motivo** y
  **una venta `refunded`** (que el motor debe excluir).
- **Tickets de 2 barberos** (corte de uno, barba de otro) — valida la atribución por línea
  de D-F3-1 y el prorrateo de descuento de D-F3-5.
- **3 reglas de pago**: la `percentage` 50% de cadena que ya existe (default), una
  `booth_rent` y una `hybrid`, asignadas por `barber_locations.commission_rule_id` a
  barberos distintos, y **al menos un barbero con override distinto en cada una de sus dos
  sedes** (PRD §5.2).
- **Volumen suficiente para medir el P95 del dashboard** (orden de magnitud: cientos de
  ventas, no decenas).
- **Corregir de paso la deuda de idempotencia documentada en el CHANGELOG del 18 sep**: el
  seed choca de forma transitoria con el `EXCLUDE` de citas cuando se re-siembra en otro día.
  Resolver por el camino que el desarrollador prefiera (borrar+insertar en vez de actualizar
  en el mismo orden, o declarar el constraint `DEFERRABLE INITIALLY DEFERRED` en una
  migración — si elige la migración, **se escala al PM primero**, no está en §5).
**AC:** tras `db:seed` sobre base limpia y **también sobre una base ya sembrada en otro
día**, corre sin error y sin duplicar (verificado con `count(*)` agrupado por fila lógica);
el corte de la quincena en curso tiene con qué calcular en las 3 sedes; existe al menos un
barbero con dos sedes y dos reglas distintas.

### Bloque A — El motor de comisiones (núcleo puro)

#### F3-02 · `src/lib/commissions/` — módulo puro · **P0**
Sin acceso a DB ni a `next/*` (regla dura §3.11). Implementa, en centavos enteros:
resolución de la regla aplicable (D-F3-3), prorrateo del descuento por línea con asignación
del residuo (D-F3-5), cálculo por tipo de regla (D-F3-4/D-F3-6), imputación del alquiler de
silla por frecuencia (D-F3-8), atribución de propinas (D-F3-7), agregación en una línea por
barbero y sede, y la **verificación del invariante de cuadre** (D-F3-11) como función
exportada que el llamador debe invocar. Importa `roundHalfToEven` de `@/lib/pos` (D-F3-20).
**AC:** cobertura **100%** del módulo en Vitest (requisito literal del PRD §15), con al
menos estos casos: barbero con una sola sede y regla de cadena; barbero multi-sede con
override distinto por sede (dos líneas, montos distintos); ticket de 2 barberos con
descuento (la suma de las bases prorrateadas es exactamente `subtotal - descuento`, y el
residuo cae en la línea mayor); descuento que deja residuo impar de 1 centavo; silla fija
con `net_payable` negativo; `hybrid`; renta `weekly` en una quincena con 2 lunes y en otra
con 3; renta `monthly` con monto impar (las dos mitades suman el total exacto);
`fixed_per_service` rechazado con mensaje explícito; barbero sin regla resoluble rechazado
con su nombre y sede; venta `refunded` excluida; período sin ventas ⇒ cero líneas, no error;
invariante que no cuadra ⇒ el módulo lo reporta. **Cero uso de float, verificable con grep.**

#### F3-03 · Capa de lectura del período (servidor) · **P0**
`loadPayoutInputs({ chainId, startsOn, endsOn }, executor)` en `src/lib/commissions/` (parte
con acceso a DB, separada del núcleo puro): carga ventas `paid` del rango con sus
`sale_items`, las reglas de pago, los `barber_locations` y las sedes con su timezone, y
devuelve la entrada ya normalizada en centavos que consume el módulo puro. **Acepta el
ejecutor Drizzle como parámetro** (regla dura §3.2) y **nunca interpola un `Date` crudo en
un template `sql`** (§3.3).
**AC:** para el seed devuelve datos coherentes con las ventas sembradas; la pertenencia al
período se resuelve en la tz de la sede (test con una venta a las 23:45 del último día del
período); llamada **desde dentro** de una `db.transaction(...)` resuelve en < 2s y **no se
cuelga** (test explícito de este punto — es el bug de clase que ya apareció dos veces); el
número de round-trips se documenta en el PR.

### Bloque B — El Corte (ciclo del período y sus pantallas)

#### F3-04 · Reglas de Pago · **P0**
`(chain)/commissions/rules`: CRUD de `commission_rules` (tipos `percentage`, `booth_rent`,
`hybrid` — D-F3-4) y asignación del override por barbero y sede sobre
`barber_locations.commission_rule_id`. Solo `superuser` escribe (matriz §6.2: admin y barber
solo leen). Todo cambio escribe `audit_log` con `before`/`after`.
**AC:** se crea una regla `booth_rent` con frecuencia y se asigna a un barbero en una sede
sin afectar su regla en la otra; intentar crear una segunda regla `applies_to = 'chain'` en
la misma cadena es rechazado con mensaje legible (no un error crudo de Postgres); un `admin`
que abre la pantalla la ve en solo lectura; `fixed_per_service` y `split_pct` no aparecen
como opciones; todo cambio deja fila en `audit_log`.

#### F3-05 · Server Actions del ciclo del período · **P0**
`createPayoutPeriod`, `calculatePayoutPeriod`, `approvePayoutPeriod`,
`markPayoutPeriodPaid`, y `adjustPayoutLine` (**P1**). Cada una: Zod con `zUuid` → guard →
**una sola transacción** con `select ... for update` sobre el período (§3.6) → cálculo con
`lib/commissions` → verificación del invariante (§3.7) → `audit_log` con `tx` → 
`ActionResult`. Estados, permisos e inmutabilidad exactamente como D-F3-9; bloqueadores
exactamente como D-F3-10.
**AC:** calcular dos veces seguidas el mismo período produce líneas **idénticas** y no
duplica (verificado contra la DB real); un `admin` puede calcular pero recibe error de
permiso al aprobar; aprobar un período cuyo `ends_on` es futuro está bloqueado con el motivo
escrito; con una caja abierta dentro del rango, aprobar está bloqueado y el mensaje nombra la
caja; un período `approved` rechaza cualquier intento de recálculo, ajuste o cambio de
estado hacia atrás **por llamada directa a la Server Action** (no solo por UI oculta); el
desglose de un barbero multi-sede produce **dos líneas** que suman su total; cada operación
deja su fila en `audit_log`.

#### F3-06 · Corte de Quincena — pantallas · **P0**
`(chain)/commissions` (índice: reglas + accesos), `(chain)/commissions/periods` (historial
con estado y total) y `(chain)/commissions/periods/[id]` (**Corte de Quincena**), según el
wireframe `UX-BRIEF` §4.5 — que es **especificación, no inspiración**: estado siempre
visible en el header (`Abierto → Calculado → Aprobado → Pagado`), resumen ("8 barberos ·
RD$248,600 a pagar · 2 sedes"), tabla con `DataTable` (barbero, sede, servicios, ingreso de
servicios, comisión, alquiler de silla, propinas, **neto**), panel de bloqueadores con su
texto y su enlace, botón **"Cerrar el corte"** que **explica por qué** no puede cerrarse
(nunca un `disabled` mudo), modal de confirmación con el resumen exacto y el copy *"después
no se puede editar"*, y sello visual de cobre al quedar cerrado.
**AC:** con el seed, la pantalla muestra el corte de la quincena en curso con cifras que
coinciden **al peso** con un cálculo manual hecho aparte sobre las mismas ventas (se adjunta
la comprobación en el PR — esto es el criterio §16.8 del PRD); el botón deshabilitado
siempre dice su motivo; una vez aprobado, la tabla queda en solo lectura; en tablet la tabla
sigue siendo legible.

#### F3-07 · Recibo del barbero + "Lo mío" en Mi Silla · **P1**
Clic en una fila del Corte abre el **Recibo del barbero** en modo lectura (lo mismo que verá
el barbero). Conectar el bloque **"Lo mío"** de `(barber)/mi-silla` (hoy mock desde F2-18) a
la **quincena en curso** del barbero autenticado: monto, servicios, propinas, en cobre y
como única métrica grande (UX §4.6), más el histórico de recibos cerrados. Un barbero ve
**solo lo suyo** (D-F3-18).
**AC:** el barbero del seed ve su propio monto y **no** puede acceder al recibo de otro ni
por URL directa (403); el monto del recibo coincide exactamente con su línea en el Corte; si
el período todavía no se calculó, la pantalla dice "en curso" con el cálculo al vuelo, no un
0 engañoso.

#### F3-08 · Export CSV del corte · **P1**
Botón "Descargar CSV" en el Corte de Quincena (UX §4.5), con una fila por `payout_line` y
todas las columnas del desglose. Es lo que reemplaza el Excel y lo que se le manda al
contador.
**AC:** el CSV abre correctamente en Excel con separador y codificación adecuados, los
montos son numéricos (no texto), y la suma de la columna neto coincide con el total de la
pantalla.

#### F3-09 · Conectar "Anular venta" a la UI · **P1**
`voidSaleAction` (F2-22) existe, está probada contra la DB real y **no tiene ningún botón**
(deuda de producto documentada en el CHANGELOG). Es material para F3: una venta anulada no
paga comisión, y hoy no hay forma de anularla. Conectar el botón con motivo obligatorio en
la pantalla donde el gerente ve las ventas de la caja abierta (`(location)/.../register`),
con las restricciones ya implementadas (solo `superuser`/`admin`, solo con la caja abierta).
**AC:** un gerente anula una venta del día desde la UI; el esperado del cuadre baja
exactamente ese monto; la venta anulada **desaparece del cálculo del período** al recalcular;
un `barber` no ve el botón y recibe error si llama la acción directamente.

#### F3-10 · Vista del corte para el admin de sede · **P1**
`(location)/sede/[locationId]/payouts` en **solo lectura**: las líneas de pago de los
barberos de **esa sede** para el período seleccionado (D-F3-18). Sin aprobación, sin ajustes,
sin cifras de otras sedes.
**AC:** el `admin` de Naco ve las líneas de Naco y **ninguna** de Bella Vista, ni por
cambiar el `locationId` en la URL (403, re-verificación de §16.11 con datos de dinero).

### Bloque C — Vista Cadena y Tabla de Posiciones

#### F3-11 · `src/lib/metrics/` — módulo puro de métricas derivadas · **P0**
Funciones puras que, dadas filas de `location_daily_metrics` (o su equivalente del día en
curso), producen: totales de cadena, ticket promedio, ocupación, **RD$/silla**,
RD$/barbero-hora, Δ vs. período anterior, ranking y la marca de desviación >10% bajo el
promedio — exactamente con las definiciones de D-F3-13. Sin DB, sin `next/*`, sin floats
sobre montos.
**AC:** cobertura completa en Vitest, con casos: período anterior en 0 ⇒ "—" y no división
por cero; sede con `chairs_count` pequeño que **gana** en RD$/silla aunque pierda en ingreso
bruto (es el caso que justifica la normalización del PRD §5.4.B); ocupación que excede 100 se
topa; empate en el ranking resuelto de forma determinista.

#### F3-12 · Agregación diaria y materialización perezosa · **P0**
`computeLocationDailyMetrics(locationId, date, executor)` con las definiciones de D-F3-13,
más la lógica de lectura de D-F3-12 (día cerrado ⇒ tabla, con `upsert` si falta; día en
curso ⇒ en vivo, sin persistir), `recomputeLocationDailyMetrics` y el script
`npm run metrics:backfill`. Acepta el ejecutor Drizzle (§3.2); nada de `Date` crudo en `sql`
(§3.3).
**AC:** `metrics:backfill` sobre el rango del seed puebla las 3 sedes sin duplicar
(idempotente por el único `(location_id, date)`), correrlo dos veces da exactamente los
mismos números; la cifra de `revenue` de un día coincide **al centavo** con la suma manual de
las ventas `paid` de ese día; el día en curso cambia tras cobrar una venta y **no** queda
persistido.

#### F3-13 · Vista Cadena (`(chain)/overview`) · **P0**
Según el wireframe `UX-BRIEF` §4.1: selector de fecha global (D-F3-14) en `searchParams`
validados con Zod, **KPI hero** (ingreso total de la cadena con su Δ, `MoneyDisplay` +
`TrendIndicator`), 4 KPI cards (servicios, ticket promedio, ocupación, no-show), la **Tabla
de Posiciones** y los bloques "Top barberos de la cadena" y "Top servicios". Desktop-first y
funcional en móvil (Ramón consulta de noche desde la cama).
**AC:** con el seed, los KPIs cuadran con la suma de las 3 sedes; cambiar el rango actualiza
KPIs y tabla a la vez y la URL es compartible; un `admin` o un `barber` que entra a
`/overview` recibe **403** (ya lo da `requireChainScope`, se re-verifica); P95 de carga
medido y documentado, **< 2s** con la tabla materializada (PRD §15).

#### F3-14 · Tabla de Posiciones (`(chain)/compare`) · **P0**
La tabla completa sobre `DataTable`: `#`, sede, ingreso, Δ, servicios, ticket, ocupación,
**RD$/silla**, no-show. Ordenable por cualquier columna; **RD$/silla siempre visible, nunca
tras un toggle** (PRD §5.4.B); semáforo y borde izquierdo `--data-neg` en la fila desviada
(D-F3-13); en móvil, scroll horizontal con la **columna sede fija** (`stickyFirstColumn`);
clic en fila ⇒ drill-down (F3-15).
**AC (criterio §16.9 del PRD):** el superuser compara las 3 sedes por ingreso, ticket,
ocupación e **ingreso por silla**, con drill-down funcional; ordenar por RD$/silla cambia el
orden respecto de ordenar por ingreso bruto (si no, los datos del seed no ejercitan la
normalización y hay que ajustarlos); en un teléfono real la columna sede queda fija al hacer
scroll.

#### F3-15 · Drill-down en modo lectura+ · **P0**
Implementar D-F3-15: clic en una fila lleva a `(location)/sede/[locationId]/today` con
`ScopeBanner variant="readonly-visit"` y el copy exacto de UX §5.1, con "Volver a Vista
Cadena" siempre visible. **Cero pantallas nuevas.**
**AC:** desde la Tabla de Posiciones se entra a cualquiera de las 3 sedes y se vuelve con un
clic; el banner es persistente y no descartable; el `admin` de esa sede **no** ve el banner al
entrar por su camino normal; el botón atrás del navegador también funciona.

#### F3-16 · Unificar la definición de "ingreso" entre El Día y Vista Cadena · **P1**
El KPI de ingreso de El Día (F2-05) se calcula hoy sobre `appointments`; Vista Cadena lo
calcula sobre `sales` (D-F3-13). **Dos pantallas del mismo producto no pueden dar dos cifras
distintas del mismo día** — es exactamente la clase de discrepancia que destruye la confianza
que este producto vende. Migrar El Día a la definición canónica de D-F3-13.
**AC:** el ingreso de hoy de la sede Naco es **el mismo número** en El Día y en la fila de
Naco de la Tabla de Posiciones, al centavo.

### Bloque D — Suscripción y control de acceso

#### F3-17 · `src/lib/billing/` — módulo puro de estado de suscripción · **P0**
Estado efectivo (`acceso_normal | restringido | bloqueado`) a partir de `subscriptions` y la
fecha actual, con la gracia de 7 días y las excepciones duras de D-F3-16, más
`assertLocationQuota` (D-F3-17).
**AC:** cobertura completa, con casos: prueba vigente; prueba vencida ayer (restringido);
vencida hace 8 días (bloqueado); `past_due`; `cancelled`; plan `local` intentando la sede 4
(rechazado con el copy de upsell); plan `chain` con 5 sedes (permitido, cobra 2 extra).

#### F3-18 · Gate de suscripción en la app · **P0**
Aplicar el estado efectivo en los layouts de `(chain)` y `(location)`: bloqueo de lo
analítico/administrativo primero, operación preservada, banner `trial-ending` persistente con
el copy del brand brief, y las **excepciones duras** de D-F3-16 (cerrar una caja abierta y
cobrar una venta en curso **nunca** se bloquean).
**AC:** con la suscripción del seed puesta a prueba vencida, `(chain)/overview` y
`/commissions` quedan bloqueados con su aviso, **pero** el gerente todavía puede cobrar y
cerrar la caja; con la suscripción vigente todo funciona igual que antes; el bloqueo se
aplica en el **servidor**, no ocultando botones (verificado llamando la Server Action
directamente).

#### F3-19 · "Tu plan" (`(chain)/billing`) + script operativo · **P1**
Pantalla de lectura con plan, estado, días de prueba restantes, sedes usadas vs. incluidas y
precio según §7.2, con CTA de contacto por WhatsApp. Script documentado
`npm run billing:set-status` para mover el estado tras un pago recibido fuera de Kortex.
**AC:** la pantalla refleja el estado real del seed; el script cambia el estado, escribe
`audit_log` y el cambio se ve reflejado en la app sin redeploy; **no** existe ningún camino de
autoservicio de pago (verificado: `paypal_subscription_id` sigue nulo y no hay ninguna
llamada a una pasarela en el código).

### Bloque E — Cierre de fase

#### F3-20 · Tests, medición y cierre de F3 · **P0**
- Vitest: **100% en `lib/commissions`** (requisito del PRD §15), cobertura completa de
  `lib/metrics` y `lib/billing`, test de **idempotencia del recálculo** contra la DB real,
  test de **concurrencia** (dos cálculos simultáneos del mismo período: uno gana, el otro no
  corrompe nada) y test explícito de **llamada desde dentro de una transacción** para cada
  función nueva con acceso a DB (regla dura §3.2).
- **Playwright**: el 4º flujo crítico que exige el PRD §15 y que nunca se escribió —
  **cerrar período**: calcular, ver los bloqueadores, resolverlos, aprobar, marcar pagado, y
  verificar en la DB las líneas y las filas de `audit_log`.
- **Medición** del P95 de Vista Cadena con la tabla de agregados poblada, documentada en el
  PR (PRD §15: < 2s).
- Re-verificación de aislamiento: un `admin` no ve dinero de otra sede; una sesión de otra
  cadena no ve nada.
**AC:** `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build` en verde (los
cuatro, **en ese orden** — `build` detecta cosas que los otros tres no, lección del 17 sep);
los E2E existentes **siguen pasando** (incluido `02-dar-turno.spec.ts`, hoy en rojo por un
bug pre-existente: si sigue fallando, **se arregla o se escala**, no se ignora); el E2E nuevo
pasa contra el seed; `CHANGELOG.md` actualizado con lo construido, lo decidido y los riesgos
abiertos de F3.

---

## 7. Definición de Done de F3

F3 está terminada cuando, en un preview desplegado en Cloudflare, con el seed cargado:

1. El superuser configura una **regla de pago por porcentaje**, una de **alquiler de silla**
   y una **mixta**, y asigna a un barbero multi-sede una regla **distinta en cada sede**.
2. Se ejecuta el **cierre de un período de pago** y el sistema genera el monto exacto por
   barbero, **con desglose por sede**, coincidiendo **al peso** con el cálculo manual
   (PRD §16.8). El barbero multi-sede aparece con **dos líneas** que suman su total.
3. El período **no se puede aprobar** mientras haya una caja sin cuadrar, una venta abierta,
   un descuento sin motivo o un barbero sin regla — y la pantalla **dice cuál** de los cuatro.
4. La aprobación exige **acción humana del superuser**; el paso a "pagado" es un segundo
   acto explícito; **un período aprobado no se puede modificar por ningún camino**, ni
   llamando la Server Action directamente.
5. Toda creación, cálculo, recálculo, ajuste, aprobación y marcado de pagado tiene su fila en
   `audit_log`, con `before`/`after`.
6. El superuser abre **Vista Cadena** y ve las **3 sedes comparadas** por ingreso, ticket
   promedio, ocupación e **ingreso por silla**, con **drill-down funcional** a una sede
   (PRD §16.9), y el ingreso de hoy coincide con el que muestra El Día de esa sede.
7. Con la prueba vencida, el acceso a lo analítico queda **restringido** con su aviso, pero
   el local **puede seguir cobrando y cerrando su caja** (PRD §16.12, parcial y declarado:
   sin cobro automático — D-F3-16).
8. Un `admin` sigue recibiendo **403** en el dinero de otra sede y en `(chain)`; una sesión de
   otra cadena no ve ni un número.
9. `typecheck`, `lint`, `test` (con **100% en `lib/commissions`**), los E2E de Playwright
   (los existentes **más** "cerrar período") y `build` pasan.
10. El P95 de Vista Cadena está **medido** (no declarado) y documentado.

---

## 8. FUERA DE ALCANCE de F3 (no lo construyas)

**De fases posteriores (PRD §8.2 / roadmap §11 — F5 en adelante):**
- **Recordatorios y notificaciones por WhatsApp/SMS** (PRD 2.1) — F5.
- **Inventario completo**: productos, stock, mínimos, traslados entre sedes, venta de
  producto en el POS (PRD 2.2/2.3/2.4) — F5. En F3 `product_revenue` es siempre 0 por
  construcción, y eso es correcto.
- **PWA del barbero** (manifest, service worker, offline) (PRD 2.5) — F5. En F3 "Mi Silla"
  es una pantalla web más, sin instalación ni offline.
- **Reportes exportables generales, PDF, reportes de inventario** (PRD 2.6) — F5. En F3 el
  único export es el CSV del corte (F3-08, P1).
- **Alertas automáticas al superuser** (PRD 2.10, §5.4.E) — F5. El bloque "Avisos" del
  wireframe §4.1 se renderiza **vacío o se omite** en F3; no se inventa un motor de alertas.
- **Lealtad, reseñas, lista de espera, depósito anti-no-show, política de no-show
  automática, gestión de gastos por sede** — F5+.
- **White-label, API pública, franquicias, multi-moneda, asistente IA** — F6.

**Decidido explícitamente fuera de F3 en este documento:**
- **Cobro real por pasarela de pago** (Azul/CardNet, PayPal, Stripe). PRD D11 sigue abierta;
  la decisión se toma en F4 con datos del piloto (D-F3-16). **No se escribe una línea de
  integración de pago en F3.**
- **Autoservicio de cambio de plan / upgrade con tarjeta** (D-F3-16).
- **Email transaccional** (PRD 1.16, criterio §16.10) → reasignado a **F4** (D-F3-19).
- **Pantallas CRUD de F1 parte 2** (sedes, equipo, servicios, horarios, onboarding) →
  reasignado a **F4**. F3 se valida contra el seed, igual que F2.
- **`fixed_per_service`** como tipo de regla (D-F3-4) y **`split_pct`** de propinas
  (D-F3-7): no expresables sin inventar columnas que el PRD §10 no define.
- **`applies_to = 'location'`** en `commission_rules` (D-F3-3): el override por sede se hace
  en `barber_locations`.
- **Períodos de pago semanales o mensuales configurables** (D-F3-2): la quincena es fija.
- **Gráficos / Recharts** (D-F3-14).
- **Job nocturno programado** (Supabase Cron / Trigger.dev) (D-F3-12).
- **Ranking anónimo de sedes para el `admin`** (D-F3-18) — opcional en el PRD, no aporta al
  piloto.
- **Etiqueta "Acción de gerente" sobre los botones de escritura en modo lectura+** (D-F3-15).
- **Rendimiento cross-sede de un barbero individual** (PRD §5.4.C, segunda mitad: "clic en un
  barbero → su rendimiento cross-sede"): en F3 ese desglose existe **solo dentro del Corte de
  Quincena** (sus líneas por sede). Una pantalla de analítica por barbero es F5.
- **Optimizar los 8 round-trips de `getAvailability`** y la **deuda de accesibilidad de
  `FormField`/`htmlFor`** (ambas documentadas en el CHANGELOG): siguen siendo deuda técnica
  abierta, no son de esta fase.

**Regla anti-scope-creep:** si una tarea de F3 empieza a necesitar inventario, emails,
WhatsApp, una pasarela de pago o una columna nueva, **está fuera de alcance. Para y escala al
PM.** El único trabajo de producto de esta fase es: *que el dueño sepa cuánto le debe a cada
barbero y qué sede rinde mejor, sin abrir un Excel.*

---

## 9. Riesgos vigentes de esta fase

| # | Riesgo | Mitigación en la fase |
|---|---|---|
| A | **"F3 = MVP vendible" es falso tal como está el repo**: faltan las pantallas CRUD de F1 parte 2 y el email (§16.10). Si alguien intenta vender al cerrar F3, el primer cliente no puede ni configurarse solo | Declarado desde §1 y en D-F3-19. **F4 deja de ser solo "piloto" y pasa a ser "piloto + lo que falta del MVP"**. El PM lo comunica antes de que F3 cierre, no después |
| B | **Un error en el cálculo de comisiones** (R2 del PRD, impacto crítico: "un error aquí pierde al cliente para siempre") | Módulo puro con **100% de cobertura** (F3-02); invariante de cuadre verificado **en runtime** que aborta la transacción (D-F3-11); aprobación humana obligatoria (§3.9); inmutabilidad tras aprobar (§3.10); todo auditado; comprobación manual adjunta al PR de F3-06 |
| C | **Deadlock de aplicación en el cierre de período** — el bug de clase que ya apareció **dos veces** (`writeAuditLog`, `resolveEffectiveServiceFor`). El cálculo del período es la transacción más grande del producto y llama muchas funciones auxiliares | Regla dura §3.2 (ejecutor explícito) + **test obligatorio por función** que la ejercite desde dentro de una transacción (F3-03, F3-20). Es el riesgo técnico #1 de la fase y el más barato de prevenir |
| D | **Ambigüedad de centavos**: dos implementaciones razonables del prorrateo dan números distintos por 1 centavo, y el PRD exige cero discrepancias | D-F3-5 (prorrateo y residuo especificados), D-F3-20 (redondeo bancario único, importado de `lib/pos`), invariante de D-F3-11, casos de residuo impar obligatorios en los tests |
| E | **Reclamo de un barbero contra un número ya pagado**, y la tentación de "corregirlo" editando el período | §3.10 + D-F3-9: inmutable, correcciones vía `adjustments` del período siguiente. El **Recibo del barbero** (F3-07) existe precisamente para que el barbero vea el mismo desglose que el gerente, antes del reclamo |
| F | **El dashboard y El Día muestran cifras distintas del mismo día** y el dueño deja de confiar en ambos | D-F3-13 (definición canónica única) + F3-16 (unificación), con AC de igualdad al centavo |
| G | **La materialización perezosa se desactualiza** si algún día aparece una escritura retroactiva sobre un día cerrado | D-F3-12: `recomputeLocationDailyMetrics` existe, es el único punto de reparación, y hoy no hay ningún camino que escriba en el pasado. Si F4 añade uno (ej. anular una venta de ayer), **ese camino debe llamarla** — anotado como condición de entrada de F4 |
| H | **El bloqueo por suscripción le corta la operación a un local a media tarde** y el piloto se pierde por una razón que no es el producto | D-F3-16: gracia de 7 días, se bloquea lo analítico antes que lo operativo, y **cerrar caja / cobrar nunca se bloquean**. AC explícito en F3-18 |
| I | **La decisión de pasarela (D11) sigue abierta** y en F4 se descubre que Azul/CardNet exige integración larga | F3 deja el modelo y el control de acceso listos y **no acopla nada** a una pasarela concreta; el cobro del piloto es manual. La decisión se toma con datos del piloto, no antes |
| J | **`02-dar-turno.spec.ts` sigue en rojo** por un bug pre-existente en la consulta de `time_off` de La Fila (documentado el 18 sep) y la suite deja de ser señal confiable | F3-20 lo pone como condición de cierre: **se arregla o se escala**. Una suite con un test rojo "conocido" deja de detectar regresiones a las dos semanas |
| K | **El seed no tiene volumen ni variedad suficiente** y el motor se declara correcto sobre 5 ventas de un solo tipo de regla | F3-01 es P0 y explícito sobre el volumen, las 3 reglas, el barbero multi-sede con override por sede, el ticket de 2 barberos, la venta con descuento y la anulada |
| L | **Complejidad multi-sede infla la fase y el proyecto se abandona** (R3 del PRD, probabilidad alta) | Alcance congelado en §6; §8 con lista explícita de fuera-de-alcance; **cinco features se recortaron en la fase de análisis** (D-F3-4, D-F3-7, D-F3-14, D-F3-18, D-F3-19) antes de escribir una línea de código |
