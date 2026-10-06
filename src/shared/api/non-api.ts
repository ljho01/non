import type { InstalledSkill } from '../contracts/skill'
import type {
  TranscriptionEvent,
  TranscriptionLanguage,
  TranscriptionMicrophoneState,
  TranscriptionRuntimeStatus,
  TranscriptionSession,
} from '../contracts/transcription'

export type Entry = {
  path: string
  name: string
  kind: 'note' | 'canvas' | 'base' | 'pdf' | 'legacy' | 'transcription' | 'folder' | 'attachment'
  created?: number
  modified: number
  size: number
  sessionId?: string
}
export type ArchivedEntry = Entry & {
  id: string
  originalPath: string
  archivedAt: number
}
export type AgentEvent = {
  id?: string
  type: string
  text?: string
  name?: string
  error?: string
  url?: string
  message?: string
  title?: string
  data?: unknown
  ids?: string[]
}
export type AgentRequest = { id: string; action: string; payload?: unknown }
export type ThemeSource = 'light' | 'dark' | 'system'

export type NonDesktopApi = {
  vault: {
    defaultRoot(): Promise<string>
    open(path: string): Promise<{ path: string; entries: Entry[] }>
    list(): Promise<Entry[]>
    databaseEntries?(): Promise<Entry[]>
    propertyTypes?(): Promise<Record<string,string>>
    readAsset?(path: string): Promise<string>
    read(path: string): Promise<{ content: string; revision: string }>
    save(path: string, content: string, revision: string | null): Promise<string>
    createFolder(path: string): Promise<void>
    readPdf(path: string): Promise<Uint8Array>
    importPdf(source: string, folder?: string): Promise<string>
    trash(path: string): Promise<void>
    archive(path: string): Promise<ArchivedEntry>
    listArchived(): Promise<ArchivedEntry[]>
    restoreArchived(id: string): Promise<string>
    deleteArchived(id: string): Promise<void>
    rename(path: string, name: string): Promise<string>
    move(path: string, targetFolder: string): Promise<string>
    reveal(path: string): Promise<void>
  }
  dialog: {
    chooseFolder(): Promise<string | null>
    choosePdf(): Promise<string | null>
  }
  transcription: {
    list(): Promise<TranscriptionSession[]>
    listArchived(): Promise<import('../contracts/transcription').ArchivedTranscriptionSession[]>
    microphoneInputs(): Promise<TranscriptionMicrophoneState>
    setMicrophoneInput(id: string): Promise<TranscriptionMicrophoneState>
    create(language: TranscriptionLanguage, folder: string): Promise<TranscriptionSession | null>
    createLive(language: TranscriptionLanguage, folder: string): Promise<TranscriptionSession>
    rename(id: string, name: string): Promise<TranscriptionSession>
    move(id: string, folder: string): Promise<TranscriptionSession>
    remove(id: string): Promise<void>
    archive(id: string): Promise<import('../contracts/transcription').ArchivedTranscriptionSession>
    restoreArchived(id: string): Promise<TranscriptionSession>
    setLanguage(id: string, language: TranscriptionLanguage): Promise<TranscriptionSession>
    start(id: string): Promise<TranscriptionSession>
    retranscribe(id: string): Promise<TranscriptionSession>
    stop(id: string): Promise<TranscriptionSession>
    runtimeStatus(): Promise<TranscriptionRuntimeStatus>
    installRuntime(): Promise<TranscriptionRuntimeStatus>
    audioUrl(id: string): string
    onEvent(callback: (event: TranscriptionEvent) => void): () => void
  }
  agent: {
    request(request: AgentRequest): Promise<void>
    onEvent(callback: (event: AgentEvent) => void): () => void
  }
  skills: {
    list(): Promise<InstalledSkill[]>
    install(): Promise<InstalledSkill | null>
    setEnabled(id: string, enabled: boolean): Promise<InstalledSkill[]>
    remove(id: string): Promise<InstalledSkill[]>
    reveal(): Promise<void>
  }
  window: {
    setTheme(theme: ThemeSource): Promise<void>
    isFullScreen(): Promise<boolean>
    onFullScreenChanged(callback: (fullScreen: boolean) => void): () => void
    hide(): Promise<void>
    onCloseRequested(callback: (quit: boolean) => void): () => void
    closeReady(quit: boolean): Promise<void>
  }
  openExternal(url: string): Promise<void>
}

declare global {
  interface Window {
    non?: NonDesktopApi
    __NON_NATIVE_IOS__?: boolean
    EXCALIDRAW_ASSET_PATH?: string
  }
}
