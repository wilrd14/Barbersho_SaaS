import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * F3-18: red de seguridad estatica. Cada Server Action de analitica/administracion de dinero
 * (cortes, reglas de pago) y de operacion mutante debe llamar al gate de suscripcion, y las
 * excepciones duras deben pasar su accion permitida. Analisis por texto (misma limitacion que
 * use-server-guards.test.ts).
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function body(src: string, fn: string): string {
  const start = src.indexOf(`export async function ${fn}(`);
  expect(start, `no existe ${fn}`).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport async function ", start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

const ANALYTICS: Array<[string, string[]]> = [
  [
    "src/lib/actions/payout-periods.ts",
    ["createPayoutPeriodAction", "calculatePayoutPeriodAction", "approvePayoutPeriodAction", "markPayoutPeriodPaidAction", "adjustPayoutLineAction"],
  ],
  [
    "src/lib/actions/commission-rules.ts",
    ["createCommissionRuleAction", "updateCommissionRuleAction", "deleteCommissionRuleAction", "assignBarberLocationRuleAction"],
  ],
];

describe("gate de suscripcion en Server Actions (F3-18)", () => {
  for (const [file, fns] of ANALYTICS) {
    for (const fn of fns) {
      it(`${fn} exige el area analytics`, () => {
        expect(body(read(file), fn)).toMatch(/assertAreaAllowed\([^)]*"analytics"/);
      });
    }
  }

  it("las acciones de operacion mutantes exigen el area operation", () => {
    const checks: Array<[string, string]> = [
      ["src/lib/actions/appointments.ts", "transitionAppointmentAction"],
      ["src/lib/actions/appointments.ts", "createAppointmentAction"],
      ["src/lib/actions/appointments.ts", "rescheduleAppointmentAction"],
      ["src/lib/actions/checkout.ts", "voidSaleAction"],
      ["src/lib/actions/cash-register.ts", "openCashSessionAction"],
      ["src/lib/actions/queue.ts", "joinQueue"],
      ["src/lib/actions/queue.ts", "callTicket"],
      ["src/lib/actions/queue.ts", "startServing"],
      ["src/lib/actions/queue.ts", "markDone"],
      ["src/lib/actions/queue.ts", "markLeft"],
      ["src/lib/actions/queue.ts", "reassignBarber"],
    ];
    for (const [file, fn] of checks) {
      expect(body(read(file), fn), fn).toMatch(/(assert|enforce)AreaAllowed\([^)]*"operation"/);
    }
  });

  it("cobrar y cerrar caja pasan la excepcion dura (nunca se bloquean)", () => {
    expect(body(read("src/lib/actions/checkout.ts"), "createSaleAction")).toMatch(/"charge_open_sale"/);
    expect(body(read("src/lib/actions/cash-register.ts"), "closeCashSessionAction")).toMatch(/"close_open_cash_session"/);
  });

  it("la reserva publica anonima no pasa por el gate", () => {
    expect(read("src/lib/actions/public-booking.ts")).not.toMatch(/AreaAllowed/);
  });
});
