import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  nativeTheme,
  protocol,
  safeStorage,
  session,
  shell,
  systemPreferences,
  utilityProcess,
  type IpcMainInvokeEvent,
  type UtilityProcess,
  type WebContents,
} from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  archiveEntry,
  createFolder,
  deleteArchivedEntry,
  ensureDefaultVault,
  importPdf,
  listArchivedEntries,
  listEntries,
  moveEntry,
  openVault,
  readDocument,
  readPdf,
  readAsset,
  readPropertyTypes,
  renameEntry,
  restoreArchivedEntry,
  saveDocument,
  vaultAbsolutePath,
} from './vault'
import { EncryptedCredentialVault } from './credentials'
import {
  installSkill,
  ensureBuiltInSkills,
  listSkills,
  prepareSkillRemoval,
  setSkillEnabled,
  skillDirectory,
} from './skills'
import type { AgentEvent, AgentRequest, ThemeSource } from '../src/shared/api/non-api'
import { isTranscriptionLanguage, type TranscriptionEvent } from '../src/shared/contracts/transcription'
import { TranscriptionManager } from './transcription'

app.setName('Non')
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'non-audio',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
  },
])

const APP_HEADER_HEIGHT = 44
const MACOS_TRAFFIC_LIGHT_DIAMETER = 14
const MACOS_TRAFFIC_LIGHT_OFFSET = (APP_HEADER_HEIGHT - MACOS_TRAFFIC_LIGHT_DIAMETER) / 2
const MACOS_TRAFFIC_LIGHT_POSITION = {
  x: MACOS_TRAFFIC_LIGHT_OFFSET,
  y: MACOS_TRAFFIC_LIGHT_OFFSET,
}

let mainWindow: BrowserWindow | null = null
let currentRoot: string | null = null
let allowClose = false
let closePending = false
let quitPending = false
let agentProcess: UtilityProcess | null = null
let skillChangePending = false
const agentRoutes = new Map<string, WebContents>()
let aiCredentials: EncryptedCredentialVault | null = null
let transcriptionManager: TranscriptionManager | null = null
const execFileAsync = promisify(execFile)

type CredentialRequest = {
  type: 'credential:request'
  requestId: string
  action: 'read' | 'write' | 'delete'
  providerId: string
  credential?: unknown
}

type SecretPromptRequest = {
  type: 'auth_secret_prompt'
  id: string
  providerId: string
}

function trusted(event: IpcMainInvokeEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Untrusted IPC sender')
}

function root() {
  if (!currentRoot) throw new Error('Open a folder first')
  return currentRoot
}

function transcriptions() {
  if (!transcriptionManager) throw new Error('전사 런타임이 아직 준비되지 않았습니다.')
  return transcriptionManager
}

async function ensureMicrophoneAccess() {
  if (process.platform !== 'darwin')
    throw new Error('실시간 마이크 전사는 현재 macOS에서 지원됩니다.')
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'granted') return
  if (status === 'not-determined' && (await systemPreferences.askForMediaAccess('microphone')))
    return
  throw new Error('시스템 설정 > 개인정보 보호 및 보안 > 마이크에서 Non 접근을 허용해 주세요.')
}

