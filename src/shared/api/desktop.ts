import { errorText } from '@/shared/lib/utils'
import type { AgentEvent, ThemeSource } from './non-api'
import type { TranscriptionLanguage } from '@/shared/contracts/transcription'

export type { AgentEvent, ArchivedEntry, Entry } from './non-api'
export const isDesktop = typeof window !== 'undefined' && window.non !== undefined
export const isNativeIOS =
  typeof window !== 'undefined' && window.__NON_NATIVE_IOS__ === true

type PreviewAgentRequest = (action: string, payload?: unknown) => Promise<unknown>
let previewAgentRequest: PreviewAgentRequest | null = null

export function setPreviewAgentRequest(handler: PreviewAgentRequest) {
  if (!import.meta.env.DEV || isDesktop)
    throw new Error('브라우저 미리보기 요청은 개발 fixture에서만 설정할 수 있습니다.')
  previewAgentRequest = handler
}

function api() {
  if (!window.non) throw new Error('이 기능은 Non 데스크톱 앱에서 사용할 수 있습니다.')
  return window.non
}

export const desktop = {
  defaultRoot: () => api().vault.defaultRoot(),
  open: (path: string) => api().vault.open(path),
  list: () => api().vault.list(),
  propertyTypes: async () => api().vault.propertyTypes?.() ?? Promise.resolve({} as Record<string,string>),
  databaseEntries: async () => api().vault.databaseEntries?.() ?? api().vault.list(),
  asset: async (path: string) => api().vault.readAsset?.(path) ?? Promise.reject(new Error('Image API unavailable')),
  read: (path: string) => api().vault.read(path),
  save: (path: string, content: string, revision: string | null) =>
    api().vault.save(path, content, revision),
  createFolder: (path: string) => api().vault.createFolder(path),
  pdf: async (path: string) => new Uint8Array(await api().vault.readPdf(path)),
  importPdf: (source: string, folder = '') => api().vault.importPdf(source, folder),
  trash: (path: string) => api().vault.trash(path),
  archive: (path: string) => api().vault.archive(path),
  listArchived: () => api().vault.listArchived(),
  restoreArchived: (id: string) => api().vault.restoreArchived(id),
  deleteArchived: (id: string) => api().vault.deleteArchived(id),
  rename: (path: string, name: string) => api().vault.rename(path, name),
  move: (path: string, targetFolder: string) => api().vault.move(path, targetFolder),
  reveal: (path: string) => api().vault.reveal(path),
  chooseFolder: () => api().dialog.chooseFolder(),
  choosePdf: () => api().dialog.choosePdf(),
  transcription: {
    list: () => api().transcription.list(),
    listArchived: () => api().transcription.listArchived(),
    microphoneInputs: () => api().transcription.microphoneInputs(),
    setMicrophoneInput: (id: string) => api().transcription.setMicrophoneInput(id),
    create: (language: TranscriptionLanguage, folder: string) =>
      api().transcription.create(language, folder),
    createLive: (language: TranscriptionLanguage, folder: string) =>
      api().transcription.createLive(language, folder),
    rename: (id: string, name: string) => api().transcription.rename(id, name),
    move: (id: string, folder: string) => api().transcription.move(id, folder),
    remove: (id: string) => api().transcription.remove(id),
    archive: (id: string) => api().transcription.archive(id),
    restoreArchived: (id: string) => api().transcription.restoreArchived(id),
    setLanguage: (id: string, language: TranscriptionLanguage) =>
      api().transcription.setLanguage(id, language),
    start: (id: string) => api().transcription.start(id),
    retranscribe: (id: string) => api().transcription.retranscribe(id),
    stop: (id: string) => api().transcription.stop(id),
    runtimeStatus: () => api().transcription.runtimeStatus(),
    installRuntime: () => api().transcription.installRuntime(),
    audioUrl: (id: string) => api().transcription.audioUrl(id),
    onEvent: (callback: Parameters<NonNullable<Window['non']>['transcription']['onEvent']>[0]) =>
      api().transcription.onEvent(callback),
  },
  skills: {
    list: () => api().skills.list(),
    install: () => api().skills.install(),
    setEnabled: (id: string, enabled: boolean) => api().skills.setEnabled(id, enabled),
    remove: (id: string) => api().skills.remove(id),
    reveal: () => api().skills.reveal(),
  },
  openExternal: (url: string) => api().openExternal(url),
  setTheme: (theme: ThemeSource) => api().window.setTheme(theme),
  isFullScreen: () => api().window.isFullScreen(),
  onFullScreenChanged: (callback: (fullScreen: boolean) => void) =>
    api().window.onFullScreenChanged(callback),
  hideWindow: () => api().window.hide(),
  onCloseRequested: (callback: (quit: boolean) => void) =>
    api().window.onCloseRequested(callback),
  closeReady: (quit: boolean) => api().window.closeReady(quit),
}

export async function agentRequest<T>(
  action: string,
  payload?: unknown,
  event?: (event: AgentEvent) => void,
): Promise<T> {
  if (!isDesktop) {
    if (import.meta.env.DEV && previewAgentRequest)
      return (await previewAgentRequest(action, payload)) as T
    throw new Error('AI는 Non 데스크톱 앱에서 사용할 수 있습니다.')
  }
  return new Promise<T>((resolve, reject) => {
    const id = crypto.randomUUID()
    const timeout =
      action === 'prompt'
        ? 180_000
        : action === 'login' || action.startsWith('auth:')
          ? 360_000
          : action.startsWith('index:')
            ? 120_000
            : 15_000
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const expire = () => {
      if (settled) return
      settled = true
      unsubscribe()
      reject(new Error('로컬 AI 런타임 응답 시간이 초과되었습니다. 앱을 다시 열어 주세요.'))
    }
    const unsubscribe = api().agent.onEvent((message) => {
      if (settled || message.id !== id) return
      clearTimeout(timer)
      event?.(message)
      if (message.type === 'result' || message.type === 'error') {
        settled = true
        unsubscribe()
        if (message.type === 'error') reject(new Error(message.error))
        else resolve(message.data as T)
      } else timer = setTimeout(expire, timeout)
    })
    timer = setTimeout(expire, timeout)
    void api()
      .agent.request({ id, action, payload })
      .catch((error) => {
        if (settled) return
        clearTimeout(timer)
        settled = true
        unsubscribe()
        reject(new Error(errorText(error)))
      })
  })
}
