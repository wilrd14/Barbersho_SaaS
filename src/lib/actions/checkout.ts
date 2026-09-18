"use server";

/**
 * F2-21/F2-22 · Checkout / cobro y anulacion de venta el mismo dia.
 *
 * Patron obligatorio (regla dura §3.1): Zod -> guard de sede -> transaccion ->
 * `ActionResult` -> auditoria. `chainId` sale SIEMPRE de `requireLocationScope`.
 * El calculo de dinero SIEMPRE pasa por `lib/pos#computeSaleTotals` (modulo
 * puro, no se toca ni se reimplementa aqui) y trabaja en **centavos
 * enteros**; nunca se opera con `Number` en punto flotante sobre un monto
 * (regla dura §3.2).
 *
 * Conversion numeric(12,2) <-> centavos: se hace con las utilidades
 * `centsFromDecimalString`/`decimalStringFromCents` de este archivo, que
 * parsean/forman el string decimal directamente (sin `Number(x) * 100`, que
 * puede perder precision en punto flotante). Son las unicas "matematicas de
 * dinero" fuera de `lib/pos`, y son solo formato de I/O con la base de datos,
 * no calculo de negocio.
 *
 * Anti doble-submit/doble-cobro (regla dura adicional del encargo): el
 * cliente genera un `idempotencyKey` (uuid) una sola vez por intento de venta
 * y lo reenvia en cada reintento. El servidor verifica en `audit_log`
 * (`action = 'sale.create'`, `after.idempotencyKey`) si ya existe una venta
 * con esa clave para esta sede ANTES de insertar nada; si existe, devuelve la
 * venta ya creada como si fuera exitosa (respuesta idempotente), sin
 * duplicar. No se agrega una tabla nueva de idempotencia (fuera de las
 * migraciones autorizadas en BACKLOG-F2.md §5) — se reutiliza `audit_log`,
 * que ya es obligatoria en este camino. Como segunda capa, el indice unico
 * parcial `sales_appointment_id_uq` (0002_f2_integrity.sql) rechaza en la
 * base de datos un segundo cobro de la misma cita aunque la primera capa
 * fallara por alguna razon.
 */

import { z } from "zod";

import { zUuid } from "@/lib/validation/id";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  appointments,
  auditLog,
  cashSessions,
  chains,
  clients,
  locationServiceOverrides,
  sales,
  saleItems,
  services,
  barberLocations,
  users,
} from "@/lib/db/schema";
import { requireLocationScope, type LocationScopeContext } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/auth/audit";
import { actionError, actionOk, type ActionResult } from "@/types/action-result";
import { computeSaleTotals, type MaxDiscountPct } from "@/lib/pos";
import { assertManagerRole, centsFromDecimalString, decimalStringFromCents } from "@/lib/actions/money-utils";

type SaleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | SaleTx;

const UNIQUE_VIOLATION_CODE = "23505";

function isPgErrorCode(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === code;
}

// ---------------------------------------------------------------------------
// D-F2-1: precio efectivo (solo precio; la duracion no aplica al cobro).
// ---------------------------------------------------------------------------

class ServiceUnavailableError extends Error {}

async function resolveEffectivePriceCents(
  tx: DbOrTx,
  locationId: string,
  serviceId: string,
): Promise<{ priceCents: number; name: string }> {
  const [service] = await tx
    .select({ defaultPrice: services.defaultPrice, isActive: services.isActive, name: services.name })
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);

  if (!service || !service.isActive) {
    throw new ServiceUnavailableError("Ese servicio no existe o esta inactivo.");
  }

  const [override] = await tx
    .select({ price: locationServiceOverrides.price, isActive: locationServiceOverrides.isActive })
    .from(locationServiceOverrides)
    .where(
      and(
        eq(locationServiceOverrides.locationId, locationId),
        eq(locationServiceOverrides.serviceId, serviceId),
      ),
    )
    .limit(1);

  if (override?.isActive === false) {
    throw new ServiceUnavailableError(`"${service.name}" no esta disponible en esta sede.`);
  }

  const priceDecimal = override?.price ?? service.defaultPrice;
  return { priceCents: centsFromDecimalString(priceDecimal), name: service.name };
}

