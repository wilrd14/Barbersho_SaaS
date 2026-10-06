/**
 * F3-19 · Mueve el estado de la suscripcion de una cadena tras un pago recibido FUERA de Kortex (D-F3-16).
 *
 *   npm run billing:set-status -- --chain=don-bigote --status=active [--trial-ends=YYYY-MM-DD] [--period-end=YYYY-MM-DD]
 *
 * No integra ninguna pasarela ni toca paypal_subscription_id. Las fechas se guardan al final de ese dia en
 * hora de Santo Domingo (UTC-4, sin horario de verano). Escribe audit_log dentro de la misma transaccion.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "@/lib/auth/audit";
import { db } from "@/lib/db/client";
import { chains, subscriptions } from "@/lib/db/schema";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD");
const input = z.object({
  chain: z.string().min(1, "Falta --chain=<slug>"),
  status: z.enum(["trialing", "active", "past_due", "cancelled"], {
    message: "--status debe ser trialing|active|past_due|cancelled",
  }),
  trialEnds: dateText.optional(),
  periodEnd: dateText.optional(),
});

function endOfDay(date: string): Date {
  const d = new Date(`${date}T23:59:59-04:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha invalida: ${date}`);
  return d;
}

async function main() {
  const parsed = input.parse({
    chain: arg("chain"),
    status: arg("status"),
    trialEnds: arg("trial-ends"),
    periodEnd: arg("period-end"),
  });

  await db.transaction(async (tx) => {
    const [chain] = await tx
      .select({ id: chains.id, name: chains.name })
      .from(chains)
      .where(eq(chains.slug, parsed.chain))
      .limit(1);
    if (!chain) throw new Error(`No existe la cadena con slug "${parsed.chain}".`);

    const [before] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.chainId, chain.id))
      .for("update")
      .limit(1);
    if (!before) throw new Error(`La cadena "${chain.name}" no tiene suscripcion.`);

    const patch = {
      status: parsed.status,
      ...(parsed.trialEnds ? { trialEndsAt: endOfDay(parsed.trialEnds) } : {}),
      ...(parsed.periodEnd ? { currentPeriodEnd: endOfDay(parsed.periodEnd) } : {}),
    };
    const [after] = await tx.update(subscriptions).set(patch).where(eq(subscriptions.id, before.id)).returning();

    await writeAuditLog(
      {
        chainId: chain.id,
        actorUserId: null,
        action: "billing.set_status",
        entity: "subscriptions",
        entityId: before.id,
        before: { status: before.status, trialEndsAt: before.trialEndsAt, currentPeriodEnd: before.currentPeriodEnd },
        after: {
          status: after.status,
          trialEndsAt: after.trialEndsAt,
          currentPeriodEnd: after.currentPeriodEnd,
          via: "script billing:set-status",
        },
      },
      tx,
    );
    console.log(`Suscripcion de "${chain.name}": ${before.status} -> ${after.status}.`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error en billing:set-status:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
