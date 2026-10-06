import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, chmod, mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { arch, homedir, release, tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import {
  applyQwenLiveEvent,
  parseQwenLiveEvent,
  type TranscriptionEvent,
  type ArchivedTranscriptionSession,
  type TranscriptionLanguage,
  type TranscriptionMicrophoneInput,
  type TranscriptionMicrophoneState,
  type TranscriptionRuntimeStatus,
  type TranscriptionSegment,
  type TranscriptionSession,
} from '../src/shared/contracts/transcription'

const QWEN_REPOSITORY = 'https://github.com/ljho01/qwen3-asr-opt.git'
const QWEN_COMMIT = '5303f31e5c7558fc1435426099342cec8cd15182'
const QWEN_MODEL_REVISION = '7278e1e70fe206f11671096ffdd38061171dd6e5'
const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.aiff',
  '.flac',
  '.m4a',
  '.m4v',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
])

type StoredSession = TranscriptionSession & {
  sourcePath: string | null
  attempt: number
  archivedAt: number | null
  originalPath: string | null
}

type StoredState = {
  version: 1
  sessions: StoredSession[]
  microphoneInputId?: string
}

type RunningSession = {
  process: ChildProcessWithoutNullStreams
  capture: ChildProcessWithoutNullStreams | null
  recordingDone: Promise<RecordingResult> | null
  stopRequested: boolean
}

type RecordingResult = {
  path: string | null
  durationMs: number | null
  error: string | null
}

type QualityChunk = {
  index: number
  start: number
  end: number
  text: string
}

type QualityResult = {
  text: string
  audio_s: number
  chunks: QualityChunk[]
}

function publicSession(session: StoredSession): TranscriptionSession {
  const {
    sourcePath: _sourcePath,
    attempt: _attempt,
    archivedAt: _archivedAt,
    originalPath: _originalPath,
    ...visible
  } = session
  return visible
}

function publicArchivedSession(session: StoredSession): ArchivedTranscriptionSession {
  return {
    ...publicSession(session),
    archivedAt: session.archivedAt ?? session.updatedAt,
    originalPath: session.originalPath ?? session.path,
  }
}

function processEnvironment(extraPaths: string[]) {
  const paths = [
    ...extraPaths,
    join(homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
  return {
    HOME: homedir(),
    LANG: process.env.LANG ?? 'en_US.UTF-8',
    PATH: [...new Set(paths)].join(':'),
    TMPDIR: tmpdir(),
  }
}

async function exists(path: string, mode = constants.F_OK) {
  try {
    await access(path, mode)
    return true
  } catch {
    return false
  }
}

async function isNonEmptyFile(path: string) {
  try {
    const value = await stat(path)
    return value.isFile() && value.size > 0
  } catch {
    return false
  }
}

async function q8ModelReady(repositoryDirectory: string) {
  const modelDirectory = join(repositoryDirectory, 'models', 'q8')
  const [optimizationReady, weightsReady] = await Promise.all([
    isNonEmptyFile(join(modelDirectory, 'optimization.json')),
    isNonEmptyFile(join(modelDirectory, 'weights.safetensors')),
  ])
  return optimizationReady && weightsReady
}

export async function removeOriginalModelAfterConversion(repositoryDirectory: string) {
  if (!(await q8ModelReady(repositoryDirectory))) return false
  const originalDirectory = join(repositoryDirectory, 'models', 'original')
  if (!(await exists(originalDirectory))) return false
  await rm(originalDirectory, { recursive: true, force: true })
  return true
}

async function executable(name: 'ffmpeg' | 'ffprobe' | 'git' | 'uv') {
  const candidates = [
    join(homedir(), '.local', 'bin', name),
    join('/opt/homebrew/bin', name),
    join('/usr/local/bin', name),
    join('/usr/bin', name),
  ]
  for (const candidate of candidates)
    if (await exists(candidate, constants.X_OK)) return candidate
  return null
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
}

export function parseAvfoundationAudioInputs(output: string): TranscriptionMicrophoneInput[] {
  const inputs: TranscriptionMicrophoneInput[] = []
  let readingAudioInputs = false
  for (const line of output.split(/\r?\n/)) {
    if (line.includes('AVFoundation audio devices:')) {
      readingAudioInputs = true
      continue
    }
    if (line.includes('AVFoundation video devices:')) {
      readingAudioInputs = false
      continue
    }
    if (!readingAudioInputs) continue
    const match = line.match(/\[(\d+)\]\s+(.+?)\s*$/)
    if (!match) continue
    inputs.push({ id: match[1], name: match[2] })
  }
  return inputs
}

async function avfoundationAudioInputs(ffmpeg: string) {
  return new Promise<TranscriptionMicrophoneInput[]>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
      { env: processEnvironment([dirname(ffmpeg)]) },
    )
    let output = ''
    child.stderr.on('data', (chunk: Buffer) => {
      output = `${output}${chunk.toString('utf8')}`.slice(-32_000)
    })
    child.once('error', reject)
    child.once('exit', () => resolve(parseAvfoundationAudioInputs(output)))
  })
}

