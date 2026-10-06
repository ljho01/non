import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

export function Input({ className, unstyled = false, ...props }: ComponentProps<'input'> & {
  unstyled?: boolean
}) {
  return (
    <input
      data-slot="input"
      className={cn(
        !unstyled &&
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
}
