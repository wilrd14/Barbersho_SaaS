# UX BRIEF — Kortex

**Producto:** Kortex — SaaS de gestión operativa para cadenas de barberías multi-sede
**Empresa:** W-Tech (Williams R. Villavizar Hdez.)
**Fecha:** 16 de septiembre de 2026
**Versión:** 1.0
**Insumos:** `PRD-BarberShop.md` v1.0 (aprobado) — §5, §6.2, §8.1, §9.3, §10 · `BRAND-BRIEF-Kortex.md` v1.0
**Rol que redacta:** `graphic-designer`
**Destinatarios:** Williams (decisión), luego implementación (frontend)
**Estado:** propuesta — requiere decisión de Williams en §1 (paleta) y validación en §8

---

## 0. Cómo leer este documento

Este es el **último paso de planeación antes de escribir UI real**. No hay código ni
assets aquí — solo la especificación con la que un desarrollador (o el propio Williams)
puede construir cada pantalla sin inventar decisiones de layout sobre la marcha.

Orden de lectura recomendado:
1. §1 — decide la paleta (es lo único que bloquea el resto).
2. §2 — sistema de diseño base (tokens, tipografía, espaciado, estados).
3. §3 — mapa completo de pantallas.
4. §4 — wireframes de las 7 pantallas críticas.
5. §5 a §7 — patrones de interacción, responsive y componentes base.
6. §8 — decisiones abiertas.

---

## 1. Las dos direcciones de paleta

El brand brief (§3.1–§3.3) ya presentó su argumento y su recomendación: **grafito +
índigo + cobre**, rechazando el cliché negro + dorado + navaja. Williams pidió ver
ambas direcciones completas, con el detalle suficiente para visualizarlas, antes de
comprometerse. Abajo están las dos, descritas con la misma profundidad, aplicadas a las
dos superficies donde más se nota la diferencia: **la Tabla de Posiciones** (consola
oscura, la pantalla más densa e importante del producto) y **la página pública en modo
claro** (donde compite visualmente con Instagram y con la marca de cada cadena cliente).

Ambas direcciones comparten lo que ya está fuera de discusión: tipografía (Archivo +
Inter + IBM Plex Mono), radios de 4–6px, iconografía lineal Lucide, modo oscuro por
defecto en consola / claro en público, y el semáforo de datos. Lo único que cambia es
el **color de marca** (capa 2 del sistema, brand-brief §3.3).

### Dirección A — Grafito / Índigo / Cobre (recomendada por el brand-strategist)

**Paleta exacta:**

| Rol | Token | Hex |
|---|---|---|
| Fondo raíz oscuro | `ink-950` | `#0B0E14` |
| Superficie/tarjeta | `ink-900` | `#12161F` |
| Superficie elevada | `ink-800` | `#1A1F2B` |
| Borde | `ink-700` | `#252B3A` |
| Texto secundario | `ink-500` | `#5A6478` |
| Texto primario | `ink-100` | `#E6E9EF` |
| Fondo raíz claro | `ink-50` | `#F5F7FA` |
| **Marca / acción primaria** | `brand-600` | `#4F46E5` (índigo) |
| Marca hover/acento | `brand-500` / `brand-400` | `#6366F1` / `#818CF8` |
| **Dinero / comisiones / Mi Silla** | `copper-500` | `#B87333` (cobre) |
| Semáforo positivo | `data-pos` | `#16A34A` (verde bosque) |
| Semáforo advertencia | `data-warn` | `#D97706` (ámbar) |
| Semáforo negativo | `data-neg` | `#DC2626` (rojo) |

**Cómo se ve la Tabla de Posiciones (`(chain)/compare`) en Dirección A:**
Fondo `#0B0E14` casi negro pero con una temperatura azulada perceptible, no negro puro.
Las filas de la tabla alternan entre `#0B0E14` y `#12161F` (diferencia sutil, solo
bordes de 1px `#252B3A` separan columnas). Los encabezados de columna van en `label`
(11px, mayúsculas, `ink-500`). Los nombres de sede en `ink-100`, los montos en IBM Plex
Mono alineados a la derecha. La columna "Δ vs. período anterior" es la única con color
fuerte: verde `#16A34A` con flecha arriba, ámbar `#D97706` con flecha lateral, rojo
`#DC2626` con flecha abajo — y el índigo `#4F46E5` **no aparece en esta tabla salvo en
el borde de foco de la fila seleccionada y en el botón "Comparar rango"**. El
resultado: una tabla que se lee como un terminal de trading — fría, seria, sin ruido
cromático — y donde el semáforo es inequívocamente la única señal de color con
significado. Al hacer drill-down en una sede, la fila se ilumina con un borde índigo de
1px y un pulso de 400ms.

**Cómo se ve el modo claro público (`(public)/[chainSlug]`) en Dirección A:**
Fondo `#F5F7FA`, tarjetas blancas `#FFFFFF` con sombra mínima y borde `#E6E9EF`. El
color de marca de Kortex (índigo) **casi no aparece aquí** — el protagonista visual es
el `primary_color` de la cadena cliente (su logo, su foto de portada, el botón
"Reservar"). El índigo de Kortex queda relegado a detalles secundarios: el link "ver
disponibilidad", el foco de los inputs del formulario de reserva, y una firma discreta
"Powered by Kortex" en el footer en `ink-500`. Esto es intencional y es el argumento
central de la Dirección A: **la página pública se ve como la marca del cliente, no
como la de Kortex** — porque cada cadena ya tiene su propia identidad y Kortex es la
infraestructura, no el protagonista visual ahí. Las tarjetas de sede muestran una foto,
el nombre, dirección, badge de "Abierto ahora" en verde `#16A34A`, y un botón de
reserva en el color de la cadena.

### Dirección B — Negro / Dorado tradicional (el cliché de la industria)

**Paleta exacta (equivalente hipotética, construida al mismo nivel de detalle para
comparar con justicia):**

| Rol | Token | Hex |
|---|---|---|
| Fondo raíz oscuro | `noir-950` | `#0A0A0A` (negro casi puro) |
| Superficie/tarjeta | `noir-900` | `#141414` |
| Superficie elevada | `noir-800` | `#1E1E1E` |
| Borde | `noir-700` | `#2E2A22` (con temperatura cálida, no azulada) |
| Texto secundario | `noir-500` | `#8A8272` |
| Texto primario | `noir-100` | `#F2EFE9` (blanco cálido, no puro) |
| Fondo raíz claro | `noir-50` | `#FAF7F0` (crema, no blanco frío) |
| **Marca / acción primaria** | `gold-600` | `#C9A227` (dorado mate, no metálico plano) |
| Marca hover/acento | `gold-500` / `gold-400` | `#D4AF37` / `#E0C158` |
| **Dinero / comisiones / Mi Silla** | (mismo rol que el dorado — colisión, ver abajo) | `#C9A227` |
| Semáforo positivo | `data-pos` | `#4C9A5B` (verde, forzado a alejarse del dorado) |
| Semáforo advertencia | `data-warn` | `#D97706` (**mismo hue que el dorado de marca — colisión directa**) |
| Semáforo negativo | `data-neg` | `#C0392B` |

