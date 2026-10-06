import { requireChainScope } from "@/lib/auth/guards";
import { SubscriptionGate } from "@/components/kortex/subscription-gate";

export default async function ChainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // (chain) => solo superuser de la cadena activa de la sesion. 403 si no.
  const { chainId } = await requireChainScope();

  // F3-18: banner persistente de suscripcion (el area "billing" nunca se bloquea: Tu plan siempre accesible).
  return (
    <SubscriptionGate chainId={chainId} area="billing">
      {children}
    </SubscriptionGate>
  );
}
