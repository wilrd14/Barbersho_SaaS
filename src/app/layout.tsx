import type { Metadata } from "next";
import { archivo, inter, plexMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kortex",
  description: "Gestion operativa multi-sede para cadenas de barberias.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Tema por defecto: oscuro (consola). Cada route group de ambito publico
  // sobreescribe data-theme="light" en su propio layout (ver
  // src/app/(public)/layout.tsx). Se fija en el servidor, nunca en un
  // useEffect tras hidratar, para evitar flash de tema (DESIGN-SYSTEM §1.4).
  return (
    <html
      lang="es"
      data-theme="dark"
      className={`${archivo.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