**Cómo se ve la Tabla de Posiciones en Dirección B:**
Fondo negro puro `#0A0A0A`. Sobre OLED (celular del barbero, del gerente) el negro
puro produce *smearing* visible al hacer scroll rápido y consume batería distinto pero
no es el problema real. El problema real es de **lectura de dato**: el color de marca
(dorado `#C9A227`) y el color de advertencia del semáforo (`#D97706`) están a menos de
15° de diferencia de matiz. En una tabla donde el botón "Exportar", los links activos y
el borde de foco son dorados, y donde una sede con -12% de ingreso también se pinta en
un tono ambarino/dorado, **el ojo no distingue "esto es interactivo" de "esta sede está
mal"**. Para resolverlo hay dos caminos, ambos con costo: (a) mover el semáforo de
advertencia a otro hue (ej. naranja rojizo puro `#E85D04`), lo cual reduce el espacio
de color disponible para "negativo" y hace más difícil distinguir advertencia de
negativo; o (b) restringir el dorado a un solo uso decorativo (el logo) y usar un
acento distinto para interacción — lo cual diluye la razón de tener dorado como color
de marca en primer lugar. Visualmente, esta tabla se ve más cálida, más "premium
lounge", pero la jerarquía de qué es dato vs. qué es interfaz es más difícil de
mantener limpia con 8+ sedes en pantalla.

**Cómo se ve el modo claro público en Dirección B:**
Fondo crema `#FAF7F0`, tarjetas blancas cálidas, acentos dorados en botones y bordes de
foco. Se ve inmediatamente como "app de barbería" — coherente con casi cualquier
identidad de barbería existente en el mercado (poste tricolor, navajas, tipografía
slab). Esto tiene una ventaja real: **reconocimiento instantáneo de categoría** por
parte del cliente final (Yarisel) y del prospecto (Ramón) en la primera impresión de
una demo. La desventaja, ya señalada en el brand brief (§3.1, razón 2): la **mayoría de
las cadenas de barbería en RD ya usan negro+dorado como su propia identidad**. Cuando
la página pública de Kortex es negro+dorado y el logo de la cadena cliente *también* es
negro+dorado, la marca de Kortex se vuelve invisible dentro de la marca del cliente —
no hay forma de que un usuario que ve la página de "Barbería Alcázar" en negro+dorado
sepa que corre sobre Kortex y no sobre un sitio a medida. Esto no rompe la experiencia
del cliente final, pero sí diluye la identidad de Kortex como producto reconocible en
capturas de venta, redes y material de marketing propio.

### Comparación directa (resumen para decidir)

| Criterio | Dirección A (grafito/índigo/cobre) | Dirección B (negro/dorado) |
|---|---|---|
| Reconocimiento instantáneo como "app de barbería" | Bajo — necesita apoyo del copy/contexto | Alto — es el código visual esperado |
| Colisión con semáforo de datos | Ninguna (índigo está a 250°, lejos de 0°–160°) | Directa (dorado y ámbar comparten hue) |
| Diferenciación vs. Fresha/Booksy/competencia | Alta — categoría nueva | Baja — se confunde con la categoría "app de barbería" |
| Compatibilidad con página pública white-label de cada cadena | Alta — Kortex cede el protagonismo cromático al cliente sin fricción | Baja — compite/se funde con identidades ya-doradas existentes |
| Percepción en pantallas de dinero (comisiones, caja) | "Instrumento financiero serio" (Stripe/Linear/Mercury) | "Local premium/lounge" — cálido pero menos "esto no se equivoca" |
| Riesgo de marca | Que un dueño de cadena "no la reconozca" como barbería a primera vista (mitigable con copy y fotografía, brand brief §3.1) | Que se perciba como una plantilla genérica más del rubro, sin diferenciación |
| Trabajo de ajuste de tokens si se elige | Ninguno — ya está especificado al detalle en el brand brief | Medio-alto — hay que resolver la colisión de hue con el semáforo antes de construir componentes |

**Recomendación de este brief (heredada del brand-strategist, ratificada aquí desde el
lado de UX):** Dirección A. La razón de mayor peso para un diseñador de interfaz —
más allá del posicionamiento de marca — es la **colisión de hue entre el dorado y el
semáforo de advertencia**, que en un producto cuya pantalla más importante es una
tabla comparativa con semáforo, es un defecto funcional, no solo estético. La Dirección
B es viable y produce una app reconocible, pero exige resolver esa colisión
sacrificando parte de la paleta de dato, y renuncia a la ventaja de convivir sin
fricción con las identidades white-label de los clientes.

**Esto queda abierto para que Williams decida** — ver `B1` en §8. El resto de este
documento (§2 en adelante) se especifica **en Dirección A**, porque es la recomendada y
la que permite avanzar sin bloquear el resto del brief; si Williams elige Dirección B,
solo cambian los tokens de marca en §2.1 (la estructura de componentes, layout y
wireframes no cambia).

---

## 2. Sistema de diseño base

### 2.1 Tokens de color (Dirección A, ambos temas)

**Tema oscuro (consola: chain, location, barber)**

```
--surface-root:      #0B0E14   (ink-950)
--surface-card:       #12161F  (ink-900)
--surface-raised:     #1A1F2B  (ink-800)
--border:             #252B3A  (ink-700)
--text-primary:       #E6E9EF  (ink-100)
--text-secondary:     #A3ABBC  (ink-300)
--text-tertiary:      #5A6478  (ink-500)
--accent:             #4F46E5  (brand-600)
--accent-hover:       #6366F1  (brand-500)
--accent-soft:        #818CF8  (brand-400, series de gráfico/selección)
--money:              #B87333  (copper-500) — SOLO superficies de dinero devengado
--money-soft:         #D08B4A  (copper-400)
--data-pos:           #16A34A
--data-warn:          #D97706
--data-neg:           #DC2626
--data-neutral:       #5A6478
```

**Tema claro (público: reserva, reportes impresos)**

```
--surface-root:      #F5F7FA   (ink-50)
--surface-card:       #FFFFFF
--border:             #E6E9EF  (ink-100)
--text-primary:       #12161F  (ink-900)
--text-secondary:     #5A6478  (ink-500)
--accent:             #4F46E5  (brand-600 — AA sobre blanco, ~6.4:1)
--accent-hover:       #4338CA (brand-700, más oscuro para mantener contraste en claro)
--money:              #B87333  (copper-500)
--money-soft:         #F4E3D3  (copper-100, fondo de badge)
--data-pos / warn / neg / neutral: iguales al tema oscuro (mismo hex, ya cumplen AA en ambos fondos)
--client-brand:       var(--chain-primary-color)  ← inyectado por cadena, SOLO en (public)
```

