"use server";

import { z } from "zod";

import { requireChainScope } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/auth/audit";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";

/**
 * Server Action de ejemplo (S1-14) que demuestra la convencion completa:
 * input Zod -> guard de ambito -> logica -> resultado tipado -> auditoria.
 * No es una feature real de negocio (eso es F2/F3); existe solo para que el
 * patron quede probado y documentado desde Sprint 1.
 */
const pingChainSchema = z.object({
  note: z.string().trim().min(1, "La nota no puede estar vacia.").max(280),
});

export async function pingChainAction(
  input: unknown,
): Promise<ActionResult<{ chainId: string }>> {
  const parsed = pingChainSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }

  // Guard SIEMPRE antes de tocar la base de datos. chain_id sale de la
  // sesion, nunca de `input` (regla dura §3.4).
  const { userId, chainId } = await requireChainScope();

  await writeAuditLog({
    chainId,
    actorUserId: userId,
    action: "chain.ping",
    entity: "chains",
    entityId: chainId,
    after: { note: parsed.data.note },
  });

  return actionOk({ chainId });
}
