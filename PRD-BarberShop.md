# PRD: Kortex — SaaS de Gestión para Barberías Multi-Sede

## Información General
- **Nombre del proyecto:** Kortex *(confirmado — ver §18)*
- **Dominio:** kortexbarber.com *(comprado — Cloudflare Registrar, 16 sep 2026)*
- **Empresa:** W-Tech (Williams R. Villavizar Hdez.)
- **Fecha:** 16 de septiembre de 2026
- **Versión:** 1.0 (aprobado)
- **Estado:** ✅ Aprobado por Williams (16 sep 2026). Se maneja de momento como **plan
  piloto** (sin registro de marca en ONAPI todavía — ver `BRAND-BRIEF-Kortex.md` B10).
  Planeación (PRD + brand brief + UX brief) completa; **desarrollo aún no iniciado**,
  pausado en espera de retomar F0 (validación de mercado) o pasar directo a construir
- **Timeline objetivo MVP:** 10-12 semanas (part-time)
- **Mercado inicial:** República Dominicana → expansión LATAM (PR, PA, CO, MX)
- **Deploy:** Cloudflare (Workers/Pages) — Williams ya tiene dominio en esa plataforma

---

## 1. Resumen Ejecutivo

**Kortex** es un SaaS vertical de gestión operativa para **cadenas de barberías con
múltiples sucursales**. No es un sistema de reservas genérico: es el sistema operativo
de una cadena de barberías, construido alrededor de tres realidades que el software
genérico ignora:

1. **La cadena es la unidad de negocio, no la sucursal.** El dueño necesita comparar
   sedes entre sí, mover barberos entre locales y ver un P&L consolidado.
2. **El barbero cobra por comisión o alquila la silla.** El cálculo de pago por barbero
   (comisión %, silla fija, mixto, propinas) es la operación más dolorosa y manual de
   una barbería, y casi ningún software genérico la resuelve bien en español.
3. **El walk-in es el 40-60% del volumen.** Una barbería no vive solo de citas
   agendadas; vive de una cola de espera en tiempo real que el software debe modelar.

Kortex se diferencia de **Agendalo** (el otro SaaS de W-Tech) de forma deliberada:
Agendalo es *horizontal y de una sola sede* (belleza, salud, fitness, gastronomía),
optimizado para el negocio independiente que solo necesita agenda online. Kortex es
*vertical, multi-sede y operativo*: agenda + cola de walk-ins + POS + comisiones +
inventario + analítica comparativa entre sucursales. **No compiten por el mismo
cliente** y esa separación debe mantenerse en el pricing y el marketing.

---

## 2. Problema y Oportunidad

### 2.1 El problema

Cuando una barbería en RD pasa de 1 a 2-5 locales, su operación se rompe:

| Dolor | Cómo se resuelve hoy (mal) |
|---|---|
| El dueño no sabe qué sede rinde mejor | Pide fotos de cuadernos por WhatsApp a cada gerente |
| Cálculo de comisiones de barberos | Excel manual cada quincena, con errores y reclamos |
| Inventario de productos (ceras, tintes, shampoo, cuchillas) | Nadie lo lleva; se pierde producto y no se sabe cuánto |
| Un barbero cubre en otra sede | No hay forma de reflejarlo; la comisión se calcula mal |
| El cliente quiere ir a la sede más cercana hoy | Llama a cada local por separado |
| Cola de walk-ins | Lista de nombres en papel o en la cabeza del recepcionista |
| Efectivo vs. transferencia vs. tarjeta | Conciliación manual al cierre del día |

### 2.2 La oportunidad

- Las barberías tipo "cadena" son un segmento en crecimiento explosivo en RD, PR y
  LATAM (modelo de barbería premium/urbana con 2-8 locales y marca propia).
- **El software líder no habla su idioma ni su operación:** Fresha y Square Appointments
  **no tienen soporte multi-sede real**; Booksy lo tiene limitado y su foco es el
  *marketplace* (le cobra al negocio por traerle clientes, lo cual las cadenas con marca
  propia no necesitan ni quieren). Zenoti y Boulevard sí resuelven multi-sede y
  comisiones, pero son productos enterprise en inglés, con precios en USD de 3 dígitos
  al mes y procesos de venta largos — inviables para una cadena dominicana de 3 sedes.
- Los jugadores LATAM (WeiBook, AlpacaPOS, AgendaPro) son horizontales de belleza; solo
  AlpacaPOS toca multi-sede, y ninguno resuelve comisiones/alquiler de silla a fondo.
- **Hueco claro:** producto en español, precio en DOP, específico de barbería,
  multi-sede de primera clase, con comisiones y cola de walk-ins. Ese es Kortex.

### 2.3 Análisis competitivo

| Competidor | Multi-sede | Comisiones/booth rent | Walk-in queue | Inventario | Español LATAM | Precio |
|---|---|---|---|---|---|---|
| **Fresha** | No | Básico | No | Sí | Parcial | ~US$14.95/staff/mes + 20% comisión marketplace |
| **Booksy** | Limitado | Básico | Parcial | Limitado | Sí | US$29.99–79.99/mes por local |
| **Square Appointments** | Limitado | Vía Square Payroll (solo US) | No | Solo plan pago | Parcial | Free–US$29/mes |
| **Zenoti** | Sí (fuerte) | Sí | Sí | Sí | Parcial | Enterprise, US$$$ (cotización) |
| **Boulevard** | Sí | Sí (fuerte) | Sí | Sí | No | Enterprise, solo US |
| **WeiBook / AgendaPro** | Parcial | No | No | Básico | Sí | US$20–60/mes |
| **AlpacaPOS** | Sí | No | No | Sí | Sí | LATAM, gama media |
| **Agendalo (W-Tech)** | No (roadmap v1.3) | No | No | Sí (Pro) | Sí | RD$5,000–10,000/mes |
| **Kortex** | **Sí, núcleo** | **Sí, núcleo** | **Sí** | **Sí, por sede** | **Sí, nativo** | **RD$ — ver §7** |

### 2.4 Diferenciación explícita vs. Agendalo

Esto es crítico para no canibalizar el producto existente:

| Dimensión | Agendalo | Kortex |
|---|---|---|
| Vertical | Horizontal (cualquier servicio) | Solo barberías |
| Unidad de negocio | 1 negocio = 1 local | 1 cadena = N sedes |
| Cliente ideal | Negocio independiente, 1-5 empleados | Cadena de 2-8 sedes, 10-50 barberos |
| Núcleo del producto | Agenda + página pública | Operación: cola, POS, comisiones, inventario |
| Rol superuser | No existe | Existe y es el centro del producto |
| Ticket promedio | RD$5,000-10,000/mes | RD$9,000-30,000+/mes |
| Motivo de compra | "Quiero que me reserven online" | "No sé cuánto gana cada sede ni cuánto pagarle a cada barbero" |

**Regla de no canibalización:** si un prospecto tiene **una sola sede y no maneja
comisiones**, se le vende Agendalo. Kortex tiene un plan de 1 sede solo como puerta de
entrada para cadenas en formación (ver §7.3).

---

## 3. Público Objetivo

### 3.1 Segmento primario (ICP)
Cadena de barberías con **2 a 8 sucursales** en RD/LATAM, marca propia, 4-10 barberos
por sede, ticket promedio RD$400-1,200 por servicio, mezcla de citas y walk-ins,
barberos pagados por comisión (50-60% típico) o alquiler de silla.

