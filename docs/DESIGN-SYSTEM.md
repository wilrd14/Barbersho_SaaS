# DESIGN SYSTEM — Kortex

**Producto:** Kortex — SaaS de gestión operativa para cadenas de barberías multi-sede
**Empresa:** W-Tech
**Fecha:** 16 de septiembre de 2026
**Versión:** 1.0
**Rol que redacta:** `graphic-designer`
**Insumos (ya aprobados, no reinterpretar):** `BRAND-BRIEF-Kortex.md` v1.0 (§2, §3, §5),
`UX-BRIEF-Kortex.md` v1.0 (§1 U1, §2, §3, §4, §5, §6, §7)
**Destinatario:** agente/desarrollador frontend (Next.js 15 + Tailwind v4 + shadcn/ui),
sin más contexto que este documento.
**Estado:** formalización lista para implementar. No hay decisiones de diseño abiertas —
Dirección A (grafito/índigo/cobre) fue confirmada por Williams en UX-BRIEF §8 U1.

---

## 0. Cómo usar este documento

Este documento **no propone nada nuevo**. Traduce a especificación de implementación lo
que el Brand Brief y el UX Brief ya decidieron. Si algo aquí parece contradecir esos dos
documentos, gana el valor literal citado en ellos — repórtalo, no lo reinterpretes.

Orden de implementación recomendado (igual al de UX-BRIEF §9):
1. §1 de este documento — tokens de color (`@theme`, ambos temas).
2. §2 — tokens tipográficos y carga de fuentes.
3. §3 — espaciado, radios, sombras.
4. §4 — los 12 componentes reutilizables, en el orden dado.
5. §5 — reglas duras no negociables (úsalas como checklist de PR/code review).
6. §6 — dirección de marca (wordmark), como placeholder hasta que exista el asset final.

---

## 1. Tokens de color — Tailwind v4 `@theme`

Fuente literal: UX-BRIEF §2.1 (que a su vez es literal de BRAND-BRIEF §3.3). Dirección A,
confirmada (UX-BRIEF §8 U1). No inventar hex nuevos, no redondear valores.

### 1.1 Arquitectura de capas (recordatorio obligatorio antes de tocar código)

1. **Cromo (neutros grafito)** — fondos, tarjetas, bordes, texto. Fija, la controla Kortex.
2. **Marca (índigo + cobre)** — acción primaria, foco, identidad, dinero. Fija.
3. **Dato (semáforo)** — positivo/riesgo/negativo en números. Semántica, intocable.
4. **Marca de la cadena cliente** (`--client-brand`) — capa restringida, **solo** dentro de
   `(public)`: logo de la cadena, foto de portada, botón "Reservar". **Nunca** entra en la
   consola interna (`chain`, `location`, `barber`).

### 1.2 Bloque `@theme` — tema oscuro (consola: `chain`, `location`, `barber`)

Este es el tema **por defecto** de toda la aplicación excepto `(public)`.

```css
@theme {
  /* Neutros grafito (capa 1) */
  --color-ink-950: #0B0E14;
  --color-ink-900: #12161F;
  --color-ink-800: #1A1F2B;
  --color-ink-700: #252B3A;
  --color-ink-500: #5A6478;
  --color-ink-300: #A3ABBC;
  --color-ink-100: #E6E9EF;
  --color-ink-50:  #F5F7FA;
  --color-white:   #FFFFFF;

  /* Marca — índigo (capa 2) */
  --color-brand-950: #1E1B4B;
  --color-brand-600:  #4F46E5;
  --color-brand-500:  #6366F1;
  --color-brand-400:  #818CF8;

  /* Marca — cobre / dinero (capa 2) */
  --color-copper-500: #B87333;
  --color-copper-400: #D08B4A;
  --color-copper-100: #F4E3D3;

  /* Semáforo de datos (capa 3, intocable) */
  --color-data-pos:     #16A34A;
  --color-data-warn:    #D97706;
  --color-data-neg:     #DC2626;
  --color-data-neutral: #5A6478;

  /* Paleta de gráficos (Recharts) — serie categórica, nunca colores del semáforo */
  --color-chart-1: #4F46E5; /* índigo */
  --color-chart-2: #06B6D4; /* cian */
  --color-chart-3: #B87333; /* cobre */
  --color-chart-4: #8B5CF6; /* violeta */
  --color-chart-5: #0EA5E9; /* azul cielo */
  --color-chart-6: #F59E0B; /* ámbar — solo como 6ª serie, nunca antes */

  /* --- Alias semánticos consumidos por los componentes (tema oscuro) --- */
  --surface-root:    var(--color-ink-950);
  --surface-card:    var(--color-ink-900);
  --surface-raised:  var(--color-ink-800);
  --border:          var(--color-ink-700);
  --text-primary:    var(--color-ink-100);
  --text-secondary:  var(--color-ink-300);
  --text-tertiary:   var(--color-ink-500);
  --accent:          var(--color-brand-600);
  --accent-hover:    var(--color-brand-500);
  --accent-soft:     var(--color-brand-400);
  --money:           var(--color-copper-500);
  --money-soft:      var(--color-copper-400);
  --money-tint:      var(--color-copper-100); /* uso puntual: fondo de badge/sello */
  --data-pos:        var(--color-data-pos);
  --data-warn:       var(--color-data-warn);
  --data-neg:        var(--color-data-neg);
  --data-neutral:    var(--color-data-neutral);
}
```

