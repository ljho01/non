export const TRANSCRIPTION_LANGUAGES = ['Korean', 'English'] as const

export type TranscriptionLanguage = (typeof TRANSCRIPTION_LANGUAGES)[number]

export type TranscriptionSessionStatus =
  | 'waiting-for-runtime'
  | 'queued'
  | 'preparing'
  | 'transcribing'
  | 'finalizing'
  | 'completed'
  | 'stopped'
  | 'error'

export type TranscriptionSegment = {
  id: string
  startMs: number
  endMs: number
  text: string
}

export type TranscriptionSession = {
  id: string
  path: string
  title: string
  sourceName: string
  sourceKind: 'file' | 'microphone'
  language: TranscriptionLanguage
  status: TranscriptionSessionStatus
  createdAt: number
  updatedAt: number
  durationMs: number | null
  processedMs: number
  hasAudio: boolean
  segments: TranscriptionSegment[]
  stableText: string
  provisionalText: string
  error: string | null
}

export type ArchivedTranscriptionSession = TranscriptionSession & {
  archivedAt: number
  originalPath: string
}

export type TranscriptionMicrophoneInput = {
  id: string
  name: string
}

export type TranscriptionMicrophoneState = {
  inputs: TranscriptionMicrophoneInput[]
  selectedId: string
}

export type TranscriptionRuntimeState =
  | 'unsupported'
  | 'missing-dependencies'
  | 'not-installed'
  | 'installing'
  | 'ready'
  | 'error'

export type TranscriptionRuntimeStatus = {
  state: TranscriptionRuntimeState
  supported: boolean
  uvAvailable: boolean
  ffmpegAvailable: boolean
  repositoryReady: boolean
  modelReady: boolean
  message: string
}

export type TranscriptionEvent =
  | { type: 'session'; session: TranscriptionSession }
  | { type: 'removed'; id: string }
  | { type: 'runtime'; runtime: TranscriptionRuntimeStatus }

export type QwenLiveEvent = {
  schema: 'qwen-asr-live-event-v1'
  index: number
  kind: 'update' | 'final'
  audio_s: number
  elapsed_s: number
  stable_delta: string
  stable_reset: boolean
  provisional: string | null
  text?: string
}

export function isTranscriptionLanguage(value: unknown): value is TranscriptionLanguage {
  return value === 'Korean' || value === 'English'
}

export function parseQwenLiveEvent(line: string): QwenLiveEvent | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (
    row.schema !== 'qwen-asr-live-event-v1' ||
    (row.kind !== 'update' && row.kind !== 'final') ||
    typeof row.index !== 'number' ||
    typeof row.audio_s !== 'number' ||
    typeof row.elapsed_s !== 'number' ||
    typeof row.stable_delta !== 'string' ||
    typeof row.stable_reset !== 'boolean' ||
    (row.provisional !== null && typeof row.provisional !== 'string') ||
    (row.text !== undefined && typeof row.text !== 'string')
  )
    return null
  return row as QwenLiveEvent
}

export function applyQwenLiveEvent(
  session: TranscriptionSession,
  event: QwenLiveEvent,
): TranscriptionSession {
  const eventMs = Math.max(session.processedMs, Math.round(event.audio_s * 1000))
  const stableText = event.stable_reset
    ? event.stable_delta
    : `${session.stableText}${event.stable_delta}`
  const finalText = event.kind === 'final' && typeof event.text === 'string' ? event.text : null
  const delta = event.stable_delta.trim()
  const previousEndMs = session.segments.at(-1)?.endMs ?? 0
  const segments = event.stable_reset
    ? delta
      ? [{ id: String(event.index), startMs: 0, endMs: eventMs, text: delta }]
      : []
    : delta
      ? [
          ...session.segments,
          {
            id: String(event.index),
            startMs: previousEndMs,
            endMs: eventMs,
            text: delta,
          },
        ]
      : session.segments
  return {
    ...session,
    status: event.kind === 'final' ? 'finalizing' : 'transcribing',
    processedMs: eventMs,
    segments,
    stableText: finalText ?? stableText,
    provisionalText: event.kind === 'final' ? '' : (event.provisional ?? ''),
    updatedAt: Date.now(),
    error: null,
  }
}
