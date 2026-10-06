import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

export function Textarea({
  className,
  unstyled = false,
  ...props
}: ComponentProps<'textarea'> & { unstyled?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        !unstyled &&
          'flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
