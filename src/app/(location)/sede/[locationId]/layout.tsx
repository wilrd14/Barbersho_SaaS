import { and, eq } from "drizzle-orm";
import { requireLocationScope } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { locations } from "@/lib/db/schema";
import { ReadonlyVisitBanner } from "@/components/kortex/readonly-visit-banner";

interface LocationLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locationId: string }>;
}

export default async function LocationLayout({
  children,
  params,
}: LocationLayoutProps) {
  const { locationId } = await params;

  // locationId viene de la URL, pero se verifica contra la sesion aqui
  // mismo, antes de renderizar cualquier pagina hija. Nunca se confia en
  // el valor de la URL sin esta verificacion (regla dura §3.4).
  const scope = await requireLocationScope(locationId);

  // F3-15 (D-F3-15): banner de visita lectura+ para el superuser que llega desde
  // Vista Cadena (?desde=cadena). Solo contexto; los permisos no cambian.
  let locationName: string | null = null;
  if (scope.effectiveRole === "superuser") {
    const [row] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.chainId, scope.chainId)))
      .limit(1);
    locationName = row?.name ?? null;
  }

  return (
    <>
      {locationName ? <ReadonlyVisitBanner locationId={locationId} locationName={locationName} isSuperuser /> : null}
      {children}
    </>
  );
}