function titleFromSource(path: string) {
  const name = basename(path)
  return name.slice(0, Math.max(1, name.length - extname(name).length))
}

function transcriptionFolder(folder: string) {
  const normalized = folder.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (!normalized && !folder) return ''
  if (
    normalized !== folder.replaceAll('\\', '/') ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('올바르지 않은 전사 폴더입니다.')
  return normalized
}

function transcriptionName(title: string) {
  const normalized = title.trim().replace(/[\\/]/g, '-').replace(/^\.+/, '').slice(0, 180)
  if (!normalized) throw new Error('올바르지 않은 전사 이름입니다.')
  return normalized
}

function transcriptionPath(
  folder: string,
  title: string,
  sessions: Iterable<StoredSession>,
  excludeId?: string,
) {
  const directory = transcriptionFolder(folder)
  const base = transcriptionName(title)
  const occupied = new Set(
    [...sessions].filter((session) => session.id !== excludeId).map((session) => session.path),
  )
  for (let number = 1; number <= 10_000; number += 1) {
    const name = number === 1 ? base : `${base} ${number}`
    const path = directory ? `${directory}/${name}.transcription` : `${name}.transcription`
    if (!occupied.has(path)) return path
  }
  throw new Error('전사 세션 이름을 만들 수 없습니다.')
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function normalizeSegments(value: unknown): TranscriptionSegment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((segment) => {
    if (!segment || typeof segment !== 'object') return []
    const row = segment as Record<string, unknown>
    if (
      typeof row.id !== 'string' ||
      typeof row.startMs !== 'number' ||
      typeof row.endMs !== 'number' ||
      typeof row.text !== 'string'
    )
      return []
    return [{ id: row.id, startMs: row.startMs, endMs: row.endMs, text: row.text }]
  })
}

function qualityChunk(value: unknown): QualityChunk | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (
    typeof row.index !== 'number' ||
    !Number.isInteger(row.index) ||
    row.index < 0 ||
    typeof row.start !== 'number' ||
    !Number.isFinite(row.start) ||
    row.start < 0 ||
    typeof row.end !== 'number' ||
    !Number.isFinite(row.end) ||
    row.end < row.start ||
    typeof row.text !== 'string'
  )
    return null
  return { index: row.index, start: row.start, end: row.end, text: row.text }
}

function parseQualityChunk(line: string) {
  try {
    return qualityChunk(JSON.parse(line) as unknown)
  } catch {
    return null
  }
}

function parseQualityResult(value: unknown): QualityResult | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (
    typeof row.text !== 'string' ||
    typeof row.audio_s !== 'number' ||
    !Number.isFinite(row.audio_s) ||
    row.audio_s < 0 ||
    !Array.isArray(row.chunks)
  )
    return null
  const chunks: QualityChunk[] = []
  for (const value of row.chunks) {
    const chunk = qualityChunk(value)
    if (!chunk) return null
    chunks.push(chunk)
  }
  return {
    text: row.text,
    audio_s: row.audio_s,
    chunks: chunks.sort((left, right) => left.index - right.index),
  }
}

function qualitySegments(chunks: QualityChunk[], attempt: number): TranscriptionSegment[] {
  return chunks.map((chunk) => ({
    id: `quality-${attempt}-${chunk.index}`,
    startMs: Math.round(chunk.start * 1000),
    endMs: Math.round(chunk.end * 1000),
    text: chunk.text,
  }))
}

function supportedMac() {
  const darwinMajor = Number.parseInt(release().split('.')[0] ?? '0', 10)
  return process.platform === 'darwin' && arch() === 'arm64' && darwinMajor >= 24
}

export class TranscriptionManager {
  readonly #baseDirectory: string
  readonly #repositoryDirectory: string
  readonly #statePath: string
  readonly #publish: (event: TranscriptionEvent) => void
  readonly #sessions = new Map<string, StoredSession>()
  readonly #running = new Map<string, RunningSession>()
  #loaded: Promise<void> | null = null
  #persisting: Promise<void> = Promise.resolve()
  #installing = false
  #runtimeMessage = ''
  #runtimeError: string | null = null
  #microphoneInputId = '0'

