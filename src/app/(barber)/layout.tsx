import { requireBarberScope } from "@/lib/auth/guards";

export default async function BarberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBarberScope();

  return <>{children}</>;
}
