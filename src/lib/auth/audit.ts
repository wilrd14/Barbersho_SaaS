import "server-only";

import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export interface WriteAuditLogInput {
  chainId: string;
  locationId?: string | null;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Helper obligatorio (regla dura #7) para toda operacion de dinero, permisos
 * o anulacion. En Sprint 1 no hay features de dinero todavia; existe para que
 * el primer Server Action de dinero (sprint siguiente) lo use desde el dia 1.
 */
export async function writeAuditLog(input: WriteAuditLogInput) {
  await db.insert(auditLog).values({
    chainId: input.chainId,
    locationId: input.locationId ?? null,
    actorUserId: input.actorUserId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
