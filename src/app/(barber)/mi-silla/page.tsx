import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { NetAmount } from "@/components/kortex/barber-receipt"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { Button } from "@/components/ui/button"
import { centsToPesosForDisplay } from "@/lib/payouts/format"
import { loadMyCurrentQuincena, type MyQuincena } from "@/lib/payouts/queries-barber"

/**
 * Mi Silla — (barber)/ (BRAND-BRIEF §4). Home del barbero en su celular:
 * "Lo mio" (lo que lleva en la quincena en curso) + "Mi dia" (agenda
 * inmediata). Baja densidad deliberada, una sola metrica grande por pantalla
 * (UX-BRIEF §4.6).
 *
 * F3-07: "Lo mio" ya viene de la DB. Solo ve LO SUYO (D-F3-18): el barbero sale
 * de la sesion (`requireBarberScope` dentro de `loadMyCurrentQuincena`). Si el
 * corte de la quincena todavia no se calculo, dice "en curso" y calcula al
 * vuelo con lo cobrado hasta ahora; nunca muestra un 0 enganoso.
 *
 * TODO(datos reales): "Mi dia" sigue con datos de muestra (`scheduleMock`, de
 * F2-18): no es de F3.
 */
const scheduleMock = {
  now: { client: "Ramon Guzman", service: "Fade + barba", time: "2:30pm" },
  next: { client: "Luis Manzueta", service: "Corte clasico", time: "3:00pm" },
}

function statusNote(q: MyQuincena): string {
  switch (q.status) {
    case "en-curso":
      return "En curso: se calcula con lo cobrado hasta ahora. El corte todavía no está cerrado."
    case "open":
      return "En curso: el corte todavía no se calcula."
    case "calculated":
      return "Corte calculado. Falta que el dueño lo cierre."
    case "approved":
      return "Corte cerrado. Ya no cambia."
    case "paid":
      return "Corte pagado."
  }
}

export default async function MiSillaPage() {
  const quincena = await loadMyCurrentQuincena()
  const firstName = quincena.barberName.split(" ")[0] ?? quincena.barberName
  const hasActivity = quincena.lines.length > 0

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="border-b border-(--border) px-4 py-4">
        <h1 className="text-h1">Mi Silla — {firstName}</h1>
      </header>

      <section className="flex flex-col gap-3 border-b border-(--border) px-4 py-6" aria-labelledby="lo-mio-title">
        <p id="lo-mio-title" className="text-label text-(--text-tertiary)">
          Lo mío — esta quincena
        </p>
        <p className="text-body-s text-(--text-secondary)">{quincena.label}</p>

        {quincena.unavailable ? (
          <p role="status" className="text-body text-(--text-secondary)">
            Tu corte de esta quincena todavía no se puede calcular. Pídele al gerente que revise tu regla de pago.
          </p>
        ) : !hasActivity ? (
          <p role="status" className="text-body text-(--text-secondary)">
            Todavía no tienes cobros esta quincena. Cuando cobren tus servicios, aparecen aquí.
          </p>
        ) : (
          <>
            <div data-testid="lo-mio-monto">
              <NetAmount cents={quincena.netCents} size="display-l" />
            </div>
            <p className="text-body-s text-(--text-secondary)">
              {quincena.servicesCount} {quincena.servicesCount === 1 ? "servicio" : "servicios"}
            </p>
            <p className="text-body-s text-(--text-secondary)">
              Propinas:{" "}
              <MoneyDisplay
                amount={centsToPesosForDisplay(quincena.tipsCents)}
                context="commission"
                emphasis="money"
                size="num-m"
                align="left"
              />
            </p>
            <p className="text-body-s text-(--text-tertiary)">{statusNote(quincena)}</p>
          </>
        )}

        <Link href="/earnings" className={buttonVariants({ variant: "money", size: "md", className: "mt-2 w-fit" })}>
          Ver recibo completo
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </Link>
      </section>

      <section className="flex flex-col gap-4 px-4 py-6">
        <p className="text-label text-(--text-tertiary)">Mi dia — hoy</p>

        <div className="flex flex-col gap-1">
          <p className="text-body-s text-(--text-tertiary)">Ahora</p>
          <p className="text-body font-medium text-(--text-primary)">{scheduleMock.now.client}</p>
          <p className="text-body-s text-(--text-secondary)">
            {scheduleMock.now.service} · {scheduleMock.now.time}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-body-s text-(--text-tertiary)">Siguiente</p>
          <p className="text-body font-medium text-(--text-primary)">{scheduleMock.next.client}</p>
          <p className="text-body-s text-(--text-secondary)">
            {scheduleMock.next.service} · {scheduleMock.next.time}
          </p>
        </div>

        <Button variant="secondary" size="md" className="w-fit">
          Ver toda mi agenda
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </Button>
      </section>
    </div>
  )
}