Todos los componentes deben consumir estas variables semánticas, nunca hex literales
(consecuencia de diseño, brand brief §3.4).

### 2.2 Escala tipográfica (heredada del brand brief §3.5, sin cambios)

Trío: **Archivo** (display/wordmark) + **Inter** (UI/texto) + **IBM Plex Mono**
(números). Escala completa ya definida en brand brief §3.5 (`display-xl` a `num-m`).
Regla dura repetida aquí porque es la más fácil de romper en código: **todo número en
tabla va en Plex Mono, alineado a la derecha, con `font-feature-settings: "tnum"`.**

### 2.3 Espaciado y rejilla

- Base de 4px: `space-1=4px, space-2=8px, space-3=12px, space-4=16px, space-5=20px,
  space-6=24px, space-8=32px, space-10=40px, space-12=48px, space-16=64px`.
- Contenedor máximo de consola: `1440px` (dashboards anchos con tabla de 9 columnas).
- Contenedor máximo de página pública: `640px` (mobile-first, flujo de reserva de 3
  toques).
- Padding estándar de tarjeta: `space-4` (16px) en desktop, `space-3` (12px) en móvil.
- Altura de fila de tabla: `44px` desktop / `52px` táctil (ya definido en brand brief).
- Gutter entre columnas de agenda (vista día por barbero): `1px` de borde, sin gutter
  extra — las columnas deben sentirse contiguas, como una parrilla física.

### 2.4 Radios y sombras

- `radius-sm = 4px` (badges, celdas, chips de estado).
- `radius-md = 6px` (botones, inputs, tarjetas).
- `radius-full = 999px` (avatares, indicador de posición en La Fila).
- Nunca `radius-lg`/`2xl` (reservado para Agendalo, brand brief §3.6).
- Jerarquía por **borde + elevación de superficie** (`ink-900` → `ink-800`), no por
  sombra difusa. Sombra únicamente en overlays: `modal`, `popover`, `sheet`, con
  `box-shadow: 0 8px 24px rgba(0,0,0,0.4)` en oscuro / `rgba(15,15,20,0.12)` en claro.

### 2.5 Estados de interacción

| Estado | Tratamiento |
|---|---|
| **Default** | Superficie base, borde `--border` 1px |
| **Hover** (desktop/mouse) | Superficie sube un nivel (`ink-900`→`ink-800`); en filas de tabla, fondo `ink-800` completo sin cambiar borde |
| **Focus** (teclado, siempre visible) | Anillo de 2px en `--accent`, offset 2px. Nunca se suprime `outline` sin reemplazo — requisito WCAG AA |
| **Active/Pressed** | Superficie oscurece 4% adicional + escala 0.98 en botones (120ms) |
| **Disabled** | Opacidad 40%, cursor `not-allowed`, **nunca** se oculta el control — un botón "Cerrar el corte" deshabilitado debe explicar por qué en un tooltip o texto de ayuda adyacente (ej. "Falta aprobar 2 ajustes") |
| **Loading** | Skeleton con el mismo layout del contenido final (nunca spinner centrado genérico en pantallas de datos — el usuario debe ver la forma de la tabla/tarjeta que está cargando). En botones de acción de dinero: el botón se deshabilita, el label cambia a un verbo en gerundio corto ("Cobrando…", "Cerrando…") y un spinner de 14px reemplaza el ícono, nunca el texto completo |
| **Error (validación de campo)** | Borde `data-neg`, texto de ayuda en `data-neg` debajo del input, ícono de alerta a la izquierda del mensaje. El mensaje sigue la regla del brand brief §2.2: qué pasó + por qué + qué hacer |
| **Error (operación de dinero fallida)** | Nunca un toast que desaparece solo. Banner persistente en la parte superior de la pantalla, `data-neg` de fondo al 12% de opacidad + borde `data-neg` sólido, con botón "Reintentar" explícito. El usuario debe confirmar que lo leyó (no auto-dismiss) — coherente con "el dinero se reporta, no se celebra ni se pierde en un toast" |
| **Éxito (operación de dinero)** | Confirmación breve, sin ícono de check verde festivo ni animación de rebote. Cambio de estado visual sobrio: el botón pasa a estado "hecho" con un check de 16px y el monto queda impreso en la pantalla (ej. "Cobrado. RD$650 en efectivo.") — el brand brief §2.2 ya define el copy exacto |
| **Vacío (empty state)** | Nunca ilustración de personaje. Representación esquemática del dato ausente: fila fantasma con guiones (`—`) en las celdas de una tabla vacía, o un bloque de texto corto con la explicación operativa ("Todavía no se ha cobrado nada hoy") + una sola acción si aplica |

---

## 3. Mapa de pantallas por rol

Basado en PRD §9.3 (estructura de rutas) y §8.1 (19 features P0). Se agrupa por ámbito,
con el nombre oficial de producto (brand brief §4) entre paréntesis cuando aplica.

### 3.1 Ámbito `(auth)` y `(onboarding)` — todos los roles

- `/login` — inicio de sesión
- `/registro` — alta de cuenta (solo para nueva cadena → dispara onboarding)
- `/recuperar-clave`
- `(onboarding)` — **Montar tu cadena**: wizard de 3 pasos (datos de la cadena y
  fiscales → primera sede → branding básico: logo, color, horario). PRD 1.1.

### 3.2 Ámbito `(chain)` — superuser (Ramón)

- `/overview` — **Vista Cadena**: dashboard consolidado (PRD 1.14, §5.4.A). *Wireframe §4.1.*
- `/compare` — **Tabla de Posiciones**: comparativa de sedes (PRD 1.14, §5.4.B). *Wireframe §4.1 (misma pantalla, sección inferior).*
- `/locations` — CRUD de sedes (PRD 1.2)
  - `/locations/nueva`
  - `/locations/[id]` — editar sede (horario, dirección, fotos, chairs_count)
- `/team` — barberos y gerentes de toda la cadena (PRD 1.4)
  - `/team/barberos` — lista + asignación multi-sede
  - `/team/barberos/[id]` — perfil, sedes asignadas, horario consolidado, cobertura
  - `/team/gerentes`
  - `/team/nuevo`
- `/services` — catálogo maestro de servicios (PRD 1.6)
  - `/services/[id]` — override de precio/duración por sede
