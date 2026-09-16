import * as React from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

export interface ScopeBannerProps {
  variant: "readonly-visit" | "offline" | "trial-ending"
  message: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
}

/**
 * ScopeBanner — DESIGN-SYSTEM.md §4.9. Persistente, no descartable en
 * "readonly-visit". Fondo --color-brand-950 (indigo profundo), texto
 * --text-primary, siempre fijo arriba, sobre el header normal.
 */
function ScopeBanner({ variant, message, actionLabel, onAction, className }: ScopeBannerProps) {
  const isOffline = variant === "offline"

  return (
    <div
      className={cn(
        "sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-2 text-body-s",
        isOffline ? "bg-(--surface-raised) text-(--data-neutral)" : "bg-(--color-brand-950) text-(--text-primary)",
        className
      )}
    >
      <p>{message}</p>
      {actionLabel && onAction ? (
        <Button size="sm" variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

export { ScopeBanner }
