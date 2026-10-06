import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/react/sortable'
import type { SidebarSection } from '@/entities/settings'
import { cn } from '@/shared/lib/utils'

export function SortableSidebarSection({ id, index, children }: {
  id: SidebarSection
  index: number
  children: (handleRef: (element: Element | null) => void) => ReactNode
}) {
  const sortable = useSortable({
    id: `sidebar-${id}`,
    index,
    group: 'sidebar-sections',
    type: 'sidebar-section',
    accept: 'sidebar-section',
  })
  return (
    <div
      ref={sortable.ref}
      data-sidebar-section={id}
      data-dragging={sortable.isDragging || undefined}
      className={cn('relative [&_[data-slot=collapsible-trigger]]:touch-none [&_[data-slot=collapsible-trigger]]:cursor-grab',
        sortable.isDragging && 'z-10 rounded-lg bg-accent opacity-60 shadow-md')}
    >
      {children(sortable.handleRef)}
    </div>
  )
}