### 3.2 Segmento secundario
- Barbería única con **ambición de expandirse** (plan Local como puerta de entrada).
- Franquicias de barbería que necesitan visibilidad sobre locales franquiciados.
- Academias/escuelas de barbería con sede comercial anexa (fase posterior).

### 3.3 Fuera de alcance (anti-persona)
- Barbero independiente solo (le sirve Agendalo o Booksy).
- Salones de belleza full-service con servicios de 3+ horas y cabinas (otra operación).
- Spas y clínicas estéticas.

### 3.4 Personas

**Ramón — Dueño de la cadena (superuser), 38 años.**
Tiene 4 locales. No está en el piso; está comprando locales nuevos. Quiere abrir el
teléfono a las 9pm y ver cuánto facturó cada sede hoy, cuál está cayendo, y si el
gerente de Los Alcarrizos está inflando descuentos. Hoy recibe fotos de cuadernos.
*Métrica que le importa: ingreso por sede, ingreso por silla, retención de clientes.*

**Kelvin — Gerente de sede (admin), 29 años.**
Abre y cierra el local. Arma el horario de 6 barberos, gestiona la cola de walk-ins en
hora pico, cobra, cuadra la caja y hace el corte de comisiones cada quincena en Excel.
*Métrica que le importa: ocupación de sillas, cuadre de caja sin descuadres.*

**Yarisel — Cliente final (client), 26 años.**
Lleva a su hijo cada 2 semanas. Quiere reservar con **su barbero específico**, en la sede
que le quede de camino ese día. Si su barbero está en otra sede esa semana, quiere saberlo.
*Métrica que le importa: reservar en < 60 segundos y que le respeten la hora.*

---

## 4. Propuesta de Valor

> **"Tu cadena de barberías completa en una sola pantalla: cuánto facturó cada sede,
> cuánto le toca a cada barbero, y qué producto se está acabando — sin un solo Excel."**

**Tres promesas verificables:**

1. **Visibilidad consolidada:** el dueño ve y compara todas sus sedes en un dashboard
   único, en tiempo real, sin llamar a nadie.
2. **Comisiones automáticas:** el cálculo de pago por barbero (comisión, silla, propinas,
   venta de producto) se genera solo al cierre del período — cero Excel, cero reclamos.
3. **Un cliente, toda la cadena:** el cliente reserva en cualquier sede con un solo
   perfil y su historial lo sigue a donde vaya.

---

## 5. Modelo Multi-Sede (núcleo del producto)

Esta sección define la característica diferenciadora principal y debe implementarse
correctamente desde el día 1, porque condiciona todo el esquema de datos.

### 5.1 Jerarquía

```
chain (cadena)  ──┬── location (sede) A ──┬── barbers asignados
                  │                       ├── services (precios por sede)
                  │                       ├── inventory (stock por sede)
                  │                       ├── appointments / walk-in queue
                  │                       └── cash register (caja diaria)
                  ├── location (sede) B ...
                  ├── clients (compartidos a nivel CADENA)
                  ├── subscription (una por cadena)
                  └── brand settings (logo, colores, dominio)
```

**Decisiones de modelado (justificadas):**

- **`chain` es el tenant.** Toda la seguridad, facturación y branding cuelgan de la
  cadena. Esto evita el error de tratar cada sede como un negocio independiente
  (error que obligaría a duplicar clientes y a que el dueño tenga N cuentas).
- **Los clientes pertenecen a la cadena, no a la sede.** Un cliente = un perfil = un
  historial, aunque se corte en 3 sedes distintas. Esto es una ventaja competitiva
  directa y habilita retención, marketing y programa de lealtad cross-sede.
- **Los servicios se definen a nivel cadena, con precio override por sede.** Una cadena
  quiere un catálogo consistente ("Corte clásico", "Fade + barba") pero necesita cobrar
  distinto en Naco que en San Cristóbal. Solución: `services` a nivel cadena +
  `location_service_overrides` (precio, duración, activo/inactivo).
- **El inventario es estrictamente por sede.** El stock es físico; no se comparte. Sí se
  permite registrar **transferencias entre sedes** (fase 2).

### 5.2 Barberos multi-sede

Un barbero **puede trabajar en más de una sede** (caso real y frecuente: el barbero
estrella rota, o cubre vacaciones).

- Tabla puente `barber_locations` (barbero ↔ sede) con **sede primaria** marcada.
- El **horario se define por barbero y por sede**: lunes-miércoles en Sede A,
  jueves-sábado en Sede B. El sistema **impide solapamientos** entre sedes (validación
  dura: un barbero no puede tener bloques simultáneos en dos sedes).
- La **comisión puede configurarse distinta por sede** (ej. 50% en su sede primaria,
  60% cuando cubre en otra). Default: hereda la regla de su sede primaria.
- El **reporte de pago del barbero es consolidado a nivel cadena**, desglosado por sede.
  Esto es exactamente lo que hoy se hace mal a mano.
- En la página pública, el perfil del barbero muestra **en qué sede está cada día**.

### 5.3 Clientes y reservas cross-sede

**Decisión: el cliente NO queda atado a una sede.** Reserva libremente en cualquier sede
de la cadena con el mismo perfil.

- El flujo de reserva ofrece **"sede más cercana"** (geolocalización opcional) y
  **"mi sede habitual"** (la última usada) como atajos.
- Vista alternativa del flujo: **"reservar con mi barbero"** → el sistema muestra en qué
  sedes y días está disponible ese barbero. Este flujo es el preferido por el segmento
  de barbería (la lealtad es al barbero, no al local).
- El historial, los puntos de lealtad y las notas del cliente (ej. "fade 2, sin línea")
  son visibles para cualquier barbero de la cadena → **experiencia consistente**, un
  argumento de venta fuerte.
- Configuración a nivel cadena: el dueño puede **restringir** la reserva cross-sede si
  su modelo de negocio lo requiere (franquicias independientes). Default: abierta.

### 5.4 Dashboard consolidado del superuser

El superuser entra y ve, en una sola pantalla:

**A. KPIs consolidados de la cadena** (rango de fecha configurable: hoy / semana / mes / custom)
- Ingreso total, servicios realizados, ticket promedio, clientes nuevos vs. recurrentes,
  tasa de no-show, ocupación promedio de sillas, venta de productos.

**B. Tabla comparativa de sedes** — la pantalla estrella del producto:

| Sede | Ingreso | Δ vs. período anterior | Servicios | Ticket prom. | Ocupación | No-show | Clientes nuevos | Ranking |
|---|---|---|---|---|---|---|---|---|
| Naco | RD$412K | +8% | 640 | RD$644 | 78% | 6% | 91 | 🥇 1 |
| Bella Vista | RD$298K | -3% | 520 | RD$573 | 61% | 11% | 44 | 2 |
| ... | | | | | | | | |

- Ordenable por cualquier columna; **semáforo de color** por desviación vs. promedio
  de la cadena.
- **Normalización obligatoria:** además del ingreso bruto, se muestra **ingreso por
  silla** e **ingreso por barbero-hora**. Sin esto, una sede grande siempre "gana" y la
  comparación es inútil para tomar decisiones.

**C. Drill-down** — clic en una sede → vista completa de esa sede (lo mismo que ve su
admin, en modo lectura+). Clic en un barbero → su rendimiento cross-sede.

**D. Rankings de cadena**
- Top barberos de toda la cadena (por ingreso, por servicios, por rating, por retención).
- Top servicios por sede (detecta que en una sede no se vende barba y ahí hay dinero).
- Horas pico por sede (para dimensionar el staff).

