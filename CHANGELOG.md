# CHANGELOG — Kortex

## 2026-09-18 — F3 Bloque A: migracion 0004, seed de una quincena real, motor de comisiones puro y capa de lectura

Cuatro tareas del `BACKLOG-F3.md` (F3-00, F3-01, F3-02, F3-03), un commit por
tarea sobre `main`: `4a88444` (F3-00), `b8c5fb1` (F3-01), `682cba1` (F3-02),
`fbebf18` (F3-03), mas el arreglo de un test fragil y este CHANGELOG. **No se
implemento nada de los bloques B-E** (Server Actions del ciclo, pantallas,
dashboard, billing): esos agentes construyen sobre las firmas de la seccion
"Contrato para los bloques siguientes".

**Estado final verificado, en este orden:** `npm run typecheck` (0 errores),
`npm run lint` (0 errores; 1 warning ajeno en `coverage/block-navigation.js`,
archivo generado), `npm run test` (16 archivos, **225 tests**, verde; eran 131),
`npm run test:coverage` (nuevo; `lib/commissions/index.ts` **100% statements
219/219, branches 144/144, funciones 45/45, lineas 188/188**), `npm run build`
completo (25 rutas, Turbopack) y `npx playwright test` completo: **7 de 7 en
verde**, con la BD **identica a la nueva linea base** (conteos y md5 por tabla)
tras Vitest y tras Playwright. Sin `npm run deploy`, sin tocar `wrangler.jsonc`,
`.env.local` ni `.dev.vars`; ningun secreto impreso ni commiteado.

### F3-00 — Migracion `0004_f3_money_integrity.sql` (commit `4a88444`)

- **Que hace** (exactamente §5 del backlog, cero columnas, cero renombres, cero
  policies): `EXCLUDE` `payout_periods_no_overlap_per_chain` (`chain_id with =`,
  `daterange(starts_on, ends_on, '[]') with &&`, gist/`btree_gist`); unico
  `payout_lines_period_barber_location_uq`; unico parcial
  `commission_rules_chain_default_uq (chain_id) where applies_to='chain'`;
  indices `sale_items_barber_id_idx`, `sales_location_status_created_idx
  (location_id, status, created_at)`, `payout_lines_barber_id_idx`,
  `payout_lines_payout_period_id_idx`. Cada sentencia es re-ejecutable por si
  sola (`if not exists` / bloque `DO $$` que consulta `pg_constraint`), ademas
  del tracking de drizzle. Journal: entrada `idx 4`, `when 1789598801140`.
- **Aplicada al Supabase real** con `npm run db:migrate` (2 veces seguidas: la
  2a no hace nada). `drizzle.__drizzle_migrations` = 4 filas.
- **Verificado con Postgres real** (no solo leyendo el SQL), cada caso en una
  transaccion con rollback:
  - dos periodos solapados de la misma cadena (`2099-01-01..15` y `..15..31`)
    -> `23P01 payout_periods_no_overlap_per_chain`;
  - dos `payout_lines` del mismo (periodo, barbero, sede) -> `23505
    payout_lines_period_barber_location_uq`;
  - segunda regla `applies_to='chain'` -> `23505 commission_rules_chain_default_uq`;
  - quincenas adyacentes (`03-01..15` y `03-16..31`) y una regla
    `applies_to='barber'` SI se aceptan;
  - los 6 indices existen; `pg_policies` muestra las 5 policies
    `*_tenant_isolation` (commission_rules, payout_periods, payout_lines,
    location_daily_metrics, subscriptions): **RLS confirmada, no se escribio
    ninguna policy**. La migracion lo deja escrito en su cabecera.
- **Test de regresion permanente:** `src/lib/db/__tests__/f3-integrity.test.ts`
  (5 tests contra la DB real, todos con rollback, fechas de 2099).
- **Nota:** el `EXCLUDE` no exige `starts_on <= ends_on`, pero `daterange`
  lanza si el inicio es mayor que el fin, asi que un periodo invertido ya no
  entra. No se agrego un `CHECK` (no esta autorizado en §5).

### F3-01 — Seed de una quincena real (commit `b8c5fb1`)

- **Que se sembro** (`src/lib/db/seed.ts` + generador puro y determinista
  `src/lib/db/seed-history.ts`, PRNG con semilla fija, todo anclado a `now` y a
  la zona de la cadena UTC-4 sin `Date` dependiente de la tz del proceso):
  - **609 ventas / 748 lineas / 24 clientes de historia** en las 3 sedes, de
    los ultimos 34 dias (sin domingos: la barberia cierra) mas 2 ventas de hoy
    por sede (6 en total; asi la quincena en curso tiene con que calcular
    incluso el dia 1 o 16). Antes: 5 ventas.
  - Mezcla de efectivo/tarjeta/transferencia (50/30/20), propinas en ~55% de
    las ventas, **53 ventas con descuento y motivo, 0 sin motivo**, **88 tickets
    de 2 barberos** (~18%), **1 venta `refunded`** (BV, con propina, para que el
    motor la excluya).
  - Barberos con ventas: 6 (b1..b6). **b3 (multi-sede) vende en Naco lun-mie y en
    Bella Vista jue-sab** (sus horarios sembrados), asi que en cualquier
    quincena tiene ventas en sus dos sedes: 59 ventas/RD$24,200 bruto en Naco y
    30/RD$11,900 en Bella Vista en los 34 dias.
  - **Ventas de guion** para los casos del motor: 3 lineas de RD$350 (b1, b2, b1)
    con descuento RD$100.00 (residuo de 1 centavo, D-F3-5); fade b1 RD$500 + barba
    b2 RD$250 con descuento RD$100.01 (2 barberos, descuento impar); la venta
    `refunded`.
  - **3 reglas de pago** (ids `...501` default 50% que ya existia, `...502`
    "Silla fija RD$3,000/semana" `booth_rent` weekly, `...503` "Mixta 30% + silla
    RD$4,000/mes" `hybrid` monthly; las nuevas con `applies_to='barber'`,
    `tip_handling='barber_keeps_all'`). Overrides por
    `barber_locations.commission_rule_id`: **b3 Naco = mixta y b3 Bella Vista =
    silla fija (regla distinta en cada una de sus dos sedes)**, b4 BV = mixta,
    b6 SC = silla fija; b1, b2, b5 usan el default.
  - Ingreso (subtotal - descuento) por sede en la ventana entera: Naco
    RD$147,479.99 (293 ventas), Bella Vista RD$90,067.50 (177), San Cristobal
    RD$64,272.50 (143).
- **Idempotencia y deuda del CHANGELOG del 18 sep** (choque con el `EXCLUDE` de
  citas al re-sembrar otro dia): esa parte ya la habia resuelto la tanda
  anterior (borrar+insertar en una transaccion); esta tarea aplica el mismo
  patron a la historia: **borrar todas las ventas con prefijo de ID propio
  (`00000000-0000-0000-0000-2…`, `sale_items` cae por cascade) e insertarlas en
  una sola `db.transaction` con `tx` en todo**, por lotes de 150 filas (limite
  de parametros de Postgres). Un upsert fila a fila dejaria ventas huerfanas al
  cambiar el dia (p. ej. un dia que ahora cae en domingo). Sin migracion.
- **Verificado contra el Supabase real:** `db:seed` sobre base limpia y **2
  corridas seguidas -> conteos y md5 por tabla identicos** (`scripts/db-baseline.ts`);
  y **sobre una base "sembrada otro dia"** (desplazadas -3 dias las 609 ventas y
  los 24 clientes y -5 h las citas de hoy) -> el seed corre sin error y deja
  la BD identica a la linea base. Los E2E (7/7) no la alteran.
- **Nueva linea base completa** (dia de la medicion: viernes 2026-09-18;
  `npx tsx scripts/db-baseline.ts` imprime count + md5 por tabla):

  | tabla | antes | ahora |
  |---|---|---|
  | appointments | 8 | 8 |
  | walk_in_queue | 3 | 3 |
  | cash_sessions | 2 | 2 |
  | **sales** | 5 | **614** |
  | **sale_items** | 5 | **753** |
  | **clients** | 5 | **29** |
  | audit_log | 0 | 0 |
  | time_off | 0 | 0 |
  | **commission_rules** | 1 | **3** |
  | barber_locations | 9 | 9 (7 con override o explicitamente `null`) |
  | payout_periods / payout_lines | 0 | 0 |
  | location_daily_metrics | 0 | 0 |
  | notifications / stock_movements | 0 | 0 |
  | subscriptions | 1 | 1 |

  **Aviso:** `sales`/`sale_items` de la linea base dependen del dia de la
  semana en que se siembra (los domingos no tienen ventas y una ventana de 34
  dias contiene 4 o 5): 614/753 es para un viernes. Lo que se compara entre
  corridas del mismo dia es igual; entre dias distintos re-sembrar primero.
- **Decisiones sin respaldo explicito** (ver lista final): ventas historicas con
  `cash_session_id = null`; los 24 clientes de historia; `applies_to='barber'`.
