import { useEffect, useMemo, useRef, useState } from 'react'
import { useVault } from '@/entities/vault'
import { desktop } from '@/shared/api/desktop'
import { displayFilename, parseNote, serializeNote } from '@/shared/contracts/note'
import { noteTodos, setNoteTodoChecked, type NoteTodo } from '@/shared/contracts/todo'
import { Button } from '@/shared/ui/button'
import { TodoCheckbox } from '@/shared/ui/todo-checkbox'
import { cn, errorText } from '@/shared/lib/utils'
import { useI18n } from '@/shared/lib/i18n'

type TodoDocument = { title: string; todos: NoteTodo[] }
function readTodos(content: string): TodoDocument {
  const note = parseNote(content)
  return { title: note.title, todos: noteTodos(note) }
}
type TodoRow = NoteTodo & { path: string; title: string }
// Keep the document's nested hierarchy: children stay under their parent and
// each sibling level lists unchecked items first.
function treeTodos(todos: NoteTodo[], path: string, title: string): TodoRow[] {
  const roots: TodoRow[] = []
  const stack: TodoRow[] = []
  const children = new Map<TodoRow, TodoRow[]>()
  for (const todo of todos) {
    const row: TodoRow = { ...todo, path, title }
    stack.length = row.depth
    const parent = stack[row.depth - 1]
    if (parent) {
      const list = children.get(parent) ?? []
      list.push(row)
      children.set(parent, list)
    } else {
      roots.push(row)
    }
    stack[row.depth] = row
  }
  const rows: TodoRow[] = []
  const visit = (items: TodoRow[]) => {
    items.sort((a, b) => Number(a.checked) - Number(b.checked))
    for (const item of items) {
      rows.push(item)
      visit(children.get(item) ?? [])
    }
  }
  visit(roots)
  return rows
}
export function TasksPanel({ onOpen }: { onOpen: (path: string) => void }) {
  const { t } = useI18n()
  const root = useVault((s) => s.path)
  const entries = useVault((s) => s.entries)
  const tabs = useVault((s) => s.tabs)
  const [documents, setDocuments] = useState<Record<string, TodoDocument>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scanError, setScanError] = useState('')
  const cache = useRef(new Map<string, { signature: string; document: TodoDocument }>())
  const [pending, setPending] = useState<string | null>(null)
  const busy = useRef(false)
  const previousTabs = useRef(tabs)
  const [scanEpoch, setScanEpoch] = useState(0)
  useEffect(() => {
    const closed = previousTabs.current.filter(
      (tab) => tab.kind === 'note' && !tabs.some((open) => open.path === tab.path),
    )
    previousTabs.current = tabs
    if (!closed.length) return
    setDocuments((current) => {
      const next = { ...current }
      for (const tab of closed) {
        cache.current.delete(`${root}:${tab.path}`)
        try {
          next[tab.path] = readTodos(tab.content)
        } catch {
          delete next[tab.path]
        }
      }
      return next
    })
    setScanEpoch((value) => value + 1)
  }, [tabs, root])
  useEffect(() => {
    let alive = true
    setLoading(true)
    const activePaths = new Set(entries.map((entry) => `${root}:${entry.path}`))
    for (const key of cache.current.keys()) if (!activePaths.has(key)) cache.current.delete(key)
    void (async () => {
      const next: Record<string, TodoDocument> = {}
      const failures: string[] = []
      // Bound IPC concurrency when a workspace contains many documents.
      const queue = entries.filter((entry) => entry.kind === 'note')
      let cursor = 0
      await Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (cursor < queue.length && alive) {
            const entry = queue[cursor++]
            try {
              const key = `${root}:${entry.path}`
              const signature = `${entry.modified}:${entry.size}`
              const cached = cache.current.get(key)
              if (cached?.signature === signature) next[entry.path] = cached.document
              else {
                const document = readTodos((await desktop.read(entry.path)).content)
                next[entry.path] = document
                if (alive) cache.current.set(key, { signature, document })
              }
            } catch {
              failures.push(entry.path)
            }
          }
        }),
      )
      if (alive) {
        setDocuments(next)
        setLoading(false)
        setScanError(failures.length ? `${t('읽지 못한 문서')}: ${failures.join(', ')}` : '')
      }
    })()
    return () => {
      alive = false
    }
  }, [root, entries, t, scanEpoch])
  const rows = useMemo(() => {
    const live = { ...documents }
    for (const tab of tabs) {
      if (tab.kind !== 'note') continue
      try {
        live[tab.path] = readTodos(tab.content)
      } catch {
        delete live[tab.path]
      }
    }
    return entries.flatMap((entry) =>
      treeTodos(
        live[entry.path]?.todos ?? [],
        entry.path,
        live[entry.path]?.title || displayFilename(entry.path),
      ),
    )
  }, [documents, tabs, entries])
  const toggle = async (path: string, id: string, checked: boolean) => {
    if (busy.current) return
    busy.current = true
    setPending(`${path}:${id}`)
    setError('')
    try {
      const state = useVault.getState()
      if (state.path !== root) return
      const tab = state.tabs.find((item) => item.path === path)
      if (tab) {
        const content = serializeNote(setNoteTodoChecked(parseNote(tab.content), id, checked))
        state.edit(path, content)
        if (!(await state.save(path)))
          throw new Error(
            useVault.getState().tabs.find((item) => item.path === path)?.error ||
              t('저장하지 못했습니다.'),
          )
      } else {
        const original = await desktop.read(path)
        // A file may have been opened while the read was in flight. Prefer its current buffer.
        const opened = useVault.getState().tabs.find((item) => item.path === path)
        if (useVault.getState().path !== root) return
        if (opened) {
          state.edit(
            path,
            serializeNote(setNoteTodoChecked(parseNote(opened.content), id, checked)),
          )
          if (!(await state.save(path))) throw new Error(t('저장하지 못했습니다.'))
        } else {
          const content = serializeNote(
            setNoteTodoChecked(parseNote(original.content), id, checked),
          )
          await desktop.save(path, content, original.revision)
          if (useVault.getState().path === root)
            setDocuments((current) => ({ ...current, [path]: readTodos(content) }))
        }
      }
      cache.current.delete(`${root}:${path}`)
      setScanEpoch((value) => value + 1)
      await useVault.getState().refresh()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      busy.current = false
      setPending(null)
    }
  }
  return (
    <section aria-label="Task" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
      {(error || scanError) && (
        <p role="alert" className="px-2 py-2 text-xs text-destructive">
          {error || scanError}
        </p>
      )}
      {!rows.length && (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          {loading ? t('할 일 불러오는 중…') : t('할 일이 없습니다.')}
        </p>
      )}
      {rows.map((row) => (
        <div
          key={`${row.path}:${row.id}`}
          className="flex items-start gap-2 rounded-lg py-2 pr-2 hover:bg-accent"
          style={{ paddingLeft: 8 + row.depth * 24 }}
        >
          <TodoCheckbox
            checked={row.checked}
            label={row.text || t('빈 할 일')}
            disabled={pending !== null}
            onCheckedChange={(checked) => void toggle(row.path, row.id, checked)}
          />
          <Button
            unstyled
            onClick={() => onOpen(row.path)}
            title={row.path}
            className="min-w-0 flex-1 text-left text-sm"
          >
            <span
              className={cn(
                'block break-words',
                row.checked && 'text-muted-foreground line-through',
              )}
            >
              {row.text || t('빈 할 일')}
            </span>
            <span className="block truncate text-2xs text-muted-foreground">{row.title}</span>
          </Button>
        </div>
      ))}
    </section>
  )
}
