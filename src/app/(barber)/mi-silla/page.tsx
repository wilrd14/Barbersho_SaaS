import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MoneyDisplay } from "@/components/kortex/money-display"
import { ScopeBanner } from "@/components/kortex/scope-banner"

/**
 * Mi Silla — (barber)/ (BRAND-BRIEF §4). Home del barbero en su PWA:
 * "Lo mío" (ganancias de la quincena en curso) + "Mi día" (agenda
 * inmediata). Mobile-only, baja densidad deliberada, una sola metrica
 * grande por pantalla (UX-BRIEF §4.6).
 *
 * TODO(datos reales): reemplazar `earningsMock`/`scheduleMock` por el
 * fetch server-side del periodo de comisiones abierto del barbero
 * (payout_periods + commission_lines) y de su agenda del dia
 * (appointments donde barber_id = session.user.id), ambos ya con guard
 * `requireBarberScope()` aplicado en el layout de este route group.
 */

const earningsMock = {
  amount: 17300,
  services: 38,
  tips: 3100,
  periodLabel: "esta quincena",
}

const scheduleMock = {
  now: { client: "Ramon Guzman", service: "Fade + barba", time: "2:30pm" },
  next: { client: "Luis Manzueta", service: "Corte clasico", time: "3:00pm" },
}

export default function MiSillaPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      {/* Ejemplo de ScopeBanner en variant "offline" (UX-BRIEF §4.6): se
          muestra solo cuando la ultima sincronizacion no es reciente.
          Aqui queda comentado el gate real, visible por defecto solo para
          fines de demostracion visual de este sprint. */}
      <ScopeBanner variant="offline" message="Actualizado hace 12 min · sin conexion" />

      <header className="border-b border-(--border) px-4 py-4">
        <h1 className="text-h1">Mi Silla — Jandy</h1>
      </header>

      <section className="flex flex-col gap-3 border-b border-(--border) px-4 py-6">
        <p className="text-label text-(--text-tertiary)">Lo mio — {earningsMock.periodLabel}</p>
        <MoneyDisplay amount={earningsMock.amount} emphasis="money" size="display-l" align="left" />
        <p className="text-body-s text-(--text-secondary)">{earningsMock.services} servicios</p>
        <p className="text-body-s text-(--text-secondary)">
          Propinas: <MoneyDisplay amount={earningsMock.tips} emphasis="money" size="num-m" align="left" />
        </p>
        <Button variant="money" size="md" className="mt-2 w-fit">
          Ver recibo completo
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </Button>
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
