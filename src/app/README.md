# src/app — principio rector

**La ruta declara el ambito.** Cada route group de primer nivel fija quien
puede entrar, antes de que se ejecute una sola consulta a la base de datos:

- `(auth)` — publico. Login, registro, recuperacion de clave.
- `(onboarding)` — usuario autenticado sin cadena todavia (alta de cadena).
- `(chain)` — requiere `requireChainScope()`: rol `superuser` en la cadena
  activa de la sesion. 403 para cualquier otro rol.
- `(location)/[locationId]` — requiere `requireLocationScope(locationId)`:
  la sede debe pertenecer a la cadena de la sesion y el usuario debe ser
  `superuser` de esa cadena o tener `admin`/`barber` asignado a esa sede via
  `barber_locations`. 403 incluso navegando la URL a mano.
- `(barber)` — requiere `requireBarberScope()`: membership activa con rol
  `barber` en alguna cadena.
- `(client)` — requiere `requireClientScope()`: usuario autenticado sin
  ninguna membership activa (el "cliente" del producto).
- `(public)` — sin sesion. Landing de cadena (`[chainSlug]`) y flujo de
  reserva publica (`book`).

Los guards viven en `src/lib/auth/guards.ts` y se invocan en el `layout.tsx`
de cada route group, **antes** de renderizar o de tocar la base de datos.
`chain_id`/`location_id` de autorizacion se resuelven siempre en el servidor;
nunca se confia en lo que declare el cliente (ver §3 de BACKLOG-BACKEND.md).

## Desviacion tecnica documentada: `(location)/sede/[locationId]`

El §9.3 del PRD lista `(location)/[locationId]/...` como ruta directa. En la
practica, Next.js **no permite que dos segmentos dinamicos con nombre
distinto ocupen la misma posicion en el arbol de rutas** (los route groups
`(location)` y `(public)` son invisibles en la URL, asi que `[locationId]` y
`[chainSlug]` competian por el mismo slot raiz). Esto no es un error de
build: `next build` compila sin quejarse, pero **tanto `next start` como el
worker de OpenNext/Cloudflare devuelven 500 en toda la app** con
`Error: You cannot use different slug names for the same dynamic path`.

Verificado en este sprint corriendo `next start` y
`opennextjs-cloudflare build` + `wrangler dev` localmente.

Solucion aplicada: se agrego un segmento estatico disambiguador
(`/sede/[locationId]/...`) delante del parametro dinamico de sede, dejando
intactos el route group, los nombres de las paginas hijas y la URL publica
`/[chainSlug]` (la que el PRD exige como vanity URL de marketing). Se
prioriza esta ultima porque el PRD la menciona explicitamente como URL
publica (`kortexbarber.com/[chainSlug]`); el dashboard interno de sede no
tiene ese requisito de URL limpia.

**Esto se escala al PM**: es una correccion tecnica, no una decision de
producto, pero el arbol de carpetas ya no es 1:1 con el literal de §9.3 y
merece su visto bueno o una alternativa (ej. mover el chainSlug a un
subdominio en vez de un path).
