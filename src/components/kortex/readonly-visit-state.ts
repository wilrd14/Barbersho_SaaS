/**
 * F3-15 · Estado puro del banner de visita lectura+ (sin React ni storage real).
 * El banner se ve si la URL trae `?desde=cadena` o si ya se entro a esta sede
 * desde Vista Cadena en esta pestana (marca en sessionStorage por locationId).
 */
export const VISIT_PARAM_VALUE = "cadena";

export function visitStorageKey(locationId: string): string {
  return `kortex:visita-lectura:${locationId}`;
}

export function isVisitParam(value: string | null): boolean {
  return value === VISIT_PARAM_VALUE;
}

export function shouldShowVisitBanner(input: { param: string | null; marked: boolean }): boolean {
  return isVisitParam(input.param) || input.marked;
}

/** Lee la marca; cualquier fallo del storage (modo privado, bloqueado) cuenta como "sin marca". */
export function readVisitMark(storage: Pick<Storage, "getItem"> | null, locationId: string): boolean {
  try {
    return storage?.getItem(visitStorageKey(locationId)) === "1";
  } catch {
    return false;
  }
}

export function writeVisitMark(storage: Pick<Storage, "setItem"> | null, locationId: string): void {
  try {
    storage?.setItem(visitStorageKey(locationId), "1");
  } catch {
    /* sin storage: el banner solo vive mientras la URL traiga el parametro */
  }
}

export function clearVisitMark(storage: Pick<Storage, "removeItem"> | null, locationId: string): void {
  try {
    storage?.removeItem(visitStorageKey(locationId));
  } catch {
    /* nada que limpiar */
  }
}