async function resolveMaxDiscountPct(
  tx: DbOrTx,
  chainId: string,
  effectiveRole: LocationScopeContext["effectiveRole"],
): Promise<MaxDiscountPct> {
  if (effectiveRole === "superuser" || effectiveRole === "admin") return "unlimited";
  const [chain] = await tx
    .select({ maxBarberDiscountPct: chains.maxBarberDiscountPct })
    .from(chains)
    .where(eq(chains.id, chainId))
    .limit(1);
  if (!chain || chain.maxBarberDiscountPct === null) return null;
  // Tope en pct: no es un monto de dinero, es un umbral de politica — el uso
  // de Number() aqui no cae bajo la prohibicion de la regla dura §3.2.
  return Number(chain.maxBarberDiscountPct);
}

/** Normalizacion de telefono (mismo criterio D-F2-15 usado en queue.ts/public-booking.ts). */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  return digits;
}

// ---------------------------------------------------------------------------
// Catalogo para el formulario de checkout (servicios activos con precio
// efectivo en centavos, barberos activos de la sede).
// ---------------------------------------------------------------------------

export type CheckoutCatalogService = { id: string; name: string; priceCents: number };
export type CheckoutCatalogBarber = { id: string; fullName: string };

export async function loadCheckoutCatalog(locationId: string): Promise<{
  services: CheckoutCatalogService[];
  barbers: CheckoutCatalogBarber[];
}> {
  // Modulo "use server": toda funcion exportada es tambien un endpoint
  // invocable desde el cliente, asi que el guard va aqui y no solo en la pagina.
  await requireLocationScope(locationId);

  const [serviceRows, barberRows] = await Promise.all([
    db
      .select({
        id: services.id,
        name: services.name,
        defaultPrice: services.defaultPrice,
        overridePrice: locationServiceOverrides.price,
        overrideActive: locationServiceOverrides.isActive,
      })
      .from(services)
      .leftJoin(
        locationServiceOverrides,
        and(
          eq(locationServiceOverrides.serviceId, services.id),
          eq(locationServiceOverrides.locationId, locationId),
        ),
      )
      .where(eq(services.isActive, true)),
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(barberLocations)
      .innerJoin(users, eq(users.id, barberLocations.userId))
      .where(and(eq(barberLocations.locationId, locationId), eq(barberLocations.isActive, true))),
  ]);

  return {
    services: serviceRows
      .filter((s) => s.overrideActive !== false)
      .map((s) => ({
        id: s.id,
        name: s.name,
        priceCents: centsFromDecimalString(s.overridePrice ?? s.defaultPrice),
      })),
    barbers: barberRows.map((b) => ({ id: b.id, fullName: b.fullName ?? "Sin nombre" })),
  };
}

// ---------------------------------------------------------------------------
// Cita a cobrar (entrada `?appointmentId=` del checkout).
// ---------------------------------------------------------------------------

export type CheckoutAppointmentInfo = {
  id: string;
  clientId: string;
  clientName: string;
  barberId: string;
  serviceId: string;
  serviceName: string;
  priceCents: number;
  status: string;
};

export async function loadAppointmentForCheckout(
  locationId: string,
  appointmentId: string,
): Promise<CheckoutAppointmentInfo | null> {
  // Modulo "use server": ver nota en loadCheckoutCatalog.
  await requireLocationScope(locationId);

  const [row] = await db
    .select({
      id: appointments.id,
      locationId: appointments.locationId,
      clientId: appointments.clientId,
      barberId: appointments.barberId,
      serviceId: appointments.serviceId,
      status: appointments.status,
    })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!row || row.locationId !== locationId) return null;

  const [client] = await db
    .select({ fullName: clients.fullName })
    .from(clients)
    .where(eq(clients.id, row.clientId))
    .limit(1);

  const { priceCents, name } = await resolveEffectivePriceCents(db, locationId, row.serviceId).catch(
    () => ({ priceCents: 0, name: "Servicio" }),
  );

  const [alreadySold] = await db
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.appointmentId, appointmentId))
    .limit(1);

  return {
    id: row.id,
    clientId: row.clientId,
    clientName: client?.fullName ?? "Cliente",
    barberId: row.barberId,
    serviceId: row.serviceId,
    serviceName: name,
    priceCents,
    status: alreadySold ? "sold" : row.status,
  };
}