### 1.3 Bloque `@theme` — tema claro (público: reserva, reportes impresos)

Se activa **solo** dentro del segmento de rutas `(public)`. Nunca se activa en `chain`,
`location` ni `barber` (BRAND-BRIEF §3.4: dark-first en operación es una decisión de
producto, no un valor por defecto de sistema operativo del usuario — no seguir
`prefers-color-scheme` en la consola).

```css
@theme {
  /* Reutiliza los mismos primitivos de color; solo cambian los alias semánticos */

  --surface-root:    var(--color-ink-50);   /* #F5F7FA */
  --surface-card:    var(--color-white);    /* #FFFFFF */
  --border:          var(--color-ink-100);  /* #E6E9EF */
  --text-primary:    var(--color-ink-900);  /* #12161F */
  --text-secondary:  var(--color-ink-500);  /* #5A6478 */
  --text-tertiary:   var(--color-ink-500);
  --accent:          var(--color-brand-600); /* #4F46E5 — AA sobre blanco, ~6.4:1 */
  --accent-hover:    #4338CA;                /* brand-700, más oscuro para AA en claro */
  --accent-soft:     var(--color-brand-400);
  --money:           var(--color-copper-500);
  --money-soft:      var(--color-copper-100); /* fondo de badge en claro, no copper-400 */
  --money-tint:      var(--color-copper-100);
  --data-pos:        var(--color-data-pos);   /* mismo hex, ya cumple AA en ambos fondos */
  --data-warn:       var(--color-data-warn);
  --data-neg:        var(--color-data-neg);
  --data-neutral:    var(--color-data-neutral);

  /* Capa 4 — inyectada en runtime por cadena, SOLO dentro de (public) */
  --client-brand:    var(--chain-primary-color, var(--color-brand-600));
}
```

`--chain-primary-color` y `--chain-secondary-color` se inyectan como variables inline en
el layout de `(public)/[chainSlug]` a partir de la columna `chains.primary_color` /
`secondary_color` del PRD. `--client-brand` **nunca** se define ni se usa fuera de
`(public)`.

### 1.4 Mecanismo de tema (Next.js 15 + Tailwind v4)

