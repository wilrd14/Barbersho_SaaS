/**
 * F2-11 · Formato "Jandy atiende en Naco lun–mie y en Bella Vista jue–sab".
 * Funcion pura (sin `db` ni `next/*`) — vive fuera de `lib/scheduling` porque
 * es puro formato de presentacion, no calculo de disponibilidad (D-F2 no la
 * exige en el modulo de 100% de cobertura, pero se mantiene pura igual por
 * higiene y testabilidad).
 */

// Orden de exhibicion lunes -> domingo. dayOfWeek en DB: 0 = domingo.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  0: "dom",
  1: "lun",
  2: "mar",
  3: "mié",
  4: "jue",
  5: "vie",
  6: "sáb",
};

/** Comprime un set de dayOfWeek (0-6) en rangos legibles: "lun–mié", "lun, mié y vie". */
export function formatWeekdayRanges(daysOfWeek: number[]): string {
  const set = new Set(daysOfWeek);
  const present = DISPLAY_ORDER.filter((d) => set.has(d));
  if (present.length === 0) return "";

  const groups: number[][] = [];
  let current: number[] = [];
  for (const day of present) {
    if (current.length === 0) {
      current = [day];
      continue;
    }
    const prevIndex = DISPLAY_ORDER.indexOf(current[current.length - 1]!);
    const dayIndex = DISPLAY_ORDER.indexOf(day);
    if (dayIndex === prevIndex + 1) {
      current.push(day);
    } else {
      groups.push(current);
      current = [day];
    }
  }
  if (current.length > 0) groups.push(current);

  const labels = groups.map((group) => {
    if (group.length === 1) return DAY_LABELS[group[0]!];
    if (group.length === 2) return `${DAY_LABELS[group[0]!]} y ${DAY_LABELS[group[group.length - 1]!]}`;
    return `${DAY_LABELS[group[0]!]}–${DAY_LABELS[group[group.length - 1]!]}`;
  });

  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

/** Normaliza un telefono a formato RD: +1 809/829/849 + 7 digitos (D-F2-15). */
export function normalizeDominicanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  // Acepta con o sin codigo de pais/1 inicial.
  let local = digits;
  if (local.startsWith("1") && local.length === 11) local = local.slice(1);
  if (local.length !== 10) return null;
  const areaCode = local.slice(0, 3);
  if (!["809", "829", "849"].includes(areaCode)) return null;
  return `+1${local}`;
}
