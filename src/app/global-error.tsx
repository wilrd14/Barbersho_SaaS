"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
          <h1 className="text-xl font-semibold">Algo salio mal</h1>
          <p className="text-muted-foreground">
            El error ya fue reportado. Intenta de nuevo mas tarde.
          </p>
        </div>
      </body>
    </html>
  );
}