  constructor(dataDirectory: string, publish: (event: TranscriptionEvent) => void) {
    this.#baseDirectory = join(dataDirectory, 'transcription')
    this.#repositoryDirectory = join(this.#baseDirectory, 'qwen3-asr-opt')
    this.#statePath = join(this.#baseDirectory, 'sessions.json')
    this.#publish = publish
    void removeOriginalModelAfterConversion(this.#repositoryDirectory).catch(() => undefined)
  }

  async #load() {
    this.#loaded ??= (async () => {
      await mkdir(this.#baseDirectory, { recursive: true })
      try {
        const stored = JSON.parse(await readFile(this.#statePath, 'utf8')) as unknown
        if (!stored || typeof stored !== 'object') return
        const value = stored as Partial<StoredState>
        if (value.version !== 1 || !Array.isArray(value.sessions)) return
        if (typeof value.microphoneInputId === 'string' && /^\d+$/.test(value.microphoneInputId))
          this.#microphoneInputId = value.microphoneInputId
        for (const session of value.sessions) {
          if (!session || typeof session !== 'object' || typeof session.id !== 'string') continue
          const storedPath = (session as Partial<TranscriptionSession>).path
          const normalized: StoredSession = {
            ...session,
            path:
              typeof storedPath === 'string' && storedPath.endsWith('.transcription')
                ? storedPath
                : transcriptionPath('', session.title, this.#sessions.values()),
            sourceKind: session.sourceKind === 'microphone' ? 'microphone' : 'file',
            sourceName: session.sourceKind === 'microphone' ? '마이크' : session.sourceName,
            sourcePath: typeof session.sourcePath === 'string' ? session.sourcePath : null,
            hasAudio:
              session.sourceKind === 'microphone'
                ? session.hasAudio === true && typeof session.sourcePath === 'string'
                : typeof session.sourcePath === 'string',
            segments: normalizeSegments(session.segments),
            archivedAt:
              typeof session.archivedAt === 'number' && Number.isFinite(session.archivedAt)
                ? session.archivedAt
                : null,
            originalPath:
              typeof session.originalPath === 'string' ? session.originalPath : null,
            status:
              session.status === 'preparing' ||
              session.status === 'transcribing' ||
              session.status === 'finalizing'
                ? 'stopped'
                : session.status,
          }
          this.#sessions.set(normalized.id, normalized)
        }
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String(error.code) : ''
        if (code !== 'ENOENT') throw error
      }
    })()
    await this.#loaded
  }

  async #persist() {
    const operation = this.#persisting.then(async () => {
      const state: StoredState = {
        version: 1,
        sessions: [...this.#sessions.values()],
        microphoneInputId: this.#microphoneInputId,
      }
      const temporary = `${this.#statePath}.${process.pid}.tmp`
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
      await rename(temporary, this.#statePath)
    })
    this.#persisting = operation.catch(() => undefined)
    await operation
  }

  #emitSession(session: StoredSession) {
    this.#publish({ type: 'session', session: publicSession(session) })
  }

