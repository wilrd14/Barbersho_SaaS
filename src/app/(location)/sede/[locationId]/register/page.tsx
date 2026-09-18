import { requireLocationScope } from "@/lib/auth/guards"
import { listOpenSessionSales, loadCashRegisterState } from "@/lib/actions/cash-register"
import { CashRegisterPanel } from "@/components/kortex/cash-register-panel"
import { OpenSessionSales } from "@/components/kortex/open-session-sales"

/**
 * F2-23 · Cierre de caja diario (y F2-20, apertura, cuando no hay caja
 * abierta). D-F2-9: el barbero no abre ni cierra caja — la pantalla igual
 * es visible para el (lectura), pero el panel bloquea las acciones si su
 * rol efectivo no es admin/superuser.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locationId: string }>
}) {
  const { locationId } = await params
  const scope = await requireLocationScope(locationId)
  const state = await loadCashRegisterState(locationId)

  const isManager = scope.effectiveRole === "superuser" || scope.effectiveRole === "admin"
  // F2-22: la lista de ventas (con "Anular") solo la ve el gerente y solo si
  // hay caja abierta; el barbero no anula (D-F2-9 / matriz §6.2).
  const openSessionSales =
    isManager && state.openSession ? await listOpenSessionSales(locationId) : null

  return (
    <div className="mx-auto max-w-lg p-4">
      <h1 className="text-h1">Caja</h1>
      <div className="mt-4">
        <CashRegisterPanel locationId={locationId} isManager={isManager} state={state} />
      </div>
      {openSessionSales ? (
        <div className="mt-8">
          <OpenSessionSales locationId={locationId} sales={openSessionSales} />
        </div>
      ) : null}
    </div>
  )
}
