import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Badge de estado — DESIGN-SYSTEM.md §4.3.
 *
 * kind: cita | turno | periodo | sede — agrupa los valores validos por
 * dominio, pero el color siempre se deriva del mismo mapeo semantico
 * (nunca ad hoc por pantalla, ver mapeo abajo):
 *   positivo/completado/pagado/activo -> --data-pos
 *   pendiente/esperando/calculado     -> --data-neutral
 *   advertencia/llamado               -> --data-warn
 *   cancelado/no-show/inactiva        -> --data-neg
 */
type CitaStatus = "pendiente" | "confirmada" | "completada" | "cancelada" | "no-show"
type TurnoStatus = "esperando" | "llamado" | "atendiendo"
type PeriodoStatus = "abierto" | "calculado" | "aprobado" | "pagado"
type SedeStatus = "activa" | "inactiva"

type BadgeStatus = CitaStatus | TurnoStatus | PeriodoStatus | SedeStatus

const STATUS_LABEL: Record<BadgeStatus, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada: "Cancelada",
  "no-show": "No-show",
  esperando: "Esperando",
  llamado: "Llamado",
  atendiendo: "Atendiendo",
  abierto: "Abierto",
  calculado: "Calculado",
  aprobado: "Aprobado",
  pagado: "Pagado",
  activa: "Activa",
  inactiva: "Inactiva",
}

const STATUS_SEVERITY: Record<BadgeStatus, "pos" | "neutral" | "warn" | "neg"> = {
  pendiente: "neutral",
  confirmada: "pos",
  completada: "pos",
  cancelada: "neg",
  "no-show": "neg",
  esperando: "neutral",
  llamado: "warn",
  atendiendo: "pos",
  abierto: "neutral",
  calculado: "neutral",
  aprobado: "pos",
  pagado: "pos",
  activa: "pos",
  inactiva: "neg",
}

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-sm border px-2 py-0.5 text-body-s font-medium whitespace-nowrap",
  {
    variants: {
      severity: {
        pos: "border-(--data-pos)/30 bg-(--data-pos)/10 text-(--data-pos)",
        warn: "border-(--data-warn)/30 bg-(--data-warn)/10 text-(--data-warn)",
        neg: "border-(--data-neg)/30 bg-(--data-neg)/10 text-(--data-neg)",
        neutral: "border-(--border) bg-(--surface-raised) text-(--text-secondary)",
      },
    },
    defaultVariants: {
      severity: "neutral",
    },
  }
)

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  kind?: "cita" | "turno" | "periodo" | "sede"
  status: BadgeStatus
  className?: string
}

function Badge({ status, className }: BadgeProps) {
  const severity = STATUS_SEVERITY[status]
  return (
    <span data-slot="badge" className={cn(badgeVariants({ severity }), className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

export { Badge, badgeVariants }
export type { BadgeStatus, CitaStatus, TurnoStatus, PeriodoStatus, SedeStatus }
