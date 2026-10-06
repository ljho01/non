import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  FilePlus2,
  FileText,
  FileJson2,
  FileCode2,
  Folder,
  FolderOpen,
  FolderPlus,
  Import,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Star,
  Settings2,
  X,
  ArrowUpRight,
  Archive,
  ChevronDown,
  File,
  Loader2,
  Pencil,
  AudioWaveform,
  Canvas,
  ListTodo,
  Database,
} from '@/shared/ui/icon'
import { useVault, type DocumentFormat, type OpenDocument } from '@/entities/vault'
import { useSettings, type RecentDocument, SIDEBAR_SECTIONS } from '@/entities/settings'
import { useAgent } from '@/entities/agent'
import { useTranscription } from '@/entities/transcription'
import { TasksPanel } from '@/features/tasks'
import { Preferences } from '@/features/preferences'
import { MemoryManager } from '@/features/memory'
import { TranscriptionCreateDialog } from '@/features/transcription'
import { DocumentSearchDialog, NoteLinks } from '@/features/knowledge-index'
import { AssistantPanel } from '@/widgets/assistant'
import { TranscriptionSessionPanel } from '@/widgets/transcription-session'
import { LiveTranscriptionFooter } from './live-transcription-footer'
import { TreeDocumentIcon } from './tree-document-icon'
import { SortableSidebarSection } from './sortable-sidebar-section'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Tip } from '@/shared/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
import { desktop, isDesktop, isNativeIOS, type Entry } from '@/shared/api/desktop'
import { cn, errorText } from '@/shared/lib/utils'
import { PointerSensorPlugin } from '@/shared/lib/pointer-sensor'
import { RestrictToHorizontalAxis } from '@/shared/lib/restrict-to-horizontal-axis'
import { displayFilename, noteCover, parseNote, type NoteCoverId } from '@/shared/contracts/note'
import type { TranscriptionSession } from '@/shared/contracts/transcription'
import {
  documentTabTitle,
  modWActionForTabCount,
  workspaceTabTargetForShortcut,
} from '../-model/document-tabs'
import { sidebarVisibilityForResize } from '../-model/sidebar-resize'
import { getTabbarOverflow } from '../-model/tabbar-overflow'
import { useI18n } from '@/shared/lib/i18n'

const DOCUMENT_TAB_HOTKEYS = [
  'Mod+1',
  'Mod+2',
  'Mod+3',
  'Mod+4',
  'Mod+5',
  'Mod+6',
  'Mod+7',
  'Mod+8',
  'Mod+9',
] as const

const LazyNoteEditor = lazy(() =>
  import('@/features/note-editor').then((m) => ({ default: m.NoteEditor })),
)
const LazyPdfReader = lazy(() =>
  import('@/features/pdf-reader').then((m) => ({ default: m.PdfReader })),
)
const LazyBaseEditor = lazy(() =>
  import('@/features/bases').then((m) => ({ default: m.BaseEditor })),
)
const LazyBaseEmbed = lazy(() => import('@/features/bases').then(m => ({ default: m.BaseEmbed })))
const LazyCanvasEditor = lazy(() =>
  import('@/features/canvas-editor').then((m) => ({ default: m.CanvasEditor })),
)
function NoteEditor(props: { document: OpenDocument }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col items-center justify-center p-9 pb-24">
          편집기 여는 중…
        </div>
      }
    >
      <LazyNoteEditor
        {...props}
        renderBase={(spec) => (
          <Suspense fallback={<p className="text-xs text-muted-foreground">데이터베이스 여는 중…</p>}>
            <LazyBaseEmbed hostPath={props.document.path} spec={spec} />
          </Suspense>
        )}
      />
    </Suspense>
  )
}
function PdfReader(props: { document: OpenDocument }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col items-center justify-center p-9 pb-24">
          PDF 여는 중…
        </div>
      }
    >
      <LazyPdfReader {...props} />
    </Suspense>
  )
}
function CanvasEditor(props: { document: OpenDocument }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col items-center justify-center p-9 pb-24">
          캔버스 여는 중…
        </div>
      }
    >
      <LazyCanvasEditor {...props} />
    </Suspense>
  )
}

type DocumentTabDragData = Record<string, unknown> & {
  type: 'document-tab'
  path: string
}

const MAIN_DOCUMENT_TAB_MIN_WIDTH = 180

function isDocumentTabDragData(value: unknown): value is DocumentTabDragData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return data.type === 'document-tab' && typeof data.path === 'string'
}

function SortableDocumentTab({
  document,
  index,
  active,
  minWidth,
  onActivate,
  onClose,
}: {
  document: OpenDocument
  index: number
  active: boolean
  minWidth?: number
  onActivate: () => void
  onClose: () => void
}) {
  const title = documentTabTitle(document)
  const sortable = useSortable<DocumentTabDragData>({
    id: document.path,
    index,
    group: 'document-tabs',
    type: 'document-tab',
    accept: 'document-tab',
    data: { type: 'document-tab', path: document.path },
    transition: { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  })

  return (
    <div
      ref={sortable.ref}
      className={cn(
        'document-tab relative flex h-7 w-max max-w-[220px] flex-none rounded-lg text-muted-foreground data-[dragging]:z-4 data-[dragging]:opacity-45 data-[dragging]:shadow-[0_8px_20px_#0000001a]',
        active && 'selected bg-muted text-foreground',
      )}
      data-document-tab-active={active || undefined}
      data-dragging={sortable.isDragging || undefined}
      data-drop-target={sortable.isDropTarget || undefined}
      style={{ minWidth }}
      onMouseDown={onActivate}
    >
      <Button
        ref={sortable.handleRef}
        unstyled
        className="document-tab-handle cursor-default touch-none flex items-center flex-1 min-w-0 gap-1.5 px-2.5 text-xs text-left"
        role="tab"
        aria-selected={active}
      >
        {document.kind === 'base' ? (
          <Database size={14} />
        ) : document.kind === 'pdf' ? (
          <File size={14} />
        ) : document.kind === 'canvas' ? (
          <Canvas size={14} />
        ) : (
          <FileText size={14} />
        )}
        <span className="truncate" title={title}>
          {title}
        </span>
      </Button>
      <Button
        unstyled
        className="document-tab-close absolute z-[2] top-[3px] right-[3px] grid size-[22px] place-items-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground"
        aria-label={`${title} 탭 닫기`}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      >
        <X size={12} />
      </Button>
    </div>
  )
}

function TranscriptionTab({
  session,
  active,
  onActivate,
  onClose,
}: {
  session: TranscriptionSession
  active: boolean
  onActivate: () => void
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        'document-tab relative flex h-7 w-max max-w-[220px] min-w-[180px] flex-none rounded-lg text-muted-foreground',
        active && 'selected bg-muted text-foreground',
      )}
      data-document-tab-active={active || undefined}
      onMouseDown={onActivate}
    >
      <Button
        unstyled
        className="flex min-w-0 flex-1 cursor-default items-center gap-1.5 px-2.5 text-left text-xs"
        role="tab"
        aria-selected={active}
      >
        <AudioWaveform size={14} />
        <span className="truncate" title={session.title}>
          {session.title}
        </span>
      </Button>
      <Button
        unstyled
        className="document-tab-close absolute top-[3px] right-[3px] z-[2] grid size-[22px] place-items-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground"
        aria-label={`${session.title} 세션 탭 닫기`}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      >
        <X size={12} />
      </Button>
    </div>
  )
}

function folderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function documentCover(document: OpenDocument | undefined): NoteCoverId | null {
  if (document?.kind !== 'note') return null
  try {
    return noteCover(parseNote(document.content))
  } catch {
    return null
  }
}

const SIDEBAR_MIN_WIDTH = 232
const SIDEBAR_DEFAULT_WIDTH = 252
const SIDEBAR_MAX_WIDTH = 420
const ASSISTANT_MIN_WIDTH = 280
const ASSISTANT_DEFAULT_WIDTH = 344
const ASSISTANT_MAX_WIDTH = 520

function documentMinimumWidth() {
  return window.innerWidth <= 1150 ? 300 : 350
}

function sidebarMaximum(showChat: boolean, assistantWidth: number) {
  const chatWidth = showChat ? assistantWidth : 0
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - chatWidth - documentMinimumWidth()),
  )
}

function assistantMaximum(showSidebar: boolean, sidebarWidth: number) {
  const libraryWidth = showSidebar ? sidebarWidth : 0
  return Math.max(
    ASSISTANT_MIN_WIDTH,
    Math.min(ASSISTANT_MAX_WIDTH, window.innerWidth - libraryWidth - documentMinimumWidth()),
  )
}

function NewNoteTrigger({
  children,
  disabled,
  onCreate,
}: {
  children: React.ReactElement
  disabled?: boolean
  onCreate: (format: DocumentFormat) => void
}) {
  const { t } = useI18n()
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{t('새 문서 형식')}</ContextMenuLabel>
        <ContextMenuItem disabled={disabled} onSelect={() => onCreate('json')}>
          <FileJson2 />
          {t('JSON 노트')}
          <ContextMenuShortcut>{t('기본')}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onCreate('markdown')}>
          <FileCode2 />
          Markdown
          <ContextMenuShortcut>.md</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onCreate('base')}>
          <Database />
          데이터베이스<ContextMenuShortcut>.base</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onCreate('canvas')}>
          <Canvas />
          {t('캔버스')}
          <ContextMenuShortcut>.excalidraw</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

type TreeItemKind = 'folder' | DocumentFormat
const TREE_BASE_INDENT = 8
const TREE_DEPTH_INDENT = 14
const treeItemButtonClass =
  'pointer-events-none grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-100 hover:bg-foreground/9 hover:text-foreground focus-visible:bg-foreground/9 focus-visible:text-foreground group-hover/folder-row:pointer-events-auto group-hover/folder-row:opacity-100 group-hover/file-row:pointer-events-auto group-hover/file-row:opacity-100 group-focus-within/actions:pointer-events-auto group-focus-within/actions:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:bg-foreground/9 data-[state=open]:text-foreground data-[state=open]:opacity-100'
const treeItemClass =
  'group/sidebar-item m-0 flex min-h-8 w-full min-w-0 items-center gap-2 rounded-lg py-0.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground'

type TreeEntryDragData = Record<string, unknown> & {
  type: 'tree-entry'
  path: string
  kind: Entry['kind']
}

const TREE_DRAG_MIME = 'application/x-non-tree-entry'

