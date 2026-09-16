import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Kortex</h1>
      <p className="max-w-md text-muted-foreground">
        Sistema de gestion operativa multi-sede para cadenas de barberias.
        Sprint 1: fundacion tecnica (auth, esquema, autorizacion por ambito).
      </p>
      <Link href="/login">
        <Button>Iniciar sesion</Button>
      </Link>
    </div>
  );
}