**E. Alertas automáticas** (fase 2)
- "Sede Bella Vista lleva 3 días con ingreso 20% bajo su promedio."
- "Sede Naco: stock de cera Reuzel por debajo del mínimo."
- "Barbero X tiene 18% de no-shows, el doble del promedio de la cadena."

---

## 6. Roles y Permisos

### 6.1 Roles

| Rol | Descripción | Alcance |
|---|---|---|
| **superuser** | Dueño/administrador de la cadena | Toda la cadena, todas las sedes |
| **admin** | Gerente de una sede | Solo su(s) sede(s) asignada(s) |
| **barber** | Barbero/estilista *(rol operativo, ver nota)* | Su propia agenda en sus sedes |
| **client** | Cliente final | Sus propios datos y reservas |

> **Nota de producto:** el brief original definía 3 roles (superuser, admin, client).
> **Confirmado con Williams: se añade `barber` como cuarto rol desde el MVP**, porque
> sin él el barbero no puede ver su agenda ni sus comisiones desde su teléfono — y eso
> es justamente lo que genera la adopción diaria del producto dentro del local. Un
> producto que solo usa el gerente se abandona.

### 6.2 Matriz de permisos

Leyenda: ✅ total · 🟡 solo su ámbito · 👁 solo lectura · ❌ sin acceso

| Capacidad | superuser | admin | barber | client |
|---|:---:|:---:|:---:|:---:|
| **Cadena y sedes** | | | | |
| Crear / editar / desactivar sedes | ✅ | ❌ | ❌ | ❌ |
| Editar datos de su sede (horario, dirección, fotos) | ✅ | 🟡 | ❌ | ❌ |
| Ver dashboard consolidado multi-sede | ✅ | ❌ | ❌ | ❌ |
| Comparar sedes entre sí | ✅ | 👁 (solo ranking anónimo, opcional) | ❌ | ❌ |
| Configurar branding de la cadena | ✅ | ❌ | ❌ | ❌ |
| **Usuarios y equipo** | | | | |
| Crear/editar admins (gerentes) | ✅ | ❌ | ❌ | ❌ |
| Crear/editar barberos | ✅ | 🟡 | ❌ | ❌ |
| Asignar un barbero a múltiples sedes | ✅ | ❌ | ❌ | ❌ |
| Definir horario de barbero | ✅ | 🟡 | 👁 | ❌ |
| Solicitar cambio de horario / día libre | ✅ | 🟡 | 🟡 | ❌ |
| **Servicios y precios** | | | | |
| Crear/editar catálogo de servicios (cadena) | ✅ | ❌ | ❌ | ❌ |
| Override de precio/duración en su sede | ✅ | 🟡 | ❌ | ❌ |
| Activar/desactivar un servicio en su sede | ✅ | 🟡 | ❌ | ❌ |
| **Citas y cola** | | | | |
| Ver todas las citas de todas las sedes | ✅ | ❌ | ❌ | ❌ |
| Ver/gestionar citas de su sede | ✅ | 🟡 | 👁 | ❌ |
| Ver/gestionar sus propias citas | ✅ | 🟡 | 🟡 | 🟡 |
| Gestionar cola de walk-ins | ✅ | 🟡 | 🟡 | ❌ |
| Reservar una cita | ✅ | 🟡 | 🟡 | 🟡 |
| Cancelar/reprogramar cita propia | ✅ | 🟡 | 🟡 | 🟡 (según política) |
| Marcar cita como completada / no-show | ✅ | 🟡 | 🟡 | ❌ |
| **Dinero** | | | | |
| Cobrar (POS / cierre de servicio) | ✅ | 🟡 | 🟡 | ❌ |
| Aplicar descuentos | ✅ | 🟡 | 🟡 (con límite %) | ❌ |
| Abrir/cerrar caja diaria | ✅ | 🟡 | ❌ | ❌ |
| Ver reporte de caja de su sede | ✅ | 🟡 | ❌ | ❌ |
| Configurar reglas de comisión | ✅ | 👁 | 👁 | ❌ |
| Ver comisiones de todo el equipo de su sede | ✅ | 🟡 | ❌ | ❌ |
| Ver sus propias comisiones/propinas | ✅ | 🟡 | 🟡 | ❌ |
| Cerrar/aprobar período de pago | ✅ | 🟡 (propone) | ❌ | ❌ |
| **Inventario** | | | | |
| Definir catálogo de productos (cadena) | ✅ | ❌ | ❌ | ❌ |
| Ajustar stock de su sede | ✅ | 🟡 | ❌ | ❌ |
| Transferir stock entre sedes | ✅ | 🟡 (solicita) | ❌ | ❌ |
| Ver stock de todas las sedes | ✅ | 👁 | ❌ | ❌ |
| **Clientes** | | | | |
| Ver ficha completa del cliente (cadena) | ✅ | 🟡 | 🟡 (limitada: notas de corte) | ❌ |
| Editar notas de corte / preferencias | ✅ | 🟡 | 🟡 | 👁 |
| Exportar base de clientes | ✅ | ❌ | ❌ | ❌ |
| **Suscripción y facturación de Kortex** | | | | |
| Ver/cambiar plan, método de pago, facturas | ✅ | ❌ | ❌ | ❌ |

### 6.3 Reglas de seguridad derivadas
- Todo registro lleva `chain_id`; **ninguna consulta cruza cadenas**, nunca.
- `admin` y `barber` se resuelven vía `location_id` ∈ sus sedes asignadas.
- La exportación de la base de clientes es **solo superuser** (es el activo más valioso
  de la cadena; un gerente que se va no debe poder llevársela).
- Los descuentos de `barber` están topados por un % configurable a nivel cadena
  (control anti-fraude pedido explícitamente por el perfil de Ramón).

---

## 7. Modelo de Negocio y Precios

### 7.1 Decisión: modelo híbrido (base por cadena + fee por sede)

Se evaluaron tres modelos:

| Modelo | Pro | Contra | Veredicto |
|---|---|---|---|
| **Por cadena (flat)** | Simple de vender y entender | Una cadena de 8 sedes paga igual que una de 2 → o se subcobra a las grandes o se sobrecobra a las chicas; el ingreso no crece con el cliente | ❌ |
| **Por sede (puro)** | Escala con el valor entregado | Castiga la expansión, que es justo el momento en que el cliente ama el producto; el dueño duda antes de abrir sede nueva | ❌ |
| **Híbrido: base + fee/sede decreciente** | Escala con el cliente, es predecible, y premia la expansión | Un poco más complejo de explicar | ✅ **Elegido** |

**Justificación:** el valor central de Kortex (dashboard consolidado, comisiones,
cliente único cross-sede) se entrega **a nivel cadena**, pero el costo operativo y el
valor incremental crecen **por sede**. El híbrido alinea ambas cosas. El fee por sede
**decreciente** elimina la fricción de expandirse: abrir la sede 5 cuesta menos que
abrir la 2, lo que convierte a Kortex en aliado del crecimiento, no en un impuesto.

### 7.2 Estructura de precios (DOP, mensual)