- `/commissions` — **Reglas de Pago** + **El Corte** (PRD 1.13, §5.4)
  - `/commissions/rules` — configuración de comisión por barbero/sede
  - `/commissions/periods` — historial de cortes de quincena
  - `/commissions/periods/[id]` — **Corte de Quincena**: cierre de un período. *Wireframe §4.5.*
- `/reports` — reportes exportables (fase 2, pero la ruta se reserva desde MVP)
- `/settings` — branding de cadena, política de descuentos, reserva cross-sede
- `/billing` — **Tu plan**: suscripción Kortex (PRD 1.18)
- `/clients` — ficha de cliente a nivel cadena (PRD 1.9), exportación (solo superuser)

### 3.3 Ámbito `(location)/[locationId]` — admin (Kelvin)

- `/today` — **El Día**: agenda + cola del día (PRD 1.15). *Wireframe §4.2.*
- `/calendar` — agenda semana/mes, vista drag-and-drop (PRD 1.7)
- `/queue` — **La Fila**: cola de walk-ins en tiempo real (PRD 1.10). *Wireframe §4.3.*
- `/checkout` — **Cobrar** (PRD 1.11, POS). *Wireframe §4.4.*
- `/register` — **El Cuadre**: cierre de caja diaria (PRD 1.12)
- `/team` — barberos de esta sede, horarios, bloqueos/días libres (PRD 1.5)
- `/inventory` — **Almacén** (fase 2, ruta reservada desde MVP)
- `/clients` — ficha de cliente en modo sede (lectura + notas de corte)
- `/settings` — datos de la sede (si tiene permiso `location_admin`)

### 3.4 Ámbito `(barber)` — barber (PWA)

- `/mi-silla` — **Mi Silla**: home del barbero
  - `/mi-silla/schedule` — **Mi día**: agenda del día/semana. *Wireframe §4.6 (combinada con ganancias).*
  - `/mi-silla/earnings` — **Lo mío**: ganancias del período + histórico de recibos
  - `/mi-silla/recibo/[periodId]` — **Recibo del barbero** (detalle de un corte cerrado)
  - `/mi-silla/clientes/[id]` — Ficha de Corte de un cliente (lectura + notas), solo si tiene la cita activa

### 3.5 Ámbito `(client)` — cliente final (Yarisel)

- `/mis-citas` — historial y próximas citas
- `/perfil` — datos personales, preferencias (sede/barbero habitual)

### 3.6 Ámbito `(public)` — sin login

- `/[chainSlug]` — **Tu Página**: landing de la cadena + selector de sede (PRD 1.17)
- `/[chainSlug]/[locationSlug]` — perfil de una sede: horario, dirección, fotos, mapa,
  barberos que atienden ahí, botón reservar
- `/[chainSlug]/barber/[barberSlug]` — perfil público de un barbero: en qué sedes y
  días atiende, portafolio (fase 3), botón "reservar con él"
- `/[chainSlug]/book` — wizard de reserva (2 rutas: por sede / por barbero). *Wireframe §4.7.*
  - paso 1: sede o barbero
  - paso 2: servicio
  - paso 3: fecha/hora
  - paso 4: datos de contacto + confirmación

### 3.7 Total de pantallas MVP (referencia rápida)

| Ámbito | # de pantallas principales |
|---|---|
| Auth/Onboarding | 4 |
| Chain (superuser) | 13 |
| Location (admin) | 8 |
| Barber (PWA) | 4 |
| Client | 2 |
| Public | 4 (+ 4 pasos del wizard de reserva) |
| **Total** | **~35 pantallas/estados de ruta** |

---

## 4. Wireframes de las pantallas críticas

Notación: bloques ASCII de baja fidelidad, con anotaciones de comportamiento. No son
layouts pixel-perfect — fijan jerarquía, agrupación y las zonas que un desarrollador no
debe reinterpretar.

### 4.1 Vista Cadena + Tabla de Posiciones (`(chain)/overview` + `/compare`)

