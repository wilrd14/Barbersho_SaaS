import { requireLocationScope } from "@/lib/auth/guards";
import { SubscriptionGate } from "@/components/kortex/subscription-gate";

/**
 * F3-18 (D-F3-16): area "operation". Con prueba vencida (restringido) la operacion sigue; con bloqueo total
 * se pausa. Cobrar (checkout) y El Cuadre (register) NO tienen este gate: cerrar una caja abierta y
 * cobrar nunca se bloquean.
 */
export default async function SectionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  const { chainId } = await requireLocationScope(locationId);
  return (
    <SubscriptionGate chainId={chainId} area="operation" showBanner={false}>
      {children}
    </SubscriptionGate>
  );
}
