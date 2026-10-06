import { createBase, parseBase } from '@/shared/contracts/base'
import { create } from 'zustand'
import { debounce } from 'es-toolkit'
import { desktop, type Entry } from '@/shared/api/desktop'
import { errorText } from '@/shared/lib/utils'
import { reorderById } from '@/shared/lib/reorder'
import {
  createNote,
  displayFilename,
  duplicateNote,
  parseNote,
  noteFilename,
  parentFolder,
  serializeNote,
} from '@/shared/contracts/note'
import {
  canvasFilename,
  createCanvas,
  parseCanvas,
  serializeCanvas,
} from '@/shared/contracts/canvas'

export type DocumentFormat = 'json' | 'markdown' | 'canvas' | 'base'

export type OpenDocument = {
  path: string
  kind: 'note' | 'canvas' | 'base' | 'pdf' | 'legacy'
  content: string
  saved: string
  revision: string | null
  saving: boolean
  error: string | null
  page: number
  pdfText: string
}
type Vault = {
  path: string | null
  entries: Entry[]
  tabs: OpenDocument[]
  active: string | null
  selectedFolder: string
  selectFolder: (path: string) => void
  error: string | null
  loading: boolean
  openVault: (path: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  refresh: () => Promise<void>
  edit: (path: string, content: string) => void
  save: (path: string) => Promise<boolean>
  close: (path: string) => Promise<void>
  reorderTab: (path: string, toIndex: number) => void
  createNote: (path: string, content?: string) => Promise<void>
  createUntitled: (format?: DocumentFormat, folder?: string) => Promise<string>
  createUntitledFolder: (parent?: string) => Promise<string>
  saveCopy: (path: string) => Promise<void>
  archive: (path: string) => Promise<void>
  trash: (path: string) => Promise<void>
  rename: (path: string, name: string) => Promise<string>
  move: (path: string, targetFolder: string) => Promise<string>
  updatePdf: (path: string, page: number, text: string) => void
  setError: (error: string | null) => void
}
const delayed = new Map<string, ReturnType<typeof debounce>>()
const saves = new Map<string, Promise<boolean>>()
let refreshGeneration = 0

function movedPath(entryPath: string, path: string, nextPath: string) {
  if (entryPath === path) return nextPath
  if (entryPath.startsWith(`${path}/`)) return `${nextPath}${entryPath.slice(path.length)}`
  return entryPath
}

function moveEntryPaths(entries: Entry[], path: string, nextPath: string) {
  return entries.map((entry) => {
    const moved = movedPath(entry.path, path, nextPath)
    return moved === entry.path
      ? entry
      : { ...entry, path: moved, name: moved.split('/').at(-1) ?? entry.name }
  })
}

function rememberTabs(path: string, tabs: OpenDocument[], active: string | null) {
  localStorage.setItem(
    `non-tabs:${path}`,
    JSON.stringify({ paths: tabs.map((t) => t.path), active }),
  )
}
export const useVault = create<Vault>((set, get) => ({
  path: null,
  entries: [],
  tabs: [],
  active: null,
  selectedFolder: '',
  selectFolder: (selectedFolder) => set({ selectedFolder }),
  error: null,
  loading: false,
  setError: (error) => set({ error }),
  openVault: async (path) => {
    if (get().loading) return
    for (const tab of get().tabs)
      if (!(await get().save(tab.path)))
        throw new Error('저장하지 못한 문서가 있습니다. 복사본을 저장한 후 폴더를 바꿔 주세요.')
    set({ loading: true, error: null })
    try {
      refreshGeneration += 1
      const data = await desktop.open(path)
      delayed.forEach((timer) => timer.cancel())
      delayed.clear()
      set({ path: data.path, entries: data.entries, tabs: [], active: null, selectedFolder: '' })
      const previous = localStorage.getItem(`non-tabs:${data.path}`)
      if (previous) {
        const saved = JSON.parse(previous) as { paths: string[]; active: string | null }
        for (const item of saved.paths.slice(0, 20))
          if (data.entries.some((e) => e.path === item)) await get().openFile(item)
        if (saved.active && get().tabs.some((t) => t.path === saved.active))
          set({ active: saved.active, selectedFolder: parentFolder(saved.active) })
      }
    } finally {
      set({ loading: false })
    }
  },
  openFile: async (path) => {
    const root = get().path
    if (!root) return
    if (get().tabs.some((t) => t.path === path)) {
      set({ active: path, selectedFolder: parentFolder(path) })
      rememberTabs(root, get().tabs, path)
      return
    }
    const kind = path.toLowerCase().endsWith('.base') ? 'base' : path.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : path.toLowerCase().endsWith('.md')
        ? 'legacy'
        : path.toLowerCase().endsWith('.excalidraw')
          ? 'canvas'
          : 'note'
    const data = kind !== 'pdf' ? await desktop.read(path) : { content: '', revision: null }
    if (get().path !== root) return
    set((s) => ({
      active: path,
      selectedFolder: parentFolder(path),
      tabs: s.tabs.some((t) => t.path === path)
        ? s.tabs
        : [
            ...s.tabs,
            {
              path,
              kind,
              ...data,
              saved: data.content,
              saving: false,
              error: null,
              page: 1,
              pdfText: '',
            },
          ],
    }))
    rememberTabs(root, get().tabs, path)
  },
  edit: (path, content) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab || tab.kind === 'pdf' || tab.content === content) return
    set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, content } : t)) }))
    let timer = delayed.get(path)
    if (!timer) {
      timer = debounce(() => {
        void get().save(path)
      }, 650)
      delayed.set(path, timer)
    }
    timer()
  },
  save: async (path) => {
    if (saves.has(path)) {
      await saves.get(path)
      return get().save(path)
    }
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab || tab.kind === 'pdf' || tab.content === tab.saved) return true
    const operation = (async () => {
      set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, saving: true } : t)) }))
      try {
        if (tab.kind === 'note') parseNote(tab.content)
        if (tab.kind === 'canvas') parseCanvas(tab.content)
        if (tab.kind === 'base') parseBase(tab.content)
        const revision = await desktop.save(path, tab.content, tab.revision)
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.path === path
              ? { ...t, saved: tab.content, revision, saving: false, error: null }
              : t,
          ),
        }))
        return true
      } catch (error) {
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.path === path ? { ...t, saving: false, error: errorText(error) } : t,
          ),
        }))
        return false
      }
    })()
    saves.set(path, operation)
    const result = await operation
    saves.delete(path)
    return result
  },
  close: async (path) => {
    delayed.get(path)?.cancel()
    if (!(await get().save(path))) return
    if (
      get().tabs.find((t) => t.path === path)?.content !==
      get().tabs.find((t) => t.path === path)?.saved
    )
      return
    set((s) => {
      const index = s.tabs.findIndex((t) => t.path === path)
      const tabs = s.tabs.filter((t) => t.path !== path)
      return {
        tabs,
        selectedFolder:
          s.active === path
            ? parentFolder(tabs[Math.min(index, tabs.length - 1)]?.path ?? '')
            : s.selectedFolder,
        active:
          s.active === path ? (tabs[Math.min(index, tabs.length - 1)]?.path ?? null) : s.active,
      }
    })
    if (get().path) rememberTabs(get().path!, get().tabs, get().active)
  },
  reorderTab: (path, toIndex) => {
    set((state) => ({
      tabs: reorderById(state.tabs, path, toIndex, (tab) => tab.path),
    }))
    const root = get().path
    if (root) rememberTabs(root, get().tabs, get().active)
  },
  createNote: async (path, content) => {
    const markdown = /\.md$/i.test(path)
    const canvas = /\.excalidraw$/i.test(path)
    const base = /\.base$/i.test(path)
    const value =
      content ??
      (base ? createBase() : markdown
        ? `# ${displayFilename(path)}\n\n`
        : canvas
          ? serializeCanvas(createCanvas())
          : serializeNote(createNote(displayFilename(path))))
    if (base) parseBase(value)
    else if (canvas) parseCanvas(value)
    else if (!markdown) parseNote(value)
    await desktop.save(path, value, null)
    await get().refresh()
    await get().openFile(path)
  },
  createUntitled: async (format = 'json', parent) => {
    const folder = parent ?? get().selectedFolder
    for (let number = 1; number <= 10_000; number += 1) {
      const title = number === 1 ? 'Untitled' : `Untitled ${number}`
      const filename = format === 'base' ? `${title}.base` : format === 'canvas' ? canvasFilename(title) : noteFilename(title, format)
      const path = `${folder ? `${folder}/` : ''}${filename}`
      const occupied =
        get().entries.some((entry) => entry.path === path) ||
        get().tabs.some((tab) => tab.path === path)
      if (occupied) continue
      try {
        await get().createNote(
          path,
          format === 'base' ? createBase() : format === 'markdown'
            ? ''
            : format === 'canvas'
              ? serializeCanvas(createCanvas())
              : serializeNote(createNote('')),
        )
        return path
      } catch (error) {
        if (errorText(error).includes('CONFLICT')) continue
        throw error
      }
    }
    throw new Error('Untitled 노트 이름을 만들 수 없습니다.')
  },
  createUntitledFolder: async (parent) => {
    const folder = parent ?? get().selectedFolder
    for (let number = 1; number <= 10_000; number += 1) {
      const name = number === 1 ? 'Untitled folder' : `Untitled folder ${number}`
      const path = `${folder ? `${folder}/` : ''}${name}`
      if (get().entries.some((entry) => entry.path === path)) continue
      try {
        await desktop.createFolder(path)
        await get().refresh()
        get().selectFolder(path)
        return path
      } catch (error) {
        if (errorText(error).includes('CONFLICT')) continue
        throw error
      }
    }
    throw new Error('Untitled 폴더 이름을 만들 수 없습니다.')
  },
  saveCopy: async (path) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab) return
    if (tab.kind === 'pdf') return
    const extension =
      tab.kind === 'base' ? '.base' : tab.kind === 'legacy' ? '.md' : tab.kind === 'canvas' ? '.excalidraw' : '.note.json'
    const copyPath = path.replace(
      /(?:\.note)?\.json$|\.md$|\.excalidraw$|\.base$/i,
      ` (복사본 ${crypto.randomUUID().slice(0, 8)})${extension}`,
    )
    await get().createNote(
      copyPath,
      tab.kind === 'note'
        ? serializeNote(duplicateNote(parseNote(tab.content)))
        : tab.content,
    )
    // The original may have been removed externally. Retire the buffer only
    // after its exact contents are safely copied, without reading the old file.
    if (get().tabs.find((t) => t.path === path)?.content === tab.content) {
      delayed.get(path)?.cancel()
      set((s) => ({ tabs: s.tabs.filter((t) => t.path !== path) }))
      if (get().path) rememberTabs(get().path!, get().tabs, get().active)
    }
  },
  archive: async (path) => {
    const root = get().path
    if (!root) return
    const isInside = (entryPath: string) => entryPath === path || entryPath.startsWith(`${path}/`)
    const affected = get().tabs.filter((tab) => isInside(tab.path)).map((tab) => tab.path)
    for (const tabPath of affected) {
      delayed.get(tabPath)?.cancel()
      delayed.delete(tabPath)
      if (!(await get().save(tabPath)))
        throw new Error('저장하지 못한 변경이 있어 보관하지 못했습니다.')
    }
    await desktop.archive(path)
    if (get().path !== root) return
    set((state) => {
      const tabs = state.tabs.filter((tab) => !isInside(tab.path))
      const active = state.active && isInside(state.active) ? (tabs.at(-1)?.path ?? null) : state.active
      return {
        tabs,
        active,
        selectedFolder: isInside(state.selectedFolder) ? parentFolder(path) : state.selectedFolder,
      }
    })
    await get().refresh()
    if (get().path) rememberTabs(get().path!, get().tabs, get().active)
  },
  trash: async (path) => {
    const root = get().path
    if (!root) return
    const isInside = (entryPath: string) => entryPath === path || entryPath.startsWith(`${path}/`)
    const affected = get().tabs.filter((tab) => isInside(tab.path)).map((tab) => tab.path)
    for (const tabPath of affected) {
      delayed.get(tabPath)?.cancel()
      delayed.delete(tabPath)
      if (!(await get().save(tabPath)))
        throw new Error('저장하지 못한 변경이 있어 휴지통으로 이동하지 못했습니다.')
    }
    await desktop.trash(path)
    if (get().path !== root) return
    set((s) => {
      const tabs = s.tabs.filter((t) => !isInside(t.path))
      const active = s.active && isInside(s.active) ? (tabs.at(-1)?.path ?? null) : s.active
      return {
        tabs,
        active,
        selectedFolder: isInside(s.selectedFolder) ? parentFolder(path) : s.selectedFolder,
      }
    })
    await get().refresh()
    if (get().path) rememberTabs(get().path!, get().tabs, get().active)
  },
  rename: async (path, name) => {
    const root = get().path
    if (!root) return path
    // Flush every open descendant before a folder rename so no autosave can
    // race the filesystem move using an obsolete path.
    const isInside = (entryPath: string) => entryPath === path || entryPath.startsWith(`${path}/`)
    const affected = get().tabs.filter((tab) => isInside(tab.path)).map((tab) => tab.path)
    for (const tabPath of affected) {
      delayed.get(tabPath)?.cancel()
      delayed.delete(tabPath)
      if (!(await get().save(tabPath)))
        throw new Error('저장하지 못한 변경이 있어 이름을 바꾸지 못했습니다.')
    }
    const next = await desktop.rename(path, name)
    if (get().path !== root || next === path) return next
    // Invalidate any list request that started before the filesystem rename,
    // then update paths immediately so the tree never flashes stale or empty.
    refreshGeneration += 1
    const moved = (entryPath: string) => movedPath(entryPath, path, next)
    set((s) => ({
      entries: moveEntryPaths(s.entries, path, next),
      tabs: s.tabs.map((tab) =>
        moved(tab.path) === tab.path ? tab : { ...tab, path: moved(tab.path) },
      ),
      active: s.active ? moved(s.active) : s.active,
      selectedFolder: moved(s.selectedFolder),
    }))
    void get().refresh()
    if (get().path) rememberTabs(get().path!, get().tabs, get().active)
    return next
  },
  move: async (path, targetFolder) => {
    const root = get().path
    if (!root) return path
    const isInside = (entryPath: string) => entryPath === path || entryPath.startsWith(`${path}/`)
    const affected = get().tabs.filter((tab) => isInside(tab.path)).map((tab) => tab.path)
    for (const tabPath of affected) {
      delayed.get(tabPath)?.cancel()
      delayed.delete(tabPath)
      if (!(await get().save(tabPath)))
        throw new Error('저장하지 못한 변경이 있어 항목을 이동하지 못했습니다.')
    }
    const next = await desktop.move(path, targetFolder)
    if (get().path !== root || next === path) return next
    const moved = (entryPath: string) =>
      entryPath === path
        ? next
        : entryPath.startsWith(`${path}/`)
          ? `${next}${entryPath.slice(path.length)}`
          : entryPath
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        moved(tab.path) === tab.path ? tab : { ...tab, path: moved(tab.path) },
      ),
      active: state.active ? moved(state.active) : state.active,
      selectedFolder: moved(state.selectedFolder),
    }))
    await get().refresh()
    if (get().path) rememberTabs(get().path!, get().tabs, get().active)
    return next
  },
  refresh: async () => {
    const root = get().path
    if (!root || get().loading) return
    const generation = ++refreshGeneration
    try {
      const entries = await desktop.list()
      if (get().path !== root || generation !== refreshGeneration) return
      set({ entries })
      for (const tab of get().tabs.filter(
        (t) => t.kind !== 'pdf' && t.content === t.saved && !t.saving,
      )) {
        if (!entries.some((e) => e.path === tab.path)) continue
        const data = await desktop.read(tab.path)
        if (get().path !== root || generation !== refreshGeneration) return
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.path === tab.path && t.content === t.saved && !t.saving
              ? { ...t, ...data, saved: data.content }
              : t,
          ),
        }))
      }
    } catch (error) {
      set({ error: errorText(error) })
    }
  },
  updatePdf: (path, page, pdfText) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, page, pdfText } : t)) })),
}))
