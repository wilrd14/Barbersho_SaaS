interface PageProps {
  params: Promise<{ chainSlug: string }>;
}

export default async function PublicChainPage({ params }: PageProps) {
  const { chainSlug } = await params;

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Cadena: {chainSlug}</h1>
      <p className="text-muted-foreground">
        Landing publica de la cadena — placeholder Sprint 1.
      </p>
    </div>
  );
}
