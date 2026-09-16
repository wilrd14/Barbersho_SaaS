"use server";

import { redirect } from "next/navigation";

import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";

/**
 * Mensajes de error de Auth traducidos al espanol, sin filtrar si el email
 * existe o no (regla del AC de S1-11: "credenciales invalidas devuelven un
 * error en espanol, sin filtrar si el email existe").
 */
function translateAuthError(message: string): string {
  const known: Record<string, string> = {
    "Invalid login credentials": "Correo o contrasena incorrectos.",
    "Email not confirmed": "Debes confirmar tu correo antes de iniciar sesion.",
    "User already registered": "Ya existe una cuenta con este correo.",
  };
  return known[message] ?? "No se pudo completar la operacion. Intenta de nuevo.";
}

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * Registro. Sincroniza auth.users -> public.users de forma "atomica" via
 * accion compensatoria (S1-11): si signUp de Supabase Auth crea el usuario
 * pero el insert en public.users falla, se revierte borrando el auth.user
 * recien creado (no existen transacciones distribuidas reales entre
 * Supabase Auth y nuestra base de datos, asi que esto es el patron de
 * compensacion equivalente).
 */
export async function registerAction(
  input: unknown,
): Promise<ActionResult<{ email: string }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }

  const { fullName, email, phone, password } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${getSiteUrl()}/login`,
    },
  });

  if (error) {
    return actionError(translateAuthError(error.message));
  }

  if (!data.user) {
    return actionError("No se pudo crear la cuenta. Intenta de nuevo.");
  }

  try {
    await db
      .insert(users)
      .values({
        id: data.user.id,
        email,
        phone: phone || null,
        fullName,
      })
      .onConflictDoNothing({ target: users.id });
  } catch (dbError) {
    // Accion compensatoria: no puede existir un auth.users sin su public.users.
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.deleteUser(data.user.id).catch(() => {
      // Si tambien falla el rollback, queda un usuario huerfano en auth.users
      // que debe limpiarse manualmente. Se documenta como riesgo conocido.
    });
    console.error("registerAction: fallo el insert en public.users", dbError);
    return actionError("No se pudo completar el registro. Intenta de nuevo.");
  }

  return actionOk({ email });
}

export async function loginAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return actionError(translateAuthError(error.message));
  }

  return actionOk(null);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }

  const supabase = await createSupabaseServerClient();
  // No revelamos si el error es "no existe el correo": siempre respondemos ok.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/api/auth/callback?next=/reset-password`,
  });

  return actionOk(null);
}

export async function resetPasswordAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return actionError(translateAuthError(error.message));
  }

  return actionOk(null);
}
