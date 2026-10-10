import { useRef, useState } from 'react'
import type { Properties } from '@/shared/contracts/properties'
import { propertyText } from '@/shared/contracts/properties'
import { displayFilename } from '@/shared/contracts/note'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { TodoCheckbox } from '@/shared/ui/todo-checkbox'
import { Check, X, FileText, List, ListOrdered, Circle, History, Link2, Square } from '@/shared/ui/icon'
import { cn, errorText } from '@/shared/lib/utils'
import { parsePropertyDraft, propertyDraft } from '../model/property-value'

const chipColors = [
  'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'bg-rose-500/10 text-rose-700 dark:text-rose-300',
]
function chipColor(text: string) {
  let hash = 0
  for (const character of text) hash = (hash + character.charCodeAt(0)) % chipColors.length
  return chipColors[hash]
}
function isStatus(name: string) {
  return /^(status|state|priority|상태|우선순위)$/i.test(name)
}
function isDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && !Number.isNaN(new Date(value).getTime())
}
function PropertyValue({ name, value }: { name: string; value: unknown }) {
  if (value === null || value === undefined || value === '')
    return <span className="text-muted-foreground/60">비어 있음</span>
  if (Array.isArray(value)) return (
    <span className="flex flex-wrap gap-1.5">
      {value.map((item, index) => (
        <span key={index} className={cn('rounded px-1.5 py-0.5 text-xs leading-normal', chipColor(propertyText(item)))}>
          {propertyText(item)}
        </span>
      ))}
      {!value.length && <span className="text-muted-foreground/60">비어 있음</span>}
    </span>
  )
  if (isStatus(name)) return (
    <span className={cn('inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium leading-normal', chipColor(propertyText(value)))}>
      <span className="size-1.5 rounded-full bg-current opacity-60" />
      {propertyText(value)}
    </span>
  )
  const text = propertyText(value)
  const link = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(text)
  if (link) return <span className="inline-flex min-w-0 items-center gap-1.5"><Link2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate underline decoration-border underline-offset-4">{link[2] || displayFilename(link[1])}</span></span>
  return <span className={cn('break-words', typeof value === 'number' && 'tabular-nums', typeof value === 'object' && 'font-mono text-xs')}>{isDate(value) ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(text)) : text}</span>
}
function PropertyRow({ name, value, onChange }: {
  name: string
  value: unknown
  onChange: (name: string, value: unknown, previous: unknown) => void
}) {
  const original = useRef(value)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const structured = value !== null && typeof value === 'object' && !(value instanceof Date)
  const Icon = typeof value === 'boolean' ? Square : typeof value === 'number' ? ListOrdered : Array.isArray(value) ? List : isStatus(name) ? Circle : isDate(value) ? History : FileText
  const commit = () => {
    try {
      if (propertyDraft(value) !== propertyDraft(original.current)) throw new Error('속성이 다른 곳에서 변경되었습니다. 취소 후 다시 편집하세요.')
      onChange(name, parsePropertyDraft(draft, value), value)
      setEditing(false)
      setError('')
    } catch (error) {
      setError(errorText(error))
    }
  }
  const field = {
    'aria-label': `${name} 속성 값`,
    value: draft,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Escape') { event.preventDefault(); setEditing(false) }
      if (event.key === 'Enter' && (!structured || event.metaKey || event.ctrlKey)) { event.preventDefault(); commit() }
    },
  }
  return (
    <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-start gap-x-3 py-0.5">
      <div className="flex min-h-8 min-w-0 items-center gap-2 px-1 text-muted-foreground">
        <Icon className="size-4 shrink-0 opacity-70" />
        <span className="truncate" title={name}>{name}</span>
      </div>
      <div className="min-w-0">
        {typeof value === 'boolean' ? (
          <div className="flex min-h-8 items-center px-2"><TodoCheckbox checked={value} label={`${name} 속성`} className="mt-0 rounded" onCheckedChange={(checked) => { try { onChange(name, checked, value); setError('') } catch (error) { setError(errorText(error)) } }} /></div>
        ) : editing ? (
          <div className="space-y-1">
            <div className="flex items-start gap-1">
              {structured ? <Textarea autoFocus {...field} className="min-h-20 flex-1 text-xs font-mono" /> : <Input autoFocus {...field} type={isDate(value) ? (String(value).includes('T') ? 'datetime-local' : 'date') : typeof value === 'number' ? 'number' : 'text'} className="h-8 min-w-0 flex-1 px-2 text-sm shadow-none" />}
              <Button unstyled aria-label={`${name} 속성 저장`} title="저장" className="grid size-8 shrink-0 place-items-center rounded hover:bg-accent" onClick={commit}><Check className="size-4" /></Button>
              <Button unstyled aria-label={`${name} 속성 편집 취소`} title="취소" className="grid size-8 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent" onClick={() => setEditing(false)}><X className="size-4" /></Button>
            </div>
            {error && <p role="alert" className="px-2 text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          <Button unstyled className="flex min-h-8 w-full min-w-0 items-center rounded px-2 py-1 text-left hover:bg-accent/60" aria-label={`${name} 속성 편집`} onClick={() => { original.current = value; setDraft(propertyDraft(value)); setError(''); setEditing(true) }}>
            <PropertyValue name={name} value={value} />
          </Button>
        )}
        {error && !editing && <p role="alert" className="px-2 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
export function NoteProperties({ properties, onChange }: {
  properties: Properties
  onChange: (name: string, value: unknown, previous: unknown) => void
}) {
  const entries = Object.entries(properties)
  if (!entries.length) return null
  return (
    <section aria-label="문서 속성" className="mb-7 border-b border-border/60 pb-5 text-sm font-normal leading-normal" data-note-properties>
      {entries.map(([name, value]) => <PropertyRow key={name} name={name} value={value} onChange={onChange} />)}
    </section>
  )
}
