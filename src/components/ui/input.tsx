"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"
import { useFormFieldControl } from "@/components/ui/field"

/**
 * Input — DESIGN-SYSTEM.md §4.2.
 * `numeric`: cuando true, usa --font-mono con tnum, alineado a la derecha
 * (campo de descuento manual, monto de propina "otro", etc).
 */
function Input({
  className,
  type,
  numeric = false,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: React.ComponentProps<"input"> & { numeric?: boolean }) {
  // Dentro de un FormField, hereda id / aria-describedby / aria-invalid del
  // campo (asocia el <label>, el helper/error y el estado invalido). Lo que el
  // llamador pase explicitamente tiene prioridad.
  const field = useFormFieldControl()
  return (
    <InputPrimitive
      id={id ?? field?.id}
      aria-describedby={ariaDescribedBy ?? field?.describedBy}
      aria-invalid={ariaInvalid ?? (field?.invalid ? true : undefined)}
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-(--border) bg-transparent px-3 py-1 text-body text-(--text-primary) transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-(--text-primary) placeholder:text-(--text-tertiary) focus-visible:border-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-(--data-neg)",
        numeric && "text-num-m text-right",
        className
      )}
      {...props}
    />
  )
}

export { Input }
