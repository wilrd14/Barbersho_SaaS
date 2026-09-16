import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">403 — Acceso denegado</h1>
      <p className="max-w-md text-muted-foreground">
        No tienes permiso para ver este recurso. Si crees que esto es un error,
        contacta al administrador de tu cadena.
      </p>
      <Link href="/" className="text-sm underline">
        Volver al inicio
      </Link>
    </div>
  );
}