| | **Local** | **Cadena** | **Franquicia** |
|---|---|---|---|
| **Base mensual** | RD$ 4,500 | RD$ 9,500 | RD$ 22,000 |
| **Sedes incluidas** | 1 | 3 | 10 |
| **Sede adicional** | RD$ 3,500 c/u (máx. 2) | RD$ 2,500 c/u | RD$ 1,500 c/u |
| **Barberos** | Hasta 5 | Ilimitados | Ilimitados |
| Agenda + reserva online | ✅ | ✅ | ✅ |
| Cola de walk-ins | ✅ | ✅ | ✅ |
| POS y cierre de caja | ✅ | ✅ | ✅ |
| Página pública de la cadena | ✅ | ✅ | ✅ |
| Recordatorios por email | ✅ | ✅ | ✅ |
| Recordatorios WhatsApp/SMS | ❌ | ✅ | ✅ |
| **Dashboard consolidado multi-sede** | ❌ | ✅ | ✅ |
| **Comparativa y ranking de sedes** | ❌ | ✅ | ✅ |
| **Motor de comisiones y booth rent** | ❌ | ✅ | ✅ |
| Barberos multi-sede | ❌ | ✅ | ✅ |
| Inventario por sede | Básico | ✅ + transferencias | ✅ |
| Programa de lealtad | ❌ | ✅ | ✅ |
| Alertas automáticas | ❌ | ✅ | ✅ |
| App móvil del barbero | ❌ | ✅ | ✅ |
| Dominio propio (white-label) | ❌ | ❌ | ✅ |
| Roles y permisos personalizados | ❌ | ❌ | ✅ |
| Exportación contable / API | ❌ | CSV | API + CSV |
| Soporte | Email 48h | WhatsApp 24h | Dedicado + onboarding presencial |

**Reglas comerciales:**
- **Prueba gratuita: 21 días** (más larga que los 14 de Agendalo — el ciclo de decisión
  de una cadena es más largo y necesita vivir al menos un cierre de quincena para
  ver el valor de las comisiones).
- **Descuento anual: 2 meses gratis** (pago 10, recibe 12) — mejora caja y retención.
- **Sin comisión por transacción de Kortex.** Solo la del proveedor de pago. Esto es
  munición directa contra Fresha (20% sobre clientes nuevos del marketplace).
- **Onboarding y migración de datos:** RD$ 8,000 único en Cadena (gratis si paga anual),
  incluido en Franquicia. Es también un filtro de seriedad del prospecto.
- **Moneda:** DOP. Precios en LATAM se listan en USD equivalente (~US$75 / US$160 / US$370).

### 7.3 Ejemplos de facturación

- Cadena de 3 sedes → RD$ 9,500/mes (plan Cadena, sin adicionales).
- Cadena de 5 sedes → RD$ 9,500 + (2 × RD$2,500) = **RD$ 14,500/mes**.
- Cadena de 8 sedes → RD$ 9,500 + (5 × RD$2,500) = **RD$ 22,000/mes** → *se le sugiere
  migrar a Franquicia por el mismo precio con 10 sedes incluidas* (upsell natural).
- Barbería de 1 sede en crecimiento → RD$ 4,500/mes (Local); al abrir la 2da,
  RD$ 8,000; al llegar a 4 sedes **debe** pasar a Cadena.

### 7.4 Unit economics (estimado)

- **ARPU objetivo:** RD$ 12,000/mes (~US$200).
- **Costo de infraestructura por cliente:** < RD$ 400/mes → margen bruto > 95%.
- **CAC estimado:** RD$ 15,000-25,000 (venta consultiva, visita presencial, demo).
- **Payback:** ~2 meses. **LTV/CAC objetivo:** > 8x con churn mensual < 3%.
- **Nota:** el churn de un producto multi-sede con comisiones es estructuralmente bajo
  — una vez que la nómina de barberos depende del sistema, migrar es muy costoso.
  Esa es la razón estratégica para poner comisiones en el MVP y no en fase 3.

---

## 8. Funcionalidades por Fase y Prioridad

Prioridades: **P0** = sin esto no se vende · **P1** = necesario para competir ·
**P2** = deseable / diferenciador futuro.

### 8.1 FASE 1 — MVP Vendible (semanas 1-8)

> **Definición de "mínimo vendible":** una cadena de 3 sedes puede operar un día
> completo en Kortex, cobrar, cerrar caja, y el dueño puede ver desde su casa cuánto
> facturó cada sede y cuánto le toca a cada barbero. Nada menos que eso se vende.

| # | Feature | Prioridad | Criterio de aceptación |
|---|---|---|---|
| 1.1 | Onboarding de cadena (registro, datos fiscales, 1ra sede) | P0 | Un dueño crea su cadena y su primera sede en < 10 min sin ayuda |
| 1.2 | Gestión de sedes (CRUD, horario, dirección, teléfono, fotos) | P0 | superuser crea, edita y desactiva sedes; una sede desactivada no aparece en reserva pública |
| 1.3 | Auth + roles (superuser/admin/barber/client) | P0 | Un admin de Sede A recibe 403 al intentar acceder a datos de Sede B, incluso por URL directa |
| 1.4 | Gestión de barberos + asignación multi-sede | P0 | Un barbero asignado a 2 sedes aparece en ambas agendas; el sistema rechaza horarios solapados entre sedes |
| 1.5 | Horarios por barbero y por sede + bloqueos/días libres | P0 | El calendario refleja disponibilidad real; un bloqueo impide reservar ese slot |
| 1.6 | Catálogo de servicios (cadena) + override de precio por sede | P0 | "Fade" cuesta RD$500 en Naco y RD$400 en San Cristóbal desde un solo catálogo |
| 1.7 | Agenda por sede (vista día/semana, columnas por barbero) | P0 | El gerente ve las 6 columnas de sus barberos en una pantalla y arrastra una cita para reprogramar |
| 1.8 | Flujo de reserva pública — 2 rutas: por sede y por barbero | P0 | Un cliente reserva en < 60s por cualquiera de las dos rutas; no se permite doble-booking |
| 1.9 | Perfil de cliente único a nivel cadena + historial cross-sede | P0 | Un cliente que se cortó en Sede A ve su historial al reservar en Sede B |
| 1.10 | **Cola de walk-ins en tiempo real** | P0 | Recepción agrega un walk-in sin cita, el sistema estima espera y lo asigna al primer barbero libre |
| 1.11 | Cierre de servicio + cobro (efectivo, tarjeta, transferencia) | P0 | Al completar una cita se registra monto, método de pago y propina |
| 1.12 | Cierre de caja diario por sede | P0 | El gerente cierra el día; el sistema muestra esperado vs. contado y registra el descuadre |
| 1.13 | **Motor de comisiones** (% por servicio, % por producto, silla fija, mixto) | P0 | Al cerrar la quincena, el sistema genera el monto exacto a pagar a cada barbero, desglosado por sede |
| 1.14 | **Dashboard consolidado multi-sede + tabla comparativa** | P0 | superuser ve KPIs de la cadena y compara sedes por ingreso, ticket, ocupación e ingreso/silla |
| 1.15 | Dashboard de sede (para admin) | P0 | El gerente ve su día: citas, cola, ingreso, ocupación |
| 1.16 | Notificaciones email (confirmación, recordatorio 24h y 2h, cancelación) | P0 | Se envían y se registran; el cliente puede cancelar desde el email |
| 1.17 | Página pública de la cadena con selector de sede | P0 | `kortexbarber.com/[cadena]` lista todas las sedes con dirección, horario y botón reservar |
| 1.18 | Suscripción y facturación (planes, prueba 21 días, pago recurrente) | P0 | Una cadena se suscribe, se le cobra automáticamente y el acceso se bloquea al vencer |
| 1.19 | Control de sedes según plan | P0 | Al intentar crear la sede 4 en plan Cadena, se cobra el adicional o se bloquea con upsell |

### 8.2 FASE 2 — Competitivo (semanas 9-16)

