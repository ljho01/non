import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { detectAppLanguage, type AppLanguage } from '@/shared/lib/i18n'
export type SidebarSection = 'recent' | 'favorites' | 'files'
export const SIDEBAR_SECTIONS: SidebarSection[] = ['recent', 'favorites', 'files']

export function reorderSidebarSections(
  order: SidebarSection[],
  hidden: SidebarSection[],
  section: SidebarSection,
  targetIndex: number,
) {
  const visible = order.filter((item) => !hidden.includes(item))
  const from = visible.indexOf(section)
  if (from < 0 || targetIndex < 0 || targetIndex >= visible.length || from === targetIndex)
    return order
  visible.splice(from, 1)
  visible.splice(targetIndex, 0, section)
  let index = 0
  return order.map((item) => hidden.includes(item) ? item : visible[index++])
}

export type Theme = 'light' | 'dark' | 'system'
export type RecentDocument = {
  root: string
  path: string
  title: string
  kind: 'note' | 'canvas' | 'base' | 'legacy' | 'pdf' | 'transcription'
  openedAt: number
}
export type FavoriteItem = {
  root: string
  path: string
  addedAt: number
}

const RECENT_DOCUMENT_LIMIT = 12
const RECENT_DOCUMENT_STABLE_COUNT = 5

export function addFolderRoot(roots: string[], path: string) {
  return roots.includes(path) ? roots : [...roots, path]
}

export function addRecentDocument(documents: RecentDocument[], document: RecentDocument) {
  const existingIndex = documents.findIndex(
    (item) => item.root === document.root && item.path === document.path,
  )

  if (existingIndex >= 0 && existingIndex < RECENT_DOCUMENT_STABLE_COUNT) {
    return documents
      .map((item, index) => (index === existingIndex ? document : item))
      .slice(0, RECENT_DOCUMENT_LIMIT)
  }

  return [
    document,
    ...documents.filter(
      (item) => !(item.root === document.root && item.path === document.path),
    ),
  ].slice(0, RECENT_DOCUMENT_LIMIT)
}

export function moveRecentDocuments(
  documents: RecentDocument[],
  root: string,
  path: string,
  nextPath: string,
) {
  return documents.map((document) => {
    if (document.root !== root) return document
    if (document.path === path) return { ...document, path: nextPath }
    if (document.path.startsWith(`${path}/`))
      return { ...document, path: `${nextPath}${document.path.slice(path.length)}` }
    return document
  })
}

export function pruneMissingRecentDocuments(
  documents: RecentDocument[],
  root: string,
  existingPaths: ReadonlySet<string>,
) {
  const next = documents.filter(
    (document) => document.root !== root || existingPaths.has(document.path),
  )
  return next.length === documents.length ? documents : next
}

export function toggleFavoriteItem(
  items: FavoriteItem[],
  root: string,
  path: string,
  addedAt = Date.now(),
) {
  const exists = items.some((item) => item.root === root && item.path === path)
  if (exists)
    return items.filter((item) => !(item.root === root && item.path === path))
  return [{ root, path, addedAt }, ...items]
}

export function moveFavoriteItems(
  items: FavoriteItem[],
  root: string,
  path: string,
  nextPath: string,
) {
  return items.map((item) => {
    if (item.root !== root) return item
    if (item.path === path) return { ...item, path: nextPath }
    if (item.path.startsWith(`${path}/`))
      return { ...item, path: `${nextPath}${item.path.slice(path.length)}` }
    return item
  })
}

export function pruneMissingFavoriteItems(
  items: FavoriteItem[],
  root: string,
  existingPaths: ReadonlySet<string>,
) {
  const next = items.filter((item) => item.root !== root || existingPaths.has(item.path))
  return next.length === items.length ? items : next
}

type Settings = {
  theme: Theme
  language: AppLanguage
  lastVault: string | null
  folderRoots: string[]
  recentDocuments: RecentDocument[]
  favoriteItems: FavoriteItem[]
  selectedModel: string
  agentSandbox: boolean
  showSidebar: boolean
  showChat: boolean
  sidebarSectionOrder: SidebarSection[]
  hiddenSidebarSections: SidebarSection[]
  setSidebarSectionVisible: (section: SidebarSection, visible: boolean) => void
  reorderSidebarSection: (section: SidebarSection, targetIndex: number) => void
  sidebarWidth: number
  assistantWidth: number
  setTheme: (theme: Theme) => void
  setLanguage: (language: AppLanguage) => void
  rememberFolder: (path: string) => void
  rememberRecentDocument: (document: RecentDocument) => void
  moveRecentDocuments: (root: string, path: string, nextPath: string) => void
  pruneRecentDocuments: (root: string, existingPaths: ReadonlySet<string>) => void
  toggleFavorite: (root: string, path: string) => void
  moveFavoriteItems: (root: string, path: string, nextPath: string) => void
  pruneFavoriteItems: (root: string, existingPaths: ReadonlySet<string>) => void
  patch: (
    settings: Partial<
      Pick<
        Settings,
        | 'selectedModel'
        | 'language'
        | 'agentSandbox'
        | 'showSidebar'
        | 'showChat'
        | 'sidebarWidth'
        | 'assistantWidth'
      >
    >,
  ) => void
}
export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'system',
      language: detectAppLanguage(),
      lastVault: null,
      folderRoots: [],
      recentDocuments: [],
      favoriteItems: [],
      selectedModel: '',
      agentSandbox: true,
      showSidebar: true,
      showChat: true,
      sidebarSectionOrder: SIDEBAR_SECTIONS,
      hiddenSidebarSections: [],
      setSidebarSectionVisible: (section, visible) =>
        set((settings) => ({
          hiddenSidebarSections: visible
            ? settings.hiddenSidebarSections.filter((item) => item !== section)
            : [...new Set([...settings.hiddenSidebarSections, section])],
        })),
      reorderSidebarSection: (section, targetIndex) =>
        set((settings) => ({
          sidebarSectionOrder: reorderSidebarSections(
            settings.sidebarSectionOrder, settings.hiddenSidebarSections, section, targetIndex,
          ),
        })),
      sidebarWidth: 252,
      assistantWidth: 344,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      rememberFolder: (path) =>
        set((settings) => ({
          lastVault: path,
          folderRoots: addFolderRoot(settings.folderRoots, path),
        })),
      rememberRecentDocument: (document) =>
        set((settings) => ({
          recentDocuments: addRecentDocument(settings.recentDocuments, document),
        })),
      moveRecentDocuments: (root, path, nextPath) =>
        set((settings) => ({
          recentDocuments: moveRecentDocuments(settings.recentDocuments, root, path, nextPath),
        })),
      pruneRecentDocuments: (root, existingPaths) =>
        set((settings) => ({
          recentDocuments: pruneMissingRecentDocuments(
            settings.recentDocuments,
            root,
            existingPaths,
          ),
        })),
      toggleFavorite: (root, path) =>
        set((settings) => ({
          favoriteItems: toggleFavoriteItem(settings.favoriteItems, root, path),
        })),
      moveFavoriteItems: (root, path, nextPath) =>
        set((settings) => ({
          favoriteItems: moveFavoriteItems(settings.favoriteItems, root, path, nextPath),
        })),
      pruneFavoriteItems: (root, existingPaths) =>
        set((settings) => ({
          favoriteItems: pruneMissingFavoriteItems(settings.favoriteItems, root, existingPaths),
        })),
      patch: (settings) => set(settings),
    }),
    { name: 'non-settings-v1' },
  ),
)
