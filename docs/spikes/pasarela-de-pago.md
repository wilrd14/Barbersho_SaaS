# Spike F4-17 · Pasarela de pago de la suscripción de Kortex (D11)

**Fecha:** 6 de octubre de 2026 · **Estado:** spike documentado, sin código de pago.
**Decisión ya tomada (D-F4-11, aprobada por Williams):** cobro **manual por transferencia**
durante el piloto (`npm run billing:set-status`, D-F3-16), **sin integrar ninguna pasarela
hasta tener 2 cadenas pilotando**; entonces se decide con datos. Este documento prepara esa
decisión; no la adelanta.

**Convención de fuentes:** `[verificado]` = leído en la fuente citada el 6-oct-2026.
`[no verificado]` = dato de memoria, de un blog de terceros sin cifras o que no se pudo abrir;
**confirmar con el proveedor antes de decidir**. Los estimados de días de integración son
**juicio propio, no de las pasarelas**.

---

## 1. Qué hay que cobrar (contexto del producto)

- Planes en DOP (PRD §7.2): Local RD$4,500, Cadena RD$9,500, Franquicia RD$22,000 al mes,
  más sedes adicionales; descuento anual de 2 meses; prueba de 21 días.
- Ticket mensual de RD$4,500-30,000 (≈US$75-500): **recurrente, B2B, pocas cuentas** (meta del PRD:
  18 cadenas al mes 12). El volumen de transacciones es mínimo (≤ 18-50 cobros/mes), por lo
  que **las tarifas fijas mensuales pesan más que la comisión por transacción**.
- Moneda: DOP. Cliente: dueño de cadena dominicana con tarjeta local (o transferencia).

## 2. Lo que ya existe en el repo y lo que NO se toca

| Pieza | Estado hoy | Regla para el spike |
|---|---|---|
| `subscriptions` (único por `chain_id`): `plan`, `status`, `included_locations`, `extra_locations`, `billing_cycle`, `amount_dop`, `trial_ends_at`, `current_period_start/end` | En uso desde F3; fuente de verdad del plan y del acceso | **No se renombra ni se agregan columnas** (regla F4 §5) |
| `paypal_subscription_id` | **Nulo**, sin escribir en ningún camino | No se toca hasta que exista decisión; es el único gancho de pasarela del esquema |
| `lib/billing` (puro) + `lib/billing/gate.ts` | Estado efectivo (normal / restringido / bloqueado), gracia de 7 días | Se mantiene como **única** autoridad del acceso; una pasarela solo **mueve `status`**, nunca decide acceso |
| `scripts/billing-set-status.ts` | Mueve el estado tras un pago recibido fuera de Kortex, con `audit_log` | Es el "adaptador manual"; una pasarela futura llama la misma lógica |
| Pago de planes por tarjeta dentro de Kortex | No existe | Fuera de alcance (F4 §8) |

**Consecuencia de diseño:** el modelo actual ya soporta cualquier pasarela con un adaptador
delgado: *evento de pago confirmado → actualizar `status`/`current_period_end` → `audit_log`*.
Si la pasarela elegida usa un identificador propio (token de tarjeta, id de suscripción),
**no cabe** en `paypal_subscription_id` sin ensuciar el nombre: eso sería una **migración nueva
→ se escala al PM** (ver §7).

## 3. Opciones evaluadas

### 3.1 Azul (Servicios Digitales Popular, filial del Banco Popular Dominicano)

