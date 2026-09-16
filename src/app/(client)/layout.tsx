import { requireClientScope } from "@/lib/auth/guards";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireClientScope();

  return <>{children}</>;
}
