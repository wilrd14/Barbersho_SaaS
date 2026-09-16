import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import { cn } from "cn"

/**
 * Boton — DESIGN-SYSTEM.md §4.1.
 *
 * variant: primary | secondary | money | destructive | ghost
 * size:    sm (32px) | md (40px) | lg (48px, minimo tactil) | xl (56px, CTA de cobro)
 *
 * Reglas duras aplicadas aqui:
 * - radio <= 6px (--radius-md), nunca rounded-lg/2xl de la escala shadcn por defecto.
 * - foco siempre visible: anillo 2px --accent, offset 2px, nunca outline:none sin reemplazo.
 * - variant="money" solo debe usarse en superficies de dinero devengado por una
 *   persona (Mi Silla, recibos) — la restriccion de USO es responsabilidad de quien
 *   integra el componente (regla dura §5.3), el componente no lo puede validar en runtime.
 * - variant="destructive" requiere confirmacion (sheet/modal) antes de ejecutar la
 *   accion — eso se implementa en el flujo que envuelve al boton, no aqui.
 * - loading: bloquea doble-submit inmediatamente (aria-busy + disabled), reemplaza el
 *   icono por un spinner de 14px y NO hace desaparecer el label (usar `loadingText`).
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent font-sans font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-(--accent) text-(--accent-contrast) hover:bg-(--accent-hover)",
        secondary:
          "border-(--border) bg-transparent text-(--text-primary) hover:bg-(--surface-raised)",
        money: "bg-(--money) text-(--accent-contrast) hover:bg-(--money-soft)",
        destructive: "bg-(--data-neg) text-white hover:opacity-90",
        ghost: "bg-transparent text-(--text-primary) hover:bg-(--surface-raised)",
      },
      size: {
        sm: "h-8 px-3 text-body-s",
        md: "h-10 px-4 text-body",
        lg: "h-12 px-5 text-body",
        xl: "h-14 px-6 text-h2 w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

interface ButtonOwnProps extends VariantProps<typeof buttonVariants> {
  /** Estado de carga — bloquea doble-submit y reemplaza el icono por un spinner de 14px. */
  loading?: boolean
  /** Label a mostrar mientras `loading` es true (verbo en gerundio corto: "Cobrando…"). */
  loadingText?: React.ReactNode
}

function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props & ButtonOwnProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      {loading ? loadingText ?? children : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
