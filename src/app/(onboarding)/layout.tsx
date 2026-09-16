import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/session";

/**
 * (onboarding): usuario autenticado que aun no tiene ninguna cadena. No
 * requiere un rol especifico (todavia no existe membership), solo sesion
 * activa. La creacion de cadena/CRUD es fuera de alcance de Sprint 1.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();

  if (!ctx.authenticated) {
    redirect("/login");
  }

  return <>{children}</>;
}