| # | Feature | Prioridad |
|---|---|---|
| 2.1 | Recordatorios por WhatsApp (WhatsApp Business API) — el canal real en RD | P1 |
| 2.2 | Inventario por sede: productos, stock, mínimos, descuento automático por servicio | P1 |
| 2.3 | Venta de productos en el POS (con su propia comisión al barbero) | P1 |
| 2.4 | Transferencias de stock entre sedes | P1 |
| 2.5 | App móvil del barbero (PWA): su agenda, sus comisiones, sus propinas | P1 |
| 2.6 | Reportes exportables (CSV/PDF): ventas, comisiones, caja, inventario | P1 |
| 2.7 | Depósito de garantía para asegurar la cita (anti no-show) | P1 |
| 2.8 | Política de no-show configurable (bloqueo tras N faltas) | P1 |
| 2.9 | Reseñas y rating por barbero (visible en su perfil público) | P1 |
| 2.10 | Alertas automáticas al superuser (caída de ingreso, stock bajo, no-shows) | P1 |
| 2.11 | Programa de lealtad cross-sede ("cada 10 cortes, 1 gratis") | P1 |
| 2.12 | Lista de espera inteligente (avisa al liberarse un cupo) | P1 |
| 2.13 | Gestión de gastos por sede (renta, luz, insumos) → margen real por sede | P1 |

### 8.3 FASE 3 — Diferenciación y escala (mes 5+)

| # | Feature | Prioridad |
|---|---|---|
| 3.1 | White-label: dominio propio + app con marca de la cadena | P2 |
| 3.2 | Roles y permisos personalizados (constructor de roles) | P2 |
| 3.3 | Turnos y asistencia (check-in/check-out del barbero) | P2 |
| 3.4 | Metas y objetivos por sede y por barbero, con seguimiento | P2 |
| 3.5 | Campañas de marketing segmentadas (clientes que no vuelven hace 45 días) | P2 |
| 3.6 | Forecasting de demanda por sede y hora (staffing sugerido) | P2 |
| 3.7 | API pública + webhooks (integración contable) | P2 |
| 3.8 | Integración con Azul/CardNet para tarjeta presente (RD) | P2 |
| 3.9 | Galería de trabajos por barbero (portafolio visual, estilo Instagram) | P2 |
| 3.10 | Multi-moneda y multi-país (expansión LATAM) | P2 |
| 3.11 | Módulo de franquicias: regalías, reportes al franquiciante | P2 |
| 3.12 | Asistente IA: "¿por qué bajó Bella Vista este mes?" en lenguaje natural | P2 |

### 8.4 Explícitamente FUERA de alcance (anti-scope creep)

Se documenta para poder señalar el scope creep cuando aparezca:

- ❌ **Marketplace de descubrimiento de barberías.** Es el modelo de Booksy/Fresha y
  requiere una operación de demanda (marketing al consumidor) que W-Tech no puede
  sostener. Kortex vende software, no clientes.
- ❌ **App nativa iOS/Android en fases 1-2.** PWA cubre el caso; una app nativa duplica
  el costo de mantenimiento. Reevaluar en fase 3.
- ❌ **Nómina fiscal completa (TSS, ISR, retenciones).** Kortex calcula *cuánto se le
  debe* al barbero, no hace la declaración fiscal. Riesgo legal y contable alto.
- ❌ **Contabilidad general.** Se exporta a CSV para el contador; no se replica un ERP.
- ❌ **Servicios de salón full-service** (color, tratamientos de 3h, cabinas). Otra
  operación, otro producto.
- ❌ **Kortex NO reemplaza a Agendalo** ni se le venden features horizontales.

---

## 9. Arquitectura y Stack Recomendado

### 9.1 Evaluación de opciones

| Opción | A favor | En contra | Veredicto |
|---|---|---|---|
| **Express + React + Vite + Tailwind** (scaffold anterior) | Control total del backend; separación clara | Sin SSR (malo para SEO de páginas públicas de sedes); hay que construir auth, RLS, storage y deploy a mano; dos repos/deploys; más lento de llegar al MVP | ❌ |
| **Next.js + Supabase** (igual que Agendalo) | Williams ya lo domina → velocidad real; auth, Postgres, RLS, storage y realtime incluidos; SSR para SEO local; un solo deploy | RLS se complica con jerarquías profundas (cadena→sede→rol); lógica de comisiones no debe vivir en el cliente | ✅ **Base elegida, con ajustes** |
| **Laravel + Inertia / Rails** | Excelente para lógica de negocio densa (comisiones, caja) | Williams no lo domina; curva de aprendizaje mata el timeline | ❌ |
| **Next.js + Postgres propio (Neon) + Drizzle + Auth.js** | Máximo control; sin acoplarse a Supabase | Más piezas que construir y operar solo | 🟡 Alternativa si Supabase estorba |

### 9.2 Stack recomendado

**Frontend / App**
- **Next.js 15+ (App Router) + TypeScript** — RSC para dashboards pesados de datos,
  SSR para páginas públicas por sede (SEO local: "barbería en Naco" es tráfico real).
- **Tailwind CSS v4 + shadcn/ui** — velocidad de UI consistente.
- **TanStack Query** para estado de servidor en vistas interactivas (agenda, cola).
- **Recharts** para la analítica comparativa.
- **PWA** (manifest + service worker) para la app del barbero en fase 2.

**Backend / Datos**
- **Supabase**: PostgreSQL + Auth + Storage + Realtime.
  - **Realtime es clave y es la razón principal de elegir Supabase**: la cola de
    walk-ins y la agenda compartida entre recepción y barberos deben actualizarse en
    vivo sin polling. Construir eso sobre Express requiere WebSockets a mano.
- **Drizzle ORM** sobre el Postgres de Supabase — migraciones versionadas en el repo y
  tipado end-to-end. Evita depender del editor web de Supabase para el esquema.
- **Server Actions / Route Handlers de Next.js** para toda la lógica de negocio
  sensible (comisiones, caja, cobro). **Regla dura: el cálculo de dinero nunca ocurre
  en el cliente ni depende solo de RLS.**
- **Seguridad en dos capas:**
  1. **RLS en Postgres** como red de seguridad a nivel `chain_id` (aislamiento de tenant).
  2. **Autorización explícita en el servidor** por rol y `location_id` (permisos finos).
  Solo con RLS, las reglas de §6.2 se vuelven inmantenibles.
- **Zod** para validación de todo input.

**Servicios externos**
- **Resend** — email transaccional.
- **WhatsApp Business API** (Meta directo o vía Twilio) — fase 2. En RD, WhatsApp es
  el canal real; el SMS es secundario y el email es solo respaldo.
- **Cobro de suscripción — evaluar en F0/F1: Azul/CardNet (pasarela dominicana) vs.
  PayPal.** Confirmado con Williams: dado el ticket promedio de Kortex (RD$9,500-22,000
  recurrente, mayor que Agendalo) conviene validar si una pasarela local convierte
  mejor que PayPal antes de comprometerse. Si la integración con Azul/CardNet no es
  viable en el timeline del MVP, PayPal queda como fallback conocido (ya probado en
  Agendalo). **Evaluar también Stripe** para clientes LATAM fuera de RD.
- **Sentry** — monitoreo de errores desde el día 1 (esto maneja dinero de terceros;
  un error silencioso en comisiones destruye la confianza).
