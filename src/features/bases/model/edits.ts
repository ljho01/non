import { desktop } from '@/shared/api/desktop'
import { useVault } from '@/entities/vault'
import { writeProperty } from '@/shared/contracts/properties'
import type { BaseRecord } from './records'

export type PropertyEdit = { record: BaseRecord; property: string; value: unknown }
type Change = { path: string; before: string; after: string; revision: string }
/** History stores full source and expected revisions; an external edit always stops undo/redo. */
export class PropertyHistory {
  private undoStack: Change[][] = []
  private redoStack: Change[][] = []
  private running = false
  get canUndo() {
    return !!this.undoStack.length
  }
  get canRedo() {
    return !!this.redoStack.length
  }
  async apply(edits: PropertyEdit[]) {
    if (this.running) throw new Error('이전 편집을 저장하는 중입니다.')
    this.running = true
    const completed: Change[] = []
    try {
      const pending = new Map<string, { record: BaseRecord; after: string }>()
      for (const edit of edits) {
        if (edit.property.startsWith('file.') || edit.property.startsWith('formula.')) continue
        const current = pending.get(edit.record.path) ?? {
          record: edit.record,
          after: edit.record.source,
        }
        current.after = writeProperty(
          edit.record.path,
          current.after,
          edit.property.replace(/^note\./, ''),
          edit.value,
        )
        pending.set(edit.record.path, current)
      }
      for (const { record } of pending.values()) {
        this.checkTab(record.path, record.source)
        const current = await desktop.read(record.path)
        if (current.revision !== record.revision || current.content !== record.source)
          throw new Error(`${record.path}: 파일이 변경되었습니다. 최신 값으로 다시 시도하세요.`)
      }
      for (const { record, after } of pending.values()) {
        if (after === record.source) continue
        this.checkTab(record.path, record.source)
        const revision = await desktop.save(record.path, after, record.revision)
        completed.push({ path: record.path, before: record.source, after, revision })
        this.updateTab(record.path, after, revision)
      }
    } catch (error) {
      throw new Error(
        `${completed.length ? `${completed.length}개 파일은 저장되었습니다. 실행 취소할 수 있습니다. ` : ''}${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      if (completed.length) {
        this.undoStack.push(completed)
        this.undoStack = this.undoStack.slice(-50)
        this.redoStack = []
      }
      this.running = false
      await useVault.getState().refresh()
    }
  }
  private checkTab(path: string, content: string) {
    const tab = useVault.getState().tabs.find((t) => t.path === path)
    if (tab && (tab.content !== content || tab.content !== tab.saved || tab.saving))
      throw new Error(`${path}: 열린 노트의 변경 내용을 먼저 저장하세요.`)
  }
  private updateTab(path: string, content: string, revision: string) {
    useVault.setState((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, content, revision, saved: content, error: null } : t,
      ),
    }))
  }
  async travel(redo = false) {
    if (this.running) throw new Error('이전 편집을 저장하는 중입니다.')
    const from = redo ? this.redoStack : this.undoStack,
      to = redo ? this.undoStack : this.redoStack
    const changes = from.at(-1)
    if (!changes) return
    this.running = true
    const completed: Change[] = []
    try {
      // Preflight every file before the first write; each save still checks its revision.
      for (const c of changes) {
        this.checkTab(c.path, redo ? c.before : c.after)
        const data = await desktop.read(c.path)
        if (data.revision !== c.revision || data.content !== (redo ? c.before : c.after))
          throw new Error(`${c.path}: 외부 변경이 있어 실행 취소/다시 실행을 중단했습니다.`)
      }
      for (const c of [...changes]) {
        const content = redo ? c.after : c.before
        const revision = await desktop.save(c.path, content, c.revision)
        for (const batch of [...this.undoStack, ...this.redoStack])
          for (const previous of batch) if (previous.path === c.path) previous.revision = revision
        completed.push({ ...c, revision })
        changes.splice(changes.indexOf(c), 1)
        this.updateTab(c.path, content, revision)
      }
    } finally {
      if (!changes.length) from.pop()
      if (completed.length) to.push(completed)
      this.running = false
      await useVault.getState().refresh()
    }
  }
}
export function pasteValue(text: string, previous: unknown): unknown {
  if (!text) return undefined
  if (typeof previous === 'number') {
    const n = Number(text)
    if (!Number.isFinite(n)) throw new Error(`숫자가 아닙니다: ${text}`)
    return n
  }
  if (typeof previous === 'boolean') {
    if (!/^(true|false|1|0)$/i.test(text)) throw new Error(`체크박스 값이 아닙니다: ${text}`)
    return /^(true|1)$/i.test(text)
  }
  if (Array.isArray(previous)) {
    try {
      const v: unknown = JSON.parse(text)
      if (Array.isArray(v)) return v
    } catch {
      /* TSV lists can use commas. */
    }
    return text.split(',').map((v) => v.trim())
  }
  return text
}