// ---------------------------------------------------------------------------
// createSale — F2-21
// ---------------------------------------------------------------------------

const discountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("percentage"),
    pct: z.number().int().min(1).max(100),
    reason: z.string().trim().min(1, "Todo descuento necesita un motivo."),
  }),
  z.object({
    kind: z.literal("amount"),
    amountCents: z.number().int().min(1),
    reason: z.string().trim().min(1, "Todo descuento necesita un motivo."),
  }),
]);

const tipSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("percentage"), pct: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal("amount"), amountCents: z.number().int().min(0) }),
]);

const saleLineSchema = z.object({
  serviceId: zUuid,
  barberId: zUuid,
  quantity: z.number().int().min(1).max(20),
});

const createSaleSchema = z.object({
  locationId: zUuid,
  idempotencyKey: zUuid,
  appointmentId: zUuid.optional(),
  existingClientId: zUuid.optional(),
  newClient: z
    .object({
      fullName: z.string().trim().min(2, "El nombre es obligatorio."),
      phone: z.string().trim().min(6, "El telefono es obligatorio."),
    })
    .optional(),
  lines: z.array(saleLineSchema).min(1, "La venta necesita al menos un servicio.").max(10),
  discount: discountSchema,
  tip: tipSchema,
  paymentMethod: z.enum(["cash", "card", "transfer"]),
});

export type CreateSaleResult = {
  saleId: string;
  subtotalCents: number;
  discountAmountCents: number;
  tipAmountCents: number;
  totalCents: number;
  replay: boolean;
};

