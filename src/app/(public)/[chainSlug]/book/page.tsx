import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { zUuid } from "@/lib/validation/id";

import { BookingWizard } from "@/components/kortex/booking-wizard";
import { getActiveLocationsForChain, getBarberPublicProfile, getChainBySlug } from "@/lib/public/directory";

interface PageProps {
  params: Promise<{ chainSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const entrySearchParamsSchema = z.object({
  sede: z.string().trim().min(1).optional(),
  barbero: zUuid.optional(),
});

/**
 * F2-12 · `/[chainSlug]/book` (D-F2-3), las 2 rutas del wizard. El entrypoint
 * decide el modo por `?barbero=` (ruta 2, D-F2-4) vs. sin el (ruta 1, sede
 * opcionalmente preseleccionada por `?sede=`). El resto de los pasos los
 * maneja `BookingWizard` (cliente) leyendo/escribiendo `searchParams` con
 * Zod (regla dura §3.8).
 */
export default async function BookWizardPage({ params, searchParams }: PageProps) {
  const { chainSlug } = await params;
  const rawSearch = await searchParams;

  const parsedSearch = entrySearchParamsSchema.safeParse({
    sede: typeof rawSearch.sede === "string" ? rawSearch.sede : undefined,
    barbero: typeof rawSearch.barbero === "string" ? rawSearch.barbero : undefined,
  });
  const search = parsedSearch.success ? parsedSearch.data : {};

  const chain = await getChainBySlug(chainSlug);
  if (!chain) notFound();

  const brandColor = chain.primaryColor ?? null;

  if (search.barbero) {
    const barber = await getBarberPublicProfile(chain.id, search.barbero);
    if (!barber) notFound();

    return (
      <Suspense fallback={<BookingWizardFallback />}>
        <BookingWizard
          mode="barber"
          chainSlug={chainSlug}
          brandColor={brandColor}
          allowCrossLocationBooking={chain.allowCrossLocationBooking}
          barber={{ id: barber.id, fullName: barber.fullName, coverage: barber.coverage }}
        />
      </Suspense>
    );
  }

  const locationList = await getActiveLocationsForChain(chain.id);
  const preselected = search.sede ? locationList.find((l) => l.slug === search.sede) ?? null : null;

  return (
    <Suspense fallback={<BookingWizardFallback />}>
      <BookingWizard
        mode="location"
        chainSlug={chainSlug}
        brandColor={brandColor}
        allowCrossLocationBooking={chain.allowCrossLocationBooking}
        locations={locationList.map((l) => ({ id: l.id, slug: l.slug, name: l.name }))}
        preselectedLocationSlug={preselected?.slug}
      />
    </Suspense>
  );
}

function BookingWizardFallback() {
  return <div className="p-8 text-center text-body-s text-(--text-tertiary)">Cargando...</div>;
}
