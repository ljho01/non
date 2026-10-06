import { propertyConfig } from '@/shared/contracts/base'
import { useMemo, useState } from 'react'
import { desktop } from '@/shared/api/desktop'
import { type BaseRow } from '@/shared/contracts/base-values'
import { BaseTable } from './base-table'
import { BaseValue, BaseCover } from './base-value'
import { FilterTree } from './filter-tree'
import { PropertyHistory, type PropertyEdit } from '../model/edits'
import { useVault, type OpenDocument } from '@/entities/vault'
import { type Base, type BaseView, parseBase, serializeBase } from '@/shared/contracts/base'
import { propertyText, propertySourceValue, writeProperty } from '@/shared/contracts/properties'
import { displayFilename, parentFolder } from '@/shared/contracts/note'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Database, Plus, Settings2, Search, Code2, Trash2, ArrowUp } from '@/shared/ui/icon'
import { cn, errorText } from '@/shared/lib/utils'
import { csvFor, defaultsForNewRow, queryBase, summarize, type QueryRow } from '../model/query'
import { useBaseRecords, type BaseRecord } from '../model/records'

function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
  label: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 min-w-28 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([id, text]) => (
          <SelectItem key={id} value={id}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
const layouts: [string, string][] = [
  ['table', '표'],
  ['cards', '카드'],
  ['list', '목록'],
  ['kanban', '보드'],
]
const summaries = [
  'Sum',
  'Average',
  'Min',
  'Max',
  'Range',
  'Median',
  'Stddev',
  'Empty',
  'Filled',
  'Unique',
  'Checked',
  'Unchecked',
  'Earliest',
  'Latest',
]

type CellEdit = { record: BaseRecord; property: string; value: unknown }
function EditCell({
  cell,
  onClose,
  onSaved,
  onApply,
  onType,
  initialType,
}: {
  cell: CellEdit
  onClose: () => void
  onType: (type: string) => void
  initialType?: string
  onSaved: () => void
  onApply: (edits: PropertyEdit[]) => Promise<void>
}) {
  const name = cell.property.replace(/^note\./, '')
  const [type, setType] = useState(
    initialType ??
      (cell.value instanceof Date
        ? 'date'
        : Array.isArray(cell.value)
          ? 'list'
          : typeof cell.value === 'number'
            ? 'number'
            : typeof cell.value === 'boolean'
              ? 'checkbox'
              : /^\d{4}-\d\d-\d\d$/.test(String(cell.value ?? ''))
                ? 'date'
                : 'text'),
  )
  const [text, setText] = useState(
    Array.isArray(cell.value)
      ? cell.value.map(propertyText).join('\n')
      : cell.value instanceof Date
        ? cell.value.toISOString().slice(0, 10)
        : propertyText(propertySourceValue(cell.value)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(remove = false) {
    try {
      setBusy(true)
      setError('')
      let value: unknown = text
      if (remove) value = undefined
      else if (type === 'number') {
        value = text.trim() ? Number(text) : null
        if (value !== null && !Number.isFinite(value)) throw new Error('숫자를 입력하세요.')
      } else if (type === 'checkbox') value = text === 'true'
      else if (
        (type === 'date' || type === 'datetime') &&
        text &&
        Number.isNaN(new Date(text).getTime())
      )
        throw new Error('올바른 날짜를 입력하세요.')
      else if (type === 'list')
        value = text
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      await onApply([{ record: cell.record, property: name, value }])
      onType(type)
      onSaved()
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent>
        <DialogTitle className="text-lg font-medium">{name}</DialogTitle>
        <DialogDescription className="mt-1 text-xs text-muted-foreground">
          {cell.record.path}
        </DialogDescription>
        <div className="mt-5 space-y-3">
          <Choice
            label="속성 유형"
            value={type}
            onChange={setType}
            options={[
              ['text', '텍스트'],
              ['number', '숫자'],
              ['checkbox', '체크박스'],
              ['date', '날짜'],
              ['datetime', '날짜 및 시간'],
              ['list', '목록'],
            ]}
          />
          {type === 'checkbox' ? (
            <Choice
              label="체크 상태"
              value={text === 'true' ? 'true' : 'false'}
              onChange={setText}
              options={[
                ['true', '체크됨'],
                ['false', '체크 안 됨'],
              ]}
            />
          ) : type === 'list' ? (
            <Textarea
              aria-label="속성 값"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="한 줄에 하나씩"
            />
          ) : (
            <Input
              autoFocus
              aria-label="속성 값"
              type={
                type === 'number' || type === 'date'
                  ? type
                  : type === 'datetime'
                    ? 'datetime-local'
                    : 'text'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
              }}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>
              값 삭제
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? '저장 중…' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ViewSettings({
  base,
  index,
  properties,
  onChange,
  onClose,
}: {
  base: Base
  index: number
  properties: string[]
  onChange: (base: Base) => void
  onClose: () => void
}) {
  const view = base.views[index]
  const [property, setProperty] = useState('')
  const [formulaName, setFormulaName] = useState('')
  const [formulaValue, setFormulaValue] = useState('')
  const [filterProperty, setFilterProperty] = useState('file.ext')
  const [operator, setOperator] = useState('==')
  const [filterValue, setFilterValue] = useState('')
  const [scope, setScope] = useState('view')
  const patch = (changes: Partial<BaseView>) =>
    onChange({ ...base, views: base.views.map((v, i) => (i === index ? { ...v, ...changes } : v)) })
  const columns = view.order ?? ['file.name']
  const options: [string, string][] = properties.map((p) => [
    p,
    propertyConfig(base, p)?.displayName ?? p,
  ])
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] w-[min(740px,94vw)] overflow-y-auto">
        <DialogTitle className="text-lg font-medium">뷰 설정</DialogTitle>
        <DialogDescription className="sr-only">
          표시 속성, 필터, 정렬 및 수식을 설정합니다.
        </DialogDescription>
        <div className="mt-5 space-y-6">
          <div className="flex gap-2">
            <Input
              aria-label="뷰 이름"
              value={view.name}
              onChange={(e) => {
                if (e.target.value.trim()) patch({ name: e.target.value })
              }}
            />
            <Choice
              label="레이아웃"
              value={view.type}
              options={layouts}
              onChange={(type) => patch({ type })}
            />
          </div>
          <section className="grid grid-cols-2 gap-3">
            {view.type === 'kanban' && (
              <Button variant="ghost" size="sm" onClick={() => patch({ columnOrder: undefined })}>
                열 순서 초기화
              </Button>
            )}
            {view.type === 'table' && (
              <Choice
                label="행 높이"
                value={String(view.rowHeight ?? 'medium')}
                onChange={(rowHeight) => patch({ rowHeight })}
                options={[
                  ['short', '낮게'],
                  ['medium', '보통'],
                  ['tall', '높게'],
                  ['extra-tall', '아주 높게'],
                ]}
              />
            )}
            {(view.type === 'cards' || view.type === 'kanban') && (
              <>
                <label className="space-y-1 text-xs">
                  {view.type === 'cards' ? '카드 너비' : '열 너비'}
                  <Input
                    type="number"
                    min={120}
                    max={800}
                    value={Number(view.cardSize ?? 240)}
                    onChange={(e) =>
                      patch({ cardSize: Math.max(120, Math.min(800, Number(e.target.value))) })
                    }
                  />
                </label>
                <Choice
                  label="이미지 속성"
                  value={String(view.image ?? 'none')}
                  options={[['none', '이미지 없음'], ...options]}
                  onChange={(image) => patch({ image: image === 'none' ? undefined : image })}
                />
                <Choice
                  label="이미지 맞춤"
                  value={String(view.imageFit ?? 'cover')}
                  options={[
                    ['cover', '채우기'],
                    ['contain', '맞추기'],
                  ]}
                  onChange={(imageFit) => patch({ imageFit })}
                />
                <label className="space-y-1 text-xs">
                  이미지 가로/세로 비율
                  <Input
                    type="number"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={Number(view.imageAspectRatio ?? 1)}
                    onChange={(e) =>
                      patch({
                        imageAspectRatio: Math.max(0.1, Math.min(5, Number(e.target.value))),
                      })
                    }
                  />
                </label>
                {view.type === 'kanban' && (
                  <Choice
                    label="빈 열"
                    value={view.hideEmpty ? 'hide' : 'show'}
                    options={[
                      ['show', '빈 열 표시'],
                      ['hide', '빈 열 숨김'],
                    ]}
                    onChange={(v) => patch({ hideEmpty: v === 'hide' })}
                  />
                )}
              </>
            )}
            {view.type === 'list' && (
              <>
                <Choice
                  label="목록 기호"
                  value={String(view.markers ?? 'bullet')}
                  options={[
                    ['bullet', '글머리 기호'],
                    ['number', '번호'],
                    ['none', '없음'],
                  ]}
                  onChange={(markers) => patch({ markers })}
                />
                <Choice
                  label="속성 들여쓰기"
                  value={view.indentProperties ? 'yes' : 'no'}
                  options={[
                    ['no', '한 줄'],
                    ['yes', '들여쓰기'],
                  ]}
                  onChange={(v) => patch({ indentProperties: v === 'yes' })}
                />
                <label className="space-y-1 text-xs">
                  속성 구분자
                  <Input
                    value={String(view.separator ?? ', ')}
                    onChange={(e) => patch({ separator: e.target.value })}
                  />
                </label>
              </>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">표시 속성</h3>
            {columns.map((p, i) => (
              <div
                key={p}
                className="flex items-center gap-2"
                onKeyDown={(e) => {
                  if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return
                  e.preventDefault()
                  const target = i + (e.key === 'ArrowUp' ? -1 : 1)
                  if (target < 0 || target >= columns.length) return
                  const order = [...columns]
                  ;[order[i], order[target]] = [order[target], order[i]]
                  patch({ order })
                }}
              >
                <span className="w-36 truncate text-xs" title={p}>
                  {p}
                </span>
                <Input
                  className="h-8"
                  aria-label={`${p} 표시 이름`}
                  placeholder={p}
                  value={propertyConfig(base, p)?.displayName ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...base,
                      properties: {
                        ...base.properties,
                        [p]: { ...propertyConfig(base, p), displayName: e.target.value },
                      },
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${p} 위로`}
                  disabled={i === 0}
                  onClick={() => {
                    const order = [...columns]
                    ;[order[i - 1], order[i]] = [order[i], order[i - 1]]
                    patch({ order })
                  }}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${p} 숨기기`}
                  onClick={() => patch({ order: columns.filter((item) => item !== p) })}
                >
                  <Trash2 />
                </Button>
                <Choice
                  label={`${p} 요약`}
                  value={view.summaries?.[p] ?? 'none'}
                  options={[
                    ['none', '요약 없음'],
                    ...[...summaries, ...Object.keys(base.summaries ?? {})].map(
                      (s): [string, string] => [s, s],
                    ),
                    ...Object.keys(base.summaries ?? {}).map((s): [string, string] => [s, s]),
                  ]}
                  onChange={(value) => {
                    const result = { ...view.summaries }
                    if (value === 'none') delete result[p]
                    else result[p] = value
                    patch({ summaries: result })
                  }}
                />
              </div>
            ))}
            <div className="flex flex-wrap gap-1">
              {properties
                .filter((p) => !columns.includes(p))
                .map((p) => (
                  <Button
                    key={p}
                    variant="ghost"
                    size="sm"
                    onClick={() => patch({ order: [...columns, p] })}
                  >
                    <Plus />
                    {p}
                  </Button>
                ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const p = property.trim().replace(/^note\./, '')
                if (p && !columns.includes(`note.${p}`)) {
                  patch({ order: [...columns, `note.${p}`] })
                  setProperty('')
                }
              }}
            >
              <Input
                aria-label="새 속성 이름"
                value={property}
                onChange={(e) => setProperty(e.target.value)}
                placeholder="새 속성 이름"
              />
              <Button type="submit" variant="outline" size="sm">
                추가
              </Button>
            </form>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">필터</h3>
            <Choice
              label="필터 범위"
              value={scope}
              onChange={setScope}
              options={[
                ['view', '이 뷰'],
                ['base', '모든 뷰'],
              ]}
            />
            <FilterTree
              value={scope === 'base' ? base.filters : view.filters}
              onChange={(filters) =>
                scope === 'base' ? onChange({ ...base, filters }) : patch({ filters })
              }
            />
            <div className="flex flex-wrap gap-2">
              <Choice
                label="필터 속성"
                value={filterProperty}
                onChange={setFilterProperty}
                options={options}
              />
              <Choice
                label="비교"
                value={operator}
                onChange={setOperator}
                options={[
                  ['==', '같음'],
                  ['!=', '다름'],
                  ['>', '초과'],
                  ['<', '미만'],
                  ['>=', '이상'],
                  ['<=', '이하'],
                  ['contains', '포함'],
                  ['isEmpty', '비어 있음'],
                ]}
              />
              <Input
                className="w-32 flex-1"
                aria-label="필터 값"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const [prefix, ...rest] = filterProperty.split('.')
                  const accessor = `${prefix}[${JSON.stringify(rest.join('.'))}]`
                  const value =
                    /^-?\d+(\.\d+)?$/.test(filterValue) ||
                    ['true', 'false', 'null'].includes(filterValue)
                      ? filterValue
                      : JSON.stringify(filterValue)
                  const expression =
                    operator === 'isEmpty'
                      ? `${accessor}.isEmpty()`
                      : operator === 'contains'
                        ? `${accessor}.contains(${value})`
                        : `${accessor} ${operator} ${value}`
                  const previous = scope === 'base' ? base.filters : view.filters
                  const filters = previous ? { and: [previous, expression] } : expression
                  if (scope === 'base') onChange({ ...base, filters })
                  else patch({ filters })
                }}
              >
                추가
              </Button>
            </div>
            {(scope === 'base' ? base.filters : view.filters) && (
              <div className="flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(scope === 'base' ? base.filters : view.filters, null, 2)}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    scope === 'base'
                      ? onChange({ ...base, filters: undefined })
                      : patch({ filters: undefined })
                  }
                >
                  초기화
                </Button>
              </div>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">정렬 및 그룹</h3>
            {(view.sort ?? []).map((s, i) => (
              <div key={i} className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`정렬 ${i + 1} 위로`}
                  disabled={!i}
                  onClick={() => {
                    const sort = [...view.sort!]
                    ;[sort[i - 1], sort[i]] = [sort[i], sort[i - 1]]
                    patch({ sort })
                  }}
                >
                  <ArrowUp />
                </Button>
                <Choice
                  label={`정렬 ${i + 1}`}
                  value={s.property}
                  options={options}
                  onChange={(property) =>
                    patch({
                      sort: view.sort!.map((item, n) => (n === i ? { ...item, property } : item)),
                    })
                  }
                />
                <Choice
                  label="정렬 방향"
                  value={s.direction}
                  options={[
                    ['ASC', '오름차순'],
                    ['DESC', '내림차순'],
                  ]}
                  onChange={(direction) =>
                    patch({
                      sort: view.sort!.map((item, n) =>
                        n === i ? { ...item, direction: direction as 'ASC' | 'DESC' } : item,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patch({ sort: view.sort!.filter((_, n) => i !== n) })}
                >
                  삭제
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                patch({ sort: [...(view.sort ?? []), { property: 'file.name', direction: 'ASC' }] })
              }
            >
              <Plus />
              정렬 추가
            </Button>
            <div className="flex gap-2">
              <Choice
                label="그룹 속성"
                value={view.groupBy?.property ?? 'none'}
                options={[['none', '그룹 없음'], ...options]}
                onChange={(property) =>
                  patch({
                    groupBy:
                      property === 'none'
                        ? undefined
                        : { property, direction: view.groupBy?.direction ?? 'ASC' },
                  })
                }
              />
              {view.groupBy && (
                <Choice
                  label="그룹 방향"
                  value={view.groupBy.direction}
                  options={[
                    ['ASC', '오름차순'],
                    ['DESC', '내림차순'],
                  ]}
                  onChange={(direction) =>
                    patch({ groupBy: { ...view.groupBy!, direction: direction as 'ASC' | 'DESC' } })
                  }
                />
              )}
            </div>
            <label className="flex items-center gap-2 text-xs">
              최대 결과
              <Input
                className="h-8 w-28"
                type="number"
                min={0}
                aria-label="최대 결과"
                placeholder="제한 없음"
                value={view.limit ?? ''}
                onChange={(e) =>
                  patch({
                    limit:
                      e.target.value === ''
                        ? undefined
                        : Math.max(0, Math.floor(Number(e.target.value))),
                  })
                }
              />
            </label>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">사용자 지정 요약</h3>
            {Object.entries(base.summaries ?? {}).map(([name, expression]) => (
              <div key={name} className="flex gap-2">
                <span className="w-24 truncate text-xs">{name}</span>
                <Input
                  aria-label={`${name} 요약 수식`}
                  value={expression}
                  onChange={(e) =>
                    onChange({ ...base, summaries: { ...base.summaries, [name]: e.target.value } })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${name} 요약 삭제`}
                  onClick={() => {
                    const summaries = { ...base.summaries }
                    delete summaries[name]
                    onChange({ ...base, summaries })
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                let name = 'Custom'
                while (base.summaries?.[name]) name += ' 2'
                onChange({
                  ...base,
                  summaries: { ...base.summaries, [name]: 'values.reduce(acc + value, 0)' },
                })
              }}
            >
              요약 추가
            </Button>
            <h3 className="text-sm font-medium">수식</h3>
            {Object.entries(base.formulas ?? {}).map(([name, expression]) => (
              <div key={name} className="flex gap-2">
                <span className="w-28 truncate text-xs">{name}</span>
                <Input
                  aria-label={`${name} 수식`}
                  value={expression}
                  onChange={(e) =>
                    onChange({ ...base, formulas: { ...base.formulas, [name]: e.target.value } })
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const formulas = { ...base.formulas }
                    delete formulas[name]
                    onChange({ ...base, formulas })
                  }}
                >
                  삭제
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                className="w-32"
                aria-label="수식 이름"
                value={formulaName}
                onChange={(e) => setFormulaName(e.target.value)}
                placeholder="이름"
              />
              <Input
                aria-label="수식"
                value={formulaValue}
                onChange={(e) => setFormulaValue(e.target.value)}
                placeholder="price * quantity"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (formulaName.trim() && formulaValue.trim()) {
                    onChange({
                      ...base,
                      formulas: { ...base.formulas, [formulaName.trim()]: formulaValue },
                      views: base.views.map((v, i) =>
                        i === index
                          ? {
                              ...v,
                              order: [...new Set([...columns, `formula.${formulaName.trim()}`])],
                            }
                          : v,
                      ),
                    })
                    setFormulaName('')
                    setFormulaValue('')
                  }
                }}
              >
                추가
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function BaseEditor({
  document,
  embedded = false,
  hostRow,
  initialView,
  onContentChange,
}: {
  document: OpenDocument
  embedded?: boolean
  hostRow?: BaseRow
  initialView?: string
  onContentChange?: (source: string) => void
}) {
  const { records, warnings, loading } = useBaseRecords()
  const [index, setIndex] = useState(() => {
    try {
      return Math.max(
        0,
        parseBase(document.content).views.findIndex((v) => v.name === initialView),
      )
    } catch {
      return 0
    }
  })
  const [history] = useState(() => new PropertyHistory())
  const [newGroup, setNewGroup] = useState<unknown>(undefined)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [settings, setSettings] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [sourceOriginal, setSourceOriginal] = useState('')
  const [cell, setCell] = useState<CellEdit | null>(null)
  const [error, setError] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newFolder, setNewFolder] = useState(parentFolder(document.path))
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => {
    try {
      return { base: parseBase(document.content), error: '' }
    } catch (e) {
      return { base: null, error: errorText(e) }
    }
  }, [document.content])
  const base = parsed.base
  const viewIndex = Math.min(index, (base?.views.length ?? 1) - 1)
  const view = base?.views[viewIndex]
  const thisRow = hostRow ?? records.find((r) => r.path === document.path)
  const randomSeed = useMemo(() => Math.random(), [viewIndex])
  const result = useMemo(
    () =>
      base && view
        ? queryBase(records, base, view, search, thisRow, randomSeed)
        : { rows: [], total: 0, warnings: [] },
    [records, base, view, search, thisRow, randomSeed],
  )
  const columns = view?.order ?? ['file.name']
  const properties = [
    ...new Set([
      'file.name',
      'file.basename',
      'file.ctime',
      'file.links',
      'file.backlinks',
      'file.embeds',
      'file.properties',
      'file.path',
      'file.folder',
      'file.ext',
      'file.size',
      'file.mtime',
      'file.tags',
      ...records.flatMap((r) => Object.keys(r.properties).map((p) => `note.${p}`)),
      ...Object.keys(base?.formulas ?? {}).map((p) => `formula.${p}`),
      ...columns,
    ]),
  ]
  const updateContent = (content: string) =>
    onContentChange ? onContentChange(content) : useVault.getState().edit(document.path, content)
  const apply = async (edits: PropertyEdit[]) => {
    await history.apply(edits)
    setError('')
  }
  const change = (value: Base) => {
    try {
      updateContent(serializeBase(value, document.content))
      setError('')
    } catch (e) {
      setError(errorText(e))
    }
  }
  const patchView = (patch: Partial<BaseView>) => {
    if (base)
      change({
        ...base,
        views: base.views.map((v, i) => (i === viewIndex ? { ...v, ...patch } : v)),
      })
  }
  const openFile = (path: string) => {
    void (
      records.find((r) => r.path === path)?.entry.kind === 'attachment'
        ? desktop.reveal(path)
        : useVault.getState().openFile(path)
    ).catch((e) => setError(errorText(e)))
  }
  const renderCell = (row: QueryRow, property: string) => {
    const value = row.cells[property]
    const record = row.row as BaseRecord
    const text = propertyText(value)
    if (row.errors[property])
      return (
        <span className="text-destructive" title={row.errors[property]}>
          수식 오류
        </span>
      )
    if (property === 'file.name' || property === 'file.path' || property === 'file.basename')
      return (
        <Button
          unstyled
          className="min-w-0 max-w-full truncate text-left font-medium hover:underline"
          onClick={() => openFile(row.row.path)}
          title={row.row.path}
        >
          {text}
        </Button>
      )
    if (
      !property.startsWith('file.') &&
      !property.startsWith('formula.') &&
      ['note', 'legacy'].includes(record.entry.kind) &&
      (value == null || typeof value !== 'object' || Array.isArray(value))
    )
      return (
        <Button
          unstyled
          className={cn("min-h-7 min-w-0 truncate rounded px-1 text-left hover:bg-accent", view?.type !== "list" && "w-full")}
          aria-label={`${row.row.path} ${property} 편집`}
          title={text || '속성 편집'}
          onClick={() => setCell({ record, property, value })}
        >
          {text ? (
            <span>{typeof value === 'boolean' ? (value ? '☑' : '☐') : text}</span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </Button>
      )
    return (
      <span className="inline-flex max-w-72 items-center truncate" title={text}>
        <BaseValue value={value} row={row.row} onOpen={openFile} />
      </span>
    )
  }
  const groups = new Map<string, QueryRow[]>()
  for (const row of result.rows) {
    const key = view?.groupBy ? propertyText(row.cells[view.groupBy.property]) || '비어 있음' : ''
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const columnValues: Record<string, unknown> = {
    ...((view?.columnValues as Record<string, unknown>) ?? {}),
  }
  if (view?.type === 'kanban') {
    for (const [key, rows] of groups)
      columnValues[key] = view.groupBy ? propertySourceValue(rows[0]?.cells[view.groupBy.property]) : undefined
    if (!view.hideEmpty)
      for (const key of Array.isArray(view.columnOrder) ? view.columnOrder.map(String) : [])
        if (!groups.has(key)) groups.set(key, [])
  }
  const editCell = (row: QueryRow, property: string) => {
    if (property.startsWith('formula.')) {
      setSettings(true)
      return
    }
    if (property.startsWith('file.')) {
      openFile(row.row.path)
      return
    }
    if (typeof row.cells[property] === 'boolean') {
      void apply([{ record: row.row as BaseRecord, property, value: !row.cells[property] }]).catch(
        (e) => setError(errorText(e)),
      )
      return
    }
    setCell({ record: row.row as BaseRecord, property, value: row.cells[property] })
  }
  async function createRow() {
    try {
      setBusy(true)
      setError('')
      const title = newTitle.trim()
      if (!title || /[\\/]/.test(title) || title.startsWith('.'))
        throw new Error('파일 이름을 입력하세요. 경로 구분자는 사용할 수 없습니다.')
      const path = `${newFolder ? `${newFolder}/` : ''}${title.replace(/\.md$/i, '')}.md`
      let content = ''
      if (base && view)
        for (const [name, value] of Object.entries(defaultsForNewRow(base, view).properties))
          content = writeProperty(path, content, name, value)
      if (
        view?.groupBy &&
        newGroup !== undefined &&
        !/^(file|formula)\./.test(view.groupBy.property)
      )
        content = writeProperty(
          path,
          content,
          view.groupBy.property.replace(/^note\./, ''),
          newGroup,
        )
      await useVault.getState().createNote(path, content)
      if (!embedded) await useVault.getState().openFile(document.path)
      setNewOpen(false)
      setNewTitle('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden text-sm leading-normal',
        embedded ? 'w-full rounded-lg border' : 'flex-1',
      )}
      data-testid="base-editor"
    >
      <div className={cn("flex items-center gap-2", embedded ? "px-3 py-2" : "px-6 pb-3 pt-5")}>
        <Database className="size-5 text-muted-foreground" />
        {(!embedded || !document.path.includes('#base')) && (
          <div className={cn('min-w-0 truncate font-medium', embedded ? 'text-sm' : 'text-xl')}>
            {displayFilename(document.path)}
          </div>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="데이터베이스 소스 편집"
          onClick={() => {
            setSourceOriginal(document.content)
            setSource(document.content)
          }}
        >
          <Code2 />
        </Button>
      </div>
      {base && view && (
        <>
          <div className={cn("flex flex-wrap items-center gap-1 border-b", embedded ? "px-3 pb-2" : "px-6 pb-3")}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  {view.name} ▾
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {base.views.map((v, i) => (
                  <DropdownMenuItem key={i} onSelect={() => setIndex(i)}>
                    {v.name}
                    {i === viewIndex ? ' ✓' : ''}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onSelect={() => {
                    change({
                      ...base,
                      views: [
                        ...base.views,
                        { type: 'table', name: `View ${base.views.length + 1}`, order: columns },
                      ],
                    })
                    setIndex(base.views.length)
                  }}
                >
                  <Plus />뷰 추가
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    change({
                      ...base,
                      views: [...base.views, { ...view, name: `${view.name} copy` }],
                    })
                    setIndex(base.views.length)
                  }}
                >
                  뷰 복제
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={base.views.length < 2}
                  onSelect={() => {
                    change({ ...base, views: base.views.filter((_, i) => i !== viewIndex) })
                    setIndex(0)
                  }}
                >
                  뷰 삭제
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={viewIndex === 0}
                  onSelect={() => {
                    const views = [...base.views]
                    ;[views[viewIndex - 1], views[viewIndex]] = [
                      views[viewIndex],
                      views[viewIndex - 1],
                    ]
                    change({ ...base, views })
                    setIndex(viewIndex - 1)
                  }}
                >
                  뷰 위로 이동
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={viewIndex === base.views.length - 1}
                  onSelect={() => {
                    const views = [...base.views]
                    ;[views[viewIndex + 1], views[viewIndex]] = [
                      views[viewIndex],
                      views[viewIndex + 1],
                    ]
                    change({ ...base, views })
                    setIndex(viewIndex + 1)
                  }}
                >
                  뷰 아래로 이동
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={viewIndex === 0}
                  onSelect={() => {
                    change({
                      ...base,
                      views: [view, ...base.views.filter((_, i) => i !== viewIndex)],
                    })
                    setIndex(0)
                  }}
                >
                  기본 뷰로 설정
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  {result.rows.length}개 ▾
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onSelect={() => {
                    const url = URL.createObjectURL(
                      new Blob(['\uFEFF' + csvFor(result.rows, columns, base)], {
                        type: 'text/csv;charset=utf-8',
                      }),
                    )
                    const anchor = window.document.createElement('a')
                    anchor.href = url
                    anchor.download = `${displayFilename(document.path)}.csv`
                    anchor.click()
                    setTimeout(() => URL.revokeObjectURL(url), 1000)
                  }}
                >
                  CSV 내보내기
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void navigator.clipboard
                      .writeText(
                        [
                          columns.join('\t'),
                          ...result.rows.map((r) =>
                            columns.map((p) => propertyText(r.cells[p])).join('\t'),
                          ),
                        ].join('\n'),
                      )
                      .catch((e) => setError(errorText(e)))
                  }}
                >
                  결과 복사
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    const cell = (v: string) => v.replaceAll('|', '\\|').replace(/\r?\n/g, '<br>')
                    void navigator.clipboard
                      .writeText(
                        [
                          columns.map((p) => cell(propertyConfig(base, p)?.displayName ?? p)),
                          columns.map(() => '---'),
                          ...result.rows.map((r) =>
                            columns.map((p) => cell(propertyText(r.cells[p]))),
                          ),
                        ]
                          .map((r) => '| ' + r.join(' | ') + ' |')
                          .join('\n'),
                      )
                      .catch((e) => setError(errorText(e)))
                  }}
                >
                  Markdown 표로 복사
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size={embedded ? "icon" : "sm"} aria-label="속성 · 필터 · 정렬" title="속성 · 필터 · 정렬" onClick={() => setSettings(true)}>
              <Settings2 />
              {!embedded && "속성 · 필터 · 정렬"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(embedded && !history.canUndo && "hidden")}
              disabled={!history.canUndo}
              onClick={() =>
                void history
                  .travel()
                  .then(() => setError(''))
                  .catch((e) => setError(errorText(e)))
              }
            >
              실행 취소
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(embedded && !history.canRedo && "hidden")}
              disabled={!history.canRedo}
              onClick={() =>
                void history
                  .travel(true)
                  .then(() => setError(''))
                  .catch((e) => setError(errorText(e)))
              }
            >
              다시 실행
            </Button>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
              <Input
                aria-label="데이터베이스 검색"
                className={cn("h-8 border-transparent bg-muted/50 pl-7 text-xs shadow-none", embedded ? "w-28" : "w-40")}
                placeholder="검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (base && view)
                  setNewFolder(defaultsForNewRow(base, view).folder ?? parentFolder(document.path))
                setNewGroup(undefined)
                setNewOpen(true)
              }}
            >
              <Plus />새 노트
            </Button>
          </div>
          <div className={cn("min-h-0 min-w-0", embedded ? "max-h-[32rem] overflow-auto px-3 py-2" : "flex-1 overflow-auto px-6 py-4")}>
            {loading ? (
              <p className="py-8 text-sm text-muted-foreground">노트 속성을 읽는 중…</p>
            ) : !layouts.some(([id]) => id === view.type) ? (
              <p className="text-sm text-destructive">
                지원하지 않는 뷰: {view.type}. 소스 설정은 보존됩니다.
              </p>
            ) : !result.rows.length ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                조건에 맞는 파일이 없습니다.
              </p>
            ) : (
              <div className={cn(view.type === 'kanban' && 'flex items-start gap-4')}>
                {[...groups]
                  .sort(([a], [b]) => {
                    const order = Array.isArray(view.columnOrder)
                      ? view.columnOrder.map(String)
                      : []
                    return (
                      (order.includes(a) ? order.indexOf(a) : order.length) -
                      (order.includes(b) ? order.indexOf(b) : order.length)
                    )
                  })
                  .map(([group, rows]) => (
                    <section
                      key={group}
                      style={
                        view.type === 'kanban' ? { width: Number(view.cardSize ?? 288) } : undefined
                      }
                      onDragOver={(e) => {
                        if (view.type === 'kanban') e.preventDefault()
                      }}
                      onDrop={(e) => {
                        if (
                          view.type !== 'kanban' ||
                          !view.groupBy ||
                          /^(file|formula)\./.test(view.groupBy.property)
                        )
                          return
                        e.preventDefault()
                        const dragged = e.dataTransfer.getData('application/non-base-group')
                        if (dragged) {
                          const order = [...groups.keys()].filter((g) => g !== dragged)
                          order.splice(order.indexOf(group), 0, dragged)
                          patchView({ columnOrder: order })
                          return
                        }
                        const record = records.find(
                          (r) => r.path === e.dataTransfer.getData('application/non-base-row'),
                        )
                        if (record) patchView({ columnOrder: [...groups.keys()], columnValues })
                        if (record)
                          void apply([
                            {
                              record,
                              property: view.groupBy.property,
                              value: columnValues[group],
                            },
                          ]).catch((e) => setError(errorText(e)))
                      }}
                      className={cn(
                        'mb-5 last:mb-0',
                        view.type === 'kanban' && 'w-72 shrink-0 rounded-lg bg-muted/40 p-3',
                      )}
                    >
                      {group && (
                        <h2
                          className="mb-3 flex items-center gap-2 text-sm font-medium"
                          draggable={
                            view.type === 'kanban' &&
                            !!view.groupBy &&
                            !/^(file|formula)\./.test(view.groupBy.property)
                          }
                          onDragStart={(e) =>
                            e.dataTransfer.setData('application/non-base-group', group)
                          }
                        >
                          <Button
                            unstyled
                            aria-expanded={!collapsed.has(group)}
                            onClick={() =>
                              setCollapsed((old) => {
                                const next = new Set(old)
                                if (next.has(group)) next.delete(group)
                                else next.add(group)
                                return next
                              })
                            }
                          >
                            {collapsed.has(group) ? '▸' : '▾'} {group}
                          </Button>
                          <span className="ml-2 text-xs text-muted-foreground">{rows.length}</span>
                          {view.type === 'kanban' &&
                            view.groupBy &&
                            !/^(file|formula)\./.test(view.groupBy.property) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`${group}에 노트 추가`}
                                onClick={() => {
                                  setNewGroup(columnValues[group])
                                  setNewOpen(true)
                                }}
                              >
                                <Plus />
                              </Button>
                            )}
                        </h2>
                      )}
                      {!collapsed.has(group) &&
                        (view.type === 'table' ? (
                          <BaseTable
                            rows={rows}
                            columns={columns}
                            base={base}
                            view={view}
                            patch={patchView}
                            renderCell={renderCell}
                            onEdit={editCell}
                            onApply={apply}
                            onHistory={async (redo) => {
                              await history.travel(redo)
                              setError('')
                            }}
                            onError={setError}
                            onOpen={openFile}
                          />
                        ) : (
                          <div
                            className={cn(view.type === 'cards' ? 'grid gap-3' : 'space-y-2')}
                            style={
                              view.type === 'cards'
                                ? {
                                    gridTemplateColumns: `repeat(auto-fill,minmax(${Number(view.cardSize ?? 240)}px,1fr))`,
                                  }
                                : undefined
                            }
                          >
                            {rows.map((row, rowIndex) => (
                              <article
                                key={row.row.path}
                                draggable={
                                  view.type === 'kanban' &&
                                  !!view.groupBy &&
                                  !/^(file|formula)\./.test(view.groupBy.property) &&
                                  row.row.path.endsWith('.md')
                                }
                                onDragStart={(e) =>
                                  e.dataTransfer.setData('application/non-base-row', row.row.path)
                                }
                                className={cn(
                                  'text-sm',
                                  view.type === 'list'
                                    ? cn(
                                        'flex flex-wrap items-center gap-x-1 gap-y-1 py-1',
                                        !!view.indentProperties && 'flex-col',
                                      )
                                    : 'space-y-2 rounded-lg border bg-background p-4',
                                )}
                              >
                                {view.type !== 'list' && typeof view.image === 'string' && (
                                  <BaseCover
                                    value={row.cells[view.image]}
                                    row={row.row}
                                    fit={String(view.imageFit ?? 'cover')}
                                    ratio={Number(view.imageAspectRatio ?? 1)}
                                  />
                                )}
                                {columns.map((p, columnIndex) => (
                                  <div
                                    key={p}
                                    className={cn(
                                      'min-w-0',
                                      view.type === 'list' && 'inline-flex max-w-full items-center gap-1',
                                      view.type === 'list' &&
                                        !!view.indentProperties &&
                                        columnIndex > 0 &&
                                        'ml-6',
                                    )}
                                  >
                                    {view.type === 'list' &&
                                      (columnIndex === 0 ? (
                                        <span className="mr-2 text-muted-foreground">
                                          {view.markers === 'none'
                                            ? ''
                                            : view.markers === 'number'
                                              ? `${rowIndex + 1}.`
                                              : '•'}
                                        </span>
                                      ) : (
                                        !view.indentProperties && (
                                          <span>{String(view.separator ?? ', ')}</span>
                                        )
                                      ))}
                                    {p !== 'file.name' && view.type !== 'list' && (
                                      <div className="text-2xs text-muted-foreground">
                                        {propertyConfig(base, p)?.displayName ||
                                          p.replace(/^(file|note|formula)\./, '')}
                                      </div>
                                    )}
                                    {renderCell(row, p)}
                                  </div>
                                ))}
                              </article>
                            ))}
                          </div>
                        ))}
                    </section>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
      {(parsed.error || error || document.error) && (
        <p
          role="alert"
          className="max-h-36 overflow-auto border-t px-6 py-3 text-sm text-destructive"
        >
          {parsed.error || error || document.error}
        </p>
      )}
      {(warnings.length > 0 || result.warnings.length > 0) && (
        <details className="max-h-40 overflow-auto border-t px-6 py-2 text-xs text-destructive">
          <summary>
            {warnings.length + result.warnings.length}개 파일을 표시하지 못했습니다.
          </summary>
          {[...warnings, ...result.warnings].slice(0, 30).map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </details>
      )}
      {settings && base && (
        <ViewSettings
          base={base}
          index={viewIndex}
          properties={properties}
          onChange={change}
          onClose={() => setSettings(false)}
        />
      )}
      {cell && (
        <EditCell
          cell={cell}
          onClose={() => setCell(null)}
          onSaved={() => setError('')}
          onApply={apply}
          initialType={
            typeof base?.properties?.[cell.property]?.type === 'string'
              ? String(base.properties[cell.property].type)
              : undefined
          }
          onType={(type) => {
            if (base)
              change({
                ...base,
                properties: {
                  ...base.properties,
                  [cell.property]: { ...base.properties?.[cell.property], type },
                },
              })
          }}
        />
      )}
      <Dialog
        open={source !== null}
        onOpenChange={(open) => {
          if (!open) setSource(null)
        }}
      >
        <DialogContent className="w-[min(800px,94vw)]">
          <DialogTitle className="text-lg font-medium">데이터베이스 소스</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">
            필터와 뷰를 YAML로 편집합니다.
          </DialogDescription>
          <Textarea
            aria-label="데이터베이스 YAML"
            className="my-4 h-96 font-mono text-xs"
            value={source ?? ''}
            onChange={(e) => setSource(e.target.value)}
          />
          {error && (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            onClick={() => {
              try {
                if (sourceOriginal !== document.content)
                  throw new Error(
                    '소스를 여는 동안 파일이 변경되었습니다. 편집 내용을 복사한 후 다시 열어 주세요.',
                  )
                parseBase(source ?? '')
                updateContent(source!)
                setSource(null)
                setError('')
              } catch (e) {
                setError(errorText(e))
              }
            }}
          >
            적용
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogTitle className="text-lg font-medium">새 노트</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">
            Markdown 파일로 저장합니다.
          </DialogDescription>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void createRow()
            }}
          >
            <Input
              autoFocus
              aria-label="노트 이름"
              placeholder="노트 이름"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Input
              aria-label="노트 폴더"
              placeholder="폴더 (비워 두면 루트)"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              만들기
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
