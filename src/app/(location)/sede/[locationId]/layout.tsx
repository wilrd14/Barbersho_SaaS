import { requireLocationScope } from "@/lib/auth/guards";

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
  await requireLocationScope(locationId);

  return <>{children}</>;
}
