import * as Primitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'
export const DropdownMenu = Primitive.Root
export const DropdownMenuTrigger = Primitive.Trigger
export function DropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={6}
        {...props}
        className={cn('z-50 min-w-44 rounded-lg border bg-popover p-1 shadow-xl', className)}
      />
    </Primitive.Portal>
  )
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      {...props}
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none focus:bg-accent data-[disabled]:opacity-40 [&_svg]:size-4',
        className,
      )}
    />
  )
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      {...props}
      className={cn('px-3 py-1.5 text-xs font-medium text-muted-foreground', className)}
    />
  )
}
export const DropdownMenuSeparator = () => <Primitive.Separator className="my-1 h-px bg-border" />
export function DropdownMenuShortcut({
  className,
  ...props
}: ComponentProps<'span'>) {
  return (
    <span
      className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
      {...props}
    />
  )
}
