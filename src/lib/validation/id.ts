import { z } from "zod";

/**
 * F2-25 · Bug real encontrado corriendo los E2E de cierre de fase: Zod v4
 * endurecio `.uuid()` para exigir los nibbles de version ([1-8]) y variante
 * ([89ab]) del RFC 9562 (con excepcion explicita solo para el UUID nulo y el
 * "todo F"). Los IDs fijos del seed (`src/lib/db/seed.ts`, ej.
 * `00000000-0000-0000-0000-000000000301` para la sede Naco) no cumplen esos
 * nibbles -> **todo** Server Action que validaba un `locationId`/`serviceId`/
 * `barberId`/etc. con `z.string().uuid()` rechazaba con "Invalid UUID"
 * cualquier llamada real contra el seed, sin excepcion. Esto bloqueaba los 4
 * flujos criticos del PRD §15 (reservar, dar turno, cobrar, cerrar caja) por
 * completo — no es un problema teorico, se confirmo en los E2E de F2-25.
 *
 * `zUuid` valida el FORMATO (8-4-4-4-12 hex), que es lo que Zod necesita
 * garantizar aqui (regla dura §3.8: "Zod en todo input"); la autoridad real
 * de que el ID exista y pertenezca al tenant correcto sigue siendo el guard
 * + la query a la DB (regla dura §3.1), no esta validacion. No se cambian
 * los IDs del seed (serian una migracion de datos fuera del alcance de
 * F2-25, que es de testing y cierre, no de features).
 */
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const zUuid = z.string().regex(UUID_FORMAT, "UUID invalido");