function isTreeEntryDragData(value: unknown): value is TreeEntryDragData {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (
    data.type === 'tree-entry' &&
    typeof data.path === 'string' &&
    ['note', 'canvas', 'base', 'pdf', 'legacy', 'transcription', 'folder'].includes(
      String(data.kind),
    )
  )
}

function DraggableTreeRow({
  entry,
  disabled = false,
  dropFolder,
  onMove,
  children,
}: {
  entry: Entry
  disabled?: boolean
  dropFolder?: string
  onMove: (path: string, kind: Entry['kind'], targetFolder: string) => void
  children: (
    onDragStart: (event: React.DragEvent<HTMLElement>) => void,
    onDragEnd: () => void,
  ) => React.ReactNode
}) {
  const [dragging, setDragging] = useState(false)
  const [dropTarget, setDropTarget] = useState(false)
  const onDragStart = (event: React.DragEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault()
      return
    }
    const data: TreeEntryDragData = {
      type: 'tree-entry',
      path: entry.path,
      kind: entry.kind,
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(TREE_DRAG_MIME, JSON.stringify(data))
    setDragging(true)
  }
  const acceptDrop = (event: React.DragEvent<HTMLElement>) => {
    if (dropFolder === undefined) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(true)
  }
  return (
    <div
      className="group/tree-dnd relative flex min-w-0 items-center rounded-lg data-[drop-target]:bg-accent data-[drop-target]:ring-1 data-[drop-target]:ring-ring/35"
      data-drop-target={dropTarget || undefined}
      onDragEnter={acceptDrop}
      onDragOver={acceptDrop}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDropTarget(false)
        if (dropFolder === undefined) return
        try {
          const data: unknown = JSON.parse(event.dataTransfer.getData(TREE_DRAG_MIME))
          if (isTreeEntryDragData(data)) onMove(data.path, data.kind, dropFolder)
        } catch {
          // Ignore external drags and malformed payloads.
        }
      }}
    >
      <div
        className="flex min-w-0 flex-1 items-center data-[dragging]:opacity-45"
        data-dragging={dragging || undefined}
      >
        {children(onDragStart, () => setDragging(false))}
      </div>
    </div>
  )
}

