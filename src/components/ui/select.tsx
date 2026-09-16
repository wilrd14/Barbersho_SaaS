"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "cn"
import { FormField } from "@/components/ui/field"

export interface SelectItemOption {
  label: string
  value: string
}

/**
 * Select — DESIGN-SYSTEM.md §4.2. Selector de valor predefinido (sede,
 * barbero, servicio, metodo de pago, etc). Envuelve @base-ui/react/select.
 */
function Select({
  items,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Selecciona una opcion",
  label,
  helperText,
  error,
  disabled,
  className,
}: {
  items: SelectItemOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  label?: React.ReactNode
  helperText?: React.ReactNode
  error?: string
  disabled?: boolean
  className?: string
}) {
  const id = React.useId()

  return (
    <FormField label={label} helperText={helperText} error={error} htmlFor={id} className={className}>
      <SelectPrimitive.Root
        items={items}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(value) => onValueChange?.(value ?? "")}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-invalid={!!error}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-(--border) bg-transparent px-3 text-body text-(--text-primary) outline-none select-none data-disabled:opacity-40 focus-visible:border-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) aria-invalid:border-(--data-neg)"
        >
          <SelectPrimitive.Value placeholder={placeholder} className="data-placeholder:text-(--text-tertiary)" />
          <SelectPrimitive.Icon>
            <ChevronsUpDown className="size-4 text-(--text-tertiary)" strokeWidth={1.5} />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner sideOffset={4} className="z-50 outline-none select-none">
            <SelectPrimitive.Popup className="shadow-overlay min-w-(--anchor-width) origin-(--transform-origin) rounded-md border border-(--border) bg-(--surface-raised) text-(--text-primary) outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <SelectPrimitive.List className="max-h-(--available-height) overflow-y-auto py-1">
                {items.map((item) => (
                  <SelectPrimitive.Item
                    key={item.value}
                    value={item.value}
                    className={cn(
                      "grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 px-2.5 py-1.5 text-body-s outline-none select-none",
                      "data-highlighted:bg-(--surface-card)"
                    )}
                  >
                    <SelectPrimitive.ItemIndicator className="col-start-1">
                      <Check className="size-3.5 text-(--accent)" strokeWidth={1.5} />
                    </SelectPrimitive.ItemIndicator>
                    <SelectPrimitive.ItemText className="col-start-2">{item.label}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.List>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </FormField>
  )
}

export { Select }