Desktop-first (Ramón revisa desde su casa/oficina), pero debe degradar a móvil
(consulta nocturna en cama, PRD §3.4).

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Kortex]  Vista Cadena          Hoy ▾ | Semana | Mes | Rango custom  │  <- selector de fecha global, persiste entre overview/compare
├─────────────────────────────────────────────────────────────────────┤
│  RD$ 1,240,600          +6% vs. semana pasada          ↗ pos        │  <- KPI hero, display-l, Plex Mono para el número
│  Ingreso total de la cadena · 4 sedes                                │
│                                                                       │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐            │
│  │ Servicios │ │ Ticket    │ │ Ocupación │ │ No-show   │            │  <- KPI cards secundarias, num-l
│  │ 1,842     │ │ RD$674    │ │ 71%       │ │ 8%        │            │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘            │
├─────────────────────────────────────────────────────────────────────┤
│  Tabla de Posiciones                     [Exportar] [Ver ranking]   │
│  ┌──┬────────────┬─────────┬──────┬──────┬───────┬────┬─────┬────┐ │
│  │# │ SEDE       │ INGRESO │  Δ   │SERV. │TICKET │OCUP│RD$/  │NO- │ │  <- header en `label` (11px maysc, ink-500)
│  │  │            │         │      │      │       │    │SILLA │SHOW│ │
│  ├──┼────────────┼─────────┼──────┼──────┼───────┼────┼─────┼────┤ │
│  │🥇│ Naco       │ RD$412K │ ↗+8% │  640 │ RD$644│ 78%│52,400│ 6% │ │  <- fila con fondo ink-900, Δ en color semáforo + flecha
│  │2 │ Bella Vista│ RD$298K │ ↘-3% │  520 │ RD$573│ 61%│38,100│11% │ │  <- ↘ rojo, fila NO se pinta entera, solo la celda Δ
│  │3 │ S.Cristóbal│ RD$310K │ →+0% │  480 │ RD$645│ 69%│41,900│ 7% │ │
│  │4 │ Los Alcarr.│ RD$220K │ ↘-12%│  350 │ RD$629│ 54%│29,700│14% │ │  <- fila entera con borde izq. data-neg 2px: fuera de rango
│  └──┴────────────┴─────────┴──────┴──────┴───────┴────┴─────┴────┘ │
│  Ordenable por columna. Clic en fila → drill-down (§5.1).           │
├─────────────────────────────────────────────────────────────────────┤
│  Top barberos de la cadena     │  Top servicios          │ Avisos   │
│  1. Jandy — RD$68K, 92 serv.   │  1. Fade + barba — 340   │ Bella    │
│  2. Kelvin — RD$61K, 85 serv.  │  2. Corte clásico — 290  │ Vista -3d│
│  3. ...                        │  3. ...                  │ bajo prom│
└─────────────────────────────────────────────────────────────────────┘
```

**Comportamiento clave:**
- El selector de fecha global controla ambas secciones a la vez (KPIs + tabla).
- La columna `RD$/SILLA` es obligatoria y siempre visible (nunca oculta tras un
  toggle) — es la normalización que el PRD §5.4.B exige para que la comparación no
  favorezca siempre a la sede más grande.
- Ordenar por columna: clic en header, ícono de flecha aparece junto al header activo.
- En móvil: la tabla colapsa a scroll horizontal con la columna "Sede" **fija** (sticky
  left), tal como especifica el brand brief §3.4.
- Fila con desviación fuerte (>10% bajo el promedio de la cadena) lleva borde
  izquierdo de 2px en `data-neg`, no fondo completo — el fondo completo en rojo sobre
  una tabla de 9 columnas es ruido visual, el borde es suficiente señal.

### 4.2 El Día — vista del admin de sede (`(location)/[id]/today`)

Mobile-first obligatorio (Kelvin opera de pie, una mano), pero debe verse bien en
tablet/desktop del mostrador.

```
┌───────────────────────────────────┐
│ ☰  El Día — Sede Naco    [🔔2] [👤]│
├───────────────────────────────────┤
│ RD$ 48,200 hoy   ·  14 servicios   │  <- KPI compacto, siempre visible arriba
│ 6 de 8 sillas ocupadas ahora       │
├───────────────────────────────────┤
│ [ Agenda ]  [ La Fila (3) ]        │  <- tabs; badge con conteo de la fila en vivo
├───────────────────────────────────┤
│ AGENDA — ahora: 2:40pm             │
│ ┌─────┬─────────┬─────────┬──────┐│
│ │Hora │ Jandy   │ Kelvin  │Yeiko ││  <- columnas = barberos, scroll horiz en móvil
│ ├─────┼─────────┼─────────┼──────┤│
│ │2:00 │ Ramón G.│ (libre) │Ana P.││
│ │2:30 │ ▓▓▓▓▓▓▓▓│         │▓▓▓▓▓▓││  <- bloque ocupado = tarjeta con nombre+servicio
│ │3:00 │ Luis M. │ Pedro R.│      ││
│ └─────┴─────────┴─────────┴──────┘│
│ [+ Agregar cita]                   │
├───────────────────────────────────┤
│ ACCIÓN RÁPIDA (fijo, tercio inf.)  │
│ [  Dar turno  ]  [  Cobrar  ]      │  <- botones grandes, 48px+, siempre visibles
└───────────────────────────────────┘
```

**Comportamiento clave:**
- Tab "La Fila" lleva badge con conteo en vivo; si hay un turno esperando más de su
  tiempo estimado, el badge cambia de `ink-700` a `data-warn`.
- Los dos botones de acción rápida (Dar turno / Cobrar) están **siempre fijos en el
  tercio inferior de la pantalla en móvil** — son las dos acciones que Kelvin ejecuta
  con más frecuencia en hora pico y deben estar al alcance del pulgar sin scroll
  (brand brief §3.4, fila "Consola de sede").
- Toque en un bloque de la agenda abre un sheet inferior (no modal centrado) con
  detalle de la cita y acciones: reprogramar, marcar completada, no-show, cancelar.

### 4.3 La Fila — cola de walk-ins en tiempo real (`(location)/[id]/queue`)

Mobile-first, pantalla que más se beneficia de estar siempre visible en un tablet fijo
del mostrador.

```
┌───────────────────────────────────┐
│ ☰  La Fila — Sede Naco             │
│                     [+ Dar turno]  │  <- CTA primaria en índigo, arriba a la derecha
├───────────────────────────────────┤
│ 3 esperando · espera prom. 18 min  │
├───────────────────────────────────┤
│ ① Ana Peralta           esperando  │  <- tarjeta con número de posición grande (radius-full)
│    Fade + barba · espera ~5 min    │
│    Prefiere: Jandy                 │
│    [ Llamar turno ]                │  <- botón primario índigo
├───────────────────────────────────┤
│ ② Luis Manzueta         esperando  │
│    Corte clásico · espera ~15 min  │
│    Sin preferencia                 │
│    [ Llamar turno ]                │
├───────────────────────────────────┤
│ ③ +NUEVO+ Pedro Reyes   esperando  │  <- entrada nueva: borde índigo pulsante 400ms al llegar
│    Fade · espera ~22 min           │     + deslizamiento de 8px (brand brief §3.6)
│    Sin preferencia                 │
│    [ Llamar turno ]                │
├───────────────────────────────────┤
│ Atendiendo ahora                   │
│ Jandy → Ramón Guzmán (2:30–3:00)   │  <- sección separada, sin acción, solo estado
│ Kelvin → (libre)                   │
└───────────────────────────────────┘
```

**Comportamiento clave (patrón realtime, ver también §5.2):**
- Nuevo turno agregado (por recepción o por sí mismo desde tótem/web) entra con
  deslizamiento de 8px + pulso de borde índigo de 400ms, sin sonido invasivo (opcional
  beep corto configurable), sin reordenar el resto de la lista de golpe.
- El tiempo estimado de espera se recalcula en vivo; si un turno lleva más tiempo del
  estimado, el texto de espera cambia a `data-warn` ("espera ~15 min" → "llevando más
  de lo estimado").
- "Llamar turno" mueve la tarjeta a la sección "Atendiendo ahora" con una transición
  de 180ms, no un salto.
- Swipe lateral en móvil = acciones secundarias (reasignar barbero, marcar que se fue
  sin esperar — `left`).

### 4.4 Cobrar — checkout/POS (`(location)/[id]/checkout`)

Mobile/tablet-first, pantalla de dinero — máxima claridad, cero ambigüedad.

```
┌───────────────────────────────────┐
│ ←  Cobrar — Ramón Guzmán           │
├───────────────────────────────────┤
│ SERVICIOS                          │
│ Fade + barba         Jandy  RD$700 │  <- servicio y barbero por línea (sale_items)
│ [+ Agregar producto/servicio]      │
├───────────────────────────────────┤
│ Descuento               [ninguno▾] │  <- requiere motivo si se aplica (auditoría)
│ Propina                  [RD$100▾] │  <- chips rápidos: 0 / 10% / 15% / 20% / otro
├───────────────────────────────────┤
│ Subtotal                   RD$700  │
│ Propina                    RD$100  │
│ ───────────────────────────────── │
│ TOTAL                      RD$800  │  <- num-l, Plex Mono, máximo contraste
├───────────────────────────────────┤
│ MÉTODO DE PAGO                     │
│ [ Efectivo ] [ Tarjeta ] [ Transf.]│  <- selección única, targets grandes
├───────────────────────────────────┤
│         [   Cobrar RD$800   ]      │  <- botón primario, ancho completo, 56px alto
└───────────────────────────────────┘
```

**Estados explícitos (coherente con brand brief §2.2 y §2.4 de este brief):**
- Al presionar "Cobrar": botón pasa a "Cobrando…" con spinner de 14px, se bloquea
  doble-submit.
- Éxito: pantalla cambia a confirmación sobria — "Cobrado. RD$800 en efectivo.
  Propina RD$100 para Jandy." + botón "Nuevo cobro" / "Volver a El Día". Sin
  animación de celebración.
- Error (fallo de red, fallo de escritura): banner persistente rojo arriba, el monto
  y los datos ingresados **no se pierden** (el formulario no se resetea), botón
  "Reintentar" reenvía el mismo payload. Nunca se le pide al usuario re-teclear el
  monto tras un error.
- Si el método es "Tarjeta" y hay integración de pasarela pendiente (PRD §9.2, fase
  3), el MVP marca "Tarjeta" como registro manual del monto (no hay swipe real) —
  el copy debe aclarar "Registra el monto cobrado por la terminal" para no sugerir
  que Kortex procesó la tarjeta.

### 4.5 Corte de Quincena — cierre de comisiones (`(chain)/commissions/periods/[id]`)

Desktop-first (lo hace Kelvin o Ramón sentados, es una revisión, no una acción de pie),
debe funcionar en tablet.

```
┌─────────────────────────────────────────────────────────────────┐
│ El Corte — Quincena 1–15 sep 2026            Estado: Calculado  │
├─────────────────────────────────────────────────────────────────┤
│ 8 barberos · RD$248,600 a pagar · 2 sedes                        │
│ [ Ver desglose por sede ]                                        │
├─────────────────────────────────────────────────────────────────┤
│ BARBERO      │SEDE   │SERV.│ING.SERV│COMIS.  │ALQ.SILLA│PROPINAS│NETO   │
│ Jandy R.     │Naco   │ 45  │RD$28,400│RD$14,200│ —      │RD$3,100│RD$17,300│
│ Kelvin M.    │Naco   │ 38  │RD$24,100│RD$12,050│ —      │RD$2,400│RD$14,450│
│ Pedro R.     │Bella V│ 30  │RD$19,800│  —     │RD$6,000│RD$1,900│RD$13,700│  <- silla fija: sin columna comisión
│ ...          │       │     │        │        │        │        │        │
├─────────────────────────────────────────────────────────────────┤
│ ⚠ 1 ajuste pendiente de revisión — Jandy R., Naco: descuento     │
│   aplicado sin motivo registrado (RD$50). Revisar antes de cerrar│
├─────────────────────────────────────────────────────────────────┤
│  [ Descargar CSV ]        [ Cerrar el corte — no se puede editar]│  <- botón deshabilitado hasta resolver el ajuste
└─────────────────────────────────────────────────────────────────┘
```

**Comportamiento clave:**
- Estado del período visible siempre en el header: `Abierto → Calculado → Aprobado →
  Pagado` (PRD `payout_periods.status`).
- El botón "Cerrar el corte" se deshabilita explícitamente si hay ajustes o
  discrepancias sin resolver — con el texto exacto de por qué, no solo el estado
  disabled (regla de §2.5 de este brief).
- Clic en cualquier fila abre el **Recibo del barbero** (lo que ve Mi Silla → Lo mío),
  en modo lectura, para que Kelvin/Ramón vean exactamente lo que verá el barbero.
- Confirmación de "Cerrar el corte" es un modal con el resumen exacto (8 barberos,
  RD$248,600, "después no se puede editar") — copy tomado literal del brand brief §2.2.
- Una vez cerrado, la tabla pasa a solo lectura con un sello visual de cobre
  ("Pagado" / "Cerrado") — el único momento "emotivo" permitido del producto
  (brand brief §5.5).

### 4.6 Mi Silla — vista del barbero en su celular (`(barber)/mi-silla`)

Mobile-only, PWA, uso de 30 segundos entre clientes. Baja densidad deliberada.

```
┌───────────────────────┐
│  Mi Silla — Jandy      │
├───────────────────────┤
│  LO MÍO — esta quincena│
│                        │
│    RD$ 17,300          │  <- display-l en COBRE, la única pantalla donde domina
│  38 servicios          │
│  Propinas: RD$3,100    │
│                        │
│  [ Ver recibo completo]│
├───────────────────────┤
│  MI DÍA — hoy          │
│                        │
│  Ahora: Ramón G.       │
│  Fade + barba · 2:30pm │
│                        │
│  Siguiente: Luis M.    │
│  Corte clásico · 3:00pm│
│                        │
│  [ Ver toda mi agenda ]│
└───────────────────────┘
```

**Comportamiento clave:**
- Una sola métrica grande por pantalla (brand brief §3.4): el monto de la quincena en
  curso es lo primero que ve, en cobre, en Archivo/Plex Mono.
- Cero tablas, cero navegación anidada. "Ver recibo completo" y "Ver toda mi agenda"
  son las únicas dos profundizaciones posibles desde el home.
- El recibo completo (`/mi-silla/recibo/[periodId]`) sí puede mostrar el desglose tipo
  tabla simplificada (fecha, servicio, cliente, comisión), pero en una sola columna
  apilada (lista, no tabla horizontal) — el móvil angosto no soporta la tabla de 8
  columnas del Corte de Quincena del superuser.
- Sin conexión (PRD §15, offline-tolerante fase 2): la última cifra sincronizada se
  muestra con una nota "Actualizado hace 12 min · sin conexión" en `data-neutral`,
  nunca se muestra un monto potencialmente desactualizado sin esa advertencia.

### 4.7 Flujo de reserva pública del cliente (`(public)/[chainSlug]/book`)

Mobile+desktop, modo claro fijo, debe cargar rápido (LCP < 2.5s, PRD §15).

**Ruta 1 — por sede:**
```
Paso 1: Elegí tu sede                    Paso 2: Elegí el servicio
┌─────────────────────┐                  ┌─────────────────────┐
│ 📍 Sede más cercana   │                  │ Fade clásico  RD$500│
│ [Naco — a 1.2 km]    │       →          │ Fade + barba  RD$700│
│                       │                  │ Corte niño    RD$350│
│ Tu sede habitual:     │                  │ ...                  │
│ [Bella Vista]         │                  │                       │
│                       │                  │                       │
│ O elegí otra sede ▾   │                  │                       │
└─────────────────────┘                  └─────────────────────┘

