import { notFound } from "next/navigation";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { LocationCard } from "@/components/kortex/location-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getActiveLocationsForChain, getChainBySlug } from "@/lib/public/directory";
import { isLocationOpenNow } from "@/lib/public/hours";

interface PageProps {
  params: Promise<{ chainSlug: string }>;
}

/**
 * F2-10 · Landing publica de la cadena. SSR, tema claro fijo (layout de
 * `(public)`), branding minimo (logo/color) y lista de sedes ACTIVAS.
 * Slug inexistente -> 404 propio (regla dura §3.5/D-F2-3), nunca 500.
 */
export default async function PublicChainPage({ params }: PageProps) {
  const { chainSlug } = await params;
  const chain = await getChainBySlug(chainSlug);
  if (!chain) notFound();

  const locationList = await getActiveLocationsForChain(chain.id);

  const brandStyle = chain.primaryColor
    ? ({ "--client-brand": chain.primaryColor } as React.CSSProperties)
    : undefined;

  return (
    <div style={brandStyle} className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-col items-center gap-3 pt-4 text-center">
        {chain.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo de cadena, dominio dinamico por tenant
          <img src={chain.logoUrl} alt={chain.name} className="h-14 w-auto" />
        ) : null}
        <h1 className="text-display-xl text-(--text-primary)">{chain.name}</h1>
        <p className="text-body text-(--text-secondary)">Elegi una sede para reservar tu cita.</p>
      </header>

      {locationList.length === 0 ? (
        <EmptyState kind="block" message="Esta cadena todavia no tiene sedes activas." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {locationList.map((location) => (
            <LocationCardLink
              key={location.id}
              chainSlug={chainSlug}
              name={location.name}
              address={location.address ?? location.city ?? "Direccion no disponible"}
              isOpenNow={isLocationOpenNow(location.businessHours, location.timezone)}
              locationSlug={location.slug}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex justify-center">
        <Link
          href={`/${chainSlug}/book`}
          className={buttonVariants({ size: "lg", className: "bg-(--client-brand)" })}
        >
          Reservar ahora
        </Link>
      </div>
    </div>
  );
}

function LocationCardLink({
  chainSlug,
  locationSlug,
  name,
  address,
  isOpenNow,
}: {
  chainSlug: string;
  locationSlug: string;
  name: string;
  address: string;
  isOpenNow: boolean;
}) {
  return (
    <Link href={`/${chainSlug}/${locationSlug}`} className="block">
      <LocationCard name={name} address={address} isOpenNow={isOpenNow} variant="compacta" />
    </Link>
  );
}