- **E2E:** `e2e/db-helpers.ts` **no necesito cambios**: sus limpiezas ya excluyen
  `00000000-0000-0000-0000-…` (`notSeedId`) y los IDs nuevos usan ese prefijo
  (`…-2…` ventas, `…-3…` lineas, `…-4…` clientes). Comprobado: Playwright 7/7 y
  BD identica a la linea base tras la corrida completa (2 veces).

### F3-02 — `src/lib/commissions/index.ts`, motor puro (commit `682cba1`)

- **Modulo puro** (regla §3.11): unico import `roundHalfToEven` de `@/lib/pos`
  (D-F3-20; `lib/pos` no se toco). Sin `db`, `next/*`, `Date`, `Intl`,
  `Math.random`, `parseFloat`, `toFixed` ni literales decimales: **un test lo
  verifica leyendo el codigo fuente sin comentarios ni strings**. Las fechas son
  strings `YYYY-MM-DD` y se manipulan con calendario civil en enteros
  (`daysFromCivil`, algoritmo de H. Hinnant).
- **Decisiones D-F3 aplicadas:** D-F3-1 (solo `paid`, atribucion por linea),
  D-F3-3 (override de `barber_locations` -> regla `applies_to='chain'` -> error
  que nombra barbero y sede; nunca 0%/50% implicito), D-F3-4 (`fixed_per_service`
  rechazado con mensaje), D-F3-5 (prorrateo + residuo), D-F3-6 (formula del neto
  y neto negativo sin truncar), D-F3-7 (propina integra al `sales.barber_id`;
  `split_pct` rechazado), D-F3-8 (alquiler), D-F3-11 (invariante exportado),
  D-F3-20 (bps enteros, redondeo bancario).
- **Casos con montos concretos (todos en los 70 tests del motor):**
  - Prorrateo: 3 lineas de 35000 con descuento 10000 -> descuentos 3333+3333+3333
    = 9999, residuo +1 a la PRIMERA linea -> bases `[31666, 31667, 31667]` (suma
    95000 = 105000-10000). `[25000,25000,50000]` con descuento 1 -> el centavo va
    a la de 50000: `[25000,25000,49999]`. Residuo NEGATIVO: `[500,250,250]` con
    999 -> `[1,0,0]`. Empate `[100,100]` con 1 -> `[99,100]`. Ticket de 2
    barberos `[50000,25000]` con 10001 -> `[43333,21666]` (= 75000-10001).
    Propiedad con 3000 tickets aleatorios: suma de bases = subtotal-descuento,
    ninguna base negativa, todo entero.
  - Una sede, regla de cadena 50%: ventas de 35000 (+ propina 3500) y de 50000
    con descuento 5000 -> `services_revenue 80000`, `commission 40000`,
    `tips 3500`, `net 43500`, `services_count 2`.
  - **Multi-sede (2 lineas, montos distintos que suman su total):** Luis en Naco
    (mixta 30% + RD$4,000/mes) produce RD$10,000 -> comision 300000, renta
    200000 (mitad), propinas 2000, **neto 102000**; en Bella Vista (silla fija
    RD$3,000/lunes, 2 lunes) produce RD$9,000 -> comision 900000, renta 600000,
    propinas 3000, **neto 303000**; total 405000.
  - Silla fija con **neto negativo**: produce 100000, renta 3000x2 -> `net -500000`.
  - `weekly`: sep 1-15 de 2026 = 2 lunes (7, 14), sep 16-30 = 2 (21, 28), jun 1-15
    de 2026 = **3 lunes** (1, 8, 15). Cruce con un oraculo escrito con `Date`
    en el test: **todas las quincenas de 2024-2032** coinciden y las 24 de 2026
    suman **exactamente 52**.
  - `monthly` con monto impar 300001: 1a quincena 150000, 2a **150001** (suman el
    total). Febrero 16-28 (no bisiesto) y 16-29 (bisiesto) se reconocen como
    2a quincena; 16-28 en bisiesto NO.
  - Redondeo bancario: 57.50% de 101 centavos = 58.075 -> 58; de 33 = 18.975 ->
    19; 50% de 1 = 0.5 -> 0; 50% de 3 = 1.5 -> 2. En el ticket de 2 barberos, 50%
    de 43333 = 21666.5 -> **21666** (par).
  - Errores exactos: `"Jandy R. no tiene regla de pago en Bella Vista."`;
    `fixed_per_service` -> `La regla "Fijo por corte" (monto fijo por servicio) aun
    no esta soportada; aplica a Jandy R. en Naco. ...`; se **acumulan todos los
    problemas** de una pasada (`problems[]` con `code`, `barberId`, `locationId`).
  - Venta `refunded`/`open`/fuera de rango excluidas; periodo sin ventas ->
    `{ ok: true, lines: [] }`.
  - **Invariante:** un centavo de mas en ingreso o de menos en propinas de una
    sede -> `ok:false` con `mismatches` y el mensaje `Naco: ingreso esperado
    99999 vs calculado 100000 centavos, ...`; propiedad con 300 periodos
    aleatorios (reglas mixtas, descuentos, refunded, fechas dentro y fuera):
    `computePayoutLines` siempre cuadra con `verifyPayoutInvariant`.
- **Generalizacion del invariante (decision propia):** el descuento se prorratea
  entre TODAS las lineas de la venta (servicio y producto) y el invariante compara
  `services_revenue + product_revenue` contra `subtotal - descuento`. Con
  `product_revenue = 0` (todo F3) es exactamente el texto de D-F3-11.
- **Config de cobertura:** `vitest.config.ts` (`coverage.include =
  src/lib/commissions/index.ts`, umbrales 100/100/100/100) y el script
  `npm run test:coverage`. `coverage/` ya estaba en `.gitignore`.

### F3-03 — `loadPayoutInputs` (commit `fbebf18`)

- **Archivo:** `src/lib/commissions/load-payout-inputs.ts` (con `import
  "server-only"`, NO es un archivo `"use server"`: no expone endpoint; quien lo
  llame es responsable del guard). Devuelve `PayoutInputs` (el tipo del motor).
- **Ejecutor explicito y sin valor por defecto** (`Pick<typeof db, "select">`;
  `db` solo entra como `import type`). Una guarda estatica en su test prohibe
  `Promise.all`, cualquier `Date` y el import de `db` como valor.
- **Fecha operativa en la tz de la SEDE:** `(sales.created_at AT TIME ZONE
  locations.timezone)::date BETWEEN $inicio::date AND $fin::date`, todo por
  strings `YYYY-MM-DD` (nunca `Date`, regla §3.3). Ademas una cota gruesa en UTC
  (+-2/+3 dias) para poder usar el indice de `sales`; el filtro exacto es el de
  la fecha local.
- **Pruebas contra el Supabase real (10 tests):**
  - 23:45 del ultimo dia del periodo **entra** (`2099-01-31 23:45:00-04`, que es
    03:45 UTC del 1-feb) y 00:15 del dia siguiente **no**; 23:59 del ultimo dia
    de la quincena anterior no; 00:00:30 del primer dia si.
  - **Zona de la sede y no la del servidor/cadena:** con Bella Vista cambiada a
    `Pacific/Auckland` (en el test, con rollback) la misma hora UTC cae en el dia
    16 en Auckland y en el 15 en Naco.
  - Sobre el seed (quincena 1-15 sep 2026): **274 ventas** cargadas = conteo y
    suma `subtotal-descuento` de un SQL independiente **al centavo**; 3 sedes, 3
    reglas, b3 con 2 overrides distintos; todo entero; cada venta cuadra con sus
    lineas. `computePayoutLines` + `verifyPayoutInvariant` sobre esos datos:
    **sin problemas y cuadra**. `refunded`/`open` excluidas.
  - **Desde dentro de `db.transaction`**: resuelve (con consultas `tx` antes y
    despues) en < 2 s y **no se cuelga** (timeout de 10 s como red).
  - Determinista (2 llamadas -> igual), otra cadena -> todo vacio, periodos
    invalidos -> lanza antes de tocar la DB.
- **Round-trips: 3** consultas (reglas; overrides `barber_locations`⨝`locations`;
  ventas⨝sedes⨝barberos⨝lineas), medido con `DEBUG_DB_ROUNDTRIPS=1`: 34 lineas
  de round-trip para 12 llamadas = 3 por llamada (+ BEGIN/COMMIT dentro de tx).
  Tiempo real (maquina de desarrollo -> Supabase ca-central-1): **~430 ms con
  `db`, ~550 ms dentro de una transaccion, ~410 ms para 30 dias**; un `select 1`
  cuesta ~65 ms. Bien por debajo de los 2 s del AC.
