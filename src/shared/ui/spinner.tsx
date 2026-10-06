import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'
import { Loader2 } from '@/shared/ui/icon'

export function Spinner({ className, ...props }: ComponentProps<typeof Loader2>) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn('size-4 animate-spin text-muted-foreground', className)}
      {...props}
    />
  )
}
