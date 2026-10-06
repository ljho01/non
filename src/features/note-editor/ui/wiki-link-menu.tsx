import { Link2 } from '@/shared/ui/icon'
import { Button } from '@/shared/ui/button'
import type { SearchHit } from '@/shared/contracts/links'
import type { WikiLinkMenuState } from '../model/use-wiki-link-menu'

export function WikiLinkMenu({
  menu,
  hits,
  status,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: {
  menu: WikiLinkMenuState | null
  hits: SearchHit[]
  status: string
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelect: (hit: SearchHit) => void
}) {
  if (!menu) return null
  return (
    <div
      className="fixed z-80 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-[0_14px_38px_#0000002e,0_2px_8px_#0000001f]"
      role="listbox"
      aria-label="문서 링크 검색"
      style={{ left: menu.left, top: menu.top }}
    >
      <div className="max-h-[274px] overflow-y-auto p-1.5">
        {hits.map((hit, index) => (
          <Button
            unstyled
            key={hit.path}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className="flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left hover:bg-accent data-[active=true]:bg-accent [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1 [&_strong]:block [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-semibold [&_small]:mt-0.5 [&_small]:block [&_small]:truncate [&_small]:text-xs [&_small]:text-muted-foreground"
            data-active={index === activeIndex}
            onPointerMove={() => onActiveIndexChange(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(hit)
            }}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background/75 text-foreground">
              <Link2 size={16} />
            </span>
            <span>
              <strong>{hit.title}</strong>
              <small>{hit.path}</small>
            </span>
          </Button>
        ))}
        {!hits.length && (
          <p className="px-3 py-5.5 text-center text-xs text-muted-foreground">
            {status || '문서를 찾는 중…'}
          </p>
        )}
      </div>
      <div className="flex justify-between gap-3 border-t border-border px-2.5 py-2 text-xs text-muted-foreground">
        <span>[[ 문서 링크</span>
        <span>↑↓ 이동 · Enter 선택 · Esc 닫기</span>
      </div>
    </div>
  )
}
