"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "cn"
import { FormField } from "@/components/ui/field"

export interface ComboboxOption {
  label: string
  value: string
}

/**
 * Combobox — DESIGN-SYSTEM.md §4.2. Soporta busqueda inline, usado para
 * selector de sede/barbero/servicio cuando la lista es larga. Envuelve
 * @base-ui/react/combobox.
 */
function Combobox({
  items,
  value,
  onValueChange,
  placeholder = "Buscar...",
  emptyMessage = "Sin resultados.",
  label,
  helperText,
  error,
  disabled,
  className,
}: {
  items: ComboboxOption[]
  value?: ComboboxOption | null
  onValueChange?: (value: ComboboxOption | null) => void
  placeholder?: string
  emptyMessage?: string
  label?: React.ReactNode
  helperText?: React.ReactNode
  error?: string
  disabled?: boolean
  className?: string
}) {
  const id = React.useId()

  return (
    <FormField label={label} helperText={helperText} error={error} htmlFor={id} className={className}>
      <ComboboxPrimitive.Root
        items={items}
        value={value}
        onValueChange={(v) => onValueChange?.(v as ComboboxOption | null)}
        itemToStringLabel={(item) => (item as ComboboxOption)?.label ?? ""}
        disabled={disabled}
      >
        <ComboboxPrimitive.InputGroup
          className={cn(
            "relative flex h-10 items-center rounded-md border border-(--border) bg-transparent pr-16",
            "focus-within:border-(--accent) focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--accent)",
            error && "border-(--data-neg)"
          )}
        >
          <ComboboxPrimitive.Input
            id={id}
            placeholder={placeholder}
            className="h-full w-full bg-transparent px-3 text-body text-(--text-primary) outline-none placeholder:text-(--text-tertiary)"
          />
          <div className="absolute right-0 flex h-full items-center gap-0.5 pr-1">
            <ComboboxPrimitive.Clear
              aria-label="Limpiar"
              className="flex size-7 items-center justify-center text-(--text-tertiary) hover:text-(--text-primary)"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </ComboboxPrimitive.Clear>
            <ComboboxPrimitive.Trigger
              aria-label="Abrir lista"
              className="flex size-7 items-center justify-center text-(--text-tertiary) hover:text-(--text-primary)"
            >
              <ChevronDown className="size-3.5" strokeWidth={1.5} />
            </ComboboxPrimitive.Trigger>
          </div>
        </ComboboxPrimitive.InputGroup>

        <ComboboxPrimitive.Portal>
          <ComboboxPrimitive.Positioner sideOffset={4} className="z-50 outline-none">
            <ComboboxPrimitive.Popup className="shadow-overlay w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) rounded-md border border-(--border) bg-(--surface-raised) text-(--text-primary)">
              <ComboboxPrimitive.Empty className="px-3 py-4 text-body-s text-(--text-tertiary) data-empty:hidden">
                {emptyMessage}
              </ComboboxPrimitive.Empty>
              <ComboboxPrimitive.List className="max-h-(--available-height) overflow-y-auto py-1">
                {(item: ComboboxOption) => (
                  <ComboboxPrimitive.Item
                    key={item.value}
                    value={item}
                    className="grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 px-2.5 py-1.5 text-body-s outline-none select-none data-highlighted:bg-(--surface-card)"
                  >
                    <ComboboxPrimitive.ItemIndicator className="col-start-1">
                      <Check className="size-3.5 text-(--accent)" strokeWidth={1.5} />
                    </ComboboxPrimitive.ItemIndicator>
                    <span className="col-start-2">{item.label}</span>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
      </ComboboxPrimitive.Root>
    </FormField>
  )
}

export { Combobox }
