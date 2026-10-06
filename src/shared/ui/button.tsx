import { Slot } from '@radix-ui/react-slot'
import type { VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'
import { buttonVariants } from './button-variants'
export function Button({
  className,
  variant,
  size,
  asChild = false,
  unstyled = false,
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; unstyled?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(
        unstyled
          ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40'
          : buttonVariants({ variant, size }),
        className,
      )}
      {...props}
    />
  )
}
