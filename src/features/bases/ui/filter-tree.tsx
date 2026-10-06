import type { BaseFilter } from '@/shared/contracts/base'
import { Input } from '@/shared/ui/input'
import { Button } from '@/shared/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/shared/ui/select'
import { Plus, Trash2 } from '@/shared/ui/icon'
export function FilterTree({
  value,
  onChange,
  depth = 0,
}: {
  value: BaseFilter | undefined
  onChange: (v: BaseFilter | undefined) => void
  depth?: number
}) {
  if (depth > 12)
    return <p className="text-xs text-muted-foreground">깊은 필터는 소스에서 편집하세요.</p>
  if (value === undefined)
    return (
      <Button variant="outline" size="sm" onClick={() => onChange({ and: ['true'] })}>
        <Plus />
        필터 그룹
      </Button>
    )
  if (typeof value === 'string')
    return (
      <div className="flex gap-1">
        <Input
          aria-label="필터 수식"
          className="h-8 font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="필터 삭제"
          onClick={() => onChange(undefined)}
        >
          <Trash2 />
        </Button>
      </div>
    )
  const key = value.and ? 'and' : value.or ? 'or' : 'not',
    items = value[key] ?? []
  return (
    <div className="space-y-2 rounded border p-2">
      <div className="flex items-center gap-2">
        <Select value={key} onValueChange={(v) => onChange({ [v]: items })}>
          <SelectTrigger className="h-8 w-32" aria-label="필터 조합">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">모두 충족</SelectItem>
            <SelectItem value="or">하나 이상</SelectItem>
            <SelectItem value="not">모두 제외</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => onChange({ [key]: [...items, 'true'] })}>
          조건 추가
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ [key]: [...items, { and: ['true'] }] })}
        >
          그룹 추가
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="그룹 삭제"
          onClick={() => onChange(undefined)}
        >
          <Trash2 />
        </Button>
      </div>
      {items.map((item, i) => (
        <FilterTree
          key={i}
          depth={depth + 1}
          value={item}
          onChange={(v) =>
            onChange({
              [key]: items.flatMap((old, n) => (n === i ? (v === undefined ? [] : [v]) : [old])),
            })
          }
        />
      ))}
    </div>
  )
}
