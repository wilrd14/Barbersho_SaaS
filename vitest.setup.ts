import { vi } from "vitest";

// "server-only" lanza por diseno cuando se importa fuera de la condicion
// "react-server" (ver node_modules/server-only). En Node/vitest no aplica esa
// condicion, asi que lo neutralizamos para poder testear modulos server-only
// (guards, session, audit) sin arrancar Next.
vi.mock("server-only", () => ({}));