- **Cloudflare (Workers/Pages)** — deploy y DNS/CDN. Confirmado con Williams: usa
  Cloudflare en vez de Vercel porque ya tiene dominio comprado en esa plataforma.
  Next.js corre en Cloudflare Workers vía el adapter **OpenNext for Cloudflare**
  (`@opennextjs/cloudflare`) — soporta App Router, Server Actions y Route Handlers;
  validar temprano en F1 que Realtime de Supabase y los Server Actions de
  comisiones/caja funcionan bien en ese runtime antes de construir todo el resto
  sobre este supuesto.
- **Trigger.dev o Supabase Cron** — jobs programados (recordatorios, cierres de período,
  cálculo de agregados nocturnos).

### 9.3 Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/                  # login, registro, recuperación
│   ├── (onboarding)/            # alta de cadena + primera sede
│   ├── (chain)/                 # ÁMBITO SUPERUSER
│   │   ├── overview/            # dashboard consolidado
│   │   ├── locations/           # CRUD de sedes
│   │   ├── compare/             # tabla comparativa de sedes
│   │   ├── team/                # barberos y gerentes de toda la cadena
│   │   ├── services/            # catálogo maestro
│   │   ├── commissions/         # reglas y cierres de período
│   │   ├── reports/
│   │   ├── settings/            # branding, políticas de cadena
│   │   └── billing/             # suscripción Kortex
│   ├── (location)/[locationId]/ # ÁMBITO ADMIN DE SEDE
│   │   ├── today/               # agenda + cola del día
│   │   ├── calendar/
│   │   ├── queue/               # walk-ins (realtime)
│   │   ├── checkout/            # POS
│   │   ├── register/            # caja diaria
│   │   ├── team/
│   │   ├── inventory/
│   │   ├── clients/
│   │   └── settings/
│   ├── (barber)/                # ÁMBITO BARBERO (PWA)
│   │   ├── schedule/
│   │   └── earnings/
│   ├── (client)/                # ÁMBITO CLIENTE
│   │   ├── appointments/
│   │   └── profile/
│   ├── (public)/
│   │   ├── [chainSlug]/         # landing de la cadena + selector de sede
│   │   ├── [chainSlug]/[locationSlug]/
│   │   ├── [chainSlug]/barber/[barberSlug]/
│   │   └── book/                # wizard de reserva
│   └── api/
├── components/{ui,scheduling,queue,pos,charts,forms}/
├── lib/
│   ├── db/            # Drizzle schema + migraciones
│   ├── auth/          # sesión, guards de rol/sede
│   ├── commissions/   # motor de cálculo (puro, 100% testeado)
│   ├── scheduling/    # disponibilidad, solapamientos, slots
│   ├── notifications/
│   └── billing/
└── types/
```

**Principio arquitectónico rector:** la ruta declara el ámbito. `(chain)` = cadena,
`(location)/[locationId]` = sede. Un middleware valida el ámbito **antes** de cualquier
consulta. Esto hace que los errores de permisos sean estructuralmente difíciles.

---

## 10. Esquema de Datos (alto nivel)

```
chains ──< locations ──< barber_locations >── barbers(users)
   │            │
   │            ├──< location_service_overrides >── services (de chain)
   │            ├──< schedules (barber_id, location_id, day, start, end)
   │            ├──< time_off
   │            ├──< appointments
   │            ├──< walk_in_queue
   │            ├──< inventory_items >── products (de chain)
   │            ├──< stock_movements
   │            └──< cash_sessions
   ├──< clients
   ├──< commission_rules
   ├──< payout_periods ──< payout_lines
   ├──< subscription
   └──< chain_settings
