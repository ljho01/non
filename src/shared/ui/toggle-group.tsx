import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import type { ComponentProps } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/utils'
import { toggleVariants } from './toggle'

export function ToggleGroup({
  className,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  )
}

export function ToggleGroupItem({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(toggleVariants({ variant, size }), className)}
      {...props}
    />
  )
}
