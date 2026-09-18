import { config } from "dotenv";
import { vi } from "vitest";

// F2-25: algunos tests de integracion (concurrencia de doble-booking) hablan
// contra el proyecto Supabase real via DATABASE_URL, igual que
// db:seed/db:migrate. Sin esto, esos tests no tendrian credenciales.
config({ path: ".env.local" });

// "server-only" lanza por diseno cuando se importa fuera de la condicion
// "react-server" (ver node_modules/server-only). En Node/vitest no aplica esa
// condicion, asi que lo neutralizamos para poder testear modulos server-only
// (guards, session, audit) sin arrancar Next.
vi.mock("server-only", () => ({}));
