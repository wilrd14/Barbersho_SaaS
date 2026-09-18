"use client"

import * as React from "react"
import { cn } from "cn"
import { useFormFieldControl } from "@/components/ui/field"

/**
 * Textarea — mismo trato que `Input`: dentro de un FormField hereda el id del
 * label y los atributos aria del campo.
 */
function Textarea({
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: React.ComponentProps<"textarea">) {
  const field = useFormFieldControl()
  return (
    <textarea
      id={id ?? field?.id}
      aria-describedby={ariaDescribedBy ?? field?.describedBy}
      aria-invalid={ariaInvalid ?? (field?.invalid ? true : undefined)}
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-md border border-(--border) bg-transparent p-2 text-body text-(--text-primary) outline-none placeholder:text-(--text-tertiary) focus-visible:border-(--accent) aria-invalid:border-(--data-neg)",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
