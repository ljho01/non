import * as Primitive from '@radix-ui/react-dialog'
import { X } from '@/shared/ui/icon'
import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'
import { useI18n } from '@/shared/lib/i18n'
export const Dialog = Primitive.Root
export const DialogTitle = Primitive.Title
export const DialogDescription = Primitive.Description
export function DialogContent({
  children,
  className,
  overlayClassName,
  layout = 'modal',
  showClose = true,
  ...props
}: ComponentProps<typeof Primitive.Content> & {
  layout?: 'modal' | 'page'
  showClose?: boolean
  overlayClassName?: string
}) {
  const { t } = useI18n()
  return (
    <Primitive.Portal>
      <Primitive.Overlay
        className={cn(
          layout === 'page'
            ? 'fixed inset-0 z-50'
            : 'fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]',
          overlayClassName,
        )}
      />
      <Primitive.Content
        {...props}
        className={cn(
          layout === 'page'
            ? 'fixed inset-0 z-50 focus:outline-none'
            : 'fixed left-1/2 top-1/2 z-50 w-[min(560px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-6 shadow-2xl focus:outline-none',
          className,
        )}
      >
        {children}
        {showClose && (
          <Primitive.Close className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:bg-accent focus-visible:ring-2">
            <X size={16} />
            <span className="sr-only">{t('닫기')}</span>
          </Primitive.Close>
        )}
      </Primitive.Content>
    </Primitive.Portal>
  )
}
