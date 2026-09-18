import Link from "next/link"
import { forbidden } from "next/navigation"

import { BarberReceipt } from "@/components/kortex/barber-receipt"
import { loadMyReceipt } from "@/lib/payouts/queries-barber"
import { zUuid } from "@/lib/validation/id"

/**
 * Recibo completo de UN corte del barbero (UX-BRIEF §4.6): lo mismo que ve el
 * gerente al hacer clic en su fila del Corte, en una sola columna apilada.
 * `loadMyReceipt` da 403 si el corte no es de la cadena del barbero, si aun no
 * tiene cifras o si el barbero no tiene lineas en el: no hay forma de ver el
 * recibo de otro.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params
  if (!zUuid.safeParse(periodId).success) forbidden()

  const receipt = await loadMyReceipt(periodId)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-4">
      <Link href="/earnings" className="text-body-s text-(--text-secondary) underline">
        Volver a Lo mío
      </Link>
      <BarberReceipt
        barberName={receipt.barberName}
        periodLabel={receipt.label}
        status={receipt.status}
        lines={receipt.lines}
      />
    </div>
  )
}
