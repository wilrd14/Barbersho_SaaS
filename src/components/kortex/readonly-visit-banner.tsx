"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ScopeBanner } from "@/components/kortex/scope-banner"
import { buttonVariants } from "@/components/ui/button"
import {
  clearVisitMark,
  isVisitParam,
  readVisitMark,
  shouldShowVisitBanner,
  visitStorageKey,
  writeVisitMark,
} from "@/components/kortex/readonly-visit-state"
import { cn } from "cn"

const MARK_EVENT = "kortex:visit-mark"

function getStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(MARK_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(MARK_EVENT, onChange)
  }
}

/**
 * F3-15 / D-F3-15 · Banner de visita de lectura+ (UX-BRIEF §5.1). Entra con
 * `?desde=cadena`; ese paso deja una marca en sessionStorage por sede para que el
 * banner siga visible al navegar entre pantallas de la sede (los links internos no
 * propagan el parametro). Solo se monta si el servidor decidio que el rol efectivo
 * es superuser. Es contexto, no una capa de permisos. No descartable: la unica
 * salida es "Volver a Vista Cadena", que limpia la marca.
 */
function BannerInner({ locationId, locationName }: { locationId: string; locationName: string }) {
  const params = useSearchParams()
  const hasParam = isVisitParam(params.get("desde"))
  // Servidor/hidratacion: sin marca (solo cuenta la URL); luego se lee el storage.
  const marked = React.useSyncExternalStore(
    subscribe,
    () => readVisitMark(getStorage(), locationId),
    () => false,
  )

  React.useEffect(() => {
    if (hasParam && !marked) {
      writeVisitMark(getStorage(), locationId)
      window.dispatchEvent(new Event(MARK_EVENT))
    }
  }, [hasParam, marked, locationId])

  if (!shouldShowVisitBanner({ param: hasParam ? "cadena" : null, marked })) return null
  return (
    <ScopeBanner
      variant="readonly-visit"
      message={
        <>
          Estás viendo Sede {locationName} como superuser (modo lectura+) ·{" "}
          <Link
            href="/overview"
            data-visit-key={visitStorageKey(locationId)}
            onClick={() => clearVisitMark(getStorage(), locationId)}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "underline")}
          >
            Volver a Vista Cadena
          </Link>
        </>
      }
    />
  )
}

export function ReadonlyVisitBanner({
  locationId,
  locationName,
  isSuperuser,
}: {
  locationId: string
  locationName: string
  isSuperuser: boolean
}) {
  if (!isSuperuser) return null
  return (
    <React.Suspense fallback={null}>
      <BannerInner locationId={locationId} locationName={locationName} />
    </React.Suspense>
  )
}