export async function createSaleAction(input: unknown): Promise<ActionResult<CreateSaleResult>> {
  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");
  }
  const data = parsed.data;

  if (!data.appointmentId && !data.existingClientId && !data.newClient) {
    return actionError("La venta necesita una cita, un cliente existente o los datos de un cliente nuevo.");
  }

  const scope = await requireLocationScope(data.locationId);

  if (scope.effectiveRole === "barber_assigned") {
    const otherBarberLine = data.lines.find((l) => l.barberId !== scope.userId);
    if (otherBarberLine) {
      return actionError("Un barbero solo puede cobrar los servicios en los que el es el barbero de la linea.");
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      // --- Idempotencia (regla dura del encargo: bloqueo real de doble-submit) ---
      const [existingByKey] = await tx
        .select({ entityId: auditLog.entityId })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "sale.create"),
            eq(auditLog.locationId, scope.locationId),
            sql`${auditLog.after} ->> 'idempotencyKey' = ${data.idempotencyKey}`,
          ),
        )
        .limit(1);

      if (existingByKey?.entityId) {
        const [existingSale] = await tx
          .select({
            id: sales.id,
            subtotal: sales.subtotal,
            discountAmount: sales.discountAmount,
            tipAmount: sales.tipAmount,
            total: sales.total,
          })
          .from(sales)
          .where(eq(sales.id, existingByKey.entityId))
          .limit(1);

        if (existingSale) {
          return {
            saleId: existingSale.id,
            subtotalCents: centsFromDecimalString(existingSale.subtotal),
            discountAmountCents: centsFromDecimalString(existingSale.discountAmount),
            tipAmountCents: centsFromDecimalString(existingSale.tipAmount),
            totalCents: centsFromDecimalString(existingSale.total),
            replay: true,
          };
        }
      }

      // --- Caja abierta obligatoria para cobrar (D-F2-9) ---
      const [openSession] = await tx
        .select({ id: cashSessions.id })
        .from(cashSessions)
        .where(and(eq(cashSessions.locationId, scope.locationId), isNull(cashSessions.closedAt)))
        .limit(1);

      if (!openSession) {
        throw new Error("No hay una caja abierta en esta sede. Abri caja antes de cobrar.");
      }

      // --- Resolver cliente y barbero "duenio" de la cita, si aplica ---
      let clientId: string;
      let appointmentStatus: string | null = null;

      if (data.appointmentId) {
        const [appt] = await tx
          .select({
            id: appointments.id,
            locationId: appointments.locationId,
            clientId: appointments.clientId,
            status: appointments.status,
          })
          .from(appointments)
          .where(eq(appointments.id, data.appointmentId))
          .limit(1);

        if (!appt || appt.locationId !== scope.locationId) {
          throw new Error("Esa cita no pertenece a esta sede.");
        }
        if (appt.status === "cancelled" || appt.status === "no_show") {
          throw new Error("No se puede cobrar una cita cancelada o marcada como no-show.");
        }
        if (appt.status === "completed") {
          throw new Error("Esta cita ya fue completada. Si necesitas corregir el cobro, anula la venta.");
        }
        clientId = appt.clientId;
        appointmentStatus = appt.status;
      } else if (data.existingClientId) {
        clientId = data.existingClientId;
      } else {
        const newClient = data.newClient!;
        const normalizedPhone = normalizePhone(newClient.phone);
        const [existingByPhone] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.chainId, scope.chainId), eq(clients.phone, normalizedPhone)))
          .limit(1);
        if (existingByPhone) {
          clientId = existingByPhone.id;
        } else {
          const [created] = await tx
            .insert(clients)
            .values({ chainId: scope.chainId, fullName: newClient.fullName, phone: normalizedPhone })
            .returning({ id: clients.id });
          clientId = created!.id;
        }
      }

      // --- Resolver precios efectivos en el servidor (nunca del cliente) ---
      const linesWithPrice: {
        serviceId: string;
        barberId: string;
        type: "service";
        quantity: number;
        unitPriceCents: number;
      }[] = [];
      for (const line of data.lines) {
        const { priceCents } = await resolveEffectivePriceCents(tx, scope.locationId, line.serviceId);
        linesWithPrice.push({
          serviceId: line.serviceId,
          barberId: line.barberId,
          type: "service",
          quantity: line.quantity,
          unitPriceCents: priceCents,
        });
      }

      const maxDiscountPct = await resolveMaxDiscountPct(tx, scope.chainId, scope.effectiveRole);

      const totals = computeSaleTotals({
        lines: linesWithPrice,
        discount: data.discount,
        tip: data.tip,
        maxDiscountPct,
      });

      if (!totals.ok) {
        throw new Error(totals.error);
      }

      const [createdSale] = await tx
        .insert(sales)
        .values({
          chainId: scope.chainId,
          locationId: scope.locationId,
          appointmentId: data.appointmentId ?? null,
          clientId,
          barberId: totals.primaryBarberId,
          cashSessionId: openSession.id,
          subtotal: decimalStringFromCents(totals.subtotalCents),
          discountAmount: decimalStringFromCents(totals.discountAmountCents),
          discountReason: data.discount.kind === "none" ? null : data.discount.reason,
          tipAmount: decimalStringFromCents(totals.tipAmountCents),
          total: decimalStringFromCents(totals.totalCents),
          paymentMethod: data.paymentMethod,
          status: "paid",
          createdBy: scope.userId,
        })
        .returning({ id: sales.id });

      const saleId = createdSale!.id;

      await tx.insert(saleItems).values(
        totals.lines.map((line) => ({
          saleId,
          type: "service" as const,
          serviceId: line.serviceId,
          quantity: line.quantity,
          unitPrice: decimalStringFromCents(line.unitPriceCents),
          lineTotal: decimalStringFromCents(line.lineTotalCents),
          barberId: line.barberId,
        })),
      );

      if (data.appointmentId && appointmentStatus && appointmentStatus !== "completed") {
        await tx
          .update(appointments)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(appointments.id, data.appointmentId));
      }

      await tx
        .update(clients)
        .set({
          totalVisits: sql`${clients.totalVisits} + 1`,
          totalSpent: sql`${clients.totalSpent} + ${decimalStringFromCents(totals.totalCents)}::numeric`,
          lastVisitAt: new Date(),
        })
        .where(eq(clients.id, clientId));

      await writeAuditLog({
        chainId: scope.chainId,
        locationId: scope.locationId,
        actorUserId: scope.userId,
        action: "sale.create",
        entity: "sales",
        entityId: saleId,
        after: {
          idempotencyKey: data.idempotencyKey,
          appointmentId: data.appointmentId ?? null,
          clientId,
          paymentMethod: data.paymentMethod,
          lines: totals.lines,
          subtotalCents: totals.subtotalCents,
          discountAmountCents: totals.discountAmountCents,
          discountReason: data.discount.kind === "none" ? null : data.discount.reason,
          tipAmountCents: totals.tipAmountCents,
          totalCents: totals.totalCents,
          primaryBarberId: totals.primaryBarberId,
        },
      }, tx);

      return {
        saleId,
        subtotalCents: totals.subtotalCents,
        discountAmountCents: totals.discountAmountCents,
        tipAmountCents: totals.tipAmountCents,
        totalCents: totals.totalCents,
        replay: false,
      };
    });

    return actionOk(result);
  } catch (err) {
    if (err instanceof ServiceUnavailableError) return actionError(err.message);
    if (isPgErrorCode(err, UNIQUE_VIOLATION_CODE)) {
      return actionError("Esta cita ya fue cobrada. Revisa el ticket existente antes de reintentar.");
    }
    if (err instanceof Error) return actionError(err.message);
    return actionError(
      "No se pudo completar el cobro. No se registro ningun cargo — puedes reintentar con el mismo boton.",
    );
  }
}

