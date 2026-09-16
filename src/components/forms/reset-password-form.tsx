"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/lib/auth/actions";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<null> = { ok: false, error: "" };

export function ResetPasswordForm() {
  const router = useRouter();

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<null>, formData: FormData) => {
      const result = await resetPasswordAction({
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
      });
      if (result.ok) {
        router.push("/login");
      }
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Nueva contrasena</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirmar contrasena</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
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
        {isPending ? "Guardando..." : "Guardar nueva contrasena"}
      </Button>
    </form>
  );
}
