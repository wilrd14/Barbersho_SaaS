import { notFound } from "next/navigation"

import { buildPayoutCsv } from "@/lib/payouts/csv"
import { loadPeriodDetail } from "@/lib/payouts/queries-periods"
import { zUuid } from "@/lib/validation/id"

/**
 * F3-08 · Descarga del Corte de Quincena en CSV. Un route handler es un
 * endpoint publico de HTTP: el guard de superuser (`requireChainScope`) corre
 * dentro de `loadPeriodDetail`, asi que un admin, un barbero o una sesion de
 * otra cadena reciben 403/404 aqui, no solo en la pagina. Sin cache: son
 * cifras de nomina.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!zUuid.safeParse(id).success) notFound()

  const period = await loadPeriodDetail(id)
  if (!period) notFound()

  const csv = buildPayoutCsv({
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    status: period.status,
    lines: period.lines,
  })

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="corte-${period.startsOn}_${period.endsOn}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
