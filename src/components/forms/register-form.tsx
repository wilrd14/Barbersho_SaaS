"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<{ email: string }> = { ok: false, error: "" };

export function RegisterForm() {
  const [done, setDone] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<{ email: string }>, formData: FormData) => {
      const result = await registerAction({
        fullName: formData.get("fullName"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        password: formData.get("password"),
      });
      if (result.ok) {
        setDone(result.data.email);
      }
      return result;
    },
    initialState,
  );

  if (done) {
    return (
      <p className="max-w-sm text-sm text-muted-foreground">
        Cuenta creada. Revisa <strong>{done}</strong> para confirmar tu correo
        antes de iniciar sesion.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Nombre completo</Label>
        <Input id="fullName" name="fullName" required autoComplete="name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo electronico</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Telefono (opcional)</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contrasena</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
        />
      </div>
      {!state.ok && state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando cuenta..." : "Crear cuenta"}
      </Button>
      <Link href="/login" className="text-sm text-muted-foreground underline">
        Ya tengo cuenta
      </Link>
    </form>
  );
}
