import { notFound } from "next/navigation";
import Link from "next/link";

import { zUuid } from "@/lib/validation/id";

import { buttonVariants } from "@/components/ui/button";
import { getBarberPublicProfile, getChainBySlug } from "@/lib/public/directory";

interface PageProps {
  params: Promise<{ chainSlug: string; barberId: string }>;
}

const barberIdSchema = zUuid;

/**
 * F2-11 · Perfil publico del barbero (D-F2-4: `/[chainSlug]/barber/[barberId]`,
 * `users.id` como uuid, sin columna de slug). 404 si el barbero no existe, no
 * pertenece a esta cadena o no tiene horario activo en ninguna sede.
 */
export default async function PublicBarberPage({ params }: PageProps) {
  const { chainSlug, barberId } = await params;

  const parsedId = barberIdSchema.safeParse(barberId);
  if (!parsedId.success) notFound();

  const chain = await getChainBySlug(chainSlug);
  if (!chain) notFound();

  const barber = await getBarberPublicProfile(chain.id, parsedId.data);
  if (!barber) notFound();

  const brandStyle = chain.primaryColor
    ? ({ "--client-brand": chain.primaryColor } as React.CSSProperties)
    : undefined;

  return (
    <div style={brandStyle} className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <Link href={`/${chainSlug}`} className="text-body-s text-(--text-tertiary) hover:underline">
        ← {chain.name}
      </Link>

      <header className="flex flex-col items-center gap-3 text-center">
        {barber.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar dinamico por barbero
          <img src={barber.avatarUrl} alt={barber.fullName} className="size-24 rounded-full object-cover" />
        ) : (
          <span className="flex size-24 items-center justify-center rounded-full bg-(--surface-raised) text-display-xl text-(--text-tertiary)">
            {barber.fullName.charAt(0).toUpperCase()}
          </span>
        )}
        <h1 className="text-display-xl text-(--text-primary)">{barber.fullName}</h1>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-h2 text-(--text-primary)">Donde atiende</h2>
        <ul className="flex flex-col gap-1.5">
          {barber.coverage.map((c) => (
            <li key={c.locationId} className="text-body text-(--text-secondary)">
              Atiende en <span className="text-(--text-primary)">{c.locationName}</span> {c.daysLabel}
            </li>
          ))}
        </ul>
      </section>

      {barber.services.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-h2 text-(--text-primary)">Servicios</h2>
          <div className="flex flex-wrap gap-2">
            {barber.services.map((s) => (
              <span
                key={s.id}
                className="rounded-sm border border-(--border) bg-(--surface-raised) px-2.5 py-1 text-body-s text-(--text-secondary)"
              >
                {s.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <Link
        href={`/${chainSlug}/book?barbero=${barber.id}`}
        className={buttonVariants({ size: "lg", className: "w-full bg-(--client-brand)" })}
      >
        Reservar con {barber.fullName.split(" ")[0]}
      </Link>
    </div>
  );
}
