"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "cn"

export interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactElement
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Sheet inferior — DESIGN-SYSTEM.md §4.10. Por debajo de `lg` se renderiza
 * como sheet inferior (anclado abajo, drag-to-dismiss visual via borde
 * redondeado superior); en `lg` y superior, como modal centrado. Se
 * resuelve con CSS (clases responsivas) en vez de dos arboles de
 * componentes separados, para no duplicar logica de apertura/cierre.
 *
 * Usa @base-ui/react/dialog (ya en package.json) en vez de sumar una
 * dependencia de "drawer" nueva — el comportamiento de posicion (abajo en
 * movil, centrado en desktop) se logra con clases Tailwind condicionadas
 * al breakpoint, no con un primitive de drawer dedicado.
 */
function Sheet({ open, onOpenChange, trigger, title, children, className }: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <DialogPrimitive.Trigger render={trigger} />
      ) : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup
          className={cn(
            "shadow-overlay fixed z-50 flex flex-col border border-(--border) bg-(--surface-card) text-(--text-primary) outline-none",
            // movil: sheet inferior
            "inset-x-0 bottom-0 max-h-[85vh] rounded-t-md rounded-b-none",
            "data-starting-style:translate-y-full data-ending-style:translate-y-full transition-transform",
            // desktop (lg+): modal centrado
            "lg:inset-x-auto lg:top-1/2 lg:left-1/2 lg:bottom-auto lg:max-h-[80vh] lg:w-full lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-md",
            "lg:data-starting-style:translate-y-[calc(-50%+8px)] lg:data-ending-style:translate-y-[calc(-50%+8px)] lg:data-starting-style:opacity-0 lg:data-ending-style:opacity-0",
            className
          )}
        >
          <div className="flex items-center justify-between border-b border-(--border) px-4 py-3">
            {title ? <DialogPrimitive.Title className="text-h2">{title}</DialogPrimitive.Title> : <span />}
            <DialogPrimitive.Close
              aria-label="Cerrar"
              className="rounded-md p-1.5 text-(--text-tertiary) hover:bg-(--surface-raised) hover:text-(--text-primary) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              <X className="size-4" strokeWidth={1.5} />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto p-4">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { Sheet }
