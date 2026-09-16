"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<null> = { ok: true, data: null };

export function LoginForm() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<null>, formData: FormData) => {
      const result = await loginAction({
        email: formData.get("email"),
        password: formData.get("password"),
      });
      if (result.ok) {
        setRedirecting(true);
        router.push("/");
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo electronico</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contrasena</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      {!state.ok ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending || redirecting}>
        {isPending || redirecting ? "Ingresando..." : "Iniciar sesion"}
      </Button>
      <div className="flex justify-between text-sm text-muted-foreground">
        <Link href="/register" className="underline">
          Crear cuenta
        </Link>
        <Link href="/forgot-password" className="underline">
          Olvide mi contrasena
        </Link>
      </div>
    </form>
  );
}
