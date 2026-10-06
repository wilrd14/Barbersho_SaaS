/**
 * F3-13 · Top barberos de Vista Cadena, PURO.
 *
 * Ingreso NETO de descuento (D-F3-5 / D-F3-13): el descuento de cada venta se
 * prorratea entre TODAS sus lineas (servicio y producto) con `prorateDiscount`
 * (residuo a la linea mayor) y despues se suman las bases de las lineas de
 * SERVICIO por barbero (`sale_items.barber_id`). Solo ventas `paid`. Centavos
 * enteros, sin floats.
 */
import { prorateDiscount } from "@/lib/commissions";

export interface TopBarberItem {
  /** Orden estable (id de la linea) para el desempate del residuo. */
  id: string;
  barberId: string | null;
  type: "service" | "product";
  lineTotalCents: number;
  quantity: number;
}

export interface TopBarberSale {
  status: string;
  discountCents: number;
  items: TopBarberItem[];
}

export interface TopBarberTotals {
  barberId: string;
  /** Ingreso neto de descuento de sus lineas de servicio, en centavos. */
  producedCents: number;
  servicesCount: number;
}

export function aggregateTopBarbers(sales: TopBarberSale[], limit = 5): TopBarberTotals[] {
  const byBarber = new Map<string, TopBarberTotals>();

  for (const sale of sales) {
    if (sale.status !== "paid" || sale.items.length === 0) continue;
    const items = [...sale.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const bases = prorateDiscount(
      items.map((i) => i.lineTotalCents),
      sale.discountCents,
    );
    items.forEach((item, i) => {
      if (item.type !== "service" || item.barberId === null) return;
      const entry = byBarber.get(item.barberId) ?? {
        barberId: item.barberId,
        producedCents: 0,
        servicesCount: 0,
      };
      entry.producedCents += bases[i];
      entry.servicesCount += item.quantity;
      byBarber.set(item.barberId, entry);
    });
  }

  return [...byBarber.values()]
    .sort((a, b) => {
      if (b.producedCents !== a.producedCents) return b.producedCents - a.producedCents;
      return a.barberId < b.barberId ? -1 : a.barberId > b.barberId ? 1 : 0;
    })
    .slice(0, limit);
}
