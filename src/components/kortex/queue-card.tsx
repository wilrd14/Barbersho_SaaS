"use client"

import * as React from "react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface QueueCardProps {
  position: number
  clientName: string
  service: string
  preferredBarber?: string
  state: "esperando" | "llamado" | "atendiendo" | "se-fue"
  /** Minutos estimados de espera. */
  estimatedWaitMinutes: number
  /** Minutos ya transcurridos — si excede el estimado, el texto pasa a --data-warn. */
  elapsedMinutes: number
  onCall?: () => void
  /** Marca la tarjeta como recien llegada para disparar la animacion de entrada. */
  isNew?: boolean
  className?: string
}

const STATE_BADGE = {
  esperando: "esperando",
  llamado: "llamado",
  atendiendo: "atendiendo",
  "se-fue": "cancelada",
} as const

/**
 * QueueCard — DESIGN-SYSTEM.md §4.8. Uso exclusivo de La Fila.
 *
 * TODO(realtime): la animacion de entrada especificada (deslizamiento 8px
 * + pulso de borde --accent de 400ms, salida con colapso de altura y
 * reacomodo `layout` de vecinos) esta pensada en el brief para Framer
 * Motion. No se agrego `framer-motion` como dependencia nueva sin
 * confirmar con el equipo (no esta en package.json todavia); aqui se
 * implementa el mismo efecto con CSS puro (`@keyframes` + transiciones),
 * que cubre entrada/pulso pero no el reacomodo `layout` automatico de
 * vecinos al salir. Si se adopta Framer Motion mas adelante, reemplazar
 * el `div` raiz por `motion.div` con `layout` y las variantes ya definidas
 * aqui como referencia.
 */
function QueueCard({
  position,
  clientName,
  service,
  preferredBarber,
  state,
  estimatedWaitMinutes,
  elapsedMinutes,
  onCall,
  isNew = false,
  className,
}: QueueCardProps) {
  const overEstimate = elapsedMinutes > estimatedWaitMinutes

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border border-(--border) bg-(--surface-card) p-4 transition-colors",
        isNew && "animate-queue-card-enter",
        className
      )}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--surface-raised) text-body-s font-semibold text-(--text-primary)"
        aria-hidden
      >
        {position}
      </span>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body font-medium text-(--text-primary)">{clientName}</p>
          <Badge status={STATE_BADGE[state]} />
        </div>
        <p className="text-body-s text-(--text-secondary)">
          {service} ·{" "}
          <span className={cn(overEstimate && "text-(--data-warn)")}>
            {overEstimate ? "llevando mas de lo estimado" : `espera ~${estimatedWaitMinutes} min`}
          </span>
        </p>
        {preferredBarber ? (
          <p className="text-body-s text-(--text-tertiary)">Prefiere: {preferredBarber}</p>
        ) : (
          <p className="text-body-s text-(--text-tertiary)">Sin preferencia</p>
        )}
        {state === "esperando" && onCall ? (
          <Button size="sm" className="mt-2" onClick={onCall}>
            Llamar turno
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export { QueueCard }
