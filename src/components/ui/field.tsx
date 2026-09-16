import * as React from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "cn"
import { Label } from "@/components/ui/label"

/**
 * FormField — envoltorio comun para Input/Select/Combobox
 * (DESIGN-SYSTEM.md §4.2: label, helperText, error, disabled).
 *
 * El mensaje de error sigue BRAND-BRIEF §2.2: que paso + por que + que
 * hacer, en una o dos frases — eso lo redacta quien integra el campo,
 * este componente solo lo presenta con el tratamiento visual correcto
 * (borde/texto --data-neg, icono de alerta).
 */
function FormField({
  label,
  helperText,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode
  helperText?: React.ReactNode
  error?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} className="text-body-s text-(--text-secondary)">
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-body-s text-(--data-neg)">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-body-s text-(--text-tertiary)">{helperText}</p>
      ) : null}
    </div>
  )
}

export { FormField }
