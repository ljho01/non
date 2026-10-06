import { useEffect, useRef, useState } from 'react'
import { useVault } from '@/entities/vault'
import { desktop, type Entry } from '@/shared/api/desktop'
import type { BaseRow } from '@/shared/contracts/base-expression'
import { readProperties, writeProperty } from '@/shared/contracts/properties'
import { BaseLink, linkPath } from '@/shared/contracts/base-values'
import { errorText } from '@/shared/lib/utils'

export type BaseRecord = BaseRow & { source: string; revision: string | null; entry: Entry }
export function recordFor(
  entry: Entry,
  source = '',
  revision: string | null = null,
  types: Record<string, string> = {},
): BaseRecord {
  const raw = ['note', 'legacy'].includes(entry.kind) ? readProperties(entry.path, source) : {}
  const typed = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(typed)
    if (typeof v === 'string' && /^\[\[.*\]\]$/.test(v))
      return new BaseLink(
        linkPath(v),
        v.slice(2, -2).includes('|') ? v.slice(2, -2).split('|').at(-1) : undefined,
      )
    return v
  }
  const properties = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => {
      if ((types[k] === 'date' || types[k] === 'datetime') && typeof v === 'string') {
        const date = new Date(v)
        if (!Number.isNaN(+date)) return [k, date]
      }
      return [k, typed(v)]
    }),
  )
  const tags = [
    ...new Set(
      [
        ...(Array.isArray(properties.tags)
          ? properties.tags.map(String)
          : typeof properties.tags === 'string'
            ? properties.tags.split(/[, ]+/)
            : []),
        ...[...source.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((m) => m[1]),
      ].map((t) => t.replace(/^#/, '')),
    ),
  ]
  const content = source.replace(/```[\s\S]*?```|`[^`]*`/g, '')
  const links = [...content.matchAll(/(?<!!)\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map((m) => m[1])
  for (const m of content.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g))
    if (!/^[a-z]+:/i.test(m[1])) links.push(decodeURI(m[1]))
  return {
    path: entry.path,
    properties,
    source,
    revision,
    entry,
    file: {
      name: entry.name,
      basename: entry.name.replace(/\.[^.]+$/, ''),
      ctime: new Date(entry.created ?? entry.modified),
      path: entry.path,
      folder: entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '',
      ext: entry.path.split('.').at(-1),
      size: entry.size,
      mtime: new Date(entry.modified),
      tags,
      links: links.map((p) => new BaseLink(p)),
      embeds: [...source.matchAll(/!\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map((m) => new BaseLink(m[1])),
      backlinks: [],
      properties,
    },
  }
}
async function readWithDeadline(path: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      desktop.read(path),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error('파일 읽기 시간이 초과되었습니다. 로컬 다운로드 상태를 확인하세요.')),
          8000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
export function useBaseRecords() {
  const root = useVault((s) => s.path)
  const entries = useVault((s) => s.entries)
  const tabs = useVault((s) => s.tabs)
  const entryVersion = JSON.stringify(entries.map((e) => [e.path, e.kind, e.modified, e.size]))
  const tabVersion = JSON.stringify(
    tabs
      .filter((t) => t.kind === 'note' || t.kind === 'legacy')
      .map((t) => [t.path, t.content, t.revision]),
  )
  const cache = useRef(new Map<string, { stamp: string; record: BaseRecord }>())
  const [state, setState] = useState<{
    records: BaseRecord[]
    warnings: string[]
    loading: boolean
  }>({ records: [], warnings: [], loading: true })
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const types = await desktop.propertyTypes().catch(() => ({}) as Record<string, string>)
      const typesVersion = JSON.stringify(types)
      const allEntries = await desktop.databaseEntries().catch(() => entries)
      const candidates = allEntries.filter((e) => e.kind !== 'folder' && e.kind !== 'transcription')
      const records: BaseRecord[] = []
      const warnings: string[] = []
      let next = 0
      let bytes = 0
      const present = new Set(candidates.map((entry) => `${root}:${entry.path}`))
      for (const key of cache.current.keys()) if (!present.has(key)) cache.current.delete(key)
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          while (next < candidates.length && !cancelled) {
            const entry = candidates[next++]
            try {
              const tab = tabs.find((t) => t.path === entry.path)
              const key = `${root}:${entry.path}`
              const stamp = `${typesVersion}:${entry.modified}:${entry.size}:${tab?.content ?? ''}:${tab?.revision ?? ''}`
              const cached = cache.current.get(key)
              bytes += ['note', 'legacy'].includes(entry.kind) ? entry.size : 0
              if (bytes > 64 * 1024 * 1024)
                throw new Error('데이터베이스의 노트 읽기 한도(64 MB)를 초과했습니다.')
              if (cached?.stamp === stamp) {
                records.push(cached.record)
                continue
              }
              const data =
                entry.kind === 'note' || entry.kind === 'legacy'
                  ? tab
                    ? { content: tab.content, revision: tab.revision }
                    : await readWithDeadline(entry.path)
                  : { content: '', revision: null }
              const record = recordFor(entry, data.content, data.revision, types)
              cache.current.set(key, { stamp, record })
              records.push(record)
            } catch (error) {
              warnings.push(`${entry.path}: ${errorText(error)}`)
            }
          }
        }),
      )
      if (!cancelled) {
        indexRecords(records)
        setState({ records, warnings, loading: false })
      }
    }
    void load().catch(error=>{if(!cancelled)setState({records:[],warnings:[errorText(error)],loading:false})})
    return () => {
      cancelled = true
    }
  }, [root, entryVersion, tabVersion])
  return state
}
export async function saveRecordProperty(record: BaseRecord, name: string, value: unknown) {
  const state = useVault.getState()
  const root = state.path
  const tab = state.tabs.find((t) => t.path === record.path)
  if (tab && tab.content !== record.source)
    throw new Error('노트가 변경되었습니다. 최신 값을 확인한 후 다시 편집하세요.')
  const next = writeProperty(record.path, record.source, name, value)
  if (tab) {
    state.edit(record.path, next)
    if (!(await state.save(record.path)))
      throw new Error(
        useVault.getState().tabs.find((t) => t.path === record.path)?.error ?? '저장 실패',
      )
  } else {
    await desktop.save(record.path, next, record.revision)
  }
  if (useVault.getState().path === root) await useVault.getState().refresh()
}

/** Resolve relative links first, then vault paths, then unambiguous basenames. */
export function indexRecords(records: BaseRecord[]) {
  const exact = new Map(records.map((r) => [r.path, r]))
  const find = (path: string) =>
    exact.get(path) ?? exact.get(`${path}.md`) ?? exact.get(`${path}.note.json`)
  for (const record of records) {
    record.resolve = (raw) => {
      const path = linkPath(raw)
      const direct = find(path)
      if (direct) return direct
      const parts = `${record.file.folder}/${path}`.split('/')
      const normalized: string[] = []
      for (const p of parts) {
        if (p === '..') normalized.pop()
        else if (p && p !== '.') normalized.push(p)
      }
      const relative = find(normalized.join('/'))
      if (relative) return relative
      const matches = records.filter((r) => r.entry.name === path || r.file.basename === path)
      return matches.length === 1 ? matches[0] : undefined
    }
    record.file.backlinks = []
  }
  for (const record of records) {
    for (const link of record.file.links as BaseLink[]) {
      const target = record.resolve?.(link.path)
      if (target) {
        const backlinks = target.file.backlinks as BaseLink[]
        if (!backlinks.some((b) => b.path === record.path))
          backlinks.push(new BaseLink(record.path))
      }
    }
  }
}
