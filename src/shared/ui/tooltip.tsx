import * as Primitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Primitive.Provider delayDuration={450}>
      <Primitive.Root>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content
            sideOffset={6}
            className="z-[60] rounded-md bg-foreground px-2 py-1 text-xs text-background shadow"
          >
            {label}
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  )
}