```

### Tablas principales

**chains** — `id, name, slug, owner_id, logo_url, cover_url, primary_color,
secondary_color, rnc (tax id), country, currency (DOP), timezone,
allow_cross_location_booking (bool, default true), max_barber_discount_pct,
cancellation_hours, created_at`

**locations** — `id, chain_id, name, slug, address, city, lat, lng, phone, email,
chairs_count, timezone, is_active, opens_at/closes_at por día (JSON o tabla aparte),
photos, created_at`
> `chairs_count` es obligatorio: sin él no se puede calcular *ingreso por silla*, la
> métrica de normalización que hace útil la comparación entre sedes.

**users** — `id, email, phone, full_name, avatar_url, global_role (nullable), created_at`

**memberships** — `id, user_id, chain_id, role (superuser|admin|barber), is_active`
> Un usuario puede tener un rol distinto en una cadena distinta. Separar `memberships`
> de `users` evita rehacer todo si en el futuro un gerente maneja dos cadenas.

**barber_locations** — `id, user_id, location_id, is_primary, commission_rule_id
(override opcional), is_active`

**services** — `id, chain_id, name, description, category (corte|barba|color|combo|otro),
default_duration_minutes, default_price, image_url, is_active`

**location_service_overrides** — `id, location_id, service_id, price, duration_minutes,
is_active`

**barber_services** — `id, user_id, service_id, custom_duration` *(qué hace cada barbero
y cuánto tarda — el barbero rápido no debe bloquear 45 min)*

**schedules** — `id, user_id, location_id, day_of_week, start_time, end_time, is_active`
> Constraint de aplicación: un barbero no puede tener bloques solapados en dos
> `location_id` distintos el mismo día/hora.

**time_off** — `id, user_id, location_id (nullable), starts_at, ends_at, reason, status`

**appointments** — `id, chain_id, location_id, client_id, barber_id, service_id,
starts_at, ends_at, status (pending|confirmed|in_progress|completed|cancelled|no_show),
source (online|walk_in|phone|admin), price_at_booking, notes, cancellation_reason,
created_at, updated_at`

**walk_in_queue** — `id, location_id, client_id (nullable), client_name_temp, phone,
service_id, preferred_barber_id (nullable), status (waiting|called|serving|done|left),
joined_at, estimated_wait_minutes, position, called_at`

**clients** — `id, chain_id, user_id (nullable), full_name, phone, email, birthday,
preferred_location_id, preferred_barber_id, cut_notes (text), tags, loyalty_points,
total_visits, total_spent, last_visit_at, no_show_count, created_at`
> `chain_id` — el cliente es de la cadena. `cut_notes` ("fade 1, barba perfilada, no
> línea") es lo que permite que cualquier barbero de cualquier sede lo atienda igual.

**sales** *(ticket / checkout)* — `id, chain_id, location_id, appointment_id (nullable),
client_id, barber_id, cash_session_id, subtotal, discount_amount, discount_reason,
tip_amount, total, payment_method (cash|card|transfer|mixed|online),
status (open|paid|refunded), created_by, created_at`

**sale_items** — `id, sale_id, type (service|product), service_id, product_id, quantity,
unit_price, line_total, barber_id` *(el barbero va por línea: un ticket puede tener el
corte de uno y la barba de otro)*

**commission_rules** — `id, chain_id, name, type (percentage|fixed_per_service|
booth_rent|hybrid), service_commission_pct, product_commission_pct,
booth_rent_amount, booth_rent_frequency (weekly|biweekly|monthly),
tip_handling (barber_keeps_all|split_pct), applies_to (chain|location|barber)`

**payout_periods** — `id, chain_id, starts_on, ends_on, status (open|calculated|
approved|paid), calculated_at, approved_by`

**payout_lines** — `id, payout_period_id, barber_id, location_id, services_count,
services_revenue, product_revenue, commission_amount, booth_rent_deducted,
tips_amount, adjustments, net_payable, notes`
> Una línea **por barbero y por sede** → el desglose cross-sede que hoy se hace en Excel.

**products** — `id, chain_id, name, sku, brand, category, cost_price, sale_price,
is_for_sale (bool), is_consumable (bool), image_url`

**inventory_items** — `id, location_id, product_id, quantity, min_threshold, updated_at`

**stock_movements** — `id, location_id, product_id, type (purchase|sale|consumption|
adjustment|transfer_in|transfer_out), quantity, reference_id, from_location_id,
to_location_id, created_by, created_at`

**cash_sessions** — `id, location_id, opened_by, opened_at, opening_amount,
closed_by, closed_at, expected_cash, counted_cash, difference, notes`

**subscriptions** — `id, chain_id, plan (local|chain|franchise), status (trialing|
active|past_due|cancelled), included_locations, extra_locations, billing_cycle
(monthly|annual), amount_dop, paypal_subscription_id, trial_ends_at,
current_period_start, current_period_end`

**notifications** — `id, chain_id, recipient_user_id, channel (email|sms|whatsapp),
template, payload, status, scheduled_for, sent_at`

**audit_log** — `id, chain_id, location_id, actor_user_id, action, entity, entity_id,
before, after, created_at`
> Obligatorio desde el MVP: descuentos, cierres de caja, cambios de comisión y
> anulaciones deben ser auditables. Es el requisito #1 de confianza de un dueño de cadena.

**location_daily_metrics** *(tabla de agregados, poblada por job nocturno)* —
`id, location_id, date, revenue, services_count, products_revenue, unique_clients,
new_clients, no_shows, avg_ticket, chair_utilization_pct, barber_hours`
> Pre-agregar es necesario: calcular la comparativa multi-sede en vivo sobre
> `sales` no escala más allá de unas pocas cadenas.

---

## 11. Roadmap por Fases

| Fase | Duración | Entregable | Hito de negocio |
|---|---|---|---|
| **F0 — Validación** | Sem. 0-1 | 5+ entrevistas con dueños de cadenas reales en SD; validar pricing y los 3 dolores | 2 cartas de intención / pilotos comprometidos |
| **F1 — Fundación** | Sem. 1-3 | Esquema de datos, auth multi-rol, CRUD de cadena/sedes/barberos/servicios, horarios multi-sede | Se puede configurar una cadena de 3 sedes completa |
| **F2 — Operación** | Sem. 4-6 | Agenda, reserva pública (por sede y por barbero), cola de walk-ins realtime, POS, cierre de caja | Una sede opera un día real end-to-end |
| **F3 — Dinero e insight** | Sem. 6-8 | Motor de comisiones, cierre de período, dashboard consolidado, comparativa de sedes, suscripción y billing | **MVP vendible** |
| **F4 — Piloto** | Sem. 9-10 | 2 cadenas piloto en producción gratis, iteración sobre feedback, hardening, Sentry, backups | Primer cliente pagando |
| **F5 — Competitivo** | Sem. 11-16 | WhatsApp, inventario completo, PWA del barbero, reportes, lealtad, alertas | 5 cadenas pagando |
| **F6 — Escala** | Mes 5+ | White-label, API, franquicias, expansión LATAM, IA | 15-20 cadenas |

---

## 12. Métricas de Éxito

### 12.1 Producto (¿funciona?)
- Tiempo de onboarding de una cadena de 3 sedes: **< 45 min**.
- Tiempo de reserva del cliente (inicio → confirmación): **< 60 s**, 3 clics o menos.
- Tiempo de cierre de comisiones de una quincena: **< 5 min** (vs. 2-4 horas en Excel).
- Exactitud del motor de comisiones: **100%** (cero discrepancias reportadas; es
  innegociable — un error aquí pierde al cliente para siempre).
- Descuadre promedio de caja: **< RD$200/día** por sede.
- Uptime: **99.5%+**. P95 de carga del dashboard consolidado: **< 2 s**.

### 12.2 Adopción (¿lo usan?)
- % de sedes activas que cierran caja diariamente: **> 90%**.
- % de barberos que abren la PWA al menos 3×/semana: **> 60%** (fase 2).
- % de citas creadas online vs. manual: **> 40%** a los 3 meses.
- % de walk-ins registrados en el sistema: **> 80%** (si no se registran, la analítica
  miente y el producto pierde valor).

### 12.3 Negocio (¿se vende?)
| Métrica | Mes 3 | Mes 6 | Mes 12 |
|---|---|---|---|
| Cadenas pagando | 2 | 6 | 18 |
| Sedes gestionadas | 6 | 22 | 70 |
| MRR (DOP) | 24K | 78K | 240K |
| Conversión prueba → pago | 30% | 40% | 45% |
| Churn mensual | — | < 5% | < 3% |
| NPS | — | > 40 | > 50 |

---

## 13. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **Mercado demasiado estrecho en RD** (¿cuántas cadenas de 3+ sedes existen realmente?) | Media | **Crítico** | F0 obligatoria: mapear y contar cadenas reales en SD/Santiago antes de escribir código. Si son < 40, ampliar a barberías de 1 sede con ambición (plan Local) y preparar LATAM desde el día 1 |
| R2 | **Error en el cálculo de comisiones** | Media | **Crítico** | Motor de comisiones como módulo puro con tests unitarios exhaustivos; todo cálculo auditado en `audit_log`; período requiere aprobación humana antes de marcarse pagado |
| R3 | **Complejidad multi-sede infla el MVP y el proyecto se abandona** | **Alta** | Alto | Alcance congelado en §8.1; §8.4 lista explícita de fuera-de-alcance; hitos semanales; cero features nuevas hasta el primer cliente pagando |
| R4 | **Los barberos no adoptan el sistema** (siguen con papel) | Alta | Alto | Cola de walk-ins debe ser más rápida que el papel; PWA del barbero que le muestre *su dinero* — es la única razón por la que un barbero abre una app |
| R5 | Resistencia a registrar efectivo (evasión / desconfianza) | Alta | Medio | Posicionar como control gerencial, no fiscal; no integrar con DGII; permitir cobro mixto |
| R6 | Competidor LATAM (WeiBook/AlpacaPOS) lanza multi-sede + comisiones | Media | Medio | Velocidad al mercado; profundizar en lo específico de barbería y en soporte local en RD (visita presencial, WhatsApp directo) |
| R7 | Desarrollador único, tiempo compartido con universidad y empleo | **Alta** | Alto | Timeline de 10-12 semanas asumiendo part-time; stack conocido; no inventar nada técnicamente novedoso |
| R8 | Costo de WhatsApp Business API mayor al previsto | Media | Bajo | Restringir a planes Cadena+; tope de mensajes por plan; email como default |
| R9 | Migración de datos desde Excel/cuadernos bloquea el onboarding | Alta | Medio | Importador CSV de clientes y servicios desde el MVP; servicio de migración pagado (RD$8,000) como oferta y filtro |
| R10 | Canibalización de Agendalo | Baja | Medio | Regla comercial de §2.4; landing y pricing claramente distintos; Kortex nunca se lista como "alternativa" a Agendalo |

---

## 14. Presupuesto y Recursos

### 14.1 Costo de infraestructura (mensual)

| Servicio | Etapa MVP | Etapa 10-20 cadenas |
|---|---|---|
| Supabase | $0 (free) | $25 (Pro) |
| Cloudflare Workers (Pages) | $0 (free tier) | $5 (Workers Paid) |
| Resend | $0 (100/día) | $20 (50K emails) |
| WhatsApp Business API | $0 | ~$20-50 (por conversación) |
| Sentry | $0 (dev) | $26 |
| Trigger.dev / Cron | $0 | $0-20 |
| Dominio + Cloudflare | ~$1 | ~$1 |
| **Total** | **~$1/mes** | **~$115-160/mes (≈RD$7,000-10,000)** |

Con 10 cadenas a ARPU RD$12,000 → MRR RD$120,000 vs. costo RD$10,000 → **margen ~92%**.

### 14.2 Equipo
- **Williams R. Villavizar Hdez.** — Product, full-stack, soporte y ventas.
- **Apoyo puntual sugerido:** diseño de marca e identidad visual (fase de branding,
  post-aprobación del PRD); un contador/asesor para validar las reglas de comisión
  y booth rent contra la práctica real dominicana.

### 14.3 Inversión inicial estimada
- Dominio + correo corporativo: ~RD$3,000/año
- Identidad visual (logo, branding): RD$0 (interno) o RD$10,000-20,000 (externo)
- Material de venta (demo, landing, one-pager): ~RD$5,000
- **Total inicial: RD$10,000-30,000**

---

## 15. Requisitos No Funcionales

- **Seguridad:** aislamiento de tenant por `chain_id` (RLS + autorización de servidor);
  Zod en todo input; rate limiting en endpoints públicos de reserva; secretos nunca en
  cliente; `audit_log` en toda operación de dinero, permisos o anulación.
- **Rendimiento:** LCP < 2.5s en páginas públicas; dashboard consolidado P95 < 2s
  (vía tabla de agregados); cola de walk-ins con latencia realtime < 1s.
- **Disponibilidad:** 99.5%; backups diarios de Postgres con retención 30 días;
  plan de restauración probado antes del primer cliente pagando.
- **Mobile-first obligatorio:** el gerente y el barbero operan desde el teléfono en el
  piso del local. La agenda y la cola deben ser usables a una mano.
- **Offline-tolerante (fase 2):** la cola y el checkout deben degradar con gracia si
  se cae el internet del local (realidad frecuente en RD).
- **Accesibilidad:** WCAG AA.
- **i18n:** español por defecto, estructura preparada para inglés (PR, mercado hispano US).
- **Testing:** Vitest; **cobertura 100% en `lib/commissions` y `lib/scheduling`**
  (los dos módulos donde un bug cuesta dinero real); Playwright para los flujos
  críticos (reservar, cobrar, cerrar caja, cerrar período).

---

## 16. Criterios de Aceptación del MVP

El MVP se considera terminado y vendible cuando, en un entorno de producción:

1. Un superuser registra una cadena, crea **3 sedes** y configura branding en < 45 min.
2. Crea **8 barberos**, asigna **1 de ellos a 2 sedes** con horarios distintos, y el
   sistema **rechaza** un horario solapado entre sedes.
3. Define un catálogo de servicios con **precio distinto en cada sede**.
4. Un cliente reserva online eligiendo sede; otro reserva eligiendo barbero; ninguno
   puede reservar un slot ocupado.
5. El cliente que se cortó en Sede A ve su historial y sus notas al reservar en Sede B.
6. Recepción agrega **3 walk-ins** a la cola y la pantalla del barbero se actualiza en
   tiempo real sin recargar.
7. Se cobran servicios en efectivo, tarjeta y transferencia, con propina; se cierra la
   caja del día y el descuadre queda registrado.
8. Se ejecuta el cierre de un **período de pago** y el sistema genera el monto exacto
   por barbero, con desglose por sede, coincidiendo al peso con el cálculo manual.
9. El superuser abre el dashboard y ve las **3 sedes comparadas** por ingreso, ticket
   promedio, ocupación e **ingreso por silla**, con drill-down funcional.
10. Los recordatorios de 24h y 2h se envían y se registran.
11. Un `admin` de Sede A **no puede** acceder a datos de Sede B ni por URL directa.
12. Una cadena se suscribe, se le cobra, y el acceso se restringe al vencer la prueba.

---

## 17. Preguntas Abiertas de Investigación (para F0)

A confirmar en las entrevistas con dueños de cadenas antes de escribir código:

1. ¿Cuál es el esquema de pago real y dominante en RD: comisión %, alquiler de silla,
   fijo + comisión? ¿Qué porcentajes son típicos?
2. ¿Qué % del volumen son walk-ins vs. citas, realmente?
3. ¿El dueño paga por software o lo ve como gasto evitable? ¿Cuánto paga hoy por algo?
4. ¿Los barberos aceptarían registrar cada servicio en el sistema?
5. ¿Las propinas se registran o son 100% informales en efectivo?
6. ¿Existe el caso real del barbero que rota entre sedes, o es marginal?
7. ¿Cuántas cadenas de 2+ sedes existen en el Gran Santo Domingo y Santiago?

---

## 18. Decisiones Confirmadas por Williams (16 sep 2026)

> Estas eran elecciones de producto abiertas en el borrador del PRD. Williams las
> revisó todas en sesión de trabajo el 16 de septiembre de 2026; el PRD queda
> **aprobado** con las resoluciones siguientes.

| # | Decisión | Resolución |
|---|---|---|
| **D1** | Nombre del producto | ✅ **Confirmado: "Kortex"** |
| **D2** | Pricing híbrido (base por cadena + fee decreciente por sede, RD$4,500 / 9,500 / 22,000, prueba 21 días) | ✅ **Aceptado tal cual** propuesto en §7 |
| **D3** | Rol `barber` como cuarto rol desde el MVP | ✅ **Confirmado** — 4 roles: superuser, admin, barber, client |
| **D4** | Stack: Next.js 15 + TypeScript + Tailwind v4 + Supabase + Drizzle | ✅ **Confirmado, con un cambio**: deploy en **Cloudflare** (Workers/Pages) en vez de Vercel — Williams ya tiene dominio comprado en Cloudflare. Ver nota de riesgo técnico en §9.2 (validar Server Actions + Realtime sobre el adapter de Cloudflare temprano en F1) |
| **D5** | Motor de comisiones + POS/caja dentro del MVP | ✅ **Confirmado** — se mantiene en Fase 1, pese a las ~3 semanas extra |
| **D6** | Reserva cross-sede abierta por default (cliente a nivel cadena, no atado a una sede) | ✅ **Confirmado** |
| **D7** | Cola de walk-ins en tiempo real como P0 del MVP | ✅ **Confirmado** |
| **D8** | Timeline 10-12 semanas part-time | ✅ **Aceptado** |
| **D9** | Fase F0 de validación de mercado (5+ entrevistas) antes de codear | ✅ **Confirmado** — obligatoria antes de iniciar F1 |
| **D10** | No construir marketplace de descubrimiento | ✅ **Confirmado** — Kortex vende software, no clientes |
| **D11** | Pasarela de pago para la suscripción | ✅ **Evaluar Azul/CardNet** (pasarela local) como alternativa a PayPal antes de comprometerse — ver criterio de decisión actualizado en §9.2 |
| **D12** | Regla anti-canibalización con Agendalo (1 sede sin comisiones → se vende Agendalo) | ✅ **Confirmado** |

**Siguiente paso:** brief de UI/UX con `brand-strategist` y `graphic-designer`, usando
este PRD (secciones 3-6 y 8) como insumo de producto. F0 (validación de mercado, §11 y
§17) puede correr en paralelo al brief de diseño, ya que ninguna de las dos depende de
la otra.

---

*PRD redactado el 16 de septiembre de 2026 — W-Tech*
*Estado: **✅ Aprobado.** Próximo paso: brief de UI/UX (no se escribe código de
producto hasta completarlo).*
