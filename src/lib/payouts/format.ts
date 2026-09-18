/**
 * Formato de presentacion del dinero de los cortes. NO se calcula con esto:
 * solo convierte centavos enteros a pesos para pintar con `MoneyDisplay`
 * (que espera pesos). Toda aritmetica de dinero se hace en centavos.
 */
export function centsToPesosForDisplay(cents: number): number {
  return cents / 100;
}

const FORMATTER = new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "RD$1,325.00" para textos corridos (mensajes), sin componente. Los negativos llevan el signo delante. */
export function formatCentsRd(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}RD$${FORMATTER.format(abs / 100)}`;
}