  async list() {
    await this.#load()
    return [...this.#sessions.values()]
      .filter((session) => session.archivedAt === null)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(publicSession)
  }

  async listArchived() {
    await this.#load()
    return [...this.#sessions.values()]
      .filter((session) => session.archivedAt !== null)
      .sort((left, right) => (right.archivedAt ?? 0) - (left.archivedAt ?? 0))
      .map(publicArchivedSession)
  }

  async microphoneInputs(): Promise<TranscriptionMicrophoneState> {
    await this.#load()
    const ffmpeg = await executable('ffmpeg')
    const inputs = ffmpeg ? await avfoundationAudioInputs(ffmpeg) : []
    const selectedId = inputs.some((input) => input.id === this.#microphoneInputId)
      ? this.#microphoneInputId
      : (inputs[0]?.id ?? '0')
    if (selectedId !== this.#microphoneInputId) {
      this.#microphoneInputId = selectedId
      await this.#persist()
    }
    return { inputs, selectedId }
  }

  async setMicrophoneInput(id: string): Promise<TranscriptionMicrophoneState> {
    await this.#load()
    if (!/^\d+$/.test(id)) throw new Error('올바르지 않은 마이크 입력입니다.')
    const state = await this.microphoneInputs()
    if (!state.inputs.some((input) => input.id === id))
      throw new Error('선택한 마이크 입력을 찾을 수 없습니다.')
    this.#microphoneInputId = id
    await this.#persist()
    return { ...state, selectedId: id }
  }

  async create(sourcePath: string, language: TranscriptionLanguage, folder = '') {
    await this.#load()
    const extension = extname(sourcePath).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(extension)) throw new Error('지원하지 않는 오디오 형식입니다.')
    const source = await stat(sourcePath)
    if (!source.isFile()) throw new Error('선택한 오디오 파일을 읽을 수 없습니다.')
    const now = Date.now()
    const session: StoredSession = {
      id: randomUUID(),
      path: transcriptionPath(folder, titleFromSource(sourcePath), this.#sessions.values()),
      title: titleFromSource(sourcePath),
      sourceName: basename(sourcePath),
      sourcePath,
      sourceKind: 'file',
      language,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      durationMs: await this.#probeDuration(sourcePath),
      processedMs: 0,
      hasAudio: true,
      segments: [],
      stableText: '',
      provisionalText: '',
      error: null,
      attempt: 0,
      archivedAt: null,
      originalPath: null,
    }
    this.#sessions.set(session.id, session)
    await this.#persist()
    this.#emitSession(session)
    return publicSession(session)
  }

  async createMicrophone(language: TranscriptionLanguage, folder = '') {
    await this.#load()
    const now = Date.now()
    const time = new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(now)
    const title = `실시간 전사 · ${time}`
    const session: StoredSession = {
      id: randomUUID(),
      path: transcriptionPath(folder, title, this.#sessions.values()),
      title,
      sourceName: '마이크',
      sourceKind: 'microphone',
      sourcePath: null,
      language,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      durationMs: null,
      processedMs: 0,
      hasAudio: false,
      segments: [],
      stableText: '',
      provisionalText: '',
      error: null,
      attempt: 0,
      archivedAt: null,
      originalPath: null,
    }
    this.#sessions.set(session.id, session)
    await this.#persist()
    this.#emitSession(session)
    return publicSession(session)
  }

  async renameSession(id: string, name: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
    const title = transcriptionName(name.replace(/\.transcription$/i, ''))
    const folder = session.path.includes('/') ? session.path.slice(0, session.path.lastIndexOf('/')) : ''
    session.path = transcriptionPath(folder, title, this.#sessions.values(), id)
    session.title = title
    session.updatedAt = Date.now()
    await this.#persist()
    this.#emitSession(session)
    return publicSession(session)
  }

  async moveSession(id: string, folder: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
    session.path = transcriptionPath(folder, session.title, this.#sessions.values(), id)
    session.updatedAt = Date.now()
    await this.#persist()
    this.#emitSession(session)
    return publicSession(session)
  }

  async removeSession(id: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session) return
    if (this.#running.has(id)) throw new Error('진행 중인 전사를 먼저 중지하세요.')
    this.#sessions.delete(id)
    await rm(join(this.#baseDirectory, 'sessions', id), { recursive: true, force: true })
    await this.#persist()
    this.#publish({ type: 'removed', id })
  }

  async archiveSession(id: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
    if (this.#running.has(id)) throw new Error('진행 중인 전사를 먼저 중지하세요.')
    if (session.archivedAt !== null) return publicArchivedSession(session)
    session.originalPath = session.path
    session.archivedAt = Date.now()
    session.updatedAt = session.archivedAt
    await this.#persist()
    this.#publish({ type: 'removed', id })
    return publicArchivedSession(session)
  }

  async restoreArchivedSession(id: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session || session.archivedAt === null)
      throw new Error('보관된 전사 세션을 찾을 수 없습니다.')
    const originalPath = session.originalPath ?? session.path
    const folder = originalPath.includes('/')
      ? originalPath.slice(0, originalPath.lastIndexOf('/'))
      : ''
    session.path = transcriptionPath(folder, session.title, this.#sessions.values(), id)
    session.archivedAt = null
    session.originalPath = null
    session.updatedAt = Date.now()
    await this.#persist()
    this.#emitSession(session)
    return publicSession(session)
  }

  async setLanguage(id: string, language: TranscriptionLanguage) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
    if (this.#running.has(id)) throw new Error('전사를 중지한 뒤 언어를 변경하세요.')
    session.language = language
    session.updatedAt = Date.now()
    session.error = null
    await this.#persist()
    this.#emitSession(session)
    return publicSession(session)
  }

  async #probeDuration(sourcePath: string) {
    const ffprobe = await executable('ffprobe')
    if (!ffprobe) return null
    return new Promise<number | null>((resolve) => {
      const child = spawn(
        ffprobe,
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', sourcePath],
        { env: processEnvironment([dirname(ffprobe)]) },
      )
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => {
        if (output.length < 64_000) output += chunk.toString('utf8')
      })
      child.once('error', () => resolve(null))
      child.once('exit', (code) => {
        if (code !== 0) return resolve(null)
        try {
          const value = JSON.parse(output) as { format?: { duration?: string } }
          const seconds = Number.parseFloat(value.format?.duration ?? '')
          resolve(Number.isFinite(seconds) ? Math.round(seconds * 1000) : null)
        } catch {
          resolve(null)
        }
      })
    })
  }

  async runtimeStatus(): Promise<TranscriptionRuntimeStatus> {
    if (!supportedMac()) {
      return {
        state: 'unsupported',
        supported: false,
        uvAvailable: false,
        ffmpegAvailable: false,
        repositoryReady: false,
        modelReady: false,
        message: 'Qwen3-ASR 로컬 전사는 Apple Silicon의 macOS 15 이상에서 지원됩니다.',
      }
    }
    const [uv, ffmpeg, asrReady, finalProfileReady, modelReady] = await Promise.all([
      executable('uv'),
      executable('ffmpeg'),
      exists(join(this.#repositoryDirectory, 'asr'), constants.X_OK),
      exists(join(this.#repositoryDirectory, 'transcribe-final')),
      q8ModelReady(this.#repositoryDirectory),
    ])
    const repositoryReady = asrReady && finalProfileReady
    const base = {
      supported: true,
      uvAvailable: Boolean(uv),
      ffmpegAvailable: Boolean(ffmpeg),
      repositoryReady,
      modelReady,
    }
    if (this.#installing)
      return { ...base, state: 'installing', message: this.#runtimeMessage || '설치 중…' }
    if (this.#runtimeError)
      return { ...base, state: 'error', message: this.#runtimeError }
    if (!uv || !ffmpeg)
      return {
        ...base,
        state: 'missing-dependencies',
        message: '먼저 Homebrew에서 uv와 ffmpeg를 설치해 주세요: brew install uv ffmpeg',
      }
    if (!repositoryReady || !modelReady)
      return {
        ...base,
        state: 'not-installed',
        message: 'Qwen3-ASR 코드와 q8 모델을 이 Mac에 한 번 설치해야 합니다.',
      }
    return { ...base, state: 'ready', message: 'Qwen3-ASR q8 로컬 런타임 준비 완료' }
  }

  async #publishRuntime(message: string) {
    this.#runtimeMessage = message
    this.#publish({ type: 'runtime', runtime: await this.runtimeStatus() })
  }

  async installRuntime() {
    const current = await this.runtimeStatus()
    if (current.state === 'ready' || current.state === 'installing') return current
    if (current.state === 'unsupported' || current.state === 'missing-dependencies') return current
    this.#installing = true
    this.#runtimeError = null
    void this.#performInstallation()
    return this.runtimeStatus()
  }

  async #performInstallation() {
    try {
      await mkdir(this.#baseDirectory, { recursive: true })
      const git = (await executable('git')) ?? '/usr/bin/git'
      const uv = await executable('uv')
      if (!uv) throw new Error('uv를 찾을 수 없습니다.')
      if (
        !(await exists(join(this.#repositoryDirectory, 'asr'), constants.X_OK)) ||
        !(await exists(join(this.#repositoryDirectory, 'transcribe-final')))
      ) {
        await this.#publishRuntime('Qwen3-ASR 코드를 내려받는 중…')
        await mkdir(this.#repositoryDirectory, { recursive: true })
        if (!(await exists(join(this.#repositoryDirectory, '.git'))))
          await this.#run(git, ['init', this.#repositoryDirectory])
        try {
          await this.#run(git, ['-C', this.#repositoryDirectory, 'remote', 'set-url', 'origin', QWEN_REPOSITORY])
        } catch {
          await this.#run(git, ['-C', this.#repositoryDirectory, 'remote', 'add', 'origin', QWEN_REPOSITORY])
        }
        await this.#run(git, ['-C', this.#repositoryDirectory, 'fetch', '--depth', '1', 'origin', QWEN_COMMIT])
        await this.#run(git, ['-C', this.#repositoryDirectory, 'checkout', '--detach', 'FETCH_HEAD'])
      }
      await this.#publishRuntime('Python 3.12 전사 환경을 준비하는 중…')
      await this.#run(uv, ['sync', '--python', '3.12'], this.#repositoryDirectory)
      if (!(await exists(join(this.#repositoryDirectory, 'models', 'original', 'config.json')))) {
        await this.#publishRuntime('Qwen3-ASR 1.7B 모델을 내려받는 중…')
        await this.#run(
          uv,
          [
            'tool',
            'run',
            '--from',
            'huggingface-hub',
            'hf',
            'download',
            'Qwen/Qwen3-ASR-1.7B',
            '--revision',
            QWEN_MODEL_REVISION,
            '--local-dir',
            'models/original',
          ],
          this.#repositoryDirectory,
        )
      }
      if (!(await q8ModelReady(this.#repositoryDirectory))) {
        await this.#publishRuntime('Apple Silicon용 q8 모델로 변환하는 중…')
        await this.#run(
          '/bin/sh',
          [
            join(this.#repositoryDirectory, 'asr'),
            'convert',
            '--source',
            'models/original',
            '--output',
            'models/q8',
            '--profile',
            'q8',
            '--group-size',
            '64',
          ],
          this.#repositoryDirectory,
        )
      }
      if (!(await q8ModelReady(this.#repositoryDirectory)))
        throw new Error('변환된 q8 모델을 확인할 수 없습니다.')
      await this.#publishRuntime('변환이 끝난 원본 모델을 정리하는 중…')
      await removeOriginalModelAfterConversion(this.#repositoryDirectory).catch(() => false)
      this.#installing = false
      await this.#publishRuntime('Qwen3-ASR q8 로컬 런타임 준비 완료')
      await this.#load()
      for (const session of this.#sessions.values())
        if (session.status === 'waiting-for-runtime') void this.start(session.id)
    } catch (error) {
      this.#installing = false
      this.#runtimeError = `전사 런타임을 설치하지 못했습니다. ${safeMessage(error)}`
      await this.#publishRuntime(this.#runtimeError)
    }
  }

  async #run(command: string, args: string[], cwd?: string) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: processEnvironment([dirname(command)]),
      })
      let recentError = ''
      child.stderr.on('data', (chunk: Buffer) => {
        recentError = `${recentError}${chunk.toString('utf8')}`.slice(-8_000)
      })
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0) resolve()
        else reject(new Error(recentError.trim() || `프로세스가 종료되었습니다 (${signal ?? code}).`))
      })
    })
  }

  async #captureMicrophone(
    id: string,
    running: RunningSession,
    readyPath: string,
    recordingPath: string,
    ffmpeg: string,
  ): Promise<RecordingResult> {
    while (!(await exists(readyPath))) {
      if (
        running.stopRequested ||
        running.process.exitCode !== null ||
        running.process.signalCode !== null
      )
        return { path: null, durationMs: null, error: null }
      await delay(50)
    }
    if (running.stopRequested || running.process.exitCode !== null)
      return { path: null, durationMs: null, error: null }

    const capture = spawn(
      ffmpeg,
      [
        '-nostdin',
        '-v',
        'error',
        '-f',
        'avfoundation',
        '-i',
        `:${this.#microphoneInputId}`,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        's16le',
        'pipe:1',
        '-map',
        '0:a:0',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        '-movflags',
        '+faststart',
        recordingPath,
      ],
      { env: processEnvironment([dirname(ffmpeg)]) },
    )
    running.capture = capture
    let dataBytes = 0
    let recentError = ''
    capture.stdout.on('data', (chunk: Buffer) => {
      dataBytes += chunk.length
    })
    capture.stderr.on('data', (chunk: Buffer) => {
      recentError = `${recentError}${chunk.toString('utf8')}`.slice(-8_000)
    })
    running.process.stdin.on('error', () => undefined)
    capture.stdout.pipe(running.process.stdin)

    const current = this.#sessions.get(id)
    if (current && !running.stopRequested) {
      current.status = 'transcribing'
      current.updatedAt = Date.now()
      await this.#persist()
      this.#emitSession(current)
    }

    const captureError = await new Promise<string | null>((resolve) => {
      let settled = false
      const finish = (message: string | null) => {
        if (settled) return
        settled = true
        resolve(message)
      }
      capture.once('error', (error) => {
        finish(safeMessage(error))
      })
      capture.once('exit', (code, signal) => {
        finish(
          code === 0 || running.stopRequested || signal === 'SIGINT'
            ? null
            : recentError.trim() || `마이크 캡처가 중단되었습니다 (${signal ?? code}).`,
        )
      })
    })
    const recording = await stat(recordingPath).catch(() => null)
    if (captureError || dataBytes <= 0 || !recording?.isFile() || recording.size <= 0) {
      await unlink(recordingPath).catch(() => undefined)
      return {
        path: null,
        durationMs: null,
        error: captureError || '마이크 녹음 파일을 완성하지 못했습니다.',
      }
    }
    await chmod(recordingPath, 0o600)
    return {
      path: recordingPath,
      durationMs: Math.round((dataBytes / 2 / 16_000) * 1000),
      error: null,
    }
  }

  async start(id: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
    if (this.#running.has(id)) return publicSession(session)
    const runtime = await this.runtimeStatus()
    if (runtime.state !== 'ready') {
      session.status = 'waiting-for-runtime'
      session.updatedAt = Date.now()
      session.error = runtime.state === 'error' ? runtime.message : null
      await this.#persist()
      this.#emitSession(session)
      return publicSession(session)
    }
    if (session.sourceKind === 'file' && (!session.sourcePath || !(await exists(session.sourcePath)))) {
      session.status = 'error'
      session.error = '원본 오디오 파일을 찾을 수 없습니다.'
      session.updatedAt = Date.now()
      await this.#persist()
      this.#emitSession(session)
      return publicSession(session)
    }

    session.attempt += 1
    session.status = 'preparing'
    session.processedMs = 0
    session.segments = []
    session.stableText = ''
    session.provisionalText = ''
    session.error = null
    session.updatedAt = Date.now()
    const outputDirectory = join(this.#baseDirectory, 'sessions', session.id)
    const output = join(outputDirectory, `live-${session.attempt}.json`)
    const readyPath = join(outputDirectory, `live-${session.attempt}.events.jsonl`)
    const recordingPath = join(outputDirectory, `recording-${session.attempt}.m4a`)
    await mkdir(outputDirectory, { recursive: true })
    await this.#persist()
    this.#emitSession(session)

    const ffmpeg = await executable('ffmpeg')
    const uv = await executable('uv')
    if (session.sourceKind === 'microphone' && !ffmpeg) {
      session.status = 'error'
      session.error = 'FFmpeg를 찾을 수 없어 마이크 녹음을 시작하지 못했습니다.'
      session.updatedAt = Date.now()
      await this.#persist()
      this.#emitSession(session)
      return publicSession(session)
    }
    const child = spawn(
      '/bin/sh',
      [
        join(this.#repositoryDirectory, 'asr'),
        'live',
        ...(session.sourceKind === 'microphone' ? ['-'] : [session.sourcePath as string]),
        '--language',
        session.language,
        '--output',
        output,
        '--format',
        'jsonl',
      ],
      {
        cwd: this.#repositoryDirectory,
        env: processEnvironment(
          [ffmpeg, uv].filter((value): value is string => Boolean(value)).map(dirname),
        ),
      },
    )
    const running: RunningSession = {
      process: child,
      capture: null,
      recordingDone: null,
      stopRequested: false,
    }
    this.#running.set(id, running)
    if (session.sourceKind === 'microphone' && ffmpeg)
      running.recordingDone = this.#captureMicrophone(
        id,
        running,
        readyPath,
        recordingPath,
        ffmpeg,
      )
    let stdout = ''
    let recentError = ''
    let finished = false

    const consume = async (line: string) => {
      const event = parseQwenLiveEvent(line)
      if (!event) return
      const current = this.#sessions.get(id)
      if (!current) return
      Object.assign(current, applyQwenLiveEvent(publicSession(current), event))
      await this.#persist()
      this.#emitSession(current)
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      const lines = stdout.split(/\r?\n/)
      stdout = lines.pop() ?? ''
      for (const line of lines) void consume(line)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      recentError = `${recentError}${chunk.toString('utf8')}`.slice(-8_000)
    })

    const finish = async (code: number | null, signal: NodeJS.Signals | null, launchError?: Error) => {
      if (finished) return
      finished = true
      if (stdout.trim()) await consume(stdout.trim())
      if (running.capture && running.capture.exitCode === null) running.capture.kill('SIGINT')
      const recording = await running.recordingDone
      this.#running.delete(id)
      const current = this.#sessions.get(id)
      if (!current) return
      if (recording?.path) {
        current.sourcePath = recording.path
        current.hasAudio = true
        current.durationMs = recording.durationMs
      }
      if (code === 0) {
        current.status = 'completed'
        if (current.durationMs !== null)
          current.processedMs = Math.max(current.processedMs, current.durationMs)
        current.provisionalText = ''
        current.error = null
      } else if (running.stopRequested || signal === 'SIGINT') {
        current.status = current.stableText ? 'completed' : 'stopped'
        current.provisionalText = ''
      } else {
        current.status = 'error'
        current.error = launchError?.message || recentError.trim() || '전사 프로세스가 중단되었습니다.'
      }
      if (recording?.error) {
        current.error = `전사는 유지했지만 녹음을 저장하지 못했습니다. ${recording.error}`
      }
      current.updatedAt = Date.now()
      await this.#persist()
      this.#emitSession(current)
    }
    child.once('error', (error) => void finish(null, null, error))
    child.once('exit', (code, signal) => void finish(code, signal))
    return publicSession(session)
  }

  async retranscribe(id: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
    if (this.#running.has(id)) return publicSession(session)
    const runtime = await this.runtimeStatus()
    if (runtime.state !== 'ready') {
      session.status = 'waiting-for-runtime'
      session.updatedAt = Date.now()
      session.error = runtime.state === 'error' ? runtime.message : null
      await this.#persist()
      this.#emitSession(session)
      return publicSession(session)
    }
    if (!session.hasAudio || !session.sourcePath || !(await exists(session.sourcePath))) {
      session.status = 'error'
      session.error = '재전사할 원본 오디오 파일을 찾을 수 없습니다.'
      session.updatedAt = Date.now()
      await this.#persist()
      this.#emitSession(session)
      return publicSession(session)
    }

    session.attempt += 1
    session.status = 'preparing'
    session.processedMs = 0
    session.segments = []
    session.stableText = ''
    session.provisionalText = ''
    session.error = null
    session.updatedAt = Date.now()
    const outputDirectory = join(this.#baseDirectory, 'sessions', session.id)
    const output = join(outputDirectory, `quality-${session.attempt}.json`)
    await mkdir(outputDirectory, { recursive: true })
    await this.#persist()
    this.#emitSession(session)

    const ffmpeg = await executable('ffmpeg')
    const uv = await executable('uv')
    const child = spawn(
      '/bin/sh',
      [
        join(this.#repositoryDirectory, 'transcribe-final'),
        session.sourcePath,
        session.language,
        output,
      ],
      {
        cwd: this.#repositoryDirectory,
        env: processEnvironment(
          [ffmpeg, uv].filter((value): value is string => Boolean(value)).map(dirname),
        ),
      },
    )
    const running: RunningSession = {
      process: child,
      capture: null,
      recordingDone: null,
      stopRequested: false,
    }
    this.#running.set(id, running)
    let stdout = ''
    let recentError = ''
    let finished = false
    const chunks = new Map<number, QualityChunk>()

    const consume = async (line: string) => {
      const chunk = parseQualityChunk(line)
      if (!chunk) return
      chunks.set(chunk.index, chunk)
      const current = this.#sessions.get(id)
      if (!current) return
      const ordered = [...chunks.values()].sort((left, right) => left.index - right.index)
      current.status = 'transcribing'
      current.segments = qualitySegments(ordered, current.attempt)
      current.processedMs = Math.round(Math.max(...ordered.map((item) => item.end)) * 1000)
      current.stableText = ordered
        .map((item) => item.text.trim())
        .filter(Boolean)
        .join(' ')
      current.updatedAt = Date.now()
      await this.#persist()
      this.#emitSession(current)
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      const lines = stdout.split(/\r?\n/)
      stdout = lines.pop() ?? ''
      for (const line of lines) void consume(line)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      recentError = `${recentError}${chunk.toString('utf8')}`.slice(-8_000)
    })

    const finish = async (code: number | null, signal: NodeJS.Signals | null, launchError?: Error) => {
      if (finished) return
      finished = true
      if (stdout.trim()) await consume(stdout.trim())
      this.#running.delete(id)
      const current = this.#sessions.get(id)
      if (!current) return
      const final = await readFile(output, 'utf8')
        .then((content) => parseQualityResult(JSON.parse(content) as unknown))
        .catch(() => null)
      if (final) {
        current.status = 'completed'
        current.segments = qualitySegments(final.chunks, current.attempt)
        current.stableText = final.text
        current.provisionalText = ''
        current.processedMs = Math.round(final.audio_s * 1000)
        current.error =
          code === 0
            ? null
            : recentError.trim() || '재전사는 완료됐지만 일부 구간을 확인해야 합니다.'
      } else if (running.stopRequested || signal === 'SIGINT') {
        current.status = current.stableText ? 'completed' : 'stopped'
        current.provisionalText = ''
      } else {
        current.status = 'error'
        current.error =
          launchError?.message || recentError.trim() || '고정밀 재전사 프로세스가 중단되었습니다.'
      }
      current.updatedAt = Date.now()
      await this.#persist()
      this.#emitSession(current)
    }
    child.once('error', (error) => void finish(null, null, error))
    child.once('exit', (code, signal) => void finish(code, signal))
    return publicSession(session)
  }

  async stop(id: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session) throw new Error('전사 세션을 찾을 수 없습니다.')
    const running = this.#running.get(id)
    if (!running) return publicSession(session)
    running.stopRequested = true
    session.status = 'finalizing'
    session.updatedAt = Date.now()
    await this.#persist()
    this.#emitSession(session)
    if (session.sourceKind === 'microphone' && running.capture) {
      running.capture.kill('SIGINT')
      setTimeout(() => {
        if (this.#running.get(id) === running) running.process.kill('SIGINT')
      }, 10_000)
    } else {
      running.process.kill('SIGINT')
    }
    return publicSession(session)
  }

  async audioPath(id: string) {
    await this.#load()
    const session = this.#sessions.get(id)
    if (!session?.hasAudio || !session.sourcePath || !(await exists(session.sourcePath))) return null
    return session.sourcePath
  }

  dispose() {
    for (const running of this.#running.values()) {
      running.capture?.kill('SIGTERM')
      running.process.kill('SIGTERM')
    }
    this.#running.clear()
  }
}
