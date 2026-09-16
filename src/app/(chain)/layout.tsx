import { requireChainScope } from "@/lib/auth/guards";

export default async function ChainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // (chain) => solo superuser de la cadena activa de la sesion. 403 si no.
  await requireChainScope();

  return <>{children}</>;
}
