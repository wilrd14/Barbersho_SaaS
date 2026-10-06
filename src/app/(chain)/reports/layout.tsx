import { requireChainScope } from "@/lib/auth/guards";
import { SubscriptionGate } from "@/components/kortex/subscription-gate";

/** F3-18 (D-F3-16): lo analitico/administrativo se bloquea con prueba vencida; Tu plan (/billing) no. */
export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  const { chainId } = await requireChainScope();
  return (
    <SubscriptionGate chainId={chainId} area="analytics" showBanner={false}>
      {children}
    </SubscriptionGate>
  );
}
