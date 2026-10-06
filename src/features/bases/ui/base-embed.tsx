import { useEffect, useState, useRef } from 'react'
import { useVault, type OpenDocument } from '@/entities/vault'
import { desktop } from '@/shared/api/desktop'
import { parseNote, serializeNote } from '@/shared/contracts/note'
import type { BaseEmbedSpec } from '@/shared/contracts/base-embed'
import { errorText } from '@/shared/lib/utils'
import { recordFor } from '../model/records'
import { BaseEditor } from './base-editor'
export function BaseEmbed({ hostPath, spec }: { hostPath: string; spec: BaseEmbedSpec }) {
  const host = useVault((s) => s.tabs.find((t) => t.path === hostPath))
  const entries = useVault((s) => s.entries)
  const tabs = useVault((s) => s.tabs)
  const [loaded, setLoaded] = useState<OpenDocument | null>(null),
    [error, setError] = useState('')
  const queue = useRef<Promise<void>>(Promise.resolve())
  const savedRevision = useRef<string | null>(null)
  const dirty = useRef(false)
  const [target, view] = spec.target?.split('#') ?? []
  const folder = hostPath.includes('/') ? hostPath.slice(0, hostPath.lastIndexOf('/') + 1) : ''
  const path = target
    ? (entries.find((e) => e.path === folder + target)?.path ??
      entries.find((e) => e.path === target)?.path ??
      entries.find((e) => e.name === target)?.path)
    : undefined
  const open = path ? tabs.find((t) => t.path === path) : undefined
  useEffect(() => {
    let cancelled = false
    if (dirty.current) return
    setLoaded(null)
    setError('')
    if (target && !path) {
      setError(`데이터베이스를 찾을 수 없습니다: ${target}`)
      return
    }
    if (!path || open) return
    void desktop
      .read(path)
      .then((data) => {
        if (!cancelled) {
          savedRevision.current = data.revision
          setLoaded({
            path,
            kind: 'base',
            ...data,
            saved: data.content,
            saving: false,
            error: null,
            page: 1,
            pdfText: '',
          })
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e))
      })
    return () => {
      cancelled = true
    }
  }, [path, target, open?.path, entries.find((e) => e.path === path)?.modified])
  if (!host) return null
  const hostEntry = entries.find((e) => e.path === hostPath)
  const hostRow = hostEntry ? recordFor(hostEntry, host.content, host.revision) : undefined
  const document =
    spec.source !== undefined
      ? { ...host, path: `${hostPath}#base`, kind: 'base' as const, content: spec.source }
      : (open ?? loaded)
  const update = (content: string) => {
    setError('')
    if (spec.source !== undefined) {
      const current = useVault.getState().tabs.find((t) => t.path === hostPath)
      if (!current) throw new Error('노트가 닫혔습니다.')
      if (spec.blockId) {
        const note = parseNote(current.content)
        const block = note.blocks.find((b) => b.id === spec.blockId)
        if (!block || block.text !== spec.source)
          throw new Error('블록이 변경되었습니다. 다시 시도하세요.')
        block.text = content
        if (block.content && typeof block.content === 'object')
          block.content = { ...block.content, content: [{ type: 'text', text: content }] }
        useVault.getState().edit(hostPath, serializeNote(note))
      } else {
        if (current.content !== host.content)
          throw new Error('노트가 변경되었습니다. 다시 시도하세요.')
        const eol = current.content.includes('\r\n') ? '\r\n' : '\n'
        const fenced =
          '```base' +
          eol +
          content.replace(/\r?\n/g, eol).replace(/(?:\r?\n)*$/, '') +
          eol +
          '```' +
          eol
        useVault
          .getState()
          .edit(
            hostPath,
            current.content.slice(0, spec.start) + fenced + current.content.slice(spec.end),
          )
      }
    } else if (open) useVault.getState().edit(open.path, content)
    else if (loaded) {
      const path = loaded.path
      dirty.current = true
      setLoaded((v) => (v ? { ...v, content, saving: true } : v))
      queue.current = queue.current
        .then(async () => {
          const revision = await desktop.save(path, content, savedRevision.current)
          savedRevision.current = revision
          setLoaded((v) => {
            if (!v) return v
            dirty.current = v.content !== content
            return { ...v, saved: content, revision, saving: dirty.current }
          })
          void useVault.getState().refresh()
        })
        .catch((e) => {
          setError(errorText(e))
          setLoaded((v) => (v ? { ...v, saving: false } : v))
        })
    }
  }
  return (
    <div className="my-4 w-full text-left" contentEditable={false}>
      {error && (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {document ? (
        <BaseEditor
          document={document}
          embedded
          hostRow={hostRow}
          initialView={view}
          onContentChange={update}
        />
      ) : (
        !error && <p className="text-xs text-muted-foreground">데이터베이스 여는 중…</p>
      )}
    </div>
  )
}
