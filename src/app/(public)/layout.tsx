/**
 * (public) — tema claro fijo (DESIGN-SYSTEM.md §1.4, regla dura §5.11).
 * Nunca sigue prefers-color-scheme ni el toggle de (location); es el
 * unico ambito con `data-theme="light"` fijo.
 *
 * `data-theme` se fija en un contenedor renderizado en el servidor (no en
 * un useEffect) para evitar flash de tema entre el <html data-theme="dark">
 * del layout raiz y este segmento.
 *
 * TODO(datos reales): el layout de `(public)/[chainSlug]` debe inyectar
 * `--chain-primary-color` / `--chain-secondary-color` inline aqui (o en su
 * propio layout hijo) a partir de `chains.primary_color` / `secondary_color`
 * una vez exista el fetch por slug. Esa es la unica capa de color que
 * puede variar por cliente, y solo dentro de este route group.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-theme="light" className="min-h-full bg-background text-foreground">
      {children}
    </div>
  );
}