| Criterio | Hallazgo |
|---|---|
| Viabilidad en RD | Es la pasarela local principal; acepta Visa/Mastercard, con 3D Secure y plugins; opera en DOP. [verificado: tarifario Azul; guías de terceros] |
| Tipo de integración | API de e-commerce, **Página de pago** (redirección) y **Link de Pagos AZUL**; plugins para WooCommerce/PrestaShop/Magento. Para Kortex: API o Página de pago. [verificado: azul.com.do tarifario; vendabo.com] |
| Recurrencia | Hay un producto de **Pagos Recurrentes** con tokenización (bóveda de datos). [verificado: tarifario y guías de terceros] Detalles de API de recurrencia y de webhooks: **[no verificado]**, la documentación técnica requiere cuenta de comercio |
| Requisitos / trámite | RNC activo ante la DGII; para persona jurídica: Registro Mercantil, acta constitutiva, cédula del representante, cuenta bancaria empresarial, y a veces estados financieros. [no verificado: fuente de terceros (vendabo.com), no la oficial]. **W-Tech debe ser una entidad con RNC** para afiliarse |
| Tiempos de aprobación | **[no verificado]** (ninguna fuente consultada da un plazo) |
| Costos públicos | Tarifa mensual de e-commerce **RD$2,500**; Pagos Recurrentes: **RD$5 por transacción procesada**, **RD$10 por transacción declinada**, tarifa complementaria **RD$595**; autenticación del tarjetahabiente **RD$10 por transacción** (<1,000/mes). La comisión por transacción (MDR) "puede alcanzar un **6 % como máximo**" según análisis comercial, revisada mensualmente. [verificado: https://www.azul.com.do/Pages/es/tarifarioAzul.aspx] Otra fuente de terceros menciona RD$1,050/mes para recurrentes: **discrepa con el tarifario oficial, prevalece el oficial** |
| Encaje con Cloudflare Workers | La integración típica es HTTPS + JSON y redirección; compatible en principio con `fetch` de Workers. Webhooks/notificación: **[no verificado]**. Certificados cliente/mTLS, si los exigen, **podrían no funcionar en Workers**: confirmar |
| Riesgos | Trámite comercial largo e incierto; costo fijo ≥ RD$2,500/mes aun sin cobros; MDR hasta 6 %; el proveedor puede exigir confirmación de negocio con ventas previas; dependencia de un solo banco |

### 3.2 CardNet (Consorcio de Tarjetas Dominicanas)

| Criterio | Hallazgo |
|---|---|
| Viabilidad en RD | Pasarela local; ofrece Botón de Pago, Enlace de Pago, POS virtual, pagos en cuotas y **pagos automáticos/recurrentes**. [parcialmente verificado: guías de terceros (wispro, vendabo, nexux.do); no la web oficial] |
| Tipo de integración | Botón de Pago / API con **tokenización y autenticación 3DS**; existe portal de desarrolladores `developers.cardnet.com.do`. **No se pudo leer** su contenido (la página devolvió vacío) → endpoints, webhooks y sandbox **[no verificados]** |
| Recurrencia | Mencionada como producto; condiciones **[no verificadas]** |
| Requisitos / trámite | Para abrir cuenta "debe ser una empresa registrada en Dominicana"; se contacta al área comercial para obtener Merchant, Terminal y MCC. [parcialmente verificado: doc.cloud.wispro.co] |
| Tiempos y costos | **[no verificados]**; una guía de terceros solo dice, sin atribuir a una pasarela, que algunos comercios enfrentan tarifas de 4-6 % |
| Workers | **[no verificado]**; mismas dudas que Azul (webhooks, mTLS) |
| Riesgos | Documentación no accesible sin contacto comercial; trámite similar al de Azul |

### 3.3 PayPal (Subscriptions / Billing API)

| Criterio | Hallazgo |
|---|---|
| Viabilidad en RD | En la tabla oficial de funciones por país, **República Dominicana figura como "Send, receive, and withdraw"**. [verificado: https://developer.paypal.com/payouts/supported-features] Esa tabla es la de **Payouts**: **no confirma** que un comercio dominicano pueda **cobrar suscripciones a terceros** ni en qué moneda. Verificar con PayPal si una cuenta Business dominicana puede crear planes y cobrar en **USD** (DOP **[no verificado]**; PayPal no suele ofrecer DOP) |
| Tipo de integración | **Subscriptions API**: productos y planes, suscripción con aprobación del cliente, cobro recurrente administrado por PayPal. [verificado: https://developer.paypal.com/subscriptions/about] Solo **una moneda por plan** [verificado: búsqueda en developer.paypal.com] |
| Recurrencia | Nativa. Eventos por webhook (`BILLING.SUBSCRIPTION.*`, `PAYMENT.SALE.COMPLETED`). [verificado: https://developer.paypal.com/api/rest/webhooks/event-names] |
| Requisitos | Cuenta Business verificada; sin RNC obligatorio para empezar [no verificado] |
| Costos | Comisión por transacción y conversión de moneda: **[no verificado]** (depende del acuerdo; típicamente porcentaje + fijo) |
| Workers | **Compatible**: REST sobre HTTPS; los webhooks se verifican llamando a la API de PayPal (`verify-webhook-signature`) o con Web Crypto. [conocimiento general, no verificado en este spike] |
| Riesgos | Cobro en **USD** a clientes que facturan en DOP (fricción y fluctuación); retiro a cuenta bancaria dominicana con tiempos y costos propios; PayPal ya está **probado en Agendalo** (menor riesgo técnico) |

### 3.4 Stripe

| Criterio | Hallazgo |
|---|---|
| Viabilidad en RD | **República Dominicana no figura entre los países soportados**; en la región solo aparecen Brasil y México. [verificado: https://stripe.com/global] |
| Vía alternativa | Stripe Atlas: constituir una sociedad en EE. UU. (Delaware) con costo reportado de **US$500** más obligaciones continuas. [no verificado en fuente oficial; ver doola.com y stripe.com/atlas] Implica **otra entidad legal, banco estadounidense e impuestos** |
| Recurrencia | Excelente (Stripe Billing), pero es irrelevante si no se puede abrir la cuenta |
| Workers | Muy buena compatibilidad (SDK y webhooks con Web Crypto) |
| Riesgos | Complejidad legal/fiscal desproporcionada para 2-18 clientes; solo tendría sentido para la **expansión LATAM** (PRD), no para el piloto en RD |

## 4. Comparación resumida

| | Azul | CardNet | PayPal Subscriptions | Stripe |
|---|---|---|---|---|
| ¿Cobra en DOP? | Sí [verificado] | Sí [no verificado] | **No confirmado** (probable USD) | No aplica |
| ¿Disponible para un negocio dominicano? | Sí, con RNC | Sí, empresa registrada | A confirmar | **No** (salvo Atlas) |
| Costo fijo público | RD$2,500/mes + RD$595 (recurrente) | No verificado | No verificado | No aplica |
| Recurrencia | Sí (producto propio) | Sí (producto propio) | Nativa | Nativa |
| Trámite comercial | Largo, incierto, con documentos | Largo, incierto | Corto | Muy largo (Atlas) |
| Riesgo técnico en Workers | Medio (docs/webhooks sin verificar) | Medio-alto (docs inaccesibles) | Bajo | Bajo |
| Probado en W-Tech | No | No | Sí (Agendalo) | No |

## 5. Estimados de integración (juicio propio, **no verificados con los proveedores**)

| Opción | Trámite comercial (calendario) | Desarrollo | Total |
|---|---|---|---|
| Cobro manual (hoy) | 0 | 0 (ya existe) | 0 |
| PayPal Subscriptions | 1-3 días hábiles (si la cuenta aplica) | 5-8 días: planes, aprobación, webhook, conciliación con `billing:set-status`, pruebas | ~2 semanas calendario |
| Azul (API/Página de pago + recurrente) | **2-6 semanas** [no verificado] | 8-12 días: sandbox, tokenización, recurrencia, 3DS, webhooks/notificaciones, conciliación | ~1.5-2 meses calendario |
| CardNet | 2-6 semanas [no verificado] | 8-12 días (docs por confirmar) | ~1.5-2 meses calendario |
| Stripe vía Atlas | 3-6 semanas (entidad, banco, EIN) [no verificado] | 4-6 días | Solo para expansión LATAM |

## 6. Criterio de decisión **después del piloto**

Decidir **cuando se cumplan las dos condiciones**: (a) **2 cadenas** usan Kortex en producción y
completaron al menos un cierre de quincena; (b) hay al menos **1 ciclo de cobro manual
completo** registrado. Umbrales para elegir:

1. **Integrar cobro automático** solo si el cobro manual cuesta más de **~30 min por cliente al
   mes** de W-Tech o si **≥ 1 de cada 3 pagos** se retrasa más de 5 días (dato del
   `audit_log` de `billing.set_status` y de `current_period_end`).
2. **Azul/CardNet** si ≥ 2 de las cadenas piloto dicen que **pagarían con tarjeta local** y el
   trámite se puede abrir **antes** del mes 3 (por tiempos largos); el cálculo de equilibrio es:
   RD$2,500 fijos + RD$595 + RD$5 por cobro **≈ RD$3,100/mes** de costo fijo, que con ARPU de
   RD$12,000 es ~26 % del ingreso de **un** cliente y **< 3 %** con 10 clientes.
3. **PayPal** (como fallback conocido) solo si PayPal **confirma por escrito** que puede cobrar
   a un negocio dominicano y si los clientes aceptan pagar en **USD**; en caso contrario
   queda descartado.
4. **Stripe** queda para la fase de expansión LATAM (México/Brasil) y se revalúa en F6.
5. **Mantener manual** si los dos primeros clientes pagan por transferencia a tiempo: el costo
   de integrar (≥ 8 días de desarrollo + costo fijo) supera el beneficio mientras haya < 10
   cadenas.

## 7. Diseño mínimo del modelo para cuando se decida (sin implementar)

- **Evento canónico:** `payment.confirmed { chainId, amountDop, periodStart, periodEnd, providerRef }`.
  El adaptador de cada pasarela lo traduce y llama **una sola función** de dominio
  (la misma que usa `billing:set-status`) que mueve `status` y `current_period_end` y escribe
  `audit_log` (`billing.payment_confirmed`). El acceso sigue decidido por `lib/billing`.
- **Idempotencia:** cada pago confirmado se aplica una sola vez; la clave de idempotencia
  es `providerRef`. Hoy **no hay columna** donde guardarla: usar `audit_log.after.providerRef`
  (patrón de `createSaleAction`, F2-21) evita una migración.
- **No se toca:** columnas de `subscriptions`, `paypal_subscription_id` (nulo), `lib/billing`
  (estado efectivo), el gate de suscripción, ni cualquier ruta anónima.
- **Escalar al PM antes de tocar el esquema** si hace falta guardar un id de pasarela distinto
  de `paypal_subscription_id` (candidata: columna genérica `provider_subscription_id`).
- **Webhooks en Workers:** endpoint de Route Handler propio (`/api/webhooks/<proveedor>`),
  verificación de firma antes de cualquier lectura, **sin `Promise.all` de consultas**,
  ejecutor explícito (`tx`), `chain_id` resuelto desde el pago, nunca desde el cuerpo.

## 8. Plan de integración por fases (cuando Williams lo apruebe)

1. **Fase 0 (ya):** cobro manual con `billing:set-status`; registrar en una tabla simple
   (hoja o Notion) fecha de vencimiento vs fecha de pago, para medir los umbrales de §6.
2. **Fase 1 (trámite, en paralelo al piloto, sin código):** iniciar el expediente comercial con
   Azul **o** abrir la consulta a PayPal por escrito, según §6. Pedir por escrito: documentación
   técnica, sandbox, soporte de recurrencia en DOP, webhooks, mTLS y plazo de aprobación.
3. **Fase 2 (backlog aparte `BACKLOG-F4-PAGOS.md` o F5):** adaptador de la pasarela elegida,
   endpoint de webhook, función de dominio `applyConfirmedPayment`, conciliación y pruebas
   contra el sandbox; **sin autoservicio de cambio de plan** hasta cerrar el flujo base.
4. **Fase 3:** autoservicio de upgrade/downgrade y facturación anual; revisar impuestos
   (ITBIS) y comprobantes fiscales (e-CF de la DGII) con el contador **[no verificado]**.

## 9. Riesgos transversales

- **Regulatorio/fiscal (RD):** ITBIS y comprobantes fiscales sobre la suscripción de Kortex
  **[no verificado; consultar contador]**.
- **PCI:** Kortex **no debe manejar números de tarjeta**; usar página de pago/redirección o
  tokenización de la pasarela.
- **Reintentos y morosidad:** definir política de reintento y cómo interactúa con la gracia de
  7 días de `lib/billing` (D-F3-16: nunca bloquear cobrar ni cerrar caja).
- **Dependencia de un solo proveedor:** el adaptador delgado (§7) evita acoplar el dominio.

## 10. Recomendación final y **pregunta para Williams**

**Recomendación:** mantener **cobro manual** durante el piloto (decisión D-F4-11 ya aprobada),
**no escribir código de pago en F4**, y usar el piloto para medir los umbrales de §6. En
paralelo, **iniciar solo el trámite comercial**: abrir la consulta formal con **Azul** (tarifario
público y recurrencia propia, cobra en DOP) y pedir a **PayPal** una confirmación escrita sobre
cobro de suscripciones desde RD; **descartar Stripe** para RD.

**Pregunta explícita para Williams:**

> ¿Autorizas iniciar **ahora** el trámite comercial con **Azul** (sin integrar nada todavía),
> y tienes una **persona jurídica con RNC y cuenta bancaria empresarial** a nombre de W-Tech
> para afiliarte? ¿O prefieres esperar a tener las 2 cadenas piloto antes de iniciar el trámite?

**Estimado si dices "sí":** trámite de 2-6 semanas **[no verificado]** corriendo en paralelo al
piloto, más 8-12 días de desarrollo de la integración **después** de aprobar el backlog de pagos.

## 11. Fuentes consultadas

- Azul, tarifario oficial: https://www.azul.com.do/Pages/es/tarifarioAzul.aspx
- Azul, guías de terceros (requisitos, pagos recurrentes): https://vendabo.com/blog/pagos-con-azul-tienda-online-republica-dominicana ·
  https://vendabo.com/blog/pasarelas-de-pago-republica-dominicana-ecommerce ·
  https://www.pasarelasdepagos.com/shop/ecommerce-republica-dominicana/azul-pagos-recurrentes-suscripciones-woocommerce-woo-subscriptions/
- CardNet: https://developers.cardnet.com.do/guias/tokenizacion-autenticacion/ (página vacía al consultarla) ·
  https://doc.cloud.wispro.co/docs/republica-dominicana-cardnet · https://nexux.do/pasarelas-de-pago-republica-dominicana-2025/
- PayPal: https://developer.paypal.com/subscriptions/about ·
  https://developer.paypal.com/api/rest/webhooks/event-names ·
  https://developer.paypal.com/payouts/supported-features
- Stripe: https://stripe.com/global · https://www.doola.com/stripe-guide/how-to-open-a-stripe-account-in-dominican-republic/

**Verificación de cierre (AC de F4-17):** `paypal_subscription_id` sigue nulo y este spike no
agrega ninguna llamada a una pasarela en el código.