function requireString(value: unknown, label: string, max = 8 * 1024 * 1024) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Invalid ${label}`)
  return value
}

function agentEntrypoint() {
  return app.isPackaged
    ? join(process.resourcesPath, 'agent.cjs')
    : join(app.getAppPath(), 'dist-electron', 'agent.cjs')
}

function credentialVault() {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('이 Mac에서는 AI 인증 정보를 안전하게 저장할 수 없습니다.')
  aiCredentials ??= new EncryptedCredentialVault(
    join(app.getPath('userData'), 'ai-credentials.bin'),
    {
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    },
    join(app.getPath('userData'), 'credentials.json'),
  )
  return aiCredentials
}

function isCredentialRequest(value: Record<string, unknown>): value is CredentialRequest {
  return (
    value.type === 'credential:request' &&
    typeof value.requestId === 'string' &&
    ['read', 'write', 'delete'].includes(String(value.action)) &&
    typeof value.providerId === 'string'
  )
}

function isSecretPromptRequest(value: Record<string, unknown>): value is SecretPromptRequest {
  return (
    value.type === 'auth_secret_prompt' &&
    typeof value.id === 'string' &&
    typeof value.providerId === 'string'
  )
}

async function answerCredentialRequest(child: UtilityProcess, request: CredentialRequest) {
  try {
    const vault = credentialVault()
    const data =
      request.action === 'read'
        ? await vault.read(request.providerId)
        : request.action === 'write'
          ? await vault.write(request.providerId, request.credential)
          : await vault.delete(request.providerId)
    child.postMessage({ type: 'credential:result', requestId: request.requestId, data })
  } catch (error) {
    child.postMessage({
      type: 'credential:result',
      requestId: request.requestId,
      error: error instanceof Error ? error.message : 'AI 인증 정보를 저장하지 못했습니다.',
    })
  }
}

async function requestApiKey(providerId: string) {
  if (process.platform !== 'darwin')
    throw new Error('API 키 보안 입력은 현재 macOS에서만 지원됩니다.')
  const provider =
    providerId === 'openai'
      ? { name: 'OpenAI', placeholder: 'sk-...' }
      : providerId === 'anthropic-api'
        ? { name: 'Anthropic', placeholder: 'sk-ant-...' }
        : null
  if (!provider) throw new Error('지원하지 않는 API 키 제공자입니다.')
  const script = `text returned of (display dialog "${provider.name} API 키를 입력하세요" default answer "" with title "Non · ${provider.name}" with icon caution with hidden answer buttons {"취소", "저장"} default button "저장" cancel button "취소" giving up after 120)`
  try {
    const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script], {
      timeout: 125_000,
      maxBuffer: 16_384,
    })
    const value = stdout.trim()
    if (!value || value === provider.placeholder) throw new Error('API 키가 비어 있습니다.')
    return value
  } catch (error) {
    if (error instanceof Error && error.message === 'API 키가 비어 있습니다.') throw error
    throw new Error('API 키 입력을 취소했습니다.')
  }
}

async function answerSecretPrompt(child: UtilityProcess, request: SecretPromptRequest) {
  if (!agentRoutes.has(request.id)) {
    child.postMessage({
      type: 'auth_secret_answer',
      id: request.id,
      error: 'API 키 요청이 더 이상 활성 상태가 아닙니다.',
    })
    return
  }
  try {
    const value = await requestApiKey(request.providerId)
    child.postMessage({ type: 'auth_secret_answer', id: request.id, value })
  } catch (error) {
    child.postMessage({
      type: 'auth_secret_answer',
      id: request.id,
      error: error instanceof Error ? error.message : 'API 키를 입력하지 못했습니다.',
    })
  }
}

function ensureAgent() {
  if (agentProcess) return agentProcess
  const child = utilityProcess.fork(agentEntrypoint(), [
    '--data-dir',
    app.getPath('userData'),
  ])
  child.on('message', (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (isCredentialRequest(record)) {
      void answerCredentialRequest(child, record)
      return
    }
    if (isSecretPromptRequest(record)) {
      void answerSecretPrompt(child, record)
      return
    }
    const event = record as AgentEvent
    if (!event.id) return
    const target = agentRoutes.get(event.id)
    if (!target || target.isDestroyed()) {
      agentRoutes.delete(event.id)
      return
    }
    target.send('agent:event', event)
    if (event.type === 'result' || event.type === 'error') agentRoutes.delete(event.id)
  })
  child.on('exit', () => {
    if (agentProcess === child) agentProcess = null
    for (const [id, target] of agentRoutes) {
      if (!target.isDestroyed())
        target.send('agent:event', {
          id,
          type: 'error',
          error: 'Local agent stopped. Retry to restart it.',
        } satisfies AgentEvent)
    }
    agentRoutes.clear()
  })
  agentProcess = child
  return child
}

async function restartAgentForSkillChange() {
  if (agentRoutes.size) throw new Error('AI 답변이 끝난 후 스킬 설정을 변경하세요.')
  const child = agentProcess
  agentProcess = null
  if (!child) return
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    child.kill()
  })
}

function registerIpc() {
  ipcMain.handle('vault:default-root', async (event) => {
    trusted(event)
    return ensureDefaultVault(app.getPath('documents'))
  })
  ipcMain.handle('vault:open', async (event, value: unknown) => {
    trusted(event)
    const result = await openVault(requireString(value, 'folder path', 32_000))
    currentRoot = result.path
    return result
  })
  ipcMain.handle('vault:list', async (event) => {
    trusted(event)
    return listEntries(root())
  })
  ipcMain.handle('vault:read', async (event, value: unknown) => {
    trusted(event)
    return readDocument(root(), requireString(value, 'document path', 32_000))
  })
  ipcMain.handle('vault:save', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid save request')
    const input = value as Record<string, unknown>
    const revision = input.revision
    if (revision !== null && typeof revision !== 'string') throw new Error('Invalid revision')
    return saveDocument(
      root(),
      requireString(input.path, 'document path', 32_000),
      requireString(input.content, 'document content'),
      revision,
    )
  })
  ipcMain.handle('vault:create-folder', async (event, value: unknown) => {
    trusted(event)
    await createFolder(root(), requireString(value, 'folder path', 32_000))
  })
  ipcMain.handle('vault:property-types', async event => { trusted(event); return readPropertyTypes(root()) })
  ipcMain.handle('vault:database-entries', async (event) => {
    trusted(event)
    return listEntries(root(), true)
  })
  ipcMain.handle('vault:read-asset', async (event, value: unknown) => {
    trusted(event)
    return readAsset(root(), requireString(value, 'image path', 32_000))
  })
  ipcMain.handle('vault:read-pdf', async (event, value: unknown) => {
    trusted(event)
    return readPdf(root(), requireString(value, 'PDF path', 32_000))
  })
  ipcMain.handle('vault:import-pdf', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid PDF import request')
    const input = value as Record<string, unknown>
    return importPdf(
      root(),
      requireString(input.source, 'PDF source path', 32_000),
      requireString(input.folder ?? '', 'folder path', 32_000),
    )
  })
  ipcMain.handle('vault:trash', async (event, value: unknown) => {
    trusted(event)
    await shell.trashItem(
      await vaultAbsolutePath(root(), requireString(value, 'vault path', 32_000)),
    )
  })
  ipcMain.handle('vault:archive', async (event, value: unknown) => {
    trusted(event)
    return archiveEntry(root(), requireString(value, 'vault path', 32_000))
  })
  ipcMain.handle('vault:list-archived', async (event) => {
    trusted(event)
    return listArchivedEntries(root())
  })
  ipcMain.handle('vault:restore-archived', async (event, value: unknown) => {
    trusted(event)
    return restoreArchivedEntry(root(), requireString(value, 'archive id', 200))
  })
  ipcMain.handle('vault:delete-archived', async (event, value: unknown) => {
    trusted(event)
    await deleteArchivedEntry(root(), requireString(value, 'archive id', 200))
  })
  ipcMain.handle('vault:rename', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid rename request')
    const input = value as Record<string, unknown>
    return renameEntry(
      root(),
      requireString(input.path, 'vault path', 32_000),
      requireString(input.name, 'name', 400),
    )
  })
  ipcMain.handle('vault:move', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid move request')
    const input = value as Record<string, unknown>
    return moveEntry(
      root(),
      requireString(input.path, 'vault path', 32_000),
      requireString(input.targetFolder ?? '', 'target folder', 32_000),
    )
  })
  ipcMain.handle('vault:reveal', async (event, value: unknown) => {
    trusted(event)
    shell.showItemInFolder(
      await vaultAbsolutePath(root(), requireString(value, 'vault path', 32_000)),
    )
  })
  ipcMain.handle('dialog:choose-folder', async (event) => {
    trusted(event)
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '폴더 추가 · iCloud Drive 폴더도 선택할 수 있습니다',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('dialog:choose-pdf', async (event) => {
    trusted(event)
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '현재 폴더에 PDF 가져오기',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('transcription:list', async (event) => {
    trusted(event)
    return transcriptions().list()
  })
  ipcMain.handle('transcription:list-archived', async (event) => {
    trusted(event)
    return transcriptions().listArchived()
  })
  ipcMain.handle('transcription:microphone-inputs', async (event) => {
    trusted(event)
    return transcriptions().microphoneInputs()
  })
  ipcMain.handle('transcription:set-microphone-input', async (event, value: unknown) => {
    trusted(event)
    return transcriptions().setMicrophoneInput(requireString(value, 'microphone input id', 20))
  })
  ipcMain.handle('transcription:create', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid transcription request')
    const input = value as Record<string, unknown>
    if (!isTranscriptionLanguage(input.language))
      throw new Error('지원하지 않는 전사 언어입니다.')
    if (!mainWindow) return null
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: '전사할 오디오 파일 선택',
      properties: ['openFile'],
      filters: [
        {
          name: '오디오와 영상',
          extensions: ['aac', 'aiff', 'flac', 'm4a', 'm4v', 'mov', 'mp3', 'mp4', 'ogg', 'opus', 'wav', 'webm'],
        },
      ],
    })
    const source = selection.canceled ? null : (selection.filePaths[0] ?? null)
    if (!source) return null
    const session = await transcriptions().create(
      source,
      input.language,
      requireString(input.folder ?? '', 'transcription folder', 32_000),
    )
    void transcriptions().start(session.id)
    return session
  })
  ipcMain.handle('transcription:create-live', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid transcription request')
    const input = value as Record<string, unknown>
    if (!isTranscriptionLanguage(input.language))
      throw new Error('지원하지 않는 전사 언어입니다.')
    await ensureMicrophoneAccess()
    const session = await transcriptions().createMicrophone(
      input.language,
      requireString(input.folder ?? '', 'transcription folder', 32_000),
    )
    void transcriptions().start(session.id)
    return session
  })
  ipcMain.handle('transcription:rename', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid transcription request')
    const input = value as Record<string, unknown>
    return transcriptions().renameSession(
      requireString(input.id, 'transcription session id', 200),
      requireString(input.name, 'transcription name', 200),
    )
  })
  ipcMain.handle('transcription:move', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid transcription request')
    const input = value as Record<string, unknown>
    return transcriptions().moveSession(
      requireString(input.id, 'transcription session id', 200),
      requireString(input.folder ?? '', 'transcription folder', 32_000),
    )
  })
  ipcMain.handle('transcription:remove', async (event, value: unknown) => {
    trusted(event)
    await transcriptions().removeSession(requireString(value, 'transcription session id', 200))
  })
  ipcMain.handle('transcription:archive', async (event, value: unknown) => {
    trusted(event)
    return transcriptions().archiveSession(
      requireString(value, 'transcription session id', 200),
    )
  })
  ipcMain.handle('transcription:restore-archived', async (event, value: unknown) => {
    trusted(event)
    return transcriptions().restoreArchivedSession(
      requireString(value, 'transcription session id', 200),
    )
  })
  ipcMain.handle('transcription:set-language', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid transcription request')
    const input = value as Record<string, unknown>
    if (!isTranscriptionLanguage(input.language))
      throw new Error('지원하지 않는 전사 언어입니다.')
    return transcriptions().setLanguage(
      requireString(input.id, 'transcription session id', 200),
      input.language,
    )
  })
  ipcMain.handle('transcription:start', async (event, value: unknown) => {
    trusted(event)
    return transcriptions().start(requireString(value, 'transcription session id', 200))
  })
  ipcMain.handle('transcription:retranscribe', async (event, value: unknown) => {
    trusted(event)
    return transcriptions().retranscribe(requireString(value, 'transcription session id', 200))
  })
  ipcMain.handle('transcription:stop', async (event, value: unknown) => {
    trusted(event)
    return transcriptions().stop(requireString(value, 'transcription session id', 200))
  })
  ipcMain.handle('transcription:runtime-status', async (event) => {
    trusted(event)
    return transcriptions().runtimeStatus()
  })
  ipcMain.handle('transcription:install-runtime', async (event) => {
    trusted(event)
    return transcriptions().installRuntime()
  })
  ipcMain.handle('skills:list', async (event) => {
    trusted(event)
    return listSkills(app.getPath('userData'))
  })
  ipcMain.handle('skills:install', async (event) => {
    trusted(event)
    if (!mainWindow) return null
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'Non 스킬 폴더 선택',
      message: 'SKILL.md가 들어 있는 폴더를 선택하세요.',
      properties: ['openDirectory'],
    })
    const source = selection.canceled ? null : (selection.filePaths[0] ?? null)
    return source ? installSkill(app.getPath('userData'), source) : null
  })
  ipcMain.handle('skills:set-enabled', async (event, value: unknown) => {
    trusted(event)
    if (!value || typeof value !== 'object') throw new Error('Invalid skill request')
    const input = value as Record<string, unknown>
    const id = requireString(input.id, 'skill id', 80)
    if (typeof input.enabled !== 'boolean') throw new Error('Invalid skill state')
    if (skillChangePending) throw new Error('스킬 설정을 변경하고 있습니다.')
    skillChangePending = true
    try {
      await restartAgentForSkillChange()
      await setSkillEnabled(app.getPath('userData'), id, input.enabled)
      return listSkills(app.getPath('userData'))
    } finally {
      skillChangePending = false
    }
  })
  ipcMain.handle('skills:remove', async (event, value: unknown) => {
    trusted(event)
    const id = requireString(value, 'skill id', 80)
    if (skillChangePending) throw new Error('스킬 설정을 변경하고 있습니다.')
    skillChangePending = true
    try {
      await restartAgentForSkillChange()
      const target = await prepareSkillRemoval(app.getPath('userData'), id)
      await shell.trashItem(target)
      return listSkills(app.getPath('userData'))
    } finally {
      skillChangePending = false
    }
  })
  ipcMain.handle('skills:reveal', async (event) => {
    trusted(event)
    const skills = skillDirectory(app.getPath('userData'))
    await listSkills(app.getPath('userData'))
    await shell.openPath(skills)
  })
  ipcMain.handle('agent:request', async (event, value: unknown) => {
    trusted(event)
    if (skillChangePending) throw new Error('스킬 설정 변경이 끝난 후 다시 시도하세요.')
    if (!value || typeof value !== 'object') throw new Error('Invalid agent request')
    const input = value as AgentRequest
    const id = requireString(input.id, 'request id', 200)
    const action = requireString(input.action, 'agent action', 200)
    agentRoutes.set(id, event.sender)
    try {
      ensureAgent().postMessage({ id, action, payload: input.payload, root: currentRoot })
    } catch (error) {
      agentRoutes.delete(id)
      throw error
    }
  })
  ipcMain.handle('external:open', async (event, value: unknown) => {
    trusted(event)
    const url = new URL(requireString(value, 'URL', 8_000))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Unsupported URL')
    await shell.openExternal(url.toString())
  })
  ipcMain.handle('window:set-theme', async (event, value: unknown) => {
    trusted(event)
    if (!['light', 'dark', 'system'].includes(String(value))) throw new Error('Invalid theme')
    nativeTheme.themeSource = value as ThemeSource
  })
  ipcMain.handle('window:is-full-screen', async (event) => {
    trusted(event)
    return mainWindow?.isFullScreen() ?? false
  })
  ipcMain.handle('window:hide', async (event) => {
    trusted(event)
    mainWindow?.hide()
  })
  ipcMain.handle('window:close-ready', async (event, quit: unknown) => {
    trusted(event)
    if (typeof quit !== 'boolean') throw new Error('Invalid close intent')
    allowClose = true
    if (quit) app.quit()
    else mainWindow?.close()
  })
}

function createWindow() {
  allowClose = false
  closePending = false
  const window = new BrowserWindow({
    title: 'Non',
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 650,
    titleBarStyle: 'hidden',
    trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    show: false,
    webPreferences: {
      preload: join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  const publishFullScreen = () =>
    window.webContents.send('window:full-screen-changed', window.isFullScreen())
  window.on('enter-full-screen', publishFullScreen)
  window.on('leave-full-screen', publishFullScreen)
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (current && new URL(url).origin !== new URL(current).origin) event.preventDefault()
  })
  window.on('close', (event) => {
    if (allowClose || window.webContents.isDestroyed()) return
    event.preventDefault()
    if (closePending) return
    const quit = quitPending
    quitPending = false
    closePending = true
    window.webContents.send('window:close-requested', quit)
    setTimeout(() => {
      closePending = false
    }, 500)
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(join(app.getAppPath(), 'dist', 'index.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('before-quit', () => {
    quitPending = true
  })
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.show()
    mainWindow?.focus()
  })
  app.whenReady().then(async () => {
    await ensureBuiltInSkills(app.getPath('userData'))
    transcriptionManager = new TranscriptionManager(
      app.getPath('userData'),
      (event: TranscriptionEvent) => {
        if (mainWindow && !mainWindow.webContents.isDestroyed())
          mainWindow.webContents.send('transcription:event', event)
      },
    )
    protocol.handle('non-audio', async (request) => {
      const url = new URL(request.url)
      if (url.hostname !== 'session') return new Response('Not found', { status: 404 })
      const id = decodeURIComponent(url.pathname.slice(1))
      if (!id || id.length > 200) return new Response('Not found', { status: 404 })
      const source = await transcriptions().audioPath(id)
      if (!source) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(source).toString(), { headers: request.headers })
    })
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    )
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else {
        if (mainWindow?.isMinimized()) mainWindow.restore()
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => {
    agentProcess?.kill()
    agentProcess = null
    transcriptionManager?.dispose()
    transcriptionManager = null
  })
}