- Estrategia: atributo `data-theme="dark" | "light"` en `<html>` (o en el `<body>` del
  segmento), **no** `prefers-color-scheme` como fuente de verdad — el tema lo decide la
  ruta/ámbito, no el SO del usuario.
  - `(chain)`, `(location)`, `(barber)`: `data-theme="dark"` fijo. `(location)` es el único
    ámbito con **toggle manual** a claro (UX-BRIEF §3.4 fila "Consola de sede": "oscuro por
    defecto, claro conmutable" — el gerente puede forzarlo por luz de vitrina). Ese toggle
    persiste en `localStorage`/cookie por sede, no es global.
  - `(barber)`: oscuro fijo, **sin** toggle (BRAND-BRIEF §3.4: "Oscuro fijo").
  - `(public)`: `data-theme="light"` fijo, sin toggle.
- Los dos bloques `@theme` de §1.2/§1.3 se cargan condicionalmente vía `[data-theme="dark"] { @theme {...} }` / `[data-theme="light"] { @theme {...} }`, o mediante dos capas CSS
  separadas activadas por el atributo — la implementación exacta queda a criterio del
  desarrollador, pero **el resultado debe ser que ambos temas coexistan sin flash** (usar
  el atributo en el HTML servido desde el servidor, no setearlo en un `useEffect` tras
  hidratar).
- Todos los componentes shadcn/ui deben remapear sus tokens (`--background`, `--foreground`,
  `--primary`, `--muted`, `--border`, `--ring`, etc., del `theme.json` de shadcn) a los
  alias semánticos de arriba. **No dejar los valores por defecto de shadcn.**

---

## 2. Tokens tipográficos

Fuente literal: BRAND-BRIEF §3.5. Trío: **Archivo** (display/wordmark) + **Inter**
(UI/texto) + **IBM Plex Mono** (números). Todas disponibles en Google Fonts, licencia
SIL/OFL, self-host obligatorio.

### 2.1 Carga de fuentes (`next/font/local` self-hosted para Cloudflare)

No usar `next/font/google` en producción (evita la dependencia de red a fonts.googleapis
en cada build/deploy y es más predecible en Cloudflare Pages/Workers). Descargar los
archivos woff2 de Google Fonts y servirlos como `next/font/local`:

```ts
// app/fonts.ts
import localFont from 'next/font/local'

export const archivo = localFont({
  src: [
    { path: './fonts/Archivo-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/Archivo-ExtraBold.woff2', weight: '800', style: 'normal' },
    // Variante Expanded, solo para wordmark/logo — ver §6
    { path: './fonts/ArchivoExpanded-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/ArchivoExpanded-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-archivo',
  display: 'swap',
})

export const inter = localFont({
  src: './fonts/InterVariable.woff2', // variable font: cubre 400/500/600
  variable: '--font-inter',
  display: 'swap',
})

export const plexMono = localFont({
  src: [
    { path: './fonts/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
})
```

**Regla dura de carga (BRAND-BRIEF §3.5):** máximo 2 pesos de Archivo cargados (700 y
800) para no penalizar el LCP. No cargar Archivo Expanded 400/500/600 — el Expanded se usa
únicamente para el wordmark (§6), nunca como cuerpo de texto.

### 2.2 Tokens de familia (Tailwind v4 `@theme`)

```css
@theme {
  --font-display: var(--font-archivo), 'Archivo', sans-serif;
  --font-sans:    var(--font-inter), 'Inter', sans-serif;
  --font-mono:    var(--font-plex-mono), 'IBM Plex Mono', monospace;
}
```

### 2.3 Escala tipográfica completa (BRAND-BRIEF §3.5, traducida a variables CSS)

Base 16px, ratio ~1.25 con ajustes de densidad. Cada token define tamaño, interlineado,
familia, peso y tracking exactos — no aproximar.

```css
@theme {
  /* display-xl — Hero del landing */
  --text-display-xl: 3.5rem;        /* 56px */
  --text-display-xl--line-height: 3.75rem; /* 60px */
  --text-display-xl--font-weight: 800;
  --text-display-xl--letter-spacing: -0.04em;
  --text-display-xl--font-family: var(--font-display);

  /* display-l — KPI gigante (ingreso del día de la cadena) */
  --text-display-l: 2.5rem;         /* 40px */
  --text-display-l--line-height: 2.75rem; /* 44px */
  --text-display-l--font-weight: 700;
  --text-display-l--letter-spacing: -0.03em;
  --text-display-l--font-family: var(--font-display);

  /* display-m — KPI de tarjeta, "Lo tuyo hoy" del barbero */
  --text-display-m: 1.875rem;       /* 30px */
  --text-display-m--line-height: 2.25rem; /* 36px */
  --text-display-m--font-weight: 700;
  --text-display-m--letter-spacing: -0.02em;
  --text-display-m--font-family: var(--font-display);

  /* h1 — Título de página */
  --text-h1: 1.5rem;                /* 24px */
  --text-h1--line-height: 2rem;     /* 32px */
  --text-h1--font-weight: 600;
  --text-h1--font-family: var(--font-sans);

  /* h2 — Título de sección/tarjeta */
  --text-h2: 1.25rem;               /* 20px */
  --text-h2--line-height: 1.75rem;  /* 28px */
  --text-h2--font-weight: 600;
  --text-h2--font-family: var(--font-sans);

  /* body — Texto base de la app */
  --text-body: 0.9375rem;           /* 15px, no 16 */
  --text-body--line-height: 1.375rem; /* 22px */
  --text-body--font-weight: 400;
  --text-body--font-family: var(--font-sans);

  /* body-s — Texto secundario, ayudas */
  --text-body-s: 0.8125rem;         /* 13px */
  --text-body-s--line-height: 1.125rem; /* 18px */
  --text-body-s--font-weight: 400; /* o 500 */
  --text-body-s--font-family: var(--font-sans);

  /* label — Encabezados de columna, etiquetas de métrica */
  --text-label: 0.6875rem;          /* 11px */
  --text-label--line-height: 0.875rem; /* 14px */
  --text-label--font-weight: 600;
  --text-label--letter-spacing: 0.06em;
  --text-label--text-transform: uppercase;
  --text-label--font-family: var(--font-sans);

  /* num-l — Montos destacados */
  --text-num-l: 1.25rem;            /* 20px */
  --text-num-l--line-height: 1.5rem; /* 24px */
  --text-num-l--font-weight: 500;
  --text-num-l--font-family: var(--font-mono);
  --text-num-l--font-feature-settings: "tnum";

  /* num-m — Celdas de monto en tablas */
  --text-num-m: 0.875rem;           /* 14px */
  --text-num-m--line-height: 1.25rem; /* 20px */
  --text-num-m--font-weight: 400;
  --text-num-m--font-family: var(--font-mono);
  --text-num-m--font-feature-settings: "tnum";
}
```

`font-feature-settings` adicional para Inter (BRAND-BRIEF §3.5): habilitar `"ss01", "cv05"`
en el body de la app vía `body { font-feature-settings: "ss01", "cv05"; }` — no aplica a
Plex Mono ni Archivo.

### 2.4 Reglas tipográficas duras (repetidas aquí porque son las más fáciles de romper)

- Todos los números en tabla: alineados a la derecha, `--font-mono`, `font-feature-settings: "tnum"`. Sin excepción.
- Nunca un monto en Archivo dentro de una tabla — Archivo solo en KPI gigante aislado
  (`display-l`, `display-m`).
- Mayúsculas solo en `label` (11px). Nunca en botones ni titulares.
- Máximo 2 pesos de Archivo cargados (700, 800).
- Archivo Expanded: uso exclusivo del wordmark/logo (§6), nunca body ni H1 de producto.

---

## 3. Espaciado, radios y sombras

Fuente literal: UX-BRIEF §2.3–§2.4.

### 3.1 Espaciado (base 4px)

```css
@theme {
  --spacing-1:  0.25rem; /* 4px */
  --spacing-2:  0.5rem;  /* 8px */
  --spacing-3:  0.75rem; /* 12px */
  --spacing-4:  1rem;    /* 16px */
  --spacing-5:  1.25rem; /* 20px */
  --spacing-6:  1.5rem;  /* 24px */
  --spacing-8:  2rem;    /* 32px */
  --spacing-10: 2.5rem;  /* 40px */
  --spacing-12: 3rem;    /* 48px */
  --spacing-16: 4rem;    /* 64px */
}
```

- Contenedor máximo de consola: `1440px` (dashboards anchos, tabla de 9 columnas).
- Contenedor máximo de página pública: `640px` (mobile-first, flujo de reserva de 3-4
  toques).
- Padding de tarjeta: `space-4` (16px) desktop, `space-3` (12px) móvil.
- Altura de fila de tabla: `44px` desktop, `52px` táctil.
- Gutter entre columnas de agenda (vista día por barbero): `1px` de borde, sin gutter
  extra adicional.
- Breakpoints: defaults de Tailwind v4, sin custom salvo necesidad comprobada — `sm 640 /
  md 768 / lg 1024 / xl 1280 / 2xl 1536`. La Tabla de Posiciones activa su modo "columna
  fija + scroll horizontal" por debajo de `lg`.

### 3.2 Radios

```css
@theme {
  --radius-sm:   0.25rem;  /* 4px — badges, celdas, chips de estado */
  --radius-md:   0.375rem; /* 6px — botones, inputs, tarjetas */
  --radius-full: 999px;    /* avatares, indicador de posición en La Fila */
}
```

**Regla dura:** nunca usar `rounded-lg` ni `rounded-2xl` de la escala por defecto de
Tailwind/shadcn en ningún componente de Kortex — ese redondeo grande es el lenguaje de
Agendalo (marca hermana) y del cliché de la industria. Sobrescribir cualquier variante de
componente shadcn que traiga `rounded-lg` por defecto (ej. `Card`, `Dialog`) a `--radius-md`.

### 3.3 Sombras y jerarquía visual

- **Bordes sobre sombras.** En modo oscuro la jerarquía se construye con `--border` (1px)
  y elevación de superficie (`--surface-card` → `--surface-raised`), **no** con blur ni
  sombra difusa.
- Sombra **únicamente** en overlays: `modal`, `popover`, `sheet`.
  - Oscuro: `box-shadow: 0 8px 24px rgba(0,0,0,0.4);`
  - Claro: `box-shadow: 0 8px 24px rgba(15,15,20,0.12);`
- Nunca aplicar `box-shadow` decorativo a tarjetas, botones o filas de tabla.

---

## 4. Los 12 componentes reutilizables

Fuente: UX-BRIEF §7 (orden de construcción) + §2.5 (estados de interacción, aplican a
todos por defecto salvo que se indique lo contrario) + wireframes §4. Especificación de
API (props/variantes), no código.

Estados base de UX-BRIEF §2.5 que **todo componente interactivo** debe soportar salvo
excepción explícita: `default`, `hover`, `focus` (anillo 2px `--accent`, offset 2px, nunca
suprimido sin reemplazo), `active/pressed`, `disabled` (opacidad 40%, nunca oculto, con
explicación adyacente del porqué), `loading` (skeleton o spinner de 14px según contexto,
nunca spinner centrado genérico en pantallas con estructura conocida).

### 4.1 Botón

- **Prop `variant`:** `primary` (fondo `--accent`) | `secondary` (borde `--border`, fondo
  transparente) | `money` (fondo `--money`, **solo** en contexto Mi Silla/recibos —
  ver regla dura §5) | `destructive` (fondo `--data-neg`, requiere confirmación
  obligatoria — sheet o modal, nunca ejecución directa) | `ghost` (sin fondo ni borde,
  solo texto).
- **Prop `size`:** `sm` (32px) | `md` (40px) | `lg` (48px, mínimo táctil) | `xl` (56px,
  CTA de cobro — usado en "Cobrar RD$800").
- **Estado `loading`:** label cambia a verbo en gerundio corto ("Cobrando…", "Cerrando…"),
  ícono reemplazado por spinner de 14px, el texto completo del label nunca desaparece,
  botón bloquea doble-submit inmediatamente al primer clic.
- **Pantallas de uso:** transversal — Cobrar (`xl`), Dar turno/Llamar turno/La Fila
  (`primary`/`md`), Cerrar el corte (`primary`, con `disabled` + tooltip si hay ajustes
  pendientes), Desactivar sede (`destructive`).

### 4.2 Input / Select / Combobox

- **Props comunes:** `label`, `helperText`, `error` (string; si presente, activa estado de
  error), `disabled`.
- **Prop `numeric`** (boolean): cuando `true` (ej. campo de descuento manual, monto de
  propina "otro"), el input usa `--font-mono` con `tnum`, alineado a la derecha.
- **Combobox:** soporta búsqueda inline, usado para selector de sede/barbero/servicio.
- **Estado de error:** borde `--data-neg`, texto de ayuda en `--data-neg` debajo del
  input, ícono de alerta a la izquierda del mensaje. El mensaje sigue BRAND-BRIEF §2.2:
  qué pasó + por qué + qué hacer.
- **Pantallas de uso:** Cobrar (monto de descuento), formularios de `/locations`,
  `/team`, `/services`, wizard de reserva pública (paso 4: nombre/teléfono).

### 4.3 Badge de estado

- **Prop `kind`:** `cita` (`pendiente | confirmada | completada | cancelada | no-show`) |
  `turno` (`esperando | llamado | atendiendo`) | `periodo` (`abierto | calculado |
  aprobado | pagado`) | `sede` (`activa | inactiva`).
- **Mapeo de color fijo (documentar una sola vez, no reinventar por pantalla):**
  - Positivo/completado/pagado/activo → `--data-pos`.
  - Pendiente/esperando/calculado → `--data-neutral` o `--accent-soft` según contraste
    necesario (definir en la implementación del componente, no ad hoc por pantalla).
  - Advertencia/llamado → `--data-warn`.
  - Cancelado/no-show/inactiva → `--data-neg`.
- **Radio:** `--radius-sm` (4px).
- **Pantallas de uso:** Agenda/El Día, La Fila, Corte de Quincena (estado del período en
  el header), `/locations`.

### 4.4 Tabla de datos densa

El componente más importante del sistema — usado en Tabla de Posiciones, El Corte,
Almacén (fase 2), reportes.

- **Props:** `columns` (con `type: 'text' | 'money' | 'number' | 'percent' | 'delta'` por
  columna — `money`/`number`/`percent`/`delta` fuerzan alineación derecha + `--font-mono`
  automáticamente), `stickyFirstColumn` (boolean, activo por defecto `<lg`), `density`
  (`44` | `52`, px de alto de fila), `sortable` (boolean por columna), `expandable`
  (boolean, fila con drill-down), `emptyState` (nodo del componente Empty State §4.12).
- **Comportamiento de orden:** clic en header, ícono de flecha junto al header activo.
- **Comportamiento de desviación (Tabla de Posiciones):** fila con desviación >10% bajo
  el promedio de la cadena lleva **borde izquierdo de 2px en `--data-neg`**, nunca fondo
  completo — el fondo completo es ruido visual en una tabla de 9 columnas.
- **Columna `Δ` (delta):** usa el subcomponente TrendIndicator (§4.7), nunca color solo.
- **Pantallas de uso:** `/compare` (Tabla de Posiciones), `/commissions/periods/[id]` (El
  Corte), reportes.

### 4.5 Tarjeta de sede

- **Prop `variant`:** `compacta` (lista, usada en `/locations`, dashboard) | `expandida`
  (perfil público, con foto de portada, horario, mapa).
- **Contenido:** foto, nombre, dirección, badge "Abierto ahora" (`--data-pos`), botón de
  acción (interno: "Ver esta sede"; público: "Reservar" en `--client-brand`).
- **Pantallas de uso:** `/locations`, selector de sede en wizard de reserva pública,
  tarjetas de resultado del dashboard.

### 4.6 MoneyDisplay (indicador de comisión/monto)

- **Props:** `amount` (number), `context` (`'summary' | 'checkout' | 'commission'` — rige
  decimales: sin decimales en `summary`, con decimales en `checkout`/`commission`),
  `emphasis` (`'money' | 'neutral'` — `'money'` aplica color `--money`, **solo** permitido
  cuando el contexto es dinero devengado por una persona; `'neutral'` para ingreso de
  sede/facturación), `align` (fuerza `text-right` por defecto en contexto de tabla).
- **Regla encapsulada (no reimplementar en cada pantalla):** siempre `--font-mono`,
  siempre `tnum`, formato `RD$` con separador de miles dominicano.
- **Pantallas de uso:** transversal — Vista Cadena (KPI hero), Tabla de Posiciones,
  Cobrar, El Corte, Mi Silla (con `emphasis="money"`).

### 4.7 TrendIndicator (Delta/Semáforo)

- **Props:** `value` (number, ej. `+8` o `-3`), `direction` (`'up' | 'down' | 'flat'`,
  deriva el ícono de flecha), `severity` (`'pos' | 'warn' | 'neg' | 'neutral'`, deriva el
  color semántico).
- **Regla dura encapsulada:** combina **siempre** flecha + color + signo explícito
  (`+8%`, `−3%`). Nunca comunica solo con color (WCAG AA, BRAND-BRIEF §3.3 — 8% de
  hombres dominicanos tiene daltonismo rojo-verde).
- **Pantallas de uso:** KPIs de Vista Cadena, columna `Δ` de Tabla de Posiciones, Avisos.

### 4.8 QueueCard (tarjeta de turno)

- **Prop `state`:** `esperando | llamado | atendiendo | se-fue`.
- **Contenido:** número de posición (usa `--radius-full`), nombre de cliente, servicio,
  tiempo de espera estimado (cambia a texto `--data-warn` si excede lo estimado),
  preferencia de barbero, botón "Llamar turno" (solo en `esperando`).
- **Animación encapsulada dentro del componente** (no reimplementar por pantalla):
  entrada `translateY(-8px) → 0` + `opacity 0 → 1` en 180ms + pulso de borde `--accent`
  de 400ms; salida `opacity 1 → 0` + colapso de altura en 150ms con reacomodo suave de
  vecinos (`layout` transition, ej. Framer Motion `layout`).
- **Uso exclusivo de:** `/queue` (La Fila).

### 4.9 ScopeBanner (banner de contexto)

- **Props:** `variant` (`'readonly-visit' | 'offline' | 'trial-ending'`), `message`,
  `actionLabel`, `onAction`.
- **Comportamiento:** persistente, no descartable (`readonly-visit`), fondo
  `--color-brand-950` (índigo profundo), texto `--text-primary`, siempre fijo arriba,
  sobre el header normal de la pantalla.
- **Pantallas de uso:** modo lectura+ del superuser visitando una sede (UX-BRIEF §5.1);
  Mi Silla sin conexión ("Actualizado hace 12 min · sin conexión", `--data-neutral`);
  Billing con prueba por vencer.

### 4.10 Sheet inferior (bottom sheet) móvil

- **Prop `breakpoint`:** por debajo de `lg` renderiza como sheet inferior; en `lg` y
  superior renderiza como modal centrado (UX-BRIEF §8 U3, confirmado).
- **Uso:** detalle de cita, detalle de turno, confirmaciones en El Día, La Fila y Cobrar.
- **Pantallas de uso:** El Día (toque en bloque de agenda), La Fila (swipe → acciones
  secundarias), Cobrar (confirmaciones).

### 4.11 Skeleton loader

- **Prop `layout`:** debe calzar con el layout real del contenido que reemplaza (`table`,
  `card`, `kpi`, `list`) — **nunca** un spinner genérico centrado en pantallas con
  estructura de datos conocida.
- **Uso transversal:** cualquier pantalla con fetch de datos (Vista Cadena, Tabla de
  Posiciones, El Corte, Mi Silla).

### 4.12 Empty state esquemático

- **Props:** `kind` (`'table' | 'block'`), `message` (texto operativo corto, ej.
  "Todavía no se ha cobrado nada hoy"), `action` (opcional, una sola acción si aplica).
- **Regla dura:** nunca ilustración de personaje. `table` renderiza fila fantasma con
  guiones (`—`) en las celdas; `block` renderiza bloque de texto corto + acción única.
- **Pantallas de uso:** Tabla de Posiciones sin datos aún, La Fila vacía, Almacén (fase
  2), cualquier tabla del sistema en su primer uso.

---

## 5. Reglas duras no negociables

Estas reglas se aplican a **todo** el código de UI. Cualquier PR que las rompa debe
rechazarse en revisión, sin excepción de "es solo para probar":

1. **Nunca hex literal en componentes.** Todo componente consume variables semánticas
   (`--surface-root`, `--surface-card`, `--surface-raised`, `--border`, `--text-primary`,
   `--text-secondary`, `--accent`, `--accent-hover`, `--money`, `--data-pos`,
   `--data-warn`, `--data-neg`, `--data-neutral`). Si un color no tiene alias semántico
   todavía, se agrega el alias — no se hardcodea el hex del token primitivo.
2. **Todo número en tabla va en Plex Mono (`--font-mono`), alineado a la derecha, con
   `font-feature-settings: "tnum"`.** Sin excepción, sin importar el ancho de columna.
3. **El cobre (`--money`) solo en superficies de dinero devengado** (comisiones,
   propinas, cierre de quincena, pantalla "Mi Silla"/"Lo mío" del barbero, sello de
   pagado/cerrado). **Nunca** en ingreso/facturación de sede — ese dato es neutro o
   semáforo, nunca cobre. Si un desarrollador necesita destacar un monto de ingreso de
   sede, usa `--accent` o tipografía (tamaño/peso), no `--money`.
4. **El semáforo nunca comunica solo con color.** Siempre acompañado de signo (`+8%`,
   `−3%`), flecha, o posición de ranking — usar siempre el componente TrendIndicator
   (§4.7), nunca aplicar color de semáforo directamente a un texto sin su acompañante.
5. **Radios máximo 6px.** Nunca `rounded-lg` ni `rounded-2xl` de la escala Tailwind/shadcn
   por defecto — sobrescribir cualquier default de componente que traiga radio grande.
   Excepción única: `--radius-full` (999px) en avatares e indicador de posición de la
   fila.
6. **Bordes sobre sombras en modo oscuro.** La jerarquía visual se construye con
   `--border` (1px) + elevación de superficie (`--surface-card` → `--surface-raised`).
   `box-shadow` reservado exclusivamente a overlays (modal, popover, sheet).
7. **Cero emoji en pantallas de producto.** Ni en copy ni en iconografía — solo Lucide,
   estilo lineal, stroke 1.5px, nunca relleno, nunca dos colores. Prohibidos íconos de
   navaja, tijeras, poste de barbero, bigote, silla de barbero, peine.
8. **`--client-brand` (color de la cadena cliente) solo existe y se usa dentro de
   `(public)`.** Nunca se inyecta ni se referencia en `(chain)`, `(location)` ni
   `(barber)`.
9. **Foco de teclado siempre visible.** Anillo de 2px en `--accent`, offset 2px. Nunca
   `outline: none` sin un reemplazo visualmente equivalente (WCAG AA).
10. **Ningún botón de operación de dinero permite doble-submit.** Se deshabilita
    inmediatamente al primer clic con estado "Cobrando…"/"Cerrando…"; nunca un toast que
    desaparece solo para errores de dinero — banner persistente con botón "Reintentar".
11. **Dark-first no es negociable por ámbito.** `(chain)`, `(location)`, `(barber)` cargan
    en oscuro por defecto sin importar `prefers-color-scheme` del sistema operativo del
    usuario. Solo `(location)` admite un toggle manual a claro, persistente por sede. Solo
    `(public)` es claro fijo.
12. **Cero ilustración de personajes en empty states.** Representación esquemática del
    dato ausente (fila fantasma con guiones, bloque de texto corto), nunca un dibujito.

---

## 6. Dirección de marca (wordmark / isotipo) — especificación textual

**Este documento no produce el asset gráfico final.** No hay herramienta de generación de
imágenes disponible en esta tarea. Lo que sigue es la especificación textual para que el
asset se produzca en una fase posterior con una herramienta de diseño (Figma/Illustrator),
tomada literal de BRAND-BRIEF §5.

### 6.1 Estrategia

Wordmark primero, símbolo derivado. El activo principal es el logotipo tipográfico
"kortex"; el símbolo (isotipo) existe solo para favicon, ícono de PWA del barbero y avatar
de WhatsApp.

### 6.2 Especificación del wordmark

- **Tipografía:** Archivo Expanded, pesos 700/800 únicamente.
- **Caja:** minúsculas (`kortex`) — no `Kortex` capitalizado, no versalitas.
- **Tracking:** ligeramente negativo (`letter-spacing` negativo sutil, del mismo rango que
  `display-l`/`display-m`, ~-0.02em a -0.03em — ajustar en la herramienta de diseño hasta
  verse "apretado pero legible", no comprimido).
- **Único detalle de firma permitido:** un corte diagonal limpio (~65–70°, ángulo de
  navaja en la nuca) que rebana un contratrazo de la `k` o atraviesa la `t`. Un solo
  gesto, sutil, que a tamaño pequeño (24px) debe desaparecer sin dañar la lectura del
  wordmark. No se agregan más elementos de firma.
- **Color:**
  - Sobre fondo oscuro: `--text-primary` (`ink-100`, `#E6E9EF`).
  - Sobre fondo claro: `ink-950` (`#12161F` o `#0B0E14` según contraste requerido).
  - Versión a color: el detalle del corte diagonal puede llevar cobre (`--money`,
    `#B87333`).
  - Debe existir una versión de una sola tinta obligatoria (para contextos donde no se
    puede usar color, ej. impresión térmica de recibo).

### 6.3 Especificación del isotipo (24–64px)

Tres pistas a explorar en la fase de producción del asset, en este orden de preferencia
(BRAND-BRIEF §5.3):
1. Monograma `K` construido con barras verticales de distinta altura (lectura doble: K /
   gráfico de barras comparando sedes) — pista más alineada al posicionamiento.
2. `K` con el contratrazo cortado en diagonal, coherente con el corte del wordmark.
3. Marco/placa de esquinas recortadas con la `k` dentro.

Requisitos técnicos del asset final: legible a 24px monocromo; versión maskable con
padding seguro para ícono de PWA; versión sobre `ink-950` y versión sobre `brand-600`.

### 6.4 Prohibiciones explícitas (checklist para quien produzca el asset)

Navaja, tijeras, peine, poste tricolor, silla de barbero, bigote, espuma, mano con
máquina — cualquiera descalifica. Dorado metálico, gradientes dorados, relieve/bisel,
texturas de cuero/madera. Tipografía slab/western/vintage, sombra larga, escudos,
laureles, "EST. 2026". Iconos de cerebro/neuronas/sinapsis (la marca no es neurociencia
ni IA). Puntos, swooshes, hojas, pines de mapa dentro del logo, gradiente morado genérico
de SaaS. El logo debe funcionar a color, monocromo y sobre ambos fondos (oscuro/claro).

### 6.5 Placeholder mientras no exista el asset final

Hasta que el isotipo/wordmark definitivo se produzca en herramienta de diseño, usar como
**fallback en todo el producto**:

- El wordmark en texto plano, renderizado con `--font-display` (Archivo), peso 800,
  minúsculas (`kortex`), sin el corte diagonal (ese detalle requiere producción vectorial
  y no debe improvisarse en CSS/texto).
- Sin isotipo: usar solo la inicial `k` en un contenedor cuadrado con `--radius-md` y
  fondo `--accent` como favicon/ícono temporal de PWA, hasta que exista el asset de §6.3.
- Este fallback es intencionalmente austero — no se debe intentar simular el corte
  diagonal con CSS (`clip-path` improvisado) como sustituto permanente; es preferible un
  wordmark plano y correcto a una interpretación apurada del detalle de firma.

---

## 7. Nota de alcance

Este documento cubre tokens, tipografía, espaciado/radios/sombras, especificación de los
12 componentes base y reglas duras. **No cubre:**
- Layout pixel-perfect de las 7 pantallas críticas (eso está en UX-BRIEF §4, con
  wireframes ASCII ya anotados — úsalos directamente).
- Código de componentes React/shadcn (fuera de alcance de este brief, es tarea del
  desarrollador).
- El asset gráfico final del logo (§6 es especificación textual para producción
  posterior).

Cualquier duda de valor de color, tipografía o espaciado debe resolverse releyendo
BRAND-BRIEF §3 y UX-BRIEF §2/§4/§7 — este documento es su traducción literal a
implementación, no una fuente alternativa.

---

*Documento redactado el 16 de septiembre de 2026 — W-Tech.*
*Insumos: BRAND-BRIEF-Kortex.md v1.0, UX-BRIEF-Kortex.md v1.0 (ambos aprobados, decisiones
cerradas en sus respectivos §8). Estado: listo para implementación.*
