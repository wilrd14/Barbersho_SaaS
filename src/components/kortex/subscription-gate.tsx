import Link from "next/link";
import { ScopeBanner } from "@/components/kortex/scope-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/lib/db/client";
import { loadChainAccess } from "@/lib/billing/gate";
import { isAllowed, type AccessArea } from "@/lib/billing";
import { bannerMessage, deniedMessage } from "@/lib/billing/messages";

/**
 * F3-18 · Banner persistente `trial-ending` (restringido, bloqueado o prueba por vencer) y, si el
 * area no esta permitida para el estado efectivo, el aviso en lugar de la pantalla. Se monta en
 * layouts DESPUES del guard de ambito; el bloqueo real tambien se aplica en las Server Actions.
 */
export async function SubscriptionGate({
  chainId,
  area,
  showBanner = true,
  children,
}: {
  chainId: string;
  area: AccessArea;
  /** El layout raiz muestra el banner; los layouts de seccion pasan false para no duplicarlo. */
  showBanner?: boolean;
  children: React.ReactNode;
}) {
  const access = await loadChainAccess(chainId, db);
  const banner = bannerMessage(access.status ?? "active", access.access, access.trialDaysLeft, access.graceDaysLeft);
  const allowed = isAllowed({ access: access.access, area });

  return (
    <>
      {showBanner && banner ? <ScopeBanner variant="trial-ending" message={banner} /> : null}
      {allowed ? (
        children
      ) : (
        <div className="mx-auto flex max-w-[720px] flex-col gap-3 p-4">
          <h1 className="text-h1">Sección en pausa</h1>
          <EmptyState kind="block" message={deniedMessage(access.access, area)} />
          <Link className="text-(--accent) underline" href="/billing">
            Ver Tu plan
          </Link>
        </div>
      )}
    </>
  );
}
