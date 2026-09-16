import * as React from "react"
import { Store } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface LocationCardProps {
  name: string
  address: string
  isOpenNow: boolean
  imageUrl?: string
  variant?: "compacta" | "expandida"
  /** 'interno' -> "Ver esta sede"; 'publico' -> "Reservar" en --client-brand. */
  actionContext?: "interno" | "publico"
  onAction?: () => void
  className?: string
}

/**
 * Tarjeta de sede — DESIGN-SYSTEM.md §4.5.
 */
function LocationCard({
  name,
  address,
  isOpenNow,
  imageUrl,
  variant = "compacta",
  actionContext = "interno",
  onAction,
  className,
}: LocationCardProps) {
  const expanded = variant === "expandida"

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-(--border) bg-(--surface-card)",
        expanded ? "gap-3" : "gap-2",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center bg-(--surface-raised) text-(--text-tertiary)",
          expanded ? "h-40" : "h-24"
        )}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- mock/foto de sede, sin dominio configurado todavia
          <img src={imageUrl} alt={name} className="size-full object-cover" />
        ) : (
          <Store className="size-8" strokeWidth={1.5} aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-4 pt-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-h2 text-(--text-primary)">{name}</p>
          <Badge status={isOpenNow ? "activa" : "inactiva"} />
        </div>
        <p className="text-body-s text-(--text-secondary)">{address}</p>
        {onAction ? (
          <Button
            size="sm"
            variant={actionContext === "publico" ? "primary" : "secondary"}
            className={cn("mt-2 self-start", actionContext === "publico" && "bg-(--client-brand)")}
            onClick={onAction}
          >
            {actionContext === "publico" ? "Reservar" : "Ver esta sede"}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export { LocationCard }