- **Numeros del motor sobre el seed, quincena 1-15 sep 2026** (centavos; renta
  de silla fija = 2 lunes x 300000; mixta mensual = 200000 por quincena):

  | sede | barbero | regla | serv. | ingreso serv. | comision | renta | propinas | neto |
  |---|---|---|---|---|---|---|---|---|
  | Naco | Barbero Uno | percentage | 75 | 2,936,000 | 1,468,000 | 0 | 191,650 | 1,659,650 |
  | Naco | Barbero Dos | percentage | 62 | 2,439,249 | 1,219,624 | 0 | 178,000 | 1,397,624 |
  | Naco | Barbero Tres | hybrid | 34 | 1,325,000 | 397,500 | 200,000 | 131,000 | 328,500 |
  | Bella Vista | Barbero Tres | booth_rent | 12 | 415,000 | 415,000 | 600,000 | 52,500 | **-132,500** |
  | Bella Vista | Barbero Cuatro | hybrid | 39 | 1,525,667 | 457,700 | 200,000 | 112,250 | 369,950 |
  | Bella Vista | Barbero Cinco | percentage | 48 | 1,780,833 | 890,416 | 0 | 116,500 | 1,006,916 |
  | San Cristobal | Barbero Seis | booth_rent | 70 | 2,883,500 | 2,883,500 | 600,000 | 178,000 | 2,461,500 |

  Comprobacion aparte (SQL directo, sin el motor): Naco ingreso RD$67,002.49
  = 2,936,000+2,439,249+1,325,000 centavos y propinas RD$5,006.50 = 191,650+
  178,000+131,000; Bella Vista RD$37,215.00 / RD$2,812.50; San Cristobal
  RD$28,835.00 / RD$1,780.00 (= la linea de Barbero Seis). Barbero Tres aparece
  con **dos lineas** (una por sede) y su neto total es 328,500 - 132,500 =
  196,000. Hay **un neto negativo real** (Barbero Tres en Bella Vista, debe
  RD$1,325.00 a la barberia).

### Contrato para los bloques siguientes (firmas exactas)

```ts
// src/lib/commissions/index.ts  (puro)
export type PayoutRuleType = "percentage" | "fixed_per_service" | "booth_rent" | "hybrid";
export type BoothRentFrequency = "weekly" | "biweekly" | "monthly";
export interface PayoutRule { id; name; type; serviceBps: number|null; productBps: number|null;
  boothRentCents: number|null; boothRentFrequency: BoothRentFrequency|null;
  tipHandling: "barber_keeps_all"|"split_pct"|null; appliesTo: "chain"|"location"|"barber" }
export interface PayoutInputs { periodStartsOn: string; periodEndsOn: string; barbers: PayoutBarber[];
  locations: PayoutLocation[]; rules: PayoutRule[]; assignments: PayoutAssignment[]; sales: PayoutSale[] }
export interface PayoutLine { barberId; locationId; ruleId; ruleType; servicesCount;
  servicesRevenueCents; productRevenueCents; commissionCents; boothRentDeductedCents;
  tipsCents; adjustmentsCents; netPayableCents }            // 1:1 con payout_lines (x100)
export type ComputePayoutResult =
  | { ok: true; lines: PayoutLine[] }
  | { ok: false; error: string; problems: PayoutProblem[] };  // code: invalid_period | invalid_input | no_rule | invalid_rule | unsupported_rule_type | unsupported_tip_handling
export function computePayoutLines(input: PayoutInputs): ComputePayoutResult;
export function verifyPayoutInvariant(input: { lines: PayoutLine[]; sales: PayoutSale[];
  periodStartsOn: string; periodEndsOn: string; locations: PayoutLocation[] }): PayoutInvariantResult;
  // { ok: true; figures } | { ok: false; error; figures; mismatches }  -> figures va en `after` de payout.calculate_failed
export function prorateDiscount(lineTotalsCents: number[], discountCents: number): number[];
export function boothRentForPeriod(i: { amountCents; frequency; startsOn; endsOn }): { ok: true; cents } | { ok: false; error };
export function resolvePayoutRule(i: { barberId; locationId; barbers; locations; rules; assignments }): { ok: true; rule } | { ok: false; problem };
export function selectPayableSales(sales: PayoutSale[], startsOn: string, endsOn: string): PayoutSale[];
export function netPayableCents(p: { commissionCents; tipsCents; adjustmentsCents; boothRentDeductedCents }): number;
export function bpsFromPercentString(value: string): number;   // "57.50" -> 5750 (lanza si es basura)
export function parseIsoDate(value: string): { year; month; day } | null;

// src/lib/commissions/load-payout-inputs.ts  (server, `import "server-only"`)
export type PayoutReadExecutor = Pick<typeof db, "select">;
export async function loadPayoutInputs(
  params: { chainId: string; startsOn: string; endsOn: string },
  executor: PayoutReadExecutor,        // db o tx; SIN default
): Promise<PayoutInputs>;
```

Como consumirlo en F3-05 (una sola transaccion): `select ... for update` del
periodo con `tx` -> `loadPayoutInputs({...}, tx)` -> `computePayoutLines` (si
`!ok`: abortar y auditar `payout.calculate_failed` con `problems`) ->
`verifyPayoutInvariant` (si `!ok`: abortar y auditar con `figures`) -> `delete` +
`insert` de `payout_lines` convirtiendo centavos con `decimalStringFromCents` ->
`writeAuditLog(..., tx)`. Aprobado/pagado nunca se recalcula.

### Bugs y hallazgos nuevos

1. **`Promise.all` sobre el pool `max: 1` cuelga el cliente `postgres.js`
   (BUG DE CLASE NUEVO, reproducido).** Al medir los round-trips del loader, un
   script con `db.execute(sql\`select ...\`)` lanzado 5 veces en `Promise.all`
   **fuera de una transaccion** tardo 651-713 ms (una consulta sola: 65 ms) y en
   la segunda rafaga (5 x `select 1` identicos) **la promesa nunca resolvio; todas
   las consultas siguientes de ese cliente hicieron timeout** hasta matar el
   proceso. Dentro de una `db.transaction` la misma tecnica si funciono (los
   tests del loader la usaron primero y pasaron: por eso casi se queda). Causa
   raiz: **no confirmada**; hipotesis: `postgres.js` encola las consultas
   concurrentes en pipeline sobre la unica conexion y Supavisor en modo
   transaccion (puerto 6543, `prepare: false`) las reparte mal fuera de una
   transaccion. Es coherente con la nota de la tarea de `getAvailability` ("sin
   `Promise.all` que solo solapa"). **Arreglo:** el loader es secuencial (3
   consultas) y hay un test estatico que prohibe `Promise.all` en el. **Matiz
   importante:** la app YA usa `Promise.all` con consultas en ~10 sitios (paginas
   `today`, `checkout`, `queue`, `calendar`, la publica de sede, y `checkout.ts`/
   `queue.ts`) y los E2E pasan, asi que **no esta demostrado que esos sitios
   fallen**; lo reproducido es el cuelgue en un script suelto con 5 `select 1`
   identicos. **Regla para codigo NUEVO de F3: nada de `Promise.all` con consultas
   de DB** (barato de evitar, y el cierre de periodo corre en una transaccion
   donde no aporta nada).
2. **`public-booking.concurrency.test.ts` era fragil y rompio al re-sembrar.**
   Elegia "el barbero" con `barber_locations where location = Naco limit 1` sin
   `ORDER BY`. `barber_locations` tambien lista a los admins; al reescribirse las
   filas con el `UPDATE commission_rule_id` del seed nuevo, Postgres devolvio
   primero al Admin Naco (sin horario) y el 2o test fallo con "El barbero de
   prueba no tiene horario sembrado en Naco". Arreglo: elegir un barbero con
   `schedules` activos en Naco (join + `ORDER BY user_id`). La BD queda identica
   a la linea base tras el test.
3. **D-F3-8 dice "en una quincena caen 2 o 3 lunes": es falso para el 16-28 de
   febrero** (13 dias -> 1 o 2). No afecta la formula (se cuentan lunes reales) ni
   el total anual (52/53); esta cubierto por el oraculo de 2024-2032. Avisar al
   PM para que corrija el copy ("dos o tres lunes" en el texto de la UI).
4. **`sale_items` no tiene `created_at`**, asi que "la primera linea por orden de
   creacion" (D-F3-5, desempate del residuo) no es recuperable de la DB. El
   loader ordena por `sale_items.id` (deterministico: recalcular da el mismo
   resultado). Solo cambia a quien va un centavo cuando dos lineas de igual
   monto empatan en un descuento con residuo. **Escalar al PM** si importa.

### Decisiones tomadas sin respaldo explicito en el backlog

1. **`applies_to = 'barber'`** para las reglas de override sembradas (502, 503).
   El backlog solo dice que `'location'` no se usa; `'chain'` es unico; `'barber'`
   es el valor natural de "regla asignada a barberos concretos". F3-04 (UI) debe
   decidir si lo conserva.
2. **Ventas historicas con `cash_session_id = null`**: no se sembraron cajas por
   dia para no tocar las cajas de Naco que usan los E2E 03/04/07 (las snapshotean
   todas) ni inflar `cash_sessions`. Consecuencia: la caja abierta de hoy sigue
   siendo el unico bloqueador D-F3-10.2 del seed; el escenario "Descuentos sin
   motivo" no existe en el seed (habria bloqueado la aprobacion para siempre): los
   tests del bloque B deben insertarlo ellos.