function TreeRootDropZone({
  onMove,
}: {
  onMove: (path: string, kind: Entry['kind'], targetFolder: string) => void
}) {
  const [dropTarget, setDropTarget] = useState(false)
  return (
    <div
      className="min-h-10 flex-1 rounded-lg data-[drop-target]:bg-accent/45"
      data-drop-target={dropTarget || undefined}
      aria-label="루트로 이동"
      onDragEnter={(event) => {
        event.preventDefault()
        setDropTarget(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDropTarget(false)
        try {
          const data: unknown = JSON.parse(event.dataTransfer.getData(TREE_DRAG_MIME))
          if (isTreeEntryDragData(data)) onMove(data.path, data.kind, '')
        } catch {
          // Ignore external drags and malformed payloads.
        }
      }}
    />
  )
}

function TreeAddMenu({
  folder,
  onCreate,
}: {
  folder: string
  onCreate: (folder: string, kind: TreeItemKind) => void
}) {
  const { t } = useI18n()
  const label = folder ? `${folderName(folder)} · ${t('새 노트')}` : t('새 노트')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button unstyled className={treeItemButtonClass} aria-label={label} title={label}>
          <Plus size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-48">
        <DropdownMenuItem onSelect={() => onCreate(folder, 'json')}>
          <FileJson2 />
          {t('JSON 문서')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate(folder, 'markdown')}>
          <FileCode2 />
          {t('Markdown 문서')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate(folder, 'base')}>
          <Database />
          데이터베이스
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate(folder, 'canvas')}>
          <Canvas />
          {t('캔버스')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate(folder, 'folder')}>
          <FolderPlus />
          {t('폴더')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TreeItemContextMenu({
  entry,
  children,
  favorite,
  onCreate,
  onOpen,
  onToggleFavorite,
  onRename,
  onArchive,
}: {
  entry: Entry
  children: React.ReactElement
  favorite: boolean
  onCreate: (folder: string, kind: TreeItemKind) => void
  onOpen: (path: string) => void
  onToggleFavorite: (entry: Entry) => void
  onRename: () => void
  onArchive: (entry: Entry) => void
}) {
  const { t } = useI18n()
  const isFolder = entry.kind === 'folder'
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        {!isFolder && (
          <ContextMenuItem onSelect={() => onOpen(entry.path)}>
            {entry.kind === 'transcription' ? (
              <AudioWaveform />
            ) : entry.kind === 'canvas' ? (
              <Canvas />
            ) : (
              <FileText />
            )}
            {t('열기')}
          </ContextMenuItem>
        )}
        {isFolder && (
          <>
            <ContextMenuItem onSelect={() => onCreate(entry.path, 'json')}>
              <FileJson2 />
              {t('JSON 문서')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCreate(entry.path, 'markdown')}>
              <FileCode2 />
              {t('Markdown 문서')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCreate(entry.path, 'base')}>
              <Database />
              데이터베이스
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCreate(entry.path, 'canvas')}>
              <Canvas />
              {t('캔버스')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCreate(entry.path, 'folder')}>
              <FolderPlus />
              {t('폴더')}
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem onSelect={() => onToggleFavorite(entry)}>
          <Star fill={favorite ? 'currentColor' : 'none'} />
          {t(favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가')}
        </ContextMenuItem>
        {entry.kind !== 'transcription' && (
          <ContextMenuItem
            onSelect={() =>
              void desktop
                .reveal(entry.path)
                .catch((e) => useVault.getState().setError(errorText(e)))
            }
          >
            <ArrowUpRight />
            {t('Finder에서 보기')}
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={() => onRename()}>
          <Pencil />
          {t('이름 바꾸기')}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onArchive(entry)}>
          <Archive />
          {t('보관')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function TreeFavoriteButton({
  entry,
  favorite,
  onToggleFavorite,
}: {
  entry: Entry
  favorite: boolean
  onToggleFavorite: (entry: Entry) => void
}) {
  const { t } = useI18n()
  const label = t(favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가')
  return (
    <Button
      unstyled
      className={cn(
        treeItemButtonClass,
        favorite && 'pointer-events-auto text-foreground/55 opacity-100',
      )}
      aria-label={`${entry.name} ${label}`}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onToggleFavorite(entry)
      }}
    >
      <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
    </Button>
  )
}

function TreeFavoriteMarker({
  entry,
  onToggleFavorite,
}: {
  entry: Entry
  onToggleFavorite: (entry: Entry) => void
}) {
  const { t } = useI18n()
  const label = t('즐겨찾기에서 제거')
  return (
    <Button
      unstyled
      className="absolute top-1/2 right-1 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-md text-foreground/55 transition-[color,background-color] duration-100 hover:bg-foreground/9 hover:text-foreground focus-visible:text-foreground"
      aria-label={`${entry.name} ${label}`}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        onToggleFavorite(entry)
      }}
    >
      <Star size={14} fill="currentColor" />
    </Button>
  )
}

function TreeArchiveButton({
  entry,
  onArchive,
}: {
  entry: Entry
  onArchive: (entry: Entry) => void
}) {
  const { t } = useI18n()
  return (
    <Button
      unstyled
      className={treeItemButtonClass}
      aria-label={`${entry.name} ${t('보관')}`}
      title={t('보관')}
      onClick={(event) => {
        event.stopPropagation()
        onArchive(entry)
      }}
    >
      <Archive size={14} />
    </Button>
  )
}

function TreeRenameInput({
  path,
  name,
  onRename,
  onDone,
}: {
  path: string
  name: string
  onRename: (path: string, name: string) => Promise<void>
  onDone: () => void
}) {
  const [value, setValue] = useState(name)
  const committed = useRef(false)
  const commit = async () => {
    if (committed.current) return
    committed.current = true
    const next = value.trim()
    if (!next || next === name) {
      onDone()
      return
    }
    try {
      await onRename(path, next)
    } catch (error) {
      useVault.getState().setError(errorText(error))
    }
    onDone()
  }
  return (
    <Input
      unstyled
      autoFocus
      className="m-0 h-auto w-0 min-w-0 flex-1 rounded-sm border-0 bg-transparent p-0 text-sm text-inherit outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      aria-label={`${name} 이름 바꾸기`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') {
          event.preventDefault()
          void commit()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          committed.current = true
          onDone()
        }
      }}
    />
  )
}

function FileTree({
  entries,
  prefix = '',
  query = '',
  depth = 0,
  onCreate,
  onOpen,
  onRename,
  renaming,
  onRenamingChange,
  folderExpansion,
  onToggleFolder,
  onMove,
  onArchive,
  favoritePaths,
  onToggleFavorite,
}: {
  entries: Entry[]
  prefix?: string
  query?: string
  depth?: number
  onCreate: (folder: string, kind: TreeItemKind) => void
  onOpen: (path: string) => void
  onRename: (path: string, name: string) => Promise<void>
  renaming: string | null
  onRenamingChange: (path: string | null) => void
  folderExpansion: ReadonlyMap<string, boolean>
  onToggleFolder: (path: string, open: boolean) => void
  onMove: (path: string, kind: Entry['kind'], targetFolder: string) => void
  onArchive: (entry: Entry) => void
  favoritePaths: ReadonlySet<string>
  onToggleFavorite: (entry: Entry) => void
}) {
  const reduceMotion = useReducedMotion()
  const active = useVault((s) => s.active)
  const activeSessionId = useTranscription((s) => s.activeId)
  const sessions = useTranscription((s) => s.sessions)
  const tabs = useVault((s) => s.tabs)
  const visible = entries.filter((e) => e.path.toLowerCase().includes(query.toLowerCase()))
  const folders = [
    ...new Set(
      visible
        .filter((e) => e.path.startsWith(prefix))
        .map((e) => e.path.slice(prefix.length).split('/'))
        .filter(
          (parts) =>
            parts.length > 1 ||
            visible.some((e) => e.path === `${prefix}${parts[0]}` && e.kind === 'folder'),
        )
        .map((parts) => parts[0]),
    ),
  ]
  const files = visible.filter(
    (e) =>
      e.kind !== 'folder' &&
      e.path.startsWith(prefix) &&
      !e.path.slice(prefix.length).includes('/'),
  )
  const paddingInlineStart = TREE_BASE_INDENT + depth * TREE_DEPTH_INDENT
  return (
    <div className="flex min-w-0 flex-col gap-px">
      {folders.map((folder) => {
        const path = `${prefix}${folder}`
        const entry: Entry = { path, name: folder, kind: 'folder', modified: 0, size: 0 }
        const favorite = favoritePaths.has(path)
        const hasChildren = visible.some((item) => item.path.startsWith(`${path}/`))
        const expanded =
          Boolean(query) && hasChildren ? true : (folderExpansion.get(path) ?? hasChildren)
        return (
          <div key={folder} className="flex min-w-0 flex-col gap-px">
            <DraggableTreeRow
              entry={entry}
              dropFolder={path}
              disabled={renaming === path}
              onMove={onMove}
            >
              {(onDragStart, onDragEnd) => (
                <TreeItemContextMenu
                  entry={entry}
                  favorite={favorite}
                  onCreate={onCreate}
                  onOpen={onOpen}
                  onToggleFavorite={onToggleFavorite}
                  onRename={() => onRenamingChange(path)}
                  onArchive={onArchive}
                >
                  <div className="group/folder-row relative flex min-w-0 flex-1 items-center">
                    {renaming === path ? (
                      <div className={cn(treeItemClass, 'pr-2')} style={{ paddingInlineStart }}>
                        {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                        <TreeRenameInput
                          path={path}
                          name={folder}
                          onRename={onRename}
                          onDone={() => onRenamingChange(null)}
                        />
                      </div>
                    ) : (
                      <Button
                        unstyled
                        draggable
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        className={cn(
                          treeItemClass,
                          'touch-none group-hover/folder-row:pr-[84px] group-focus-within/folder-row:pr-[84px]',
                          favorite ? 'pr-8' : 'pr-2',
                        )}
                        style={{ paddingInlineStart }}
                        aria-expanded={expanded}
                        onDoubleClick={(event) => {
                          event.preventDefault()
                          onRenamingChange(path)
                        }}
                        onClick={() => {
                          useVault.getState().selectFolder(path)
                          onToggleFolder(path, !expanded)
                        }}
                      >
                        {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                        <span className="truncate">{folder}</span>
                      </Button>
                    )}
                    {renaming !== path && favorite && (
                      <TreeFavoriteMarker entry={entry} onToggleFavorite={onToggleFavorite} />
                    )}
                    {renaming !== path && (
                      <div
                        className={cn(
                          'group/actions absolute top-1/2 flex -translate-y-1/2 items-center gap-px',
                          favorite ? 'right-8' : 'right-1',
                        )}
                      >
                        {!favorite && (
                          <TreeFavoriteButton
                            entry={entry}
                            favorite={favorite}
                            onToggleFavorite={onToggleFavorite}
                          />
                        )}
                        <TreeArchiveButton entry={entry} onArchive={onArchive} />
                        <TreeAddMenu folder={path} onCreate={onCreate} />
                      </div>
                    )}
                  </div>
                </TreeItemContextMenu>
              )}
            </DraggableTreeRow>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="children"
                  className="relative overflow-hidden"
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={
                    reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
                  }
                >
                  {hasChildren ? (
                    <FileTree
                      entries={visible}
                      prefix={`${path}/`}
                      query={query}
                      depth={depth + 1}
                      onCreate={onCreate}
                      onOpen={onOpen}
                      onRename={onRename}
                      renaming={renaming}
                      onRenamingChange={onRenamingChange}
                      folderExpansion={folderExpansion}
                      onToggleFolder={onToggleFolder}
                      onMove={onMove}
                      onArchive={onArchive}
                      favoritePaths={favoritePaths}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ) : (
                    <div
                      className="flex min-h-8 min-w-0 items-center gap-2 py-0.5 text-sm text-muted-foreground/60"
                      style={{
                        paddingInlineStart: TREE_BASE_INDENT + (depth + 1) * TREE_DEPTH_INDENT,
                      }}
                    >
                      <span className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">No Items</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
      {files.map((file) => {
        const favorite = favoritePaths.has(file.path)
        const openDocument = tabs.find((tab) => tab.path === file.path)
        const transcriptionSession =
          file.kind === 'transcription'
            ? sessions.find((session) => session.id === file.sessionId)
            : undefined
        const label =
          transcriptionSession?.title ??
          (file.kind === 'note' && openDocument
            ? documentTabTitle(openDocument)
            : displayFilename(file.name).replace(/\.transcription$/i, ''))
        const selected =
          file.kind === 'transcription'
            ? activeSessionId === file.sessionId
            : !activeSessionId && active === file.path
        const icon = <TreeDocumentIcon kind={file.kind} selected={selected} />
        return (
          <DraggableTreeRow
            key={file.path}
            entry={file}
            disabled={renaming === file.path}
            onMove={onMove}
          >
            {(onDragStart, onDragEnd) => (
              <TreeItemContextMenu
                entry={file}
                favorite={favorite}
                onCreate={onCreate}
                onOpen={onOpen}
                onToggleFavorite={onToggleFavorite}
                onRename={() => onRenamingChange(file.path)}
                onArchive={onArchive}
              >
                <div className="group/file-row relative flex min-w-0 flex-1 items-center">
                  {renaming === file.path ? (
                    <div
                      className={cn(treeItemClass, 'pr-2', selected && 'bg-accent text-foreground')}
                      style={{ paddingInlineStart }}
                    >
                      {icon}
                      <TreeRenameInput
                        path={file.path}
                        name={label}
                        onRename={onRename}
                        onDone={() => onRenamingChange(null)}
                      />
                    </div>
                  ) : (
                    <Button
                      unstyled
                      draggable
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      className={cn(
                        treeItemClass,
                        'touch-none group-hover/file-row:pr-[58px] group-focus-within/file-row:pr-[58px]',
                        favorite ? 'pr-8' : 'pr-2',
                        selected && 'bg-accent text-foreground',
                      )}
                      style={{ paddingInlineStart }}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        onRenamingChange(file.path)
                      }}
                      onClick={() => {
                        onOpen(file.path)
                      }}
                    >
                      {icon}
                      <span className="truncate">{label}</span>
                    </Button>
                  )}
                  {renaming !== file.path && favorite && (
                    <TreeFavoriteMarker entry={file} onToggleFavorite={onToggleFavorite} />
                  )}
                  {renaming !== file.path && (
                    <div
                      className={cn(
                        'group/actions absolute top-1/2 flex -translate-y-1/2 items-center gap-px',
                        favorite ? 'right-8' : 'right-1',
                      )}
                    >
                      {!favorite && (
                        <TreeFavoriteButton
                          entry={file}
                          favorite={favorite}
                          onToggleFavorite={onToggleFavorite}
                        />
                      )}
                      <TreeArchiveButton entry={file} onArchive={onArchive} />
                    </div>
                  )}
                </div>
              </TreeItemContextMenu>
            )}
          </DraggableTreeRow>
        )
      })}
    </div>
  )
}

export function Workspace() {
  const { t } = useI18n()
  const vault = useVault()
  const settings = useSettings()
  const transcription = useTranscription()
  const [preferences, setPreferences] = useState(false)
  const [preferencesSection, setPreferencesSection] = useState<'general' | 'account' | 'archived'>(
    'general',
  )
  const [memory, setMemory] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [transcriptionCreateOpen, setTranscriptionCreateOpen] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(isDesktop)
  const [recentsOpen, setRecentsOpen] = useState(true)
  const [favoritesOpen, setFavoritesOpen] = useState(true)
  const [filesOpen, setFilesOpen] = useState(true)
  const [fullScreen, setFullScreen] = useState(false)
  const [workspacePage, setWorkspacePage] = useState<'document' | 'tasks'>('document')
  const [sidebarPeek, setSidebarPeek] = useState(false)
  const [sidebarResizeActive, setSidebarResizeActive] = useState(false)
  const [assistantPeek, setAssistantPeek] = useState(false)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [folderExpansion, setFolderExpansion] = useState<Map<string, boolean>>(new Map())
  const [tabbarOverflow, setTabbarOverflow] = useState({
    overflow: false,
    overflowRight: false,
  })
  const [assistantWidth, setAssistantWidth] = useState(() =>
    Math.max(
      ASSISTANT_MIN_WIDTH,
      Math.min(
        assistantMaximum(settings.showSidebar, settings.sidebarWidth),
        settings.assistantWidth,
      ),
    ),
  )
  const reduceMotion = useReducedMotion()
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.max(
      SIDEBAR_MIN_WIDTH,
      Math.min(sidebarMaximum(settings.showChat, settings.assistantWidth), settings.sidebarWidth),
    ),
  )
  useEffect(() => {
    const unsubscribeVault = useVault.subscribe((state, previous) => {
      if (state.active !== previous.active || state.tabs.length > previous.tabs.length)
        setWorkspacePage('document')
    })
    const unsubscribeTranscription = useTranscription.subscribe((state, previous) => {
      if (state.activeId !== previous.activeId && state.activeId) setWorkspacePage('document')
    })
    return () => {
      unsubscribeVault()
      unsubscribeTranscription()
    }
  }, [])
  const creating = useRef(false)
  const restoringDocument = useRef<string | null>(null)
  const started = useRef(false)
  const tabbarRef = useRef<HTMLDivElement>(null)
  const sidebarWidthRef = useRef(sidebarWidth)
  const assistantWidthRef = useRef(assistantWidth)
  const sidebarPeekCloseTimer = useRef<number | null>(null)
  const assistantPeekCloseTimer = useRef<number | null>(null)
  const sidebarResize = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const assistantResize = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const cancelSidebarPeekClose = useCallback(() => {
    if (sidebarPeekCloseTimer.current === null) return
    window.clearTimeout(sidebarPeekCloseTimer.current)
    sidebarPeekCloseTimer.current = null
  }, [])
  const showSidebarPeek = useCallback(() => {
    cancelSidebarPeekClose()
    if (!useSettings.getState().showSidebar) setSidebarPeek(true)
  }, [cancelSidebarPeekClose])
  const scheduleSidebarPeekClose = useCallback(() => {
    cancelSidebarPeekClose()
    if (useSettings.getState().showSidebar) return
    sidebarPeekCloseTimer.current = window.setTimeout(() => {
      sidebarPeekCloseTimer.current = null
      setSidebarPeek(false)
    }, 140)
  }, [cancelSidebarPeekClose])
  useEffect(() => {
    if (!settings.showSidebar) return
    cancelSidebarPeekClose()
    setSidebarPeek(false)
  }, [cancelSidebarPeekClose, settings.showSidebar])
  useEffect(() => () => cancelSidebarPeekClose(), [cancelSidebarPeekClose])
  const sidebarVisible = settings.showSidebar || sidebarPeek
  const cancelAssistantPeekClose = useCallback(() => {
    if (assistantPeekCloseTimer.current === null) return
    window.clearTimeout(assistantPeekCloseTimer.current)
    assistantPeekCloseTimer.current = null
  }, [])
  const showAssistantPeek = useCallback(() => {
    cancelAssistantPeekClose()
    if (!useSettings.getState().showChat) setAssistantPeek(true)
  }, [cancelAssistantPeekClose])
  const scheduleAssistantPeekClose = useCallback(() => {
    cancelAssistantPeekClose()
    if (useSettings.getState().showChat) return
    assistantPeekCloseTimer.current = window.setTimeout(() => {
      assistantPeekCloseTimer.current = null
      setAssistantPeek(false)
    }, 140)
  }, [cancelAssistantPeekClose])
  useEffect(() => {
    if (!settings.showChat) return
    cancelAssistantPeekClose()
    setAssistantPeek(false)
  }, [cancelAssistantPeekClose, settings.showChat])
  useEffect(() => () => cancelAssistantPeekClose(), [cancelAssistantPeekClose])
  const assistantVisible = settings.showChat || assistantPeek
  const recentOpenPath = settings.recentDocuments.find(
    (document) =>
      document.root === vault.path && vault.tabs.some((tab) => tab.path === document.path),
  )?.path
  const visibleRecentDocuments = settings.recentDocuments.filter(
    (document) => document.root === vault.path,
  )
  const activeDoc =
    vault.tabs.find((tab) => tab.path === vault.active) ??
    vault.tabs.find((tab) => tab.path === recentOpenPath) ??
    vault.tabs.at(-1)
  const activeSession = transcription.sessions.find(
    (session) => session.id === transcription.activeId,
  )
  const treeEntries: Entry[] = [
    ...vault.entries,
    ...transcription.sessions.map((session) => ({
      path: session.path,
      name: session.path.split('/').at(-1) ?? session.title,
      kind: 'transcription' as const,
      modified: session.updatedAt,
      size: 0,
      sessionId: session.id,
    })),
  ].sort((left, right) => left.path.localeCompare(right.path))
  const favoritePaths = new Set(
    settings.favoriteItems.filter((item) => item.root === vault.path).map((item) => item.path),
  )
  const favoriteEntries = settings.favoriteItems.flatMap((item) => {
    if (item.root !== vault.path) return []
    const entry = treeEntries.find((candidate) => candidate.path === item.path)
    return entry ? [entry] : []
  })
  const runningSession = transcription.sessions.find((session) =>
    ['preparing', 'transcribing', 'finalizing'].includes(session.status),
  )
  const backgroundTranscription =
    runningSession && activeSession?.id !== runningSession.id ? runningSession : null
  const openTranscriptionSessions = transcription.openIds.flatMap((id) => {
    const session = transcription.sessions.find((item) => item.id === id)
    return session ? [session] : []
  })
  const activeCover = workspacePage === 'tasks' || activeSession ? null : documentCover(activeDoc)
  const updateSidebarWidth = useCallback(
    (width: number) => {
      const next = Math.round(
        Math.max(
          SIDEBAR_MIN_WIDTH,
          Math.min(sidebarMaximum(settings.showChat, assistantWidthRef.current), width),
        ),
      )
      sidebarWidthRef.current = next
      setSidebarWidth(next)
      return next
    },
    [settings.showChat],
  )
  const commitSidebarWidth = useCallback(
    (width: number) => {
      const next = updateSidebarWidth(width)
      useSettings.getState().patch({ sidebarWidth: next })
    },
    [updateSidebarWidth],
  )
  const updateAssistantWidth = useCallback(
    (width: number) => {
      const next = Math.round(
        Math.max(
          ASSISTANT_MIN_WIDTH,
          Math.min(assistantMaximum(settings.showSidebar, sidebarWidthRef.current), width),
        ),
      )
      assistantWidthRef.current = next
      setAssistantWidth(next)
      return next
    },
    [settings.showSidebar],
  )
  const commitAssistantWidth = useCallback(
    (width: number) => {
      const next = updateAssistantWidth(width)
      useSettings.getState().patch({ assistantWidth: next })
    },
    [updateAssistantWidth],
  )
  const openFolder = useCallback(
    async (path: string) => {
      if (!isDesktop) {
        useVault
          .getState()
          .setError('이 화면은 개발 미리보기입니다. bun run dev로 데스크톱 앱을 실행하세요.')
        return
      }
      if (agentBusy) {
        useVault.getState().setError('AI 응답을 중지한 후 폴더를 바꿔 주세요.')
        return
      }
      try {
        await useVault.getState().openVault(path)
        useSettings.getState().rememberFolder(path)
      } catch (e) {
        useVault.getState().setError(errorText(e))
      }
    },
    [agentBusy],
  )
  const openDocument = useCallback(async (path: string) => {
    setWorkspacePage('document')
    useTranscription.getState().deactivate()
    try {
      await useVault.getState().openFile(path)
    } catch (error) {
      useVault.getState().setError(errorText(error))
    }
  }, [])
  const openTreeEntry = useCallback(
    async (path: string) => {
      setWorkspacePage('document')
      const session = useTranscription.getState().sessions.find((item) => item.path === path)
      if (session) {
        useTranscription.getState().open(session.id)
        return
      }
      await openDocument(path)
    },
    [openDocument],
  )
  const openRecentDocument = useCallback(
    async (document: RecentDocument) => {
      if (useVault.getState().path !== document.root) return
      await openTreeEntry(document.path)
    },
    [openTreeEntry],
  )
  const importPdf = async () => {
    try {
      const selected = await desktop.choosePdf()
      if (typeof selected !== 'string') return
      const path = await desktop.importPdf(selected, vault.selectedFolder)
      await vault.refresh()
      await openDocument(path)
    } catch (e) {
      vault.setError(errorText(e))
    }
  }
  const createUntitled = useCallback(async (format: DocumentFormat = 'json', folder?: string) => {
    if (creating.current || !useVault.getState().path) return
    creating.current = true
    setWorkspacePage('document')
    try {
      useTranscription.getState().deactivate()
      await useVault.getState().createUntitled(format, folder)
    } catch (error) {
      useVault.getState().setError(errorText(error))
    } finally {
      creating.current = false
    }
  }, [])
  const createTreeItem = useCallback(async (folder: string, kind: TreeItemKind) => {
    if (creating.current || !useVault.getState().path) return
    creating.current = true
    try {
      if (kind === 'folder') await useVault.getState().createUntitledFolder(folder)
      else {
        setWorkspacePage('document')
        useTranscription.getState().deactivate()
        await useVault.getState().createUntitled(kind, folder)
      }
    } catch (error) {
      useVault.getState().setError(errorText(error))
    } finally {
      creating.current = false
    }
  }, [])
  const toggleTreeFolder = useCallback((path: string, open: boolean) => {
    setFolderExpansion((current) => {
      const next = new Map(current)
      next.set(path, open)
      return next
    })
  }, [])
  const toggleFavoriteEntry = useCallback((entry: Entry) => {
    const root = useVault.getState().path
    if (root) useSettings.getState().toggleFavorite(root, entry.path)
  }, [])
  const openFavoriteEntry = useCallback(
    async (entry: Entry) => {
      if (entry.kind !== 'folder') {
        await openTreeEntry(entry.path)
        return
      }
      useVault.getState().selectFolder(entry.path)
      setFilesOpen(true)
      setFolderExpansion((current) => {
        const next = new Map(current)
        const parts = entry.path.split('/')
        for (let index = 1; index <= parts.length; index += 1)
          next.set(parts.slice(0, index).join('/'), true)
        return next
      })
    },
    [openTreeEntry],
  )
  const renameTreeEntry = useCallback(async (path: string, name: string) => {
    const state = useVault.getState()
    const root = state.path
    if (!root) return
    const session = useTranscription.getState().sessions.find((item) => item.path === path)
    const renamingFolder = state.entries.some(
      (entry) => entry.path === path && entry.kind === 'folder',
    )
    const nextPath = session
      ? (await useTranscription.getState().rename(session.id, name)).path
      : await state.rename(path, name)
    if (nextPath === path) return
    if (renamingFolder) {
      const sessions = useTranscription
        .getState()
        .sessions.filter((item) => item.path.startsWith(`${path}/`))
      for (const item of sessions) {
        const currentFolder = item.path.slice(0, item.path.lastIndexOf('/'))
        await useTranscription
          .getState()
          .move(item.id, `${nextPath}${currentFolder.slice(path.length)}`)
      }
    }
    useSettings.getState().moveRecentDocuments(root, path, nextPath)
    useSettings.getState().moveFavoriteItems(root, path, nextPath)
    setFolderExpansion((current) => {
      const next = new Map<string, boolean>()
      for (const [folder, open] of current) {
        if (folder === path) next.set(nextPath, open)
        else if (folder.startsWith(`${path}/`))
          next.set(`${nextPath}${folder.slice(path.length)}`, open)
        else next.set(folder, open)
      }
      return next
    })
  }, [])
  const moveTreeEntry = useCallback(
    async (path: string, kind: Entry['kind'], targetFolder: string) => {
      const state = useVault.getState()
      const root = state.path
      if (!root) return
      if (kind === 'folder' && (targetFolder === path || targetFolder.startsWith(`${path}/`)))
        return
      try {
        const session = useTranscription.getState().sessions.find((item) => item.path === path)
        const nextPath = session
          ? (await useTranscription.getState().move(session.id, targetFolder)).path
          : await state.move(path, targetFolder)
        if (nextPath === path) return
        if (kind === 'folder') {
          const sessions = useTranscription
            .getState()
            .sessions.filter((item) => item.path.startsWith(`${path}/`))
          for (const item of sessions) {
            const currentFolder = item.path.slice(0, item.path.lastIndexOf('/'))
            await useTranscription
              .getState()
              .move(item.id, `${nextPath}${currentFolder.slice(path.length)}`)
          }
        }
        useSettings.getState().moveRecentDocuments(root, path, nextPath)
        useSettings.getState().moveFavoriteItems(root, path, nextPath)
        useVault.getState().selectFolder(targetFolder)
        setRenamingPath(null)
        setFolderExpansion((current) => {
          const next = new Map<string, boolean>()
          for (const [folder, open] of current) {
            if (folder === path) next.set(nextPath, open)
            else if (folder.startsWith(`${path}/`))
              next.set(`${nextPath}${folder.slice(path.length)}`, open)
            else next.set(folder, open)
          }
          next.set(targetFolder, true)
          return next
        })
      } catch (error) {
        useVault.getState().setError(errorText(error))
      }
    },
    [],
  )
  const archiveTreeEntry = useCallback((entry: Entry) => {
    if (entry.kind === 'transcription' && entry.sessionId) {
      void useTranscription
        .getState()
        .archive(entry.sessionId)
        .catch((error) => useVault.getState().setError(errorText(error)))
      return
    }
    void (async () => {
      const archivedSessionIds: string[] = []
      try {
        if (entry.kind === 'folder') {
          const sessions = useTranscription
            .getState()
            .sessions.filter((session) => session.path.startsWith(`${entry.path}/`))
          for (const session of sessions) {
            await useTranscription.getState().archive(session.id)
            archivedSessionIds.push(session.id)
          }
        }
        await useVault.getState().archive(entry.path)
      } catch (error) {
        for (const id of archivedSessionIds)
          await desktop.transcription.restoreArchived(id).catch(() => undefined)
        useVault.getState().setError(errorText(error))
      }
    })()
  }, [])
  const startSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    sidebarResize.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarWidthRef.current,
    }
    setSidebarResizeActive(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    document.documentElement.classList.add('sidebar-resizing')
  }
  const moveSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = sidebarResize.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const width = resize.startWidth + event.clientX - resize.startX
    const state = useSettings.getState()
    const showSidebar = sidebarVisibilityForResize(width, state.showSidebar)
    if (showSidebar !== state.showSidebar) state.patch({ showSidebar })
    if (showSidebar) updateSidebarWidth(width)
  }
  const finishSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = sidebarResize.current
    if (!resize || resize.pointerId !== event.pointerId) return
    sidebarResize.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    document.documentElement.classList.remove('sidebar-resizing')
    setSidebarResizeActive(false)
    useSettings.getState().patch({ sidebarWidth: sidebarWidthRef.current })
  }
  const resizeSidebarWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowLeft' ? -12 : event.key === 'ArrowRight' ? 12 : 0
    if (!direction && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    commitSidebarWidth(
      event.key === 'Home'
        ? SIDEBAR_MIN_WIDTH
        : event.key === 'End'
          ? sidebarMaximum(settings.showChat, assistantWidthRef.current)
          : sidebarWidthRef.current + direction,
    )
  }
  const startAssistantResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    assistantResize.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: assistantWidthRef.current,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    document.documentElement.classList.add('assistant-resizing')
  }
  const moveAssistantResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = assistantResize.current
    if (!resize || resize.pointerId !== event.pointerId) return
    updateAssistantWidth(resize.startWidth + resize.startX - event.clientX)
  }
  const finishAssistantResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = assistantResize.current
    if (!resize || resize.pointerId !== event.pointerId) return
    assistantResize.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    document.documentElement.classList.remove('assistant-resizing')
    useSettings.getState().patch({ assistantWidth: assistantWidthRef.current })
  }
  const resizeAssistantWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === 'ArrowLeft' ? 12 : event.key === 'ArrowRight' ? -12 : 0
    if (!direction && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    commitAssistantWidth(
      event.key === 'Home'
        ? ASSISTANT_MIN_WIDTH
        : event.key === 'End'
          ? assistantMaximum(settings.showSidebar, sidebarWidthRef.current)
          : assistantWidthRef.current + direction,
    )
  }
  useEffect(() => {
    if (!sidebarResize.current) updateSidebarWidth(settings.sidebarWidth)
  }, [settings.sidebarWidth, updateSidebarWidth])
  useEffect(() => {
    if (!assistantResize.current) updateAssistantWidth(settings.assistantWidth)
  }, [settings.assistantWidth, updateAssistantWidth])
  useEffect(() => {
    setFolderExpansion(new Map())
    setRenamingPath(null)
  }, [vault.path])
  useEffect(() => {
    const tabbar = tabbarRef.current
    if (!tabbar) {
      setTabbarOverflow({ overflow: false, overflowRight: false })
      return
    }

    const updateOverflow = () => {
      const next = getTabbarOverflow(tabbar)
      setTabbarOverflow((current) =>
        current.overflow === next.overflow && current.overflowRight === next.overflowRight
          ? current
          : next,
      )
    }
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(tabbar)
    for (const child of tabbar.children) observer.observe(child)
    tabbar.addEventListener('scroll', updateOverflow, { passive: true })
    updateOverflow()

    return () => {
      observer.disconnect()
      tabbar.removeEventListener('scroll', updateOverflow)
    }
  }, [transcription.openIds.length, vault.tabs.length])
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      tabbarRef.current
        ?.querySelector<HTMLElement>('[data-document-tab-active]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [transcription.activeId, transcription.openIds.length, vault.active, vault.tabs.length])
  useEffect(() => {
    const fitSidebar = () => {
      updateAssistantWidth(assistantWidthRef.current)
      updateSidebarWidth(sidebarWidthRef.current)
    }
    window.addEventListener('resize', fitSidebar)
    return () => {
      window.removeEventListener('resize', fitSidebar)
      document.documentElement.classList.remove('sidebar-resizing')
      document.documentElement.classList.remove('assistant-resizing')
    }
  }, [updateAssistantWidth, updateSidebarWidth])
  const sidebarTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }
  const assistantTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }
  useEffect(() => {
    void useTranscription.getState().initialize()
  }, [])
  useEffect(() => {
    if (started.current || !isDesktop) return
    started.current = true
    void useAgent.getState().check()
    void (async () => {
      try {
        const defaultRoot = await desktop.defaultRoot()
        await openFolder(defaultRoot)
      } catch (error) {
        useVault.getState().setError(errorText(error))
      } finally {
        setBootstrapping(false)
      }
    })()
  }, [openFolder])
  useEffect(() => {
    if (!isDesktop) return
    const interval = setInterval(() => {
      void useVault.getState().refresh()
    }, 4000)
    const focus = () => {
      void useVault.getState().refresh()
    }
    window.addEventListener('focus', focus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', focus)
    }
  }, [])
  useEffect(() => {
    const root = vault.path
    if (vault.loading || transcription.loading || !root) return
    const timer = window.setTimeout(() => {
      const currentVault = useVault.getState()
      if (currentVault.loading || currentVault.path !== root) return
      const existingPaths = new Set([
        ...currentVault.entries.map((entry) => entry.path),
        ...useTranscription.getState().sessions.map((session) => session.path),
      ])
      const state = useSettings.getState()
      if (
        state.recentDocuments.some(
          (document) => document.root === root && !existingPaths.has(document.path),
        )
      )
        state.pruneRecentDocuments(root, existingPaths)
      if (state.favoriteItems.some((item) => item.root === root && !existingPaths.has(item.path)))
        state.pruneFavoriteItems(root, existingPaths)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [transcription.loading, transcription.sessions, vault.entries, vault.loading, vault.path])
  useEffect(() => {
    if (vault.loading || !vault.path || vault.active) return
    const recentInFolder = settings.recentDocuments.find(
      (document) =>
        document.kind !== 'transcription' &&
        document.root === vault.path &&
        vault.entries.some((entry) => entry.path === document.path),
    )
    const path = recentOpenPath ?? vault.tabs.at(-1)?.path ?? recentInFolder?.path
    if (!path) return
    const key = `${vault.path}:${path}`
    if (restoringDocument.current === key) return
    restoringDocument.current = key
    void useVault
      .getState()
      .openFile(path)
      .catch((error) => useVault.getState().setError(errorText(error)))
      .finally(() => {
        if (restoringDocument.current === key) restoringDocument.current = null
      })
  }, [
    settings.recentDocuments,
    recentOpenPath,
    vault.active,
    vault.entries,
    vault.loading,
    vault.path,
    vault.tabs,
  ])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const state = useVault.getState()
      const document = state.tabs.find((tab) => tab.path === state.active)
      if (!state.path || !document) return
      useSettings.getState().rememberRecentDocument({
        root: state.path,
        path: document.path,
        title: documentTabTitle(document),
        kind: document.kind,
        openedAt: Date.now(),
      })
    }, 450)
    return () => window.clearTimeout(timer)
  }, [vault.path, vault.active, activeDoc?.content])
  useEffect(() => {
    if (!vault.path || !activeSession) return
    useSettings.getState().rememberRecentDocument({
      root: vault.path,
      path: activeSession.path,
      title: activeSession.title,
      kind: 'transcription',
      openedAt: Date.now(),
    })
  }, [activeSession, vault.path])
  useHotkeys(
    [
      {
        hotkey: 'Mod+B',
        callback: (event) => {
          if (event.repeat || preferences) return
          const state = useSettings.getState()
          state.patch({ showSidebar: !state.showSidebar })
        },
        options: {
          meta: {
            name: '폴더 사이드바 전환',
            description: '왼쪽 폴더 사이드바를 표시하거나 숨깁니다.',
          },
        },
      },
      {
        hotkey: 'Mod+K',
        callback: () => setSearchOpen(true),
        options: {
          meta: {
            name: '문서 찾기',
            description: '제목과 본문 검색 팔레트를 엽니다.',
          },
        },
      },
      {
        hotkey: 'Mod+J',
        callback: (event) => {
          if (event.repeat) return
          const state = useSettings.getState()
          state.patch({ showChat: !state.showChat })
        },
        options: {
          meta: {
            name: 'AI 패널 전환',
            description: '오른쪽 AI 대화 패널을 표시하거나 숨깁니다.',
          },
        },
      },
      ...DOCUMENT_TAB_HOTKEYS.map((hotkey, index) => ({
        hotkey,
        callback: () => {
          const documentState = useVault.getState()
          const transcriptionState = useTranscription.getState()
          const openSessionIds = transcriptionState.openIds.filter((id) =>
            transcriptionState.sessions.some((session) => session.id === id),
          )
          const target = workspaceTabTargetForShortcut(
            index + 1,
            openSessionIds,
            documentState.tabs.map((tab) => tab.path),
          )
          if (!target) return
          if (target.kind === 'transcription') transcriptionState.open(target.id)
          else void openDocument(target.path)
        },
        options: {
          meta: {
            name: index === 8 ? '마지막 탭으로 이동' : `${index + 1}번 탭으로 이동`,
            description:
              index === 8
                ? '열린 탭 중 마지막 탭으로 이동합니다.'
                : `열린 탭 중 ${index + 1}번째 탭으로 이동합니다.`,
          },
        },
      })),
    ],
    {
      ignoreInputs: false,
      requireReset: false,
    },
  )
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'n') {
        e.preventDefault()
        void createUntitled('json', '')
      }
      if (e.key === ',') {
        e.preventDefault()
        setPreferencesSection('general')
        setPreferences(true)
      }
      if (e.key === 's') {
        e.preventDefault()
        const current = useVault.getState().active
        if (current) void useVault.getState().save(current)
      }
      if (e.key === 'w') {
        const sessionState = useTranscription.getState()
        if (sessionState.activeId) {
          e.preventDefault()
          sessionState.close(sessionState.activeId)
          return
        }
        const state = useVault.getState()
        const action = modWActionForTabCount(state.tabs.length)
        if (action === 'hide-window') {
          e.preventDefault()
          void desktop.hideWindow().catch((error) => state.setError(errorText(error)))
        } else if (action === 'close-tab' && state.active) {
          e.preventDefault()
          void state.close(state.active)
        }
      }
    }
    window.addEventListener('keydown', keydown, { capture: true })
    return () => window.removeEventListener('keydown', keydown, { capture: true })
  }, [createUntitled, openDocument])
  useEffect(() => {
    if (!isNativeIOS) return
    useSettings.getState().patch({ showSidebar: true, showChat: false })

    const nativeAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action
      const state = useSettings.getState()
      if (action === 'library') {
        state.patch({ showSidebar: !state.showSidebar, showChat: false })
      } else if (action === 'assistant') {
        state.patch({ showSidebar: false, showChat: !state.showChat })
      } else if (action === 'new-note') {
        void createUntitled('json', '')
      } else if (action === 'document') {
        state.patch({ showSidebar: false, showChat: false })
      }
    }
    window.addEventListener('non:native-action', nativeAction)
    const unsubscribe = useVault.subscribe((state, previous) => {
      if (state.active && state.active !== previous.active)
        useSettings.getState().patch({ showSidebar: false, showChat: false })
    })
    return () => {
      window.removeEventListener('non:native-action', nativeAction)
      unsubscribe()
    }
  }, [createUntitled])
  useEffect(() => {
    if (!isDesktop) return
    let active = true
    void desktop.isFullScreen().then((value) => {
      if (active) setFullScreen(value)
    })
    const unsubscribe = desktop.onFullScreenChanged(setFullScreen)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  useEffect(() => {
    if (!isDesktop) return
    return desktop.onCloseRequested((quit) => {
      void (async () => {
        const state = useVault.getState()
        if (!state.tabs.some((t) => t.content !== t.saved || t.saving)) {
          await desktop.closeReady(quit)
          return
        }
        for (const tab of state.tabs)
          if (!(await useVault.getState().save(tab.path))) {
            useVault
              .getState()
              .setError('저장하지 못한 문서가 있습니다. 복사본을 저장한 후 앱을 닫아 주세요.')
            return
          }
        if (!useVault.getState().tabs.some((t) => t.content !== t.saved))
          await desktop.closeReady(quit)
      })()
    })
  }, [])
  return (
    <div className="h-full flex flex-col" data-settings-open={preferences}>
      <motion.div
        className="relative flex-1 min-h-0 flex overflow-hidden"
        data-workspace-layout
        initial={false}
        animate={{
          '--sidebar-layout-width': settings.showSidebar ? `${sidebarWidth}px` : '0px',
        }}
        transition={sidebarResize.current ? { duration: 0 } : sidebarTransition}
      >
        <div
          className="relative z-30 flex-none min-h-0 overflow-visible"
          data-sidebar-shell
          style={{ width: 'var(--sidebar-layout-width)' }}
          aria-hidden={!sidebarVisible}
          data-sidebar-peek={sidebarPeek || undefined}
        >
          <ContextMenu>
            <ContextMenuTrigger asChild>
          <motion.aside
            className={cn(
              'absolute inset-y-0 left-0 z-40 flex h-full min-h-0 flex-none flex-col border-r-0 font-medium select-none',
              sidebarPeek ? 'bg-background/95 shadow-2xl backdrop-blur-xl' : 'bg-sidebar',
            )}
            initial={false}
            animate={{ opacity: sidebarVisible ? 1 : 0 }}
            transition={sidebarTransition}
            style={{
              width: sidebarWidth,
              pointerEvents: sidebarVisible || sidebarResizeActive ? 'auto' : 'none',
            }}
            inert={!sidebarVisible && !sidebarResizeActive}
            onPointerEnter={cancelSidebarPeekClose}
            onPointerLeave={scheduleSidebarPeekClose}
            onFocusCapture={cancelSidebarPeekClose}
            onBlurCapture={scheduleSidebarPeekClose}
          >
            <div className="h-10 min-h-10" data-sidebar-spacer data-window-drag-region />
            <div className="shrink-0 px-2 pt-2 pb-8">
              <Button
                variant="ghost"
                className="flex h-8 min-h-8 w-full items-center justify-start gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-sm hover:bg-accent mb-px"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={16} />
                <span>{t('문서 찾기')}</span>
                <kbd>⌘ K</kbd>
              </Button>
              <NewNoteTrigger
                disabled={!vault.path}
                onCreate={(format) => void createUntitled(format)}
              >
                <Button
                  variant="ghost"
                  className="flex h-8 min-h-8 w-full items-center justify-start gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-sm hover:bg-accent mb-px"
                  disabled={!vault.path}
                  onClick={() => void createUntitled('json')}
                  title="클릭: JSON · 우클릭: 형식 선택"
                >
                  <FilePlus2 size={16} />
                  <span>{t('새 노트')}</span>
                  <kbd>⌘ N</kbd>
                </Button>
              </NewNoteTrigger>
              <Button
                variant="ghost"
                className="mb-px flex h-8 min-h-8 w-full items-center justify-start gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-sm hover:bg-accent"
                disabled={!vault.path}
                onClick={() => void createUntitled('canvas')}
              >
                <Canvas size={16} />
                <span>{t('새 캔버스')}</span>
              </Button>
              <Button
                variant="ghost"
                className="mb-px flex h-8 min-h-8 w-full items-center justify-start gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => setTranscriptionCreateOpen(true)}
              >
                <AudioWaveform size={16} />
                <span>{t('새 전사')}</span>
              </Button>
              <Button
                variant="ghost"
                className={cn(
                  'mb-px flex h-8 min-h-8 w-full items-center justify-start gap-2.5 rounded-[9px] px-2 py-1.5 text-left text-sm hover:bg-accent',
                  workspacePage === 'tasks' && 'bg-accent',
                )}
                aria-current={workspacePage === 'tasks' ? 'page' : undefined}
                onClick={() => setWorkspacePage('tasks')}
              >
                <ListTodo size={16} />
                <span>Task</span>
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" data-sidebar-scroll>
                  <DragDropProvider
                    sensors={[PointerSensorPlugin]}
                    onDragEnd={(event) => {
                      if (event.canceled) return
                      const { source } = event.operation
                      if (!isSortable(source)) return
                      const section = SIDEBAR_SECTIONS.find((id) => source.id === `sidebar-${id}`)
                      if (section) settings.reorderSidebarSection(section, source.index)
                    }}
                  >
                    {settings.sidebarSectionOrder
                      .filter((section) => !settings.hiddenSidebarSections.includes(section))
                      .map((section, index) => (
                        <SortableSidebarSection key={section} id={section} index={index}>
                          {(handleRef) => section === 'recent' ? (
                            <Collapsible asChild open={recentsOpen} onOpenChange={setRecentsOpen}>
                              <section className="mb-2 shrink-0" aria-label="최근 항목">
                                <div className="group/heading relative flex min-h-7 items-center px-3.5 pb-1 text-sm text-muted-foreground">
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      ref={handleRef}
                                      variant="ghost"
                                      size="sm"
                                      className="ml-[-4px] flex h-6 w-full min-w-0 items-center justify-start gap-1 rounded-md px-1 py-0.5 pr-7 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground [&>svg]:size-3 data-[state=open]:[&>svg]:rotate-0"
                                      aria-label={recentsOpen ? '최근 항목 접기' : '최근 항목 펼치기'}
                                    >
                                      <span>{t('최근 항목')}</span>
                                      <ChevronDown
                                        className="-rotate-90 opacity-0 transition-[transform,opacity] duration-150 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100"
                                        aria-hidden="true"
                                      />
                                    </Button>
                                  </CollapsibleTrigger>
                                  <Button
                                    unstyled
                                    className="pointer-events-none absolute top-0 right-3.5 z-10 grid size-6 place-items-center rounded-md opacity-0 transition-[opacity,background-color] duration-150 hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground group-hover/heading:pointer-events-auto group-hover/heading:opacity-100 group-focus-within/heading:pointer-events-auto group-focus-within/heading:opacity-100 disabled:pointer-events-none disabled:group-hover/heading:opacity-45 disabled:group-focus-within/heading:opacity-45"
                                    disabled={!vault.path || vault.loading}
                                    aria-label="루트에 JSON 문서 만들기"
                                    title="루트에 JSON 문서 만들기"
                                    onClick={() => void createTreeItem('', 'json')}
                                  >
                                    <Plus size={14} />
                                  </Button>
                                </div>
                                <CollapsibleContent className="flex flex-col gap-px px-2">
                                  {visibleRecentDocuments.slice(0, 6).map((document) => {
                                    const openDocument = vault.tabs.find((tab) => tab.path === document.path)
                                    const session = transcription.sessions.find(
                                      (item) => item.path === document.path,
                                    )
                                    return (
                                      <Button
                                        unstyled
                                        key={`${document.root}:${document.path}`}
                                        className={cn(
                                          'group/sidebar-item m-0 flex min-h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.25 text-left text-sm tracking-tight text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-55 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground',
                                          vault.path === document.root &&
                                            (document.kind === 'transcription'
                                              ? activeSession?.path === document.path
                                              : !activeSession && vault.active === document.path) &&
                                            'bg-accent text-foreground',
                          )}
                          style={{ paddingInlineStart: TREE_BASE_INDENT }}
                          disabled={vault.loading}
                          title={`${folderName(document.root)} · ${document.path}`}
                          onClick={() => void openRecentDocument(document)}
                        >
                          <TreeDocumentIcon
                            kind={document.kind}
                            selected={
                              vault.path === document.root &&
                              (document.kind === 'transcription'
                                ? activeSession?.path === document.path
                                : !activeSession && vault.active === document.path)
                            }
                          />
                          <span className="truncate">
                            {session?.title ??
                              (openDocument ? documentTabTitle(openDocument) : document.title)}
                          </span>
                        </Button>
                      )
                    })}
                  </CollapsibleContent>
                </section>
              </Collapsible>
                          ) : section === 'favorites' ? (
                            <Collapsible asChild open={favoritesOpen} onOpenChange={setFavoritesOpen}>
                              <section className="mb-2 shrink-0" aria-label="즐겨찾기">
                                <div className="group/heading flex min-h-7 items-center px-3.5 pb-1 text-sm text-muted-foreground">
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      ref={handleRef}
                                      variant="ghost"
                                      size="sm"
                                      className="ml-[-4px] flex h-6 min-w-0 flex-1 items-center justify-start gap-1 rounded-md px-1 py-0.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground [&>svg]:size-3 data-[state=open]:[&>svg]:rotate-0"
                                      disabled={!vault.path || vault.loading}
                                      aria-label={favoritesOpen ? '즐겨찾기 접기' : '즐겨찾기 펼치기'}
                                    >
                                      <span>{t('즐겨찾기')}</span>
                                      <ChevronDown
                                        className="-rotate-90 opacity-0 transition-[transform,opacity] duration-150 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100"
                                        aria-hidden="true"
                                      />
                                    </Button>
                                  </CollapsibleTrigger>
                                </div>
                                <CollapsibleContent className="px-2">
                                  <div className="flex flex-col gap-px py-0.5">
                                    {favoriteEntries.map((entry) => {
                                      const openDocument = vault.tabs.find((tab) => tab.path === entry.path)
                                      const session =
                                        entry.kind === 'transcription'
                                          ? transcription.sessions.find((item) => item.id === entry.sessionId)
                                          : undefined
                                      const label =
                                        session?.title ??
                                        (entry.kind === 'folder'
                                          ? entry.name
                                          : entry.kind === 'note' && openDocument
                                            ? documentTabTitle(openDocument)
                                            : displayFilename(entry.name).replace(/\.transcription$/i, ''))
                                      const selected =
                                        entry.kind === 'folder'
                                          ? vault.selectedFolder === entry.path
                                          : entry.kind === 'transcription'
                                            ? activeSession?.id === entry.sessionId
                                            : !activeSession && vault.active === entry.path
                                      return (
                                        <TreeItemContextMenu
                                          key={entry.path}
                                          entry={entry}
                                          favorite
                                          onCreate={createTreeItem}
                                          onOpen={(path) => void openTreeEntry(path)}
                                          onToggleFavorite={toggleFavoriteEntry}
                                          onRename={() => {
                                            setFilesOpen(true)
                                            setRenamingPath(entry.path)
                                          }}
                                          onArchive={archiveTreeEntry}
                                        >
                                          <div className="group/file-row relative flex min-w-0 items-center">
                                            <Button
                                              unstyled
                                              className={cn(
                                                treeItemClass,
                                                'pr-8 pl-2 tracking-tight',
                                                selected && 'bg-accent text-foreground',
                                              )}
                                              title={entry.path}
                                              onClick={() => void openFavoriteEntry(entry)}
                                            >
                                              {entry.kind === 'folder' ? (
                                                folderExpansion.get(entry.path) ? (
                                                  <FolderOpen size={15} />
                                                ) : (
                                                  <Folder size={15} />
                                                )
                                              ) : (
                                                <TreeDocumentIcon kind={entry.kind} selected={selected} />
                                              )}
                                              <span className="truncate">{label}</span>
                                            </Button>
                                            <TreeFavoriteMarker
                                              entry={entry}
                                              onToggleFavorite={toggleFavoriteEntry}
                                            />
                                          </div>
                                        </TreeItemContextMenu>
                                      )
                                    })}
                                    {!favoriteEntries.length && (
                                      <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                                        {t('항목을 우클릭해 즐겨찾기에 추가하세요.')}
                                      </p>
                                    )}
                                  </div>
                                </CollapsibleContent>
                              </section>
                            </Collapsible>
                          ) : (
                            <Collapsible asChild open={filesOpen} onOpenChange={setFilesOpen}>
                              <section className="flex flex-col" aria-label="파일">
                                <div className="group/heading relative flex min-h-7 items-center px-3.5 pb-1 text-sm text-muted-foreground">
                                  <CollapsibleTrigger asChild>
                                    <Button
                                      ref={handleRef}
                                      variant="ghost"
                                      size="sm"
                                      className="ml-[-4px] flex h-6 w-full min-w-0 items-center justify-start gap-1 rounded-md px-1 py-0.5 pr-7 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground [&>svg]:size-3 data-[state=open]:[&>svg]:rotate-0"
                                      disabled={!vault.path || vault.loading}
                                      aria-label={filesOpen ? '파일 트리 접기' : '파일 트리 펼치기'}
                                    >
                                      <span>{t('파일')}</span>
                                      <ChevronDown
                                        className="-rotate-90 opacity-0 transition-[transform,opacity] duration-150 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100"
                                        aria-hidden="true"
                                      />
                                    </Button>
                                  </CollapsibleTrigger>
                                  <Button
                                    unstyled
                                    className="pointer-events-none absolute top-0 right-3.5 z-10 grid size-6 place-items-center rounded-md opacity-0 transition-[opacity,background-color] duration-150 hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground group-hover/heading:pointer-events-auto group-hover/heading:opacity-100 group-focus-within/heading:pointer-events-auto group-focus-within/heading:opacity-100 disabled:pointer-events-none disabled:group-hover/heading:opacity-45 disabled:group-focus-within/heading:opacity-45"
                                    disabled={!vault.path || vault.loading}
                                    aria-label="루트에 JSON 문서 만들기"
                                    title="루트에 JSON 문서 만들기"
                                    onClick={() => void createTreeItem('', 'json')}
                                  >
                                    <Plus size={14} />
                                  </Button>
                                </div>
                                <CollapsibleContent className="flex flex-col px-2">
                                  {vault.path && (
                                    <>
                                      <div className="py-0.5">
                                        <FileTree
                                          key={vault.path}
                                          entries={treeEntries}
                                          onCreate={createTreeItem}
                                          onOpen={(path) => void openTreeEntry(path)}
                                          onRename={renameTreeEntry}
                                          renaming={renamingPath}
                                          onRenamingChange={setRenamingPath}
                                          folderExpansion={folderExpansion}
                                          onToggleFolder={toggleTreeFolder}
                                          onMove={(path, kind, targetFolder) => {
                                            void moveTreeEntry(path, kind, targetFolder)
                                          }}
                                          onArchive={archiveTreeEntry}
                                          favoritePaths={favoritePaths}
                                          onToggleFavorite={toggleFavoriteEntry}
                                        />
                                        {!treeEntries.length && (
                                          <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                                            {t('첫 노트를 만들거나')}
                                            <br />
                                            {t('PDF를 가져와 보세요.')}
                                          </p>
                          )}
                        </div>
                        <TreeRootDropZone
                          onMove={(path, kind, targetFolder) => {
                            void moveTreeEntry(path, kind, targetFolder)
                          }}
                        />
                      </>
                    )}
                    {!vault.path && !bootstrapping && (
                      <p className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        {t('기본 문서 폴더를 열지 못했습니다.')}
                      </p>
                    )}
                  </CollapsibleContent>
                </section>
              </Collapsible>
                          )}
                        </SortableSidebarSection>
                      ))}
                  </DragDropProvider>
                </div>

            {backgroundTranscription && (
              <LiveTranscriptionFooter
                session={backgroundTranscription}
                onOpen={() => {
                  setWorkspacePage('document')
                  transcription.open(backgroundTranscription.id)
                }}
                onStop={() => void transcription.stop(backgroundTranscription.id)}
              />
            )}
            <div
              className="sidebar-resizer"
              role="separator"
              aria-label="폴더 사이드바 너비 조절"
              aria-orientation="vertical"
              aria-valuemin={SIDEBAR_MIN_WIDTH}
              aria-valuemax={Math.round(
                sidebarMaximum(settings.showChat, assistantWidthRef.current),
              )}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              onPointerDown={startSidebarResize}
              onPointerMove={moveSidebarResize}
              onPointerUp={finishSidebarResize}
              onPointerCancel={finishSidebarResize}
              onKeyDown={resizeSidebarWithKeyboard}
              onDoubleClick={() => commitSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
            />
          </motion.aside>
            </ContextMenuTrigger>
              <ContextMenuContent>
                {settings.sidebarSectionOrder.map((section) => (
                  <ContextMenuCheckboxItem
                    key={section}
                    checked={!settings.hiddenSidebarSections.includes(section)}
                    onCheckedChange={(visible) => settings.setSidebarSectionVisible(section, visible === true)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {t(section === 'recent' ? '최근 항목' : section === 'favorites' ? '즐겨찾기' : '파일')}
                  </ContextMenuCheckboxItem>
                ))}
              </ContextMenuContent>
          </ContextMenu>
        </div>
        <main
          className={cn(
            'document-panel group/document relative isolate flex min-w-0 flex-1 flex-col overflow-hidden bg-workspace-surface',
            activeCover && 'has-note-cover',
          )}
          data-note-cover={activeCover ?? undefined}
          data-document-main
        >
          <div
            data-document-tabbar
            className={cn(
              'h-11 min-h-11 flex items-center gap-1.5 overflow-hidden pr-2 select-none',
              !settings.showChat && 'pr-(--right-sidebar-toggle-gutter)',
            )}
            style={{
              paddingLeft: `max(12px, calc(${fullScreen ? 84 : 152}px - var(--sidebar-layout-width)))`,
            }}
            data-window-drag-region
          >
            {(vault.tabs.length > 0 || openTranscriptionSessions.length > 0) && (
              <DragDropProvider
                sensors={[PointerSensorPlugin]}
                modifiers={[RestrictToHorizontalAxis]}
                onDragEnd={(event) => {
                  if (event.canceled) return
                  const { source } = event.operation
                  if (!isSortable(source) || !isDocumentTabDragData(source.data)) return
                  vault.reorderTab(source.data.path, source.index)
                }}
              >
                <div
                  className={cn(
                    'relative flex h-[30px] min-w-0 flex-1 overflow-hidden',
                    !settings.showSidebar &&
                      'pl-1 before:absolute before:top-1/2 before:left-0 before:z-1 before:h-4 before:w-px before:-translate-y-1/2 before:bg-border',
                  )}
                  data-overflow={tabbarOverflow.overflow || undefined}
                >
                  <div
                    ref={tabbarRef}
                    className="flex h-[30px] min-w-0 flex-1 items-center gap-1.5 overflow-x-auto p-0 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden data-[overflow-right]:[mask-image:linear-gradient(to_right,#000_0,#000_calc(100%_-_36px),transparent_100%)]"
                    role="tablist"
                    aria-label="열린 문서와 전사 세션"
                    data-overflow-right={tabbarOverflow.overflowRight || undefined}
                  >
                    {openTranscriptionSessions.map((session) => (
                      <TranscriptionTab
                        key={session.id}
                        session={session}
                        active={workspacePage === 'document' && activeSession?.id === session.id}
                        onActivate={() => {
                          setWorkspacePage('document')
                          transcription.open(session.id)
                        }}
                        onClose={() => transcription.close(session.id)}
                      />
                    ))}
                    {vault.tabs.map((tab, index) => (
                      <SortableDocumentTab
                        key={tab.path}
                        document={tab}
                        index={index}
                        active={
                          workspacePage === 'document' &&
                          !activeSession &&
                          activeDoc?.path === tab.path
                        }
                        minWidth={MAIN_DOCUMENT_TAB_MIN_WIDTH}
                        onActivate={() => void openDocument(tab.path)}
                        onClose={() => void vault.close(tab.path)}
                      />
                    ))}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="tab-add size-[26px] flex-none [&>svg]:size-3.5"
                      aria-label="문서 추가"
                    >
                      <Plus />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      disabled={!vault.path}
                      onSelect={() => void createUntitled('json')}
                    >
                      <FileJson2 />
                      {t('새 JSON 노트')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!vault.path}
                      onSelect={() => void createUntitled('markdown')}
                    >
                      <FileCode2 />
                      {t('새 Markdown')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!vault.path}
                      onSelect={() => void createUntitled('canvas')}
                    >
                      <Canvas />
                      {t('새 캔버스')}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!vault.path} onSelect={() => void importPdf()}>
                      <Import />
                      {t('PDF 가져오기')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setTranscriptionCreateOpen(true)}>
                      <AudioWaveform />
                      {t('오디오 전사')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </DragDropProvider>
            )}
          </div>
          {bootstrapping || vault.loading ? (
            <div className="flex flex-1 flex-col items-center justify-center p-9 pb-24">
              <Loader2 className="animate-spin" />
              <p>{t('폴더를 여는 중입니다.')}</p>
            </div>
          ) : workspacePage === 'tasks' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-[clamp(28px,5vw,80px)] pt-15.5 pb-12">
                <h1 className="mb-6 text-3xl font-bold leading-tight">Task</h1>
                <TasksPanel onOpen={(path) => void openDocument(path)} />
              </div>
            </div>
          ) : activeSession ? (
            <TranscriptionSessionPanel key={activeSession.id} sessionId={activeSession.id} />
          ) : activeDoc ? (
            activeDoc.kind === 'base' ? (
              <Suspense fallback={<div className="p-6 text-sm">데이터베이스 여는 중…</div>}>
                <LazyBaseEditor key={activeDoc.path} document={activeDoc} />
              </Suspense>
            ) : activeDoc.kind === 'canvas' ? (
              <CanvasEditor key={activeDoc.path} document={activeDoc} />
            ) : activeDoc.kind !== 'pdf' ? (
              <NoteEditor key={activeDoc.path} document={activeDoc} />
            ) : (
              <PdfReader key={activeDoc.path} document={activeDoc} />
            )
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-9 pb-24">
              {vault.path ? (
                <div className="flex w-full max-w-[500px] flex-col gap-2.5">
                  <NewNoteTrigger onCreate={(format) => void createUntitled(format)}>
                    <Button
                      variant="outline"
                      className="justify-start"
                      onClick={() => void createUntitled('json')}
                      title="클릭: JSON · 우클릭: 형식 선택"
                    >
                      <FilePlus2 />
                      <span>{t('새 노트')}</span>
                      <kbd>⌘ N</kbd>
                    </Button>
                  </NewNoteTrigger>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => void createUntitled('canvas')}
                  >
                    <Canvas />
                    <span>{t('새 캔버스')}</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => void importPdf()}
                  >
                    <Import />
                    <span>{t('PDF 가져오기')}</span>
                    <ArrowUpRight size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => setTranscriptionCreateOpen(true)}
                  >
                    <AudioWaveform />
                    <span>{t('오디오 전사')}</span>
                    <ArrowUpRight size={16} />
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('기본 문서 폴더를 열지 못했습니다.')}
                </p>
              )}
            </div>
          )}
          {workspacePage === 'document' &&
            activeDoc &&
            (activeDoc.kind === 'note' || activeDoc.kind === 'legacy') &&
            !activeSession &&
            !vault.loading && (
              <NoteLinks
                key={`${vault.path}:${activeDoc.path}`}
                path={activeDoc.path}
                revision={activeDoc.saved}
              />
            )}
        </main>
        <motion.div
          className="relative z-30 flex-none min-h-0 overflow-visible"
          initial={false}
          animate={{ width: settings.showChat ? assistantWidth : 0 }}
          transition={assistantResize.current ? { duration: 0 } : assistantTransition}
          aria-hidden={!assistantVisible}
          data-assistant-sidebar
          data-assistant-peek={assistantPeek || undefined}
        >
          <motion.div
            className={cn(
              'absolute inset-y-0 right-0 z-40 h-full min-w-0 min-h-0',
              assistantPeek && 'shadow-2xl',
            )}
            initial={false}
            animate={{ opacity: assistantVisible ? 1 : 0, x: assistantVisible ? 0 : 12 }}
            transition={assistantTransition}
            style={{
              width: assistantWidth,
              pointerEvents: assistantVisible ? 'auto' : 'none',
            }}
            inert={!assistantVisible}
            onPointerEnter={cancelAssistantPeekClose}
            onPointerLeave={scheduleAssistantPeekClose}
            onFocusCapture={cancelAssistantPeekClose}
            onBlurCapture={scheduleAssistantPeekClose}
          >
            <AssistantPanel
              key={vault.path ?? 'no-folder'}
              className="border-transparent"
              onSettings={() => {
                setPreferencesSection('general')
                setPreferences(true)
              }}
              onBusy={setAgentBusy}
            />
            <div
              className="assistant-resizer"
              role="separator"
              aria-label="AI 사이드바 너비 조절"
              aria-orientation="vertical"
              aria-valuemin={ASSISTANT_MIN_WIDTH}
              aria-valuemax={Math.round(
                assistantMaximum(settings.showSidebar, sidebarWidthRef.current),
              )}
              aria-valuenow={assistantWidth}
              tabIndex={0}
              onPointerDown={startAssistantResize}
              onPointerMove={moveAssistantResize}
              onPointerUp={finishAssistantResize}
              onPointerCancel={finishAssistantResize}
              onKeyDown={resizeAssistantWithKeyboard}
              onDoubleClick={() => commitAssistantWidth(ASSISTANT_DEFAULT_WIDTH)}
            />
          </motion.div>
        </motion.div>
        <div
          className={cn(
            'absolute top-[calc((var(--app-header-height)-26px)/2)] z-50 flex items-center',
            fullScreen ? 'left-[22px]' : 'left-[90px]',
          )}
          data-desktop-chrome
        >
          <Tip label="폴더 사이드바 · ⌘B">
            <Button
              variant="ghost"
              size="icon"
              className="size-[26px]"
              aria-label="폴더 사이드바 전환"
              aria-pressed={settings.showSidebar}
              aria-expanded={sidebarVisible}
              onPointerEnter={showSidebarPeek}
              onPointerLeave={scheduleSidebarPeekClose}
              onFocus={showSidebarPeek}
              onBlur={scheduleSidebarPeekClose}
              onClick={() => settings.patch({ showSidebar: !settings.showSidebar })}
            >
              <PanelLeft />
            </Button>
          </Tip>
          <Tip label={`${t('설정')} · ⌘,`}>
            <Button
              variant="ghost"
              size="icon"
              className="size-[26px]"
              aria-label={t('설정')}
              onClick={() => {
                setPreferencesSection('general')
                setPreferences(true)
              }}
            >
              <Settings2 />
            </Button>
          </Tip>
        </div>
        <div
          className="absolute top-[calc((var(--app-header-height)-26px)/2)] right-2 z-50 flex items-center"
          data-desktop-chrome
        >
          <Tip label="AI 패널 · ⌘J">
            <Button
              variant="ghost"
              size="icon"
              className="size-[26px]"
              aria-label="AI 패널 전환"
              aria-pressed={settings.showChat}
              aria-expanded={assistantVisible}
              onPointerEnter={showAssistantPeek}
              onPointerLeave={scheduleAssistantPeekClose}
              onFocus={showAssistantPeek}
              onBlur={scheduleAssistantPeekClose}
              onClick={() => settings.patch({ showChat: !settings.showChat })}
            >
              <PanelRight />
            </Button>
          </Tip>
        </div>
      </motion.div>
      {vault.error && (
        <div
          role="alert"
          className="fixed z-70 bottom-7 left-1/2 -translate-x-1/2 flex gap-3.5 items-center w-max max-w-[75vw] px-3.5 py-3 border border-border rounded-lg bg-popover shadow-[0_8px_35px_#0002] text-xs"
        >
          <p>{vault.error}</p>
          <Button
            size="icon"
            variant="ghost"
            aria-label="알림 닫기"
            onClick={() => vault.setError(null)}
          >
            <X />
          </Button>
        </div>
      )}
      {transcription.error && (
        <div
          role="alert"
          className="fixed z-70 bottom-7 left-1/2 flex w-max max-w-[75vw] -translate-x-1/2 items-center gap-3.5 rounded-lg border border-border bg-popover px-3.5 py-3 text-xs shadow-[0_8px_35px_#0002]"
        >
          <p>{transcription.error}</p>
          <Button
            size="icon"
            variant="ghost"
            aria-label="전사 알림 닫기"
            onClick={() => transcription.clearError()}
          >
            <X />
          </Button>
        </div>
      )}
      <DocumentSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <TranscriptionCreateDialog
        open={transcriptionCreateOpen}
        onOpenChange={setTranscriptionCreateOpen}
      />
      <Preferences
        open={preferences}
        onOpenChange={setPreferences}
        onMemory={() => setMemory(true)}
        initialSection={preferencesSection}
        sidebarWidth={sidebarWidth}
      />
      <MemoryManager open={memory} onOpenChange={setMemory} />
    </div>
  )
}
