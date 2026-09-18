"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "cn"
import { Label } from "@/components/ui/label"

/**
 * Contexto que FormField publica a su control (Input, Textarea): el `id` que
 * enlaza `<label for>` con el control, el `id` del mensaje de ayuda/error
 * (para `aria-describedby`) y si el campo esta en error (`aria-invalid`).
 * Asi la asociacion label<->control queda resuelta en UN solo lugar y los
 * ~8 formularios que usan `<FormField label="X"><Input/></FormField>` quedan
 * accesibles sin editarse uno por uno.
 */
interface FormFieldContextValue {
  id: string
  describedBy?: string
  invalid: boolean
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)

/** null si el control no esta dentro de un FormField (uso suelto, ej. login-form con Label+id manual). */
function useFormFieldControl() {
  return React.useContext(FormFieldContext)
}

/**
 * FormField — envoltorio comun para Input/Select/Combobox
 * (DESIGN-SYSTEM.md §4.2: label, helperText, error, disabled).
 *
 * El mensaje de error sigue BRAND-BRIEF §2.2: que paso + por que + que
 * hacer, en una o dos frases — eso lo redacta quien integra el campo,
 * este componente solo lo presenta con el tratamiento visual correcto
 * (borde/texto --data-neg, icono de alerta).
 *
 * Accesibilidad: genera un `id` con `useId` y lo pasa al label (`htmlFor`) y,
 * via contexto, al `Input`/`Textarea` hijo. Si el llamador da `htmlFor`
 * explicito (Select/Combobox, cuyo control es un boton/combobox de base-ui
 * con su propio `id`), se respeta ese en lugar de generar uno.
 * Un FormField debe envolver UN solo control; con varios, todos recibirian el
 * mismo `id`.
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
  const generatedId = React.useId()
  const id = htmlFor ?? generatedId
  const messageId = `${id}-message`
  const hasMessage = Boolean(error) || Boolean(helperText)

  const context = React.useMemo<FormFieldContextValue>(
    () => ({ id, describedBy: hasMessage ? messageId : undefined, invalid: Boolean(error) }),
    [id, messageId, hasMessage, error],
  )

  return (
    <FormFieldContext.Provider value={context}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {label ? (
          <Label htmlFor={id} className="text-body-s text-(--text-secondary)">
            {label}
          </Label>
        ) : null}
        {children}
        {error ? (
          <p id={messageId} className="flex items-start gap-1.5 text-body-s text-(--data-neg)">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span>{error}</span>
          </p>
        ) : helperText ? (
          <p id={messageId} className="text-body-s text-(--text-tertiary)">
            {helperText}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  )
}

export { FormField, useFormFieldControl }