// ---------------------------------------------------------------------------
// voidSaleAction — F2-22 · Anulacion de venta el mismo dia
// ---------------------------------------------------------------------------

const voidSaleSchema = z.object({
  locationId: zUuid,
  saleId: zUuid,
  reason: z.string().trim().min(1, "Anular una venta exige un motivo."),
});

export async function voidSaleAction(input: unknown): Promise<ActionResult<{ saleId: string }>> {
  const parsed = voidSaleSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Datos invalidos.");

  const scope = await requireLocationScope(parsed.data.locationId);

  try {
    assertManagerRole(scope);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "No autorizado.");
  }

  try {
    const saleId = await db.transaction(async (tx) => {
      const [sale] = await tx
        .select({
          id: sales.id,
          locationId: sales.locationId,
          status: sales.status,
          cashSessionId: sales.cashSessionId,
          total: sales.total,
        })
        .from(sales)
        .where(eq(sales.id, parsed.data.saleId))
        .limit(1);

      if (!sale || sale.locationId !== scope.locationId) {
        throw new Error("Esa venta no pertenece a esta sede.");
      }
      if (sale.status === "refunded") {
        throw new Error("Esta venta ya fue anulada.");
      }
      if (!sale.cashSessionId) {
        throw new Error("Esta venta no tiene caja asociada y no se puede anular desde aqui.");
      }

      const [session] = await tx
        .select({ closedAt: cashSessions.closedAt })
        .from(cashSessions)
        .where(eq(cashSessions.id, sale.cashSessionId))
        .limit(1);

      if (!session || session.closedAt) {
        throw new Error("La caja de esta venta ya esta cerrada. No se puede anular una venta de un dia anterior.");
      }

      await tx.update(sales).set({ status: "refunded" }).where(eq(sales.id, sale.id));

      await writeAuditLog({
        chainId: scope.chainId,
        locationId: scope.locationId,
        actorUserId: scope.userId,
        action: "sale.refund",
        entity: "sales",
        entityId: sale.id,
        before: { status: sale.status },
        after: { status: "refunded", reason: parsed.data.reason },
      }, tx);

      return sale.id;
    });

    return actionOk({ saleId });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "No se pudo anular la venta.");
  }
}