3. **24 clientes de historia** (ids `...-4…`, telefonos `809-555-05NN`) para que
   `unique_clients`/`new_clients` de las metricas tengan variedad; las ventas
   solo usan clientes ya creados en el momento de la venta. Las 5 ventas de ayer
   de F2-24 y las citas no se tocaron.
4. **Solo pares con actividad generan linea**: un barbero de silla fija que no
   vende ni recibe propinas en el periodo no aparece y por tanto **no se le
   imputa renta**. Es lo literal del backlog ("periodo sin ventas => cero
   lineas"), pero es un hueco de producto: **preguntar al PM** si la renta debe
   cobrarse igual (implicaria que el motor reciba la lista de asignaciones con
   regla `booth_rent`/`hybrid` y genere lineas sin ventas).
5. **Redondeo una sola vez por linea de pago** sobre el ingreso agregado del
   (barbero, sede), no por venta ni por linea de ticket.
6. **`adjustments` sale siempre en 0 del motor.** Como recalcular borra e inserta
   las lineas (D-F3-9), un recalculo tras un `adjustPayoutLine` perderia el
   ajuste: **F3-05 debe releer y reaplicar los ajustes** (o prohibir recalcular
   despues de ajustar). Se exporta `netPayableCents` para recomponer el neto.
7. **Alquiler mensual exige un periodo que sea quincena calendario** (1-15 o
   16-fin de mes); si no, problema `invalid_period` con el nombre del barbero.
   `weekly` y `biweekly` funcionan con cualquier rango.
8. **`loadPayoutInputs` deriva `locations` y `barbers` de las ventas del rango**
   (solo se usan para nombrar en los mensajes de error, y los errores solo
   nombran pares con ventas). No sirve como lista de sedes de la cadena: los
   bloqueadores de F3-05 (cajas abiertas, ventas `open`, descuentos sin motivo)
   necesitan sus propias consultas.
9. **Herramienta nueva `scripts/db-baseline.ts`** (solo lectura): `count(*)` y md5
   del contenido por tabla para comprobar idempotencia y que una corrida de
   tests/E2E no deja residuo. Y el script `npm run test:coverage`.
10. **Mensajes de error con tildes** (a diferencia de `lib/pos`, que las omite):
    son texto que vera un gerente.

### Deuda abierta

- Sin metricas historicas de no-show: el seed no tiene citas pasadas
  (`no_shows` de `location_daily_metrics` saldra 0). Si el bloque C quiere
  ejercitar la tasa de no-show, hay que sembrar citas historicas (cuidando el
  `EXCLUDE`).
- El seed de ventas de "hoy" cambia de hora en cada corrida (ancladas a `now`);
  el resto de la historia cambia de fecha al pasar los dias.
- `loadPayoutInputs` mide ~430 ms por llamada por la latencia de red a
  Supabase; en Workers cada request abre su propia conexion (~0.4 s extra, ver
  la entrada del runtime). Aceptable para una accion manual de cierre; no para un
  dashboard en vivo (ese usara `location_daily_metrics`).
- La causa raiz del cuelgue de `Promise.all` no esta confirmada (ver arriba);
  hay ~10 usos existentes de `Promise.all` con consultas (`grep -rn "Promise.all"
  src`), sin fallos observados en los E2E; conviene un spike aislado con
  `postgres.js` + Supavisor 6543 vs conexion directa 5432 para confirmar la causa.
- Sigue abierto todo lo del CHANGELOG anterior (rotacion de claves de Supabase,
  Worker desplegado desactualizado, `lookupClientHistoryAction`, efectos de
  `voidSaleAction` sobre `clients.total_*`).


## 2026-09-18 — Auditoria de endpoints "use server", credenciales de Supabase y cierre de la tanda de deuda

Entrada de coordinacion: junta lo que no quedo en las entradas de los agentes
(las dos siguientes, mas abajo, detallan sus tareas).

### 1. Hueco de seguridad: 4 funciones exportadas sin guard (corregido)

- **Problema.** En un modulo `"use server"` de Next.js *toda* funcion exportada
  es un endpoint HTTP invocable por cualquiera, sin sesion, con los argumentos
  que quiera. El agente de la tanda de deuda encontro y arreglo
  `loadCashRegisterState`; su reporte dejaba dicho que no auditó el resto.
- **Auditoria hecha** (listado de todos los `export async function` de los 8
  archivos `"use server"` y lectura de cada cuerpo). Sin guard estaban:
  `loadCheckoutCatalog` y `loadAppointmentForCheckout` (`checkout.ts`),
  `loadQueueSnapshot` y `loadAttendingNow` (`queue.ts`). Solo las protegian las
  paginas que las llaman o los wrappers `*Action` (que si tenian guard), pero
  las funciones `load*` estaban exportadas directamente. Exposicion: catalogo
  de servicios/barberos y precios de cualquier sede, nombres y telefonos de la
  fila de espera, y datos de cita/cliente del checkout, por `locationId`.
- **Arreglo.** `await requireLocationScope(locationId)` como primera linea de
  cada una (mismo criterio que `loadCashRegisterState`). Costo: una consulta
  extra a `locations` por llamada (el contexto de sesion esta cacheado por
  request); aceptable, la ruta caliente (refetch de La Fila) ya va debounced.
- **Prevencion.** `src/lib/actions/__tests__/use-server-guards.test.ts`: test
  estatico que recorre todos los archivos `"use server"` y falla si una funcion
  exportada no llama a `requireLocation/Chain/Barber/ClientScope` o
  `getSessionContext`, salvo una lista explicita de publicas por diseño
  (`PUBLIC_BY_DESIGN`: reserva anonima y flujos de auth, 10 funciones).
  Verificado que **detecta las 4 funciones sobre el codigo previo al arreglo**
  (ejecutando la misma logica contra `git show HEAD:…`). Suma 27 tests (131 en
  total). Limite conocido: es un analisis por texto, no un analisis de flujo;
  una funcion que llame a un guard *despues* de haber leido datos, o solo en
  una rama, pasaria el test. Sigue siendo necesaria la revision humana.
- **Verificacion.** typecheck 0 errores; lint 0 errores; 131 tests; build de 25
  rutas; Playwright 7/7 (las paginas de cola, checkout y caja ejercitan justo
  las funciones tocadas). Commit `ab4df31`.

### 2. Credenciales de Supabase: la "rotacion" no rotó nada (PENDIENTE, solo puede hacerlo Williams)

- **Contexto.** Al inicio del proyecto Williams pego en el chat una clave
  `sb_secret_…` (secret key nueva de Supabase). Despues pego una "nueva
  secret_rol key" (`eyJ…`, JWT `service_role`) creyendo haber rotado la primera.
- **Hallazgos verificados hoy.**
  - Decodificado el payload de ambos JWT: la `service_role` "nueva" y la `anon`
    tienen el **mismo `iat` (1789581121)**, es decir, se emitieron juntas al
    crear el proyecto. Es la clave `service_role` **legacy original**, no una
    rotada.
  - Una peticion REST con la `sb_secret_…` original (`GET /rest/v1/chains`)
    devuelve **HTTP 200**: **la clave expuesta sigue activa**.
- **Consecuencia.** Hay claves con acceso total (saltan RLS) que estuvieron en
  este chat: la `sb_secret_…` y la `service_role` JWT. Tambien estuvieron en el
  chat la contraseña de la base de datos y la anon key (esta ultima es publica
  por diseño, sin riesgo).
- **Que debe hacer Williams** (Dashboard de Supabase, proyecto `Barbersho_SaaS`):
  1. *Project Settings → API Keys*: **revocar/eliminar** la `sb_secret_…`
     expuesta y, si se quiere seguir usando el formato nuevo, crear otra.
  2. Rotar el **JWT secret** legacy (invalida `anon` y `service_role` legacy);
     luego copiar las claves nuevas a `.env.local` (`NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`) y a `.dev.vars` si se usa wrangler.
  3. *Project Settings → Database*: **resetear la contraseña** de la BD y
     actualizar `DATABASE_URL`/`DIRECT_URL` en `.env.local` y `.dev.vars`.
  4. Despues correr `npm run db:seed` y la suite E2E para confirmar que todo
     sigue funcionando con las claves nuevas.
  No se puede automatizar: ninguna herramienta conectada expone esa accion.
  Convencion desde ahora: no pegar secretos en el chat; ponerlos directo en
  `.env.local`.

### 3. Cambios menores de esta coordinacion

- `playwright.config.ts`: el puerto por defecto pasa de 3000 a **3100**
  (`npm run dev -- -p 3100`). En esta maquina el 3000 lo ocupa el `next dev` de
  otro proyecto (Agendalo); con `reuseExistingServer` la suite habria probado
  la app equivocada sin avisar. `E2E_BASE_URL` sigue permitiendo apuntar a
  otro servidor (p.ej. wrangler en `:8787`). Commit `6007e94`.
- `src/lib/db/client.ts`: se reemplazo el comentario obsoleto que decia que el
  spike de Workers no se habia podido verificar.
- Verificado tras el cierre: suite Playwright 7/7 en modo por defecto y conteos
  de la BD identicos al seed (appointments 8, walk_in_queue 3, cash_sessions 2,
  sales 5, sale_items 5, clients 5, audit_log 0, time_off 0).

### 4. Hallazgos abiertos que requieren decision de producto o revision

- **`lookupClientHistoryAction` (reserva publica).** Dado `chainSlug` + telefono
  devuelve el nombre completo y la ultima visita de ese cliente, **sin
  sesion**. Es lo que pide D-F2-15 ("historial breve" en el paso 4), pero
  permite a un anonimo enumerar telefonos y obtener nombres de clientes. Ideas:
  devolver solo el nombre de pila, o solo un booleano "ya eres cliente", y/o
  rate limiting en Cloudflare (D-F2-17 lo menciona pero no esta configurado).
- **`voidSaleAction` (anular venta).** Solo cambia `sales.status`: no revierte
  `clients.total_visits/total_spent/last_visit_at` ni devuelve la cita a un
  estado cobrable; hay que revisar si el indice unico `sales_appointment_id_uq`
  excluye las ventas `refunded` (si no, una cita anulada nunca se podria volver
  a cobrar). Decision de producto pendiente.
- **Worker de Cloudflare: el desplegado esta DESACTUALIZADO y roto.** Se intento
  redesplegar en privado (`workers_dev: false`) con el arreglo de
  cliente-por-request (`a5b7212`), pero Claude Code detuvo el `npm run deploy`
  por poca memoria del sistema (no fue un fallo del deploy) y no se reintento.
  Hasta que se redespliegue, el Worker subido es la version anterior, con el bug
  del singleton de `postgres.js` (500 desde la segunda peticion con BD). Como no
  tiene ruta publica, no afecta a nadie, pero **hay que correr `npm run deploy`
  antes de activar el dominio**, con memoria libre y sin procesos huerfanos de
  `wrangler`/`esbuild`/`workerd` de este repo.
- **"F3 = MVP vendible" sigue siendo falso** (ver `BACKLOG-F3.md` §1): faltan las
  pantallas CRUD de F1 y el email transaccional.

## 2026-09-18 — E2E que limpian lo suyo + flujo de dinero verificado en workerd (y un bug grave de runtime)

Dos tareas, cuatro hallazgos reales (uno critico de Cloudflare, dos de higiene
de la BD de pruebas, uno de `.gitignore`). **Estado final verificado, en este
orden:** `npm run typecheck` (exit 0), `npm run lint` (0 errores; 1 warning
ajeno en `coverage/block-navigation.js`, archivo generado), `npm run test`
(12 archivos, **131 tests**, verde; corrido 2 veces seguidas sin deriva en la
BD), `npm run build` completo (25 rutas, Turbopack) y la suite Playwright
completa: **7 de 7 en verde** contra `next dev`, contra `next start` y (tras el
fix) contra **workerd**, 2 corridas completas alli. Sin `npm run deploy`, sin
tocar `wrangler.jsonc`, `.env.local` ni credenciales (ningun valor secreto
impreso ni commiteado).

Commits (en orden): `af502ca` (E2E limpian), `3e682d9` (Playwright
`E2E_BASE_URL` + `.dev.vars` en `.gitignore`), `a5b7212` (fix del cliente
postgres.js por request en Workers), `b42b6d5` (test de concurrencia ya no
borra el seed ni deja audit_log), mas el commit de este CHANGELOG.

### Tarea 1 — Los E2E 01-04 limpian sus propios datos

- **Problema:** `01-reservar`, `02-dar-turno`, `03-cobrar` y `04-cerrar-caja`
  dejaban residuo en el Supabase real (clientes "Cliente E2E ...", "Walkin E2E
  ...", citas, turnos, ventas, cajas, `audit_log`). Al empezar la sesion la BD
  ya tenia residuo de una corrida previa (appointments 9, walk_in_queue 4,
  sales 6, clients 8, audit_log 4) y `npm run db:seed` **no** lo borra (solo
  hace upsert de sus IDs fijos).
- **Dos causas de fondo, ademas de "no borran":**
  1. **04 CIERRA la caja abierta del seed (`...1001`)** y 03/07 necesitan una
     abierta: borrar filas no basta, hay que **restaurar** la fila del seed
     (`closed_at`, `closed_by`, `expected_cash`, `counted_cash`, `difference`).
  2. **`joinQueue` reescribe `position`/`estimated_wait_minutes` de los turnos
     hermanos** (`recalcQueueState`), asi que agregar un walk-in muta filas del
     seed aunque despues se borre el nuevo: tambien hay que restaurarlas.
- **Solucion (`e2e/db-helpers.ts`, todo con el `testDb` de los E2E):**
  - `notSeedId(col)`: segunda barrera SQL (`::text not like
    '00000000-0000-0000-0000-%'`) en todo DELETE; un filtro equivocado nunca
    llega a una fila de ID fijo. (Ojo: los 2 clientes con cuenta del seed,
    "Cliente Uno/Dos", NO tienen ID fijo — se identifican solo por
    nombre/telefono, nunca por prefijo.)
  - `findE2eClientIds({phone|fullName})` + `purgeClients(ids)`: borra clientes y
    lo que cuelga (citas, ventas con `sale_items` por cascade, turnos de la fila
    y sus filas de `audit_log`) en orden seguro respecto a las FK
    (`sales.client_id` es RESTRICT). El telefono se busca crudo y normalizado
    (`+1` + 10 digitos, como guardan las actions).
  - `snapshotCashState()` / `restoreCashState()`: foto de todas las cajas de
    Naco + sus IDs de audit antes del spec; despues borra las cajas nuevas (y su
    audit), **restaura las columnas de las existentes** (reabre la del seed) y
    borra el audit que el spec genero sobre cajas ya existentes (`cash.close`),
    identificado por "no estaba en la foto" (no por reloj: evita desfases entre
    el reloj del test y el `now()` de la DB).
  - `snapshotQueue()` / `restoreQueue()`: lo mismo para `walk_in_queue` de Naco.
  - Specs: 01 usa un `PHONE` unico por corrida y `afterAll` purga por telefono;
    02 foto de la fila en `beforeAll`, `afterAll` purga por nombre unico y
    restaura la fila; 03 purga por telefono y restaura cajas; 04 restaura cajas.
    Los `afterAll` corren tambien si el test falla (comprobado: una corrida con
    5 fallos por otra causa dejo la BD identica al seed).
  - El orden 03 -> 04 ya no importa (cada spec deja las cajas como las encontro).
- **Residuo previo:** se limpio con `purgeClients` (3 clientes E2E) mas 4 filas
  de `audit_log` identificadas por ID, y se re-sembro. Un primer intento de
  borrar todo `audit_log` con SQL directo fue bloqueado por el clasificador de
  permisos y se sustituyo por lo anterior (borrado acotado por entidad/ID).
- **Verificacion con numeros reales** (`count(*)` + `md5` del contenido de cada
  fila ordenada por id, por tabla, antes/despues; script en el scratchpad de la
  sesion, no commiteado). Baseline tras `npm run db:seed`: appointments 8,
  walk_in_queue 3, cash_sessions 2, sales 5, sale_items 5, clients 5, audit_log
  0, time_off 0 (+ notifications/stock_movements/payout_periods 0). Suite
  completa **2 veces seguidas** contra `next dev`: tras la corrida 1 y tras la
  corrida 2, **conteos Y hashes de las 11 tablas identicos al baseline** (no
  solo el conteo: tambien position/ETA de la fila y la caja reabierta). Igual
  tras 2 corridas completas en workerd, 1 en `next start` y 1 final en `next dev`.
- **Deuda que queda:** la limpieza de 05/06/07 no se toco (ya limpian). Los
  helpers asumen `workers: 1` y una sola sede (Naco); si se paraleliza la suite
  o se prueba otra sede, hay que generalizar las fotos. Si un spec muere a mitad
  de proceso (kill -9) el `afterAll` no corre; el siguiente `db:seed` no borra
  ese residuo (queda `purgeClients`/limpieza manual).

### Tarea 2 — Flujo de dinero en el runtime real de Cloudflare (workerd)

**Metodo:** `npx opennextjs-cloudflare build` (1m06s) + `npx opennextjs-cloudflare
preview` (wrangler dev en http://127.0.0.1:8787, en background), variables via
`.dev.vars` (creado copiando SOLO `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL` desde `.env.local`; **`.dev.vars` no estaba en
`.gitignore`** — se agrego junto con `.dev.vars.*` ANTES de crearlo, y
`git check-ignore` confirma que esta ignorado). Playwright apunta al worker con
la nueva env `E2E_BASE_URL` (si esta definida, no se lanza `webServer` y se usa
como `baseURL`; sin ella el comportamiento es el de siempre).

- **Resultado 1 (antes del fix): fallo total.** Los 7 specs fallaron. Sintoma:
  HTTP 500 con "The Workers runtime canceled this request because it detected
  that your Worker's code had hung and would never generate a response" en toda
  ruta que toca la DB, salvo la primera request tras arrancar wrangler.
- **Reproduccion aislada:** reiniciar wrangler y hacer `curl` repetido a una
  ruta de lectura (`/don-bigote/book`): **1a request 200 (0.90 s), 2a y 3a 500
  en ~50 ms**; con el fix, 4 de 4 en 200. Es decir, el "spike de Workers" de
  S1-04 solo habia probado la primera lectura tras el arranque.
- **Causa raiz (BUG NUEVO, critico en produccion):** `src/lib/db/client.ts`
  guardaba el cliente `postgres.js` en una variable de modulo (singleton),
  patron correcto en Node. En workerd un socket TCP (`connect()`) pertenece a la
  request que lo abrio: la segunda request del mismo isolate reutilizaba un
  cliente cuyo socket era de una request ya terminada, la promesa nunca se
  resolvia y workerd cancelaba la request. Ninguna prueba en Node podia verlo, y
  habria roto **toda** ruta con DB en el Worker desplegado tras la primera
  request (el deploy privado de F2 solo se habia mirado en rutas estaticas/login).
- **Solucion:** el cliente ahora se cachea **por request** en Workers: OpenNext
  publica un almacen nuevo por request en `globalThis[Symbol.for(
  "__cloudflare-context__")]` (AsyncLocalStorage, `.open-next/cloudflare/
  init.js`); su identidad es la llave de un `WeakMap<object, Db>`. Dentro de una
  request, todas las llamadas (incluidas las transacciones con `max: 1`)
  comparten el mismo cliente (no se rompe la regla del pool ni de `tx`); fuera de
  Workers ese simbolo no existe y se usa el singleton de Node como siempre
  (`next dev`/`start`/Vitest/scripts sin cambios de comportamiento). Archivo:
  `src/lib/db/client.ts`.
- **Resultado 2 (con el fix), 2 corridas completas contra workerd: 14/14 specs
  en verde**, 0 respuestas 500 en el log de wrangler, BD identica al baseline
  tras cada corrida. Rafagas de humo: 20 GET secuenciales + 12 en paralelo a una
  ruta con DB, 32/32 en 200. Conexiones: `pg_stat_activity` no muestra
  acumulacion (12-13 idle, todas de servicios de Supabase y 2 de Supavisor, igual
  antes y despues de apagar wrangler): no hay fuga de conexiones por request.
- **Lo que SI funciono en workerd sin cambios:** TCP directo a Supabase con
  `nodejs_compat`; escrituras dentro de `db.transaction` con pool `max: 1` (los
  deadlocks de F2-25 no reaparecen: `writeAuditLog`/`resolveEffectiveServiceFor`
  con `tx` estan sanos); `cash.open/close`, `sale.create`, `sale.refund`,
  `appointment.book_public`, `appointment.reschedule`, cancelacion del cliente y
  `joinQueue` con sus `audit_log` reales; el `EXCLUDE` anti doble-booking; login
  con Supabase Auth (cookies) y guards de sede; el fix de `Date` en `time_off`.
  Ninguna diferencia funcional de comportamiento frente a Node.
- **Tiempos medidos (mismo Supabase real, misma maquina):**
  - Suite Playwright completa (7 specs, suma de duraciones): `next start` 49.2 s;
    `next dev` 67.9 s (corrida 1) / 64.3 s (final); **workerd 66.8 s (corrida 1)
    / 61.3 s (corrida 2)**. O sea workerd ~1.25x `next start` y a la par de
    `next dev`.
  - Por spec, workerd vs `next start` (s): 01 10.3-12.6 vs 6.8; 02 11.3-11.5 vs
    9.8; 03 5.8-6.0 vs 5.3; 04 5.0-5.3 vs 4.4; 05 5.4-5.6 vs 4.3; 06 7.3-8.8 vs
    6.8; 07 13.7-19.5 vs 11.8.
  - GET de una ruta con lectura de DB (`/don-bigote/book`): **workerd ~0.78 s
    (media de 20 seguidas; min 0.69, max 0.87 salvo el arranque en frio 1.26 s)
    vs Node `next start` 0.275 s.** La diferencia (~0.4-0.5 s por request) es el
    costo de abrir una conexion nueva por request (TCP + TLS/auth con Supavisor +
    carga de tipos `pg_type` de postgres.js), que en Node se amortiza con el
    singleton. En paralelo (12 a la vez) 0.81-0.91 s: no se serializan.
  - Server Actions (POST, log de wrangler): `/queue` (dar turno) media 2.2 s (max
    3.8 s), `/checkout` (cobro) 2.3 s, `/register` (abrir/cerrar/anular) 1.4 s,
    `/today` (reprogramar) 1.7 s, `/appointments` (cancelar) 1.4 s, reserva
    publica 1.5 s (max 3.5 s), login 0.38 s media (muestras pequenas: n=1 a 6
    por ruta). Ninguno cerca del timeout de 30 s de los specs; cada accion paga
    1-N idas y vueltas a Supabase (ca-central-1) desde la maquina de desarrollo,
    asi que en produccion (worker en el borde, mas cerca de la region de la DB)
    deberian ser menores; no se midio en produccion porque no se despliega en
    esta sesion.
- **Deuda / riesgos que quedan del runtime:**
  1. **Costo de conexion por request (~0.4 s).** Opciones, sin hacer hoy:
     `fetch_types: false` en postgres.js (evita la consulta de tipos en cada
     conexion; hay que validar los arrays `text[]` de `clients.tags`),
     Cloudflare Hyperdrive (pool + cache de conexiones a nivel de plataforma, es
     la solucion recomendada), o reducir round-trips por accion.
  2. No se cierran explicitamente los clientes por request (`client.end()` /
     `ctx.waitUntil`): workerd cierra los sockets al terminar la request y no se
     vio acumulacion en `pg_stat_activity`, pero conviene revisarlo bajo carga
     real con el Supavisor de produccion (limite de conexiones del pooler).
  3. Esto se verifico en **wrangler dev local** (workerd real, pero red desde la
     maquina de desarrollo); no en el Worker desplegado. Los limites de CPU/
     memoria y de subrequests de Workers en produccion no se ejercitaron.
  4. `src/lib/db/client.ts` conserva el comentario historico de que el spike no
     se ejecuto end-to-end; ahora si se ejecuto (esta entrada lo documenta).

### Otros hallazgos corregidos

- **`npm run test` borraba una fila del seed y dejaba `audit_log` huerfano**
  (`src/lib/actions/__tests__/public-booking.concurrency.test.ts`). Detectado
  porque, tras `npm run test`, la BD dejo de ser identica al seed (appointments
  8 -> 7, audit_log 0 -> 1). Causa: el bloque de "auto-reparacion" del test
  borraba las citas del barbero 1 con `price_at_booking = 500.00` y `source =
  admin`, marca que **tambien cumple la cita fija del seed `...0801`** (Fade a
  RD$500 del barbero 1); y el `createPublicBookingAction` real del segundo caso
  escribe `audit_log` `appointment.book_public` que el test nunca borraba (una
  fila huerfana por corrida; era el origen de una de las 4 filas de audit que ya
  habia al empezar). Fix: se excluyen los IDs fijos del seed del DELETE de
  auto-reparacion y se borra el `audit_log` de las citas creadas. Verificado:
  reseed + `npm run test` x2 -> conteos y hashes identicos al baseline (131
  tests en verde). La fila huerfana que la corrida previa al fix habia dejado
  se borro por ID.
- **Observacion de entorno (no es bug del repo):** en esta maquina el puerto
  3000 lo ocupa el `next dev` de OTRO proyecto (`...\SaaS\Agendalo`). Con la
  config por defecto (`reuseExistingServer`), `npx playwright test` habria
  reutilizado ESE servidor y probado la app equivocada (falla con 404/timeouts
  enganosos). No se toco ese proceso. Por eso las corridas "contra next dev" de
  esta sesion se hicieron con un `next dev -p 3100` propio + `E2E_BASE_URL=
  http://localhost:3100` (mismo codigo, mismo modo dev). Ademas, la primera
  instancia de `next dev` en 3100 sirvio 404 en todas las rutas `/sede/*` (403
  correcto tras reiniciarla): estado inconsistente de Turbopack en esa
  instancia, no reproducible tras reiniciar; sin causa raiz confirmada.
- **`.dev.vars` no estaba en `.gitignore`:** habria quedado como candidato a
  commit con `DATABASE_URL` y la service-role key. Agregado.

### Decisiones tomadas sin respaldo explicito en los backlogs

1. Se arreglo `src/lib/db/client.ts` y el test de concurrencia (fuera del texto
   literal de la tarea) por ser un bug de produccion y uno de higiene de BD
   descubiertos con la evidencia de esta sesion, tal como pedia "arreglalo si es
   un bug de codigo".
2. La corrida "por defecto" de Playwright no fue posible tal cual por el puerto
   3000 ocupado por otro proyecto (ver arriba); se uso `E2E_BASE_URL`.
3. `.dev.vars` se dejo en disco (ignorado por git) para poder repetir la
   verificacion en workerd; wrangler/workerd/esbuild de este repo estan
   apagados.
4. Se borro a mano el residuo E2E previo a la sesion (por nombre/ID, con el
   propio helper) para poder fijar el baseline pedido.

## 2026-09-18 — Saldo de deuda tecnica abierta de F2 (seed, round-trips, a11y, anular venta)

Sesion dedicada a cerrar 4 deudas que quedaron documentadas al cierre de F2.
Un commit por tarea, sobre `main`. **Estado final verificado, en este orden:**
`npm run typecheck` (0 errores), `npm run lint` (0 errores; 1 warning ajeno en
`coverage/block-navigation.js`, archivo generado), `npm run test` (11 archivos,
**104 tests** — 1 nuevo vs. los 103 anteriores), `npm run build` completo
(25 rutas, Turbopack) y la suite Playwright entera (`npx playwright test`):
**7 de 7 specs en verde** (los 6 anteriores + el nuevo `07-anular-venta`).
Sin `npm run deploy`, sin tocar `wrangler.jsonc`, credenciales ni `.env.local`.

Commits de esta sesion (en orden): `fcb257a` (seed), `51d7c0f` (round-trips),
`a816328` (a11y), `adb67b9` (anular venta), mas el commit de este CHANGELOG.

### Tarea 1 — Fragilidad del re-seed (`src/lib/db/seed.ts`)

- **Problema:** `npm run db:seed` fallaba en cualquier momento del dia distinto
  al del ultimo seed con `conflicting key value violates exclusion constraint
  "appointments_no_overlap_per_barber"` (codigo `23P01`). Esto ya nos habia
  obligado a limpiar filas a mano en Supabase.
- **Causa raiz:** las 8 citas de hoy de F2-24 (IDs fijos `...0801`-`...0808`) tienen
  horas ancladas a `now`, y el seed las actualizaba una por una con
  `onConflictDoUpdate`. El `EXCLUDE` de `0002_f2_integrity.sql` **no es
  `DEFERRABLE`**, asi que Postgres lo evalua en cada UPDATE: al mover la cita
  0802 a su nueva hora, esta se solapaba con la cita 0803 del mismo barbero que
  todavia conservaba la hora vieja. Reproducido a proposito antes de tocar codigo:
  desplazando las 8 filas -2 h (equivale a haber sembrado 2 h antes) y
  corriendo el seed viejo, fallo exactamente en la fila `...0802` (barbero
  `...0101`). Nota: un desplazamiento de +7 h NO reproducia el choque (ningun
  solapamiento transitorio), por eso el bug era intermitente y dependia de la hora.
- **Solucion:** `seedTodayAppointments` ahora hace, dentro de una sola
  `db.transaction(async (tx) => ...)`, un `DELETE` de los 8 IDs fijos
  (`inArray(appointments.id, APPOINTMENT_TODAY_IDS)`) y luego los inserta de
  nuevo (con `onConflictDoNothing` solo como red de idempotencia por id). Todo
  dentro de la transaccion usa `tx` (regla del pool `max: 1`). Sin cambios de
  schema. Solo toca los IDs fijos del seed, nunca citas reales;
  `sales.appointment_id` es `on delete set null`, y ninguna venta del seed
  referencia esas citas. Como los inserts pasaron a `tx.insert(...)`, el test
  estatico de idempotencia (`seed.test.ts`, que busca `db.insert`) no los ve;
  se agrego un test que verifica que `seedTodayAppointments` usa
  `db.transaction` + `tx.delete(appointments)` y ya no `.onConflictDoUpdate(`.
- **Archivos:** `src/lib/db/seed.ts`, `src/lib/db/__tests__/seed.test.ts`.
- **Verificacion contra el Supabase real (`.env.local`):** seed con la base ya
  rota por el escenario -2 h -> termina sin error; se volvio a desplazar -2 h y
  re-sembrar -> OK; desplazar +7 h y re-sembrar -> OK; 2 corridas mas
  seguidas -> OK. Las 8 citas quedan con las horas correctas (0801..0808, 3
  barberos, sin solapamiento). `count(*)` estable entre corridas:
  appointments 12, walk_in_queue 5, cash_sessions 5, sales 9, sale_items 9,
  schedules 18 (los numeros incluian residuos de E2E previos, ver Limpieza;
  lo relevante es que **no cambian entre corridas**, o sea no duplica).
- **Deuda que queda:** el seed no es atomico en su conjunto (cada tabla se
  siembra por separado); solo esta parte lo es. No hace falta hoy.

### Tarea 2 — `getAvailability` de 8 a 3 round-trips (`src/lib/scheduling/availability.ts`)

- **Problema:** el AC de F2-04 exigia <=3 round-trips a la DB para un dia
  completo; F2-25 midio 8 y lo dejo como deuda.
- **Medicion ANTES/DESPUES** (`scripts/measure-availability-roundtrips.ts` +
  `DEBUG_DB_ROUNDTRIPS=1`, contra el Supabase real, sede Naco, un dia):
  **ANTES: 8** (sede, barberos, servicio, override, schedules,
  barber_services, time_off, citas). **DESPUES: 3.** (La linea de `pg_type`
  que imprime el script al principio es la carga unica de OIDs de postgres.js
  al abrir la conexion; no es de `getAvailability`, y estaba tambien antes.)
- **Solucion (Drizzle tipado, sin SQL a mano, sin `Promise.all` que solo solapa):**
  1. sede `LEFT JOIN` servicio `LEFT JOIN` override de precio/duracion de esa sede (1 fila).
  2. `barber_locations` activos `INNER JOIN users` `LEFT JOIN schedules` (bloques
     activos de esa sede) `LEFT JOIN barber_services` (duracion custom); una fila
     por barbero x bloque. `barber_services` tiene indice unico (user, service),
     asi que no multiplica filas.
  3. `time_off` aprobado `UNION ALL` citas activas del rango, ambos filtrados
     con un **subquery** de barberos activos de la sede (`inArray(col, subquery)`),
     asi no hace falta conocer los ids antes. Las citas siguen siendo las del
     barbero en cualquier sede (D-F2-5). Un literal `kind` distingue las filas.
  Luego se reagrupa en memoria y se delega al motor puro sin cambios. Contrato
  de `getAvailability` y de `resolveEffectiveServiceFor` intactos; el motor
  puro `src/lib/scheduling/index.ts` no se toco.
- **Verificacion de correccion:** un script temporal (ya borrado) comparo la
  implementacion vieja (copia) contra la nueva en 62 casos (3 sedes x 5
  servicios x 4 variantes de `barberId`: ninguno, barbero 1, barbero 3
  multi-sede, id inexistente; mas servicio inexistente y sede inexistente),
  rango de 7 dias: **62/62 identicos, 5,467 slots comparados**. Se repitio con
  una fila `time_off` aprobada temporal (barbero 1, hoy +1h..+4h) para ejercitar
  la rama de la UNION: tambien identicos (5,379 slots, o sea el time_off recorto
  slots igual en ambas versiones); la fila se borro. Los 104 tests de Vitest y
  los E2E `01-reservar` y `06-reprogramar-cita` siguen en verde.
- **Archivos:** `src/lib/scheduling/availability.ts`,
  `scripts/measure-availability-roundtrips.ts` (solo el comentario con el historial).
- **Deuda que queda:** 3 es el objetivo del backlog; se podria bajar a 1-2 con
  una sola consulta con CTEs, pero no aporta nada medible hoy. No se midio
  latencia real bajo carga contra el Supabase de produccion. Nota de diseno: el
  rango del dia usa limites en UTC (`T00:00:00Z`..`T23:59:59.999Z`), igual que
  antes; el corte por zona horaria de la sede lo hace el motor puro.

### Tarea 3 — Accesibilidad: labels sin `htmlFor`

- **Problema:** `FormField` renderizaba `<label>` y control como hermanos sin
  `for`/`id`; un lector de pantalla no anunciaba el campo y `getByLabel` de
  Playwright no lo encontraba (por eso existia el locator artesanal
  `fieldInput`). Afectaba booking-wizard, queue-realtime-list, checkout-form,
  cash-register-panel, appointment-sheet y create-appointment-sheet.
- **Causa raiz:** `FormField` tenia un prop `htmlFor` opcional que casi nadie
  pasaba, y los controles hijos (`Input`) no tenian forma de conocer el id.
- **Solucion, centralizada:** `FormField` (ahora `"use client"`) genera un id
  con `useId` (o respeta el `htmlFor` explicito), lo pone en el `<label for>` y
  lo publica por un contexto (`useFormFieldControl`). `Input` y el nuevo
  `Textarea` (`src/components/ui/textarea.tsx`) lo consumen: heredan `id`,
  `aria-describedby` (apunta al helper/error, que ahora tiene id) y
  `aria-invalid` cuando hay `error`; lo que el llamador pase explicito gana.
  Los ~60 usos de `<FormField label=..><Input/></FormField>` quedaron
  arreglados **sin editarlos**. Unica edicion de componente: el `<textarea>`
  crudo de `cash-register-panel.tsx` pasa a `Textarea` (un `<textarea>` crudo
  no puede leer el contexto). `Select` y `Combobox` (base-ui) **ya** pasaban su
  propio id como `htmlFor` al FormField y lo ponian en el Trigger / Input, asi
  que no necesitaron cambio: se verifico (no se asumio) porque el E2E 06 ya
  usa `getByLabel("Barbero")` sobre un Select y el 02 `getByRole("combobox",
  { name: "Servicio" })`, y ambos pasan. Los formularios de auth
  (`login-form`, etc.) usan `Label htmlFor` + `Input id` manuales; no dependen
  del contexto y siguen igual.
- **E2E:** `fieldInput` se elimino por completo de `e2e/helpers.ts` (ningun
  control lo sigue necesitando); los 6 specs usan
  `page.getByLabel("X", { exact: true })` (`exact` porque "Telefono" y
  "Telefono (opcional)" coexisten).
- **Archivos:** `src/components/ui/field.tsx`, `src/components/ui/input.tsx`,
  `src/components/ui/textarea.tsx` (nuevo), `src/components/kortex/cash-register-panel.tsx`,
  `e2e/helpers.ts`, `e2e/01..06-*.spec.ts`.
- **Verificacion:** suite Playwright completa (6 specs en ese momento) en verde.
- **Deuda que queda:** un `FormField` debe envolver UN solo control (con varios
  compartirian id); esta documentado en el codigo. `Select`/`Combobox` no
  enlazan el helper/error con `aria-describedby` (el id de mensaje existe pero
  su trigger no lo referencia). No se hizo una auditoria de accesibilidad
  completa (foco, contraste, lectores reales), solo la asociacion label-control.

### Tarea 4 — UI para anular una venta (F2-22)

- **Problema:** `voidSaleAction` existia y estaba probado (Vitest de
  integracion) pero ninguna pantalla lo llamaba: un gerente no podia anular una
  venta desde Kortex.
- **Reglas respetadas (F2-22 / D-F2):** solo admin/superuser, solo si la caja de
  esa venta sigue abierta, motivo obligatorio, `audit_log` `sale.refund` con
  `before`/`after`. Todas las sigue imponiendo el servidor
  (`voidSaleAction`, sin cambios); la UI no es autoridad de nada.
- **Solucion:**
  - `listOpenSessionSales(locationId)` en `src/lib/actions/cash-register.ts`:
    Drizzle, con `requireLocationScope` + `assertManagerRole` dentro de la
    propia funcion. Devuelve las ventas de la caja abierta (mas recientes
    primero, incluidas las anuladas, marcadas) con cliente, servicios, metodo
    de pago, total en centavos y la hora ya formateada en el servidor con la
    zona horaria de la sede (evita desfase de hidratacion). 2 queries (ventas
    + items), no N+1.
  - `src/components/kortex/open-session-sales.tsx` (nuevo): lista con boton
    "Anular" por venta (`aria-label` "Anular venta de <cliente>"), `Sheet` con
    resumen (cliente, servicios, `MoneyDisplay`), aviso de que solo en efectivo
    baja el esperado del cierre, campo "Motivo de la anulacion (obligatorio)"
    y botones destructivo "Anular venta" / "Volver". Sin motivo, el sheet lo
    pide en el propio campo y no llama al servidor. Tras anular: aviso
    `role="status"` sobrio ("Venta anulada: <cliente>, RD$ 500.00. Ese monto
    sale del efectivo esperado en el cierre."), sin exclamaciones ni emoji
    (BRAND-BRIEF §2.2/§2.3), montos con `MoneyDisplay`; la fila pasa a
    "Anulada" tras `router.refresh()`.
  - `register/page.tsx`: monta la lista debajo del panel solo si es gerente y
    hay caja abierta (el barbero no ve la lista; D-F2-9).
- **Bug/hueco de seguridad encontrado y corregido:** `loadCashRegisterState`
  (misma "use server") no llamaba a ningun guard: al ser una funcion exportada
  de un modulo `"use server"` es tambien un endpoint invocable, asi que
  cualquier usuario autenticado podia pedir el estado de caja de cualquier sede
  pasando su id. Solo estaba protegida por el guard de las 3 paginas que la
  llaman. Se agrego `await requireLocationScope(locationId)` dentro de la
  funcion. Riesgo residual del mismo tipo: revisar el resto de las funciones de
  lectura exportadas desde archivos `"use server"` (no se auditaron todas en
  esta sesion).
- **E2E `e2e/07-anular-venta.spec.ts`:** login como `admin.naco`; abre caja por
  la UI si no hay (04-cerrar-caja la deja cerrada); cobra una venta libre en
  efectivo (cliente nuevo con nombre unico); en `/register` intenta anular sin
  motivo (verifica el mensaje y en la DB que la venta sigue `paid`); luego con
  motivo. Verifica en pantalla el aviso y que desaparece el boton, y en la DB
  `sales.status = 'refunded'` y `audit_log` `sale.refund` con `before.status =
  'paid'`, `after.status = 'refunded'`, `after.reason` = el motivo y
  `actor_user_id` = `admin.naco`. Limpia todo lo suyo (audit_log, venta con
  sale_items en cascade, cliente y la caja si la abrio el, sin tocar la del
  seed). Se reviso a ojo la pantalla (captura del sheet y del estado
  posterior). Paso a la primera y en la corrida completa de 7 specs.
- **Archivos:** `src/lib/actions/cash-register.ts`,
  `src/components/kortex/open-session-sales.tsx` (nuevo),
  `src/app/(location)/sede/[locationId]/register/page.tsx`,
  `e2e/07-anular-venta.spec.ts` (nuevo).
- **Deuda que queda (no es de esta tarea, observada):** `voidSaleAction` solo
  cambia `sales.status`; no revierte `clients.total_visits/total_spent/
  last_visit_at` ni devuelve la cita a un estado cobrable (queda `completed`), y
  hay que revisar si el indice `sales_appointment_id_uq` excluye `refunded`
  (para poder volver a cobrar esa cita). Anular una venta con caja ya cerrada
  sigue bloqueado (correcto por F2-22) y la UI no lista ventas de cajas
  cerradas. Tras cerrar la caja, la lista sigue visible hasta pulsar "Listo"
  (el servidor rechaza igual si se intenta anular).

### Limpieza de la base real y estado final

- Los specs 01-04 (de F2-25) **no limpian sus datos** (dejan citas, clientes
  "Cliente E2E ...", turnos "Walkin E2E ...", ventas, cajas y filas de
  `audit_log`), y ademas 03/04 abren/cierran cajas. Al empezar esta sesion ya
  habia residuo acumulado de sesiones anteriores. Al terminar se borro todo lo
  identificable como E2E (ventas de clientes E2E, cajas fuera de las 2 del
  seed, citas y turnos de E2E, 17 clientes E2E y las 52 filas de `audit_log`,
  que el seed no genera) y se re-sembro. Resultado verificado con `count(*)`:
  appointments 8, walk_in_queue 3, cash_sessions 2 (1 abierta = la de hoy del
  seed), sales 5, sale_items 5, clients 5 (2 con cuenta + 3 walk-in),
  audit_log 0, time_off 0.
- **Deuda:** los specs 01-04 deberian limpiar lo suyo como hacen 05/06/07
  (queda como tarea; no se toco en esta sesion para no ampliar el alcance).
  Mientras tanto, cada corrida completa de Playwright deja residuo y hay que
  limpiar a mano (o extender esos specs con `afterAll`).

### Decisiones tomadas sin respaldo explicito en los backlogs

1. Se agrego el guard dentro de `loadCashRegisterState` (arriba): cambio de
   comportamiento minimo fuera del texto literal de la tarea, por ser un hueco
   de seguridad evidente.
2. `listOpenSessionSales` exige rol de gerente (no solo pertenecer a la sede):
   la lista solo existe para anular.
3. La lista muestra tambien las ventas ya anuladas (marcadas "Anulada") para
   que el gerente vea el historial de la caja y el total coherente con el
   cierre.
4. El aviso post-anulacion distingue efectivo (baja el esperado) de otros
   metodos (no lo cambia), porque el esperado de F2-23 solo suma ventas `cash`.
5. Se creo `Textarea` como componente de `ui/` en lugar de `cloneElement` en
   `FormField`, para no adivinar el tipo del hijo.
6. La limpieza de residuos E2E previos a esta sesion (no solo los de esta
   corrida) se hizo porque el encargo pedia dejar la base limpia; se identifico
   por nombre "E2E" y por IDs fuera del rango del seed.

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
