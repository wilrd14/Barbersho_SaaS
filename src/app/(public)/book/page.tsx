import { redirect } from "next/navigation";

/**
 * D-F2-3 · `/book` sin `chainSlug` no tiene tenant ni branding. Se conserva
 * como redirect legacy hacia la landing de seleccion de cadena — el wizard
 * real vive en `/[chainSlug]/book`.
 */
export default function LegacyBookRedirect() {
  redirect("/");
}