Paso 3: Elegí fecha y hora               Paso 4: Confirmá
┌─────────────────────┐                  ┌─────────────────────┐
│ Hoy · Mañana · ...    │                  │ Fade + barba          │
│ [9:00][9:30][10:00]  │       →          │ Sede Naco · Jandy R.  │
│ [10:30][11:00]...    │                  │ Vie 19 sep, 10:30am   │
│                       │                  │ RD$700                │
│ Con cualquier barbero │                  │                       │
│ disponible, o elegí:  │                  │ Nombre / teléfono      │
│ [Jandy][Kelvin][...] │                  │ [___________]         │
│                       │                  │ [ Confirmar reserva ] │
└─────────────────────┘                  └─────────────────────┘
```

**Ruta 2 — por barbero** (desde `/[chainSlug]/barber/[barberSlug]`): mismo wizard pero
el paso 1 queda fijado al barbero elegido, y el sistema filtra el paso "sede" a
**solo las sedes y días donde ese barbero atiende esa semana** (cobertura, PRD §5.2/5.3)
— con copy explícito: "Jandy atiende en Naco lun–mié y en Bella Vista jue–sáb."

**Comportamiento clave:**
- Barra de progreso superior de 4 pasos, siempre visible, permite volver atrás sin
  perder selección previa.
- Botón "Reservar"/CTA usa `--client-brand` (color de la cadena), nunca el índigo de
  Kortex — coherencia con §1, Dirección A.
- Si el cliente ya tiene sesión (reconocido por teléfono/email), el paso 4 se
  precompleta y muestra su historial breve ("Última visita: hace 15 días en Naco,
  Fade + barba") — refuerza la promesa de "un cliente, toda la cadena" (PRD §4).
- Slot ocupado se oculta de la grilla de horarios, nunca se muestra clickeable y
  deshabilitado (evita el doble-booking por diseño, no solo por validación de backend).

---

## 5. Patrones de interacción clave

### 5.1 Navegación entre ámbito cadena y ámbito sede (superuser en modo lectura)

El superuser puede entrar en modo lectura+ a una sede específica (PRD §5.4.C) sin
perder el contexto de que está "de visita" en un ámbito que no es el suyo por defecto.

- **Disparador:** clic en una fila de la Tabla de Posiciones, o en "Ver esta sede"
  desde `/locations/[id]`.
- **Transición:** no es una navegación completa a una URL de `admin` distinta con
  permisos reescritos — es la **misma UI de `(location)/[id]/today`** que ve Kelvin,
  pero con un **banner persistente superior** no descartable:
  `Estás viendo Sede Naco como superuser (modo lectura+) · [Volver a Vista Cadena]`
  — fondo `brand-950` (índigo profundo), texto `ink-100`, siempre fijo arriba, sobre
  el header normal de la pantalla.
- **Alcance de "lectura+"**: el superuser ve todo lo que ve Kelvin (agenda, fila,
  caja, comisiones de esa sede) pero las acciones de escritura que son exclusivas de
  `admin` local (ej. ajustar stock, aprobar un horario propuesto) quedan visibles pero
  con un estado especial "Acción de gerente — disponible, pero normalmente la hace
  Kelvin" en vez de ocultarse (transparencia total, coherente con el tono "capataz de
  confianza": nada se esconde, todo se etiqueta).
- **Salida:** el botón "Volver a Vista Cadena" en el banner es la única salida
  garantizada visible en todo momento; también funciona el botón atrás del navegador.
- Esto evita construir una segunda versión de cada pantalla de sede solo para el
  superuser — una sola implementación de `(location)` sirve a `admin` y a `superuser`
  en modo visita, diferenciada por el banner y por permisos de escritura en el
  servidor (no en el cliente).

### 5.2 Actualización en tiempo real (La Fila y agenda compartida)

- Toda actualización realtime (Supabase Realtime, PRD §9.2) se anima, nunca aparece de
  golpe ni fuerza un refresh completo de la pantalla.
- Patrón estándar de entrada de un elemento nuevo: `translateY(-8px) → 0` +
  `opacity 0 → 1` en 180ms, seguido de un pulso de borde en `--accent` de 400ms que se
  desvanece — definido en el brand brief §3.6 y aplicado aquí a: nuevo turno en la
  fila, nueva cita agendada que aparece en la agenda de otro dispositivo, cambio de
  estado de un turno (esperando → llamado → atendiendo).
- Patrón de salida (turno completado/se fue): `opacity 1 → 0` + colapso de altura en
  150ms, sin desplazar bruscamente el resto de la lista (usar `layout` transitions,
  ej. Framer Motion `layout` prop, para que las tarjetas vecinas se reacomoden con
  suavidad).
- **Nunca sonido intrusivo por defecto.** Un beep corto opcional, configurable por
  sede, apagado por defecto — el mostrador de una barbería ya es ruidoso.
- Indicador de conexión: un punto de 6px en la esquina del header de La Fila — verde
  (`data-pos`) conectado en vivo, gris (`data-neutral`) reconectando, con texto
  "Reconectando…" solo si supera 3 segundos desconectado.

### 5.3 Estados de carga/error en pantallas que manejan dinero

Ya cubierto en detalle en §2.5, reforzado aquí como principio transversal: **en
`Cobrar`, `El Cuadre` y `El Corte`, ninguna acción puede quedar en estado ambiguo.**
Reglas duras adicionales:

- Ningún botón de cobro/cierre permite doble-submit (deshabilitado inmediato al primer
  clic, con estado visual "Cobrando…"/"Cerrando…").
- Si una operación de dinero falla a mitad de camino (ej. se registró el pago pero
  falló el envío del recibo), el sistema **nunca** dice genéricamente "algo salió
  mal" — dice exactamente qué se completó y qué no: "El cobro de RD$800 se registró.
  No se pudo enviar el recibo por WhatsApp — reintentar envío." Nunca se le hace creer
  al usuario que debe repetir un cobro que ya ocurrió (riesgo de cobro duplicado).
- Todo cierre (caja, corte de quincena) muestra un resumen de confirmación antes de
  ejecutar la acción irreversible, con el monto exacto y la frase "no se puede
  editar después" cuando aplique (coherente con brand brief §2.2, ejemplo de
  confirmación destructiva).

---

## 6. Responsive / dispositivo por rol

| Ámbito/rol | Prioridad de dispositivo | Justificación |
|---|---|---|
| **Chain / superuser** (`overview`, `compare`, `team`, `commissions`, `billing`) | **Desktop-first**, debe degradar bien a móvil | Ramón revisa desde su casa/oficina (PRD persona), pero también abre el teléfono a las 9pm — la Tabla de Posiciones necesita scroll horizontal con columna fija en móvil, no un rediseño aparte |
| **Location / admin** (`today`, `queue`, `checkout`, `register`) | **Mobile-first obligatorio**, óptimo en tablet | Kelvin opera de pie, una mano, bajo presión en hora pico (PRD §15, requisito no funcional) — targets de 48px+, acciones primarias en tercio inferior |
| **Barber / PWA** (`mi-silla`) | **Mobile-only, diseño no se adapta a desktop** | Uso de 30 segundos entre clientes, celular en el bolsillo — no existe caso de uso de escritorio para este rol |
| **Client** (`mis-citas`, `perfil`) | **Ambos, sin preferencia** | Reserva desde el celular mayormente, pero revisa historial desde cualquier dispositivo |
| **Public** (`[chainSlug]`, `book`) | **Debe funcionar perfecto en ambos**, mobile-first en implementación | Yarisel reserva desde el celular (>80% esperado), pero la landing de la cadena también se comparte en desktop (redes, búsqueda) — LCP < 2.5s en ambos es requisito duro (PRD §15) |

**Regla de breakpoints (Tailwind v4 defaults, sin breakpoints custom salvo necesidad
comprobada):** `sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`. La Tabla de
Posiciones activa su modo "columna fija + scroll horizontal" por debajo de `lg`.

---

## 7. Componentes reutilizables a definir primero

Orden sugerido de construcción — antes de tocar una sola pantalla completa, estos
componentes deben existir, documentados con sus variantes y estados (§2.5):

1. **Botón** — variantes: primario (índigo), secundario (borde), dinero (cobre, solo
   en contexto de Mi Silla/recibos), destructivo (rojo, con confirmación obligatoria),
   ghost/texto. Tamaños: `sm` (32px), `md` (40px), `lg` (48px, táctil), `xl` (56px,
   CTA de cobro).
2. **Input / Select / Combobox** — con estado de error inline, helper text, y soporte
   para `Plex Mono` cuando el input es un monto (ej. campo de descuento manual).
3. **Badge de estado** — chips pequeños reutilizados en toda la app: estado de cita
   (`pendiente/confirmada/completada/cancelada/no-show`), estado de turno en la fila
   (`esperando/llamado/atendiendo`), estado de período (`abierto/calculado/aprobado/
   pagado`), estado de sede (`activa/inactiva`). Cada badge mapea a un color semántico
   fijo — documentar la tabla de mapeo una sola vez, no reinventar por pantalla.
4. **Tabla de datos densa** — el componente más importante del sistema (usado en
   Tabla de Posiciones, El Corte, Almacén, reportes). Debe soportar: orden por
   columna, columna fija en scroll horizontal, alineación numérica automática para
   columnas de tipo `money`/`number`, fila expandible (drill-down), estado vacío
   estandarizado, densidad configurable (44px/52px).
5. **Tarjeta de sede** — usada en `/locations`, en el selector de sede de la página
   pública, y en tarjetas de resultado del dashboard. Variantes: compacta (lista),
   expandida (perfil público).
6. **Indicador de comisión/monto** (`MoneyDisplay`) — componente que encapsula la
   regla tipográfica dura de §3.5 del brand brief: siempre Plex Mono, siempre
   alineado a la derecha en contexto de tabla, formato `RD$` sin decimales en vistas
   resumen y con decimales en cobro/comisiones, color cobre solo cuando el contexto es
   "dinero devengado por una persona" (nunca para ingreso de sede).
7. **Delta/Semáforo** (`TrendIndicator`) — combina flecha + color + signo (`+8%`,
   `-3%`), nunca solo color (regla WCAG AA del brand brief §3.3). Un solo componente
   usado en KPIs, Tabla de Posiciones y Avisos.
8. **Tarjeta de turno** (`QueueCard`) — usada exclusivamente en La Fila, con las
   variantes de estado (esperando/llamado/atendiendo/se fue) y la animación de
   entrada/salida de §5.2 encapsulada dentro del componente, no reimplementada por
   quien construya la pantalla.
9. **Banner de contexto** (`ScopeBanner`) — el banner persistente de "modo lectura+"
   descrito en §5.1; también reutilizable para el banner de "sin conexión" de Mi
   Silla y el de "prueba por vencer" de Billing.
10. **Sheet inferior (bottom sheet) móvil** — reemplaza el modal centrado en todos los
    contextos táctiles (detalle de cita, detalle de turno, confirmaciones en El Día,
    La Fila y Cobrar). El modal centrado clásico se reserva para desktop/tablet ancho.
11. **Skeleton loader** — variantes que calzan con cada layout de tabla/tarjeta
    (nunca un spinner genérico centrado en pantallas con estructura conocida, regla
    de §2.5).
12. **Empty state esquemático** — el patrón de "fila fantasma con guiones" / bloque de
    texto corto, un solo componente parametrizable en vez de resolverlo ad hoc en
    cada pantalla.

---

## 8. Decisiones (confirmadas por Williams — 16 sep 2026)

| # | Decisión | Resolución |
|---|---|---|
| **U1** | Dirección A (grafito/índigo/cobre) vs. Dirección B (negro/dorado) | ✅ **Confirmado: Dirección A.** Tokens finales de §2.1 quedan como definitivos, ningún cambio adicional |
| **U2** | Modo lectura+ del superuser reutiliza literalmente la UI de `(location)` | ✅ **Confirmado** — se sigue la recomendación del diseñador |
| **U3** | Bottom sheet (táctil) vs. modal centrado (desktop ≥`lg`) | ✅ **Confirmado** — se sigue la recomendación del diseñador |
| **U4** | Sonido en La Fila apagado por defecto, con toggle en `/queue` | ✅ **Confirmado** — se sigue la recomendación del diseñador |
| **U5** | El Corte siempre en formato tabla (sin variante compacta para pocos barberos) | ✅ **Confirmado** — se sigue la recomendación del diseñador |
| **U6** | Validar reconocimiento visual de la Dirección A con dueños reales | ⏳ **Pendiente — se ejecuta dentro de F0** (PRD §11/§17), no bloquea el inicio del diseño/desarrollo |
| **U7** | Renombrar el plan "Starter" a "Local" | ✅ **Ya aplicado** en `PRD-BarberShop.md` (incluyendo el enum del esquema de datos) antes de que este brief se completara |

---

## 9. Siguiente paso

Con Dirección A o B decidida (§1, U1), el siguiente paso es producir:
1. Tokens de diseño finales en formato Tailwind v4 `@theme` (dos temas), listos para
   `shadcn/ui`, a partir de §2.1.
2. Los 12 componentes de §7, en ese orden, con Storybook o equivalente para validar
   estados antes de integrarlos en pantallas reales.
3. Implementación de las 7 pantallas críticas de §4 como primer sprint de UI, porque
   son las que validan el sistema completo (dark+light, realtime, dinero, mobile+
   desktop) antes de construir el resto de las ~35 pantallas del mapa de §3.

---

*UX brief redactado el 16 de septiembre de 2026 — W-Tech.*
*Insumos: PRD-BarberShop.md v1.0 (aprobado), BRAND-BRIEF-Kortex.md v1.0 (pendiente de
validación en su §8, en particular B1, que este documento reformula como U1).*
*Estado: pendiente de decisión de Williams en §1 y §8 antes de iniciar construcción.*
