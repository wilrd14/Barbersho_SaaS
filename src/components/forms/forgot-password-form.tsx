"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<null> = { ok: false, error: "" };

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<null>, formData: FormData) => {
      const result = await forgotPasswordAction({ email: formData.get("email") });
      if (result.ok) setSent(true);
      return result;
    },
    initialState,
  );

  if (sent) {
    return (
      <p className="max-w-sm text-sm text-muted-foreground">
        Si el correo existe en nuestro sistema, recibiras un enlace para
        restablecer tu contrasena.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo electronico</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      {!state.ok && state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar enlace de recuperacion"}
      </Button>
    </form>
  );
}
