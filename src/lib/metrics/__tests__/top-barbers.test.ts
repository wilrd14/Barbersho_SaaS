import { describe, expect, it } from "vitest";
import { aggregateTopBarbers, type TopBarberSale } from "../top-barbers";

const item = (
  id: string,
  barberId: string | null,
  lineTotalCents: number,
  type: "service" | "product" = "service",
  quantity = 1,
) => ({ id, barberId, type, lineTotalCents, quantity });

describe("aggregateTopBarbers", () => {
  it("ticket de 2 barberos con descuento impar: neto prorrateado, suma = subtotal - descuento", () => {
    const sales: TopBarberSale[] = [
      { status: "paid", discountCents: 10001, items: [item("1", "b1", 50000), item("2", "b2", 25000)] },
    ];
    const out = aggregateTopBarbers(sales);
    expect(out.find((o) => o.barberId === "b1")?.producedCents).toBe(43333);
    expect(out.find((o) => o.barberId === "b2")?.producedCents).toBe(21666);
    expect(out.reduce((a, o) => a + o.producedCents, 0)).toBe(75000 - 10001);
  });

  it("excluye ventas no pagadas (refunded/open)", () => {
    const out = aggregateTopBarbers([
      { status: "refunded", discountCents: 0, items: [item("1", "b1", 99999)] },
      { status: "open", discountCents: 0, items: [item("2", "b1", 1)] },
      { status: "paid", discountCents: 0, items: [item("3", "b2", 500)] },
    ]);
    expect(out).toEqual([{ barberId: "b2", producedCents: 500, servicesCount: 1 }]);
  });

  it("el descuento se reparte tambien con productos, pero solo cuentan servicios con barbero", () => {
    const out = aggregateTopBarbers([
      {
        status: "paid",
        discountCents: 1000,
        items: [item("1", "b1", 3000), item("2", "b1", 1000, "product"), item("3", null, 1000)],
      },
    ]);
    // subtotal 5000, descuento 1000 -> 600/200/200; el servicio de b1 queda en 3000 - 600
    expect(out).toEqual([{ barberId: "b1", producedCents: 2400, servicesCount: 1 }]);
  });

  it("ignora ventas sin lineas, suma cantidades, ordena, limita y desempata por id", () => {
    const sales: TopBarberSale[] = [
      { status: "paid", discountCents: 0, items: [] },
      {
        status: "paid",
        discountCents: 0,
        items: [item("a", "bz", 100, "service", 2), item("b", "ba", 100), item("c", "bx", 900), item("d", "ba", 50)],
      },
    ];
    expect(aggregateTopBarbers(sales, 2).map((o) => o.barberId)).toEqual(["bx", "ba"]);
    const all = aggregateTopBarbers(sales);
    expect(all.map((o) => o.barberId)).toEqual(["bx", "ba", "bz"]);
    expect(all.find((o) => o.barberId === "bz")?.servicesCount).toBe(2);

    const tie = aggregateTopBarbers([
      { status: "paid", discountCents: 0, items: [item("1", "y", 100), item("2", "x", 100), item("3", "z", 100)] },
    ]);
    expect(tie.map((o) => o.barberId)).toEqual(["x", "y", "z"]);
  });

  it("ordena las lineas por id antes de prorratear (determinista)", () => {
    const a = aggregateTopBarbers([
      { status: "paid", discountCents: 1, items: [item("2", "b2", 100), item("1", "b1", 100)] },
    ]);
    const b = aggregateTopBarbers([
      { status: "paid", discountCents: 1, items: [item("1", "b1", 100), item("2", "b2", 100)] },
    ]);
    expect(a).toEqual(b);
  });
});
