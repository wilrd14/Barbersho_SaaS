import localFont from "next/font/local";

/**
 * DESIGN-SYSTEM.md §2.1 — trío tipográfico Archivo + Inter + IBM Plex Mono,
 * self-hosted via next/font/local (sin next/font/google) para no depender de
 * fonts.googleapis en build/deploy y ser predecible en Cloudflare.
 *
 * DESVIACION DOCUMENTADA: no se incluye "Archivo Expanded" (usada solo para
 * el wordmark, §6.5). No existe un asset vectorial final del logo todavia, y
 * el propio DESIGN-SYSTEM.md (§6.5) indica explicitamente usar el wordmark
 * en Archivo normal (no Expanded) como placeholder hasta que exista el asset
 * de produccion. Cargar el corte Expanded ahora seria trabajo sin uso real
 * y ademas violaria la regla de "maximo 2 pesos de Archivo cargados".
 */
export const archivo = localFont({
  src: [
    { path: "./fonts/Archivo-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Archivo-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-archivo",
  display: "swap",
});

export const inter = localFont({
  src: "./fonts/InterVariable.woff2", // variable font: cubre 400/500/600
  variable: "--font-inter",
  display: "swap",
});

export const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});
