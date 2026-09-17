import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getActiveLocationBySlug,
  getChainBySlug,
  getLocationBarbers,
  getLocationCatalog,
} from "@/lib/public/directory";
import { isLocationOpenNow } from "@/lib/public/hours";

interface PageProps {
  params: Promise<{ chainSlug: string; locationSlug: string }>;
}

/**
 * F2-10 · Pagina de sede: barberos + catalogo con precio de ESA sede
 * (criterio 1.6 del PRD). Sede inactiva o inexistente -> 404.
 */
export default async function PublicLocationPage({ params }: PageProps) {
  const { chainSlug, locationSlug } = await params;

  const chain = await getChainBySlug(chainSlug);
  if (!chain) notFound();

  const location = await getActiveLocationBySlug(chain.id, locationSlug);
  if (!location) notFound();

  const [catalog, barbers] = await Promise.all([
    getLocationCatalog(location.id),
    getLocationBarbers(location.id),
  ]);

  const brandStyle = chain.primaryColor
    ? ({ "--client-brand": chain.primaryColor } as React.CSSProperties)
    : undefined;
  const openNow = isLocationOpenNow(location.businessHours, location.timezone);

  return (
    <div style={brandStyle} className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <header className="flex flex-col gap-2">
        <Link href={`/${chainSlug}`} className="text-body-s text-(--text-tertiary) hover:underline">
          ← {chain.name}
        </Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-display-xl text-(--text-primary)">{location.name}</h1>
          <Badge status={openNow ? "activa" : "inactiva"} />
        </div>
        {location.address ? (
          <p className="text-body text-(--text-secondary)">{location.address}</p>
        ) : null}
        {location.phone ? (
          <p className="text-body-s text-(--text-tertiary)">{location.phone}</p>
        ) : null}
      </header>

      <Link
        href={`/${chainSlug}/book?sede=${location.slug}`}
        className={buttonVariants({ size: "lg", className: "w-full bg-(--client-brand)" })}
      >
        Reservar en esta sede
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 text-(--text-primary)">Barberos</h2>
        {barbers.length === 0 ? (
          <EmptyState kind="block" message="Todavia no hay barberos asignados a esta sede." />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {barbers.map((barber) => (
              <li key={barber.id}>
                <Link
                  href={`/${chainSlug}/barber/${barber.id}`}
                  className="flex flex-col items-center gap-2 rounded-md border border-(--border) p-3 text-center hover:bg-(--surface-raised)"
                >
                  {barber.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatar dinamico por barbero
                    <img src={barber.avatarUrl} alt={barber.fullName} className="size-12 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded-full bg-(--surface-raised) text-h2 text-(--text-tertiary)">
                      {barber.fullName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-body-s text-(--text-primary)">{barber.fullName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 text-(--text-primary)">Servicios</h2>
        {catalog.length === 0 ? (
          <EmptyState kind="block" message="Esta sede todavia no tiene servicios publicados." />
        ) : (
          <ul className="flex flex-col gap-2">
            {catalog.map((service) => (
              <li
                key={service.id}
                className="flex items-center justify-between rounded-md border border-(--border) px-4 py-3"
              >
                <div>
                  <p className="text-body text-(--text-primary)">{service.name}</p>
                  <p className="text-body-s text-(--text-tertiary)">{service.durationMinutes} min</p>
                </div>
                <p className="text-num-m text-(--text-primary)">RD${service.price.toFixed(2)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
