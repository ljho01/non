import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranscription } from '@/entities/transcription'
import { desktop } from '@/shared/api/desktop'
import type {
  TranscriptionRuntimeStatus,
  TranscriptionSegment,
  TranscriptionSession,
  TranscriptionSessionStatus,
  TranscriptionMicrophoneState,
} from '@/shared/contracts/transcription'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  AudioWaveform,
  Check,
  Import,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Square,
} from '@/shared/ui/icon'
import { cn } from '@/shared/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { useI18n } from '@/shared/lib/i18n'

const STATUS_COPY: Record<TranscriptionSessionStatus, string> = {
  'waiting-for-runtime': '런타임 대기',
  queued: '대기 중',
  preparing: '모델 준비 중',
  transcribing: '전사 중',
  finalizing: '문장 정리 중',
  completed: '완료',
  stopped: '중지됨',
  error: '오류',
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '--:--'
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function RuntimeSetup({ runtime }: { runtime: TranscriptionRuntimeStatus | null }) {
  const { t } = useI18n()
  const install = useTranscription((state) => state.installRuntime)
  if (!runtime || runtime.state === 'ready') return null
  const installing = runtime.state === 'installing'
  const installable = runtime.state === 'not-installed' || runtime.state === 'error'
  return (
    <section className="rounded-2xl border border-border bg-card/45 p-5" aria-label="전사 런타임">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          {installing ? <Loader2 className="animate-spin" /> : <Import />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">Qwen3-ASR 로컬 런타임</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{runtime.message}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t('첫 설치에는 모델 다운로드와 q8 변환이 필요해 시간이 걸릴 수 있습니다.')}
          </p>
        </div>
        {installable && (
          <Button size="sm" onClick={() => void install()}>
            <Import />
            {t('설치')}
          </Button>
        )}
      </div>
    </section>
  )
}

function AudioPlayer({
  session,
  audio,
  onPlaybackStart,
  onTimeChange,
}: {
  session: TranscriptionSession
  audio: RefObject<HTMLAudioElement | null>
  onPlaybackStart: () => void
  onTimeChange: (milliseconds: number) => void
}) {
  const { t } = useI18n()
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioUrl = useMemo(() => desktop.transcription.audioUrl(session.id), [session.id])
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    onTimeChange(0)
  }, [session.id])

  const toggle = async () => {
    const element = audio.current
    if (!element) return
    if (element.paused) {
      try {
        await element.play()
      } catch {
        setPlaying(false)
      }
    } else element.pause()
  }

  return (
    <div className="flex h-16 items-center gap-3">
      <audio
        ref={audio}
        className="hidden"
        preload="metadata"
        src={audioUrl}
        onPlay={() => {
          setPlaying(true)
          onPlaybackStart()
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime)
          onTimeChange(event.currentTarget.currentTime * 1000)
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      />
      <Button
        variant="secondary"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        aria-label={playing ? t('오디오 일시 정지') : t('오디오 재생')}
        onClick={() => void toggle()}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          {session.sourceKind === 'file' && <span className="truncate">{session.sourceName}</span>}
          <span className="ml-auto shrink-0 tabular-nums">
            {formatDuration(currentTime * 1000)} / {formatDuration((duration || 0) * 1000)}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-foreground/55 transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: TranscriptionSessionStatus }) {
  if (status === 'completed') return <Check className="text-emerald-500" />
  if (status === 'preparing' || status === 'finalizing') return <Loader2 className="animate-spin" />
  if (status === 'transcribing') return <Mic className="text-red-500" />
  if (status === 'error') return <Square className="text-destructive" />
  return <AudioWaveform />
}

function MicrophoneState({ session }: { session: TranscriptionSession }) {
  const { t } = useI18n()
  const preparing = session.status === 'queued' || session.status === 'preparing'
  const live = session.status === 'transcribing' || session.status === 'finalizing'
  return (
    <section className="flex h-16 items-center gap-3" aria-label="마이크 상태">
      <div
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground',
          live && 'bg-red-500/12 text-red-500',
        )}
      >
        {preparing ? <Loader2 className="animate-spin" /> : <Mic />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {preparing
              ? t('준비 중')
              : live
                ? t('듣는 중')
                : t('세션 종료')}
          </p>
          {live && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-500">
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {preparing
            ? t('준비가 끝나면 입력을 시작합니다.')
            : `${formatDuration(session.processedMs)} ${t('처리됨')}`}
        </p>
      </div>
    </section>
  )
}

function MicrophoneInputSelect({ disabled }: { disabled: boolean }) {
  const [state, setState] = useState<TranscriptionMicrophoneState | null>(null)

  useEffect(() => {
    let active = true
    void desktop.transcription
      .microphoneInputs()
      .then((value) => {
        if (active) setState(value)
      })
      .catch(() => {
        if (active) setState({ inputs: [], selectedId: '0' })
      })
    return () => {
      active = false
    }
  }, [])

  const selectedName = state?.inputs.find((input) => input.id === state.selectedId)?.name
  return (
    <Select
      value={state?.selectedId}
      disabled={disabled || !state?.inputs.length}
      onValueChange={(id) => {
        const previous = state
        if (!previous) return
        setState({ ...previous, selectedId: id })
        void desktop.transcription.setMicrophoneInput(id).then(setState).catch(() => {
          setState(previous)
        })
      }}
    >
      <SelectTrigger
        className="size-8 min-w-0 shrink-0 justify-center rounded-full border-0 bg-muted px-0 shadow-none"
        aria-label="마이크 입력 선택"
        title={selectedName ?? '마이크 입력 선택'}
        showChevron={false}
      >
        <Mic />
      </SelectTrigger>
      <SelectContent align="end">
        {state?.inputs.map((input) => (
          <SelectItem key={input.id} value={input.id}>
            {input.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type TranscriptLine = TranscriptionSegment & { provisional?: boolean }

function transcriptLines(session: TranscriptionSession): TranscriptLine[] {
  const stable = session.segments.length
    ? session.segments
    : session.stableText.trim()
      ? [
          {
            id: 'legacy',
            startMs: 0,
            endMs: session.processedMs,
            text: session.stableText.trim(),
          },
        ]
      : []
  const provisional = session.provisionalText.trim()
  return provisional
    ? [
        ...stable,
        {
          id: 'provisional',
          startMs: session.processedMs,
          endMs: session.processedMs,
          text: provisional,
          provisional: true,
        },
      ]
    : stable
}

function lineTextClass(distance: number) {
  if (distance === 0) return 'text-base font-semibold leading-relaxed text-foreground'
  if (distance === 1) return 'text-base font-medium leading-relaxed text-foreground/75'
  if (distance === 2) return 'text-base font-normal leading-relaxed text-foreground/75'
  return 'text-base font-normal leading-relaxed text-foreground/75'
}

function lineOpacity(distance: number) {
  if (distance === 0) return 1
  return 0.64
}

function TranscriptTimeline({
  session,
  running,
  playbackMs,
  playbackStarted,
  onSeek,
}: {
  session: TranscriptionSession
  running: boolean
  playbackMs: number
  playbackStarted: boolean
  onSeek: (milliseconds: number) => void
}) {
  const reducedMotion = useReducedMotion()
  const viewport = useRef<HTMLDivElement>(null)
  const lines = [...transcriptLines(session)].reverse()
  const playbackIndex = lines.findIndex(
    (line) => playbackMs >= line.startMs && playbackMs < Math.max(line.endMs, line.startMs + 1),
  )
  const activeIndex = playbackStarted && playbackIndex >= 0 ? playbackIndex : 0
  const activeId = lines[activeIndex]?.id

  useEffect(() => {
    const container = viewport.current
    const target = container?.querySelector<HTMLElement>('[data-active-line="true"]')
    if (!container || !target) return
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    container.scrollBy({
      top: targetRect.top - (containerRect.top + 32),
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [activeId, reducedMotion])

  if (!lines.length)
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        {running ? (
          <>
            <AudioWaveform className="mb-3 size-7 animate-pulse text-muted-foreground" />
            <p className="text-sm font-medium">첫 자막을 기다리는 중입니다.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              모델 준비 뒤 안정된 문장부터 표시됩니다.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">전사를 시작하면 자막이 여기에 나타납니다.</p>
        )}
      </div>
    )

  return (
    <div ref={viewport} className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col justify-start gap-px py-8">
        {lines.map((line, index) => {
          const distance = Math.abs(activeIndex - index)
          const active = index === activeIndex
          return (
            <motion.div
              key={line.id}
              layout={reducedMotion ? false : 'position'}
              initial={reducedMotion ? false : { opacity: 0, y: 32, scale: 1.025 }}
              animate={{ opacity: lineOpacity(distance), y: 0, scale: active ? 1 : 0.985 }}
              transition={{ duration: reducedMotion ? 0 : 0.52, ease: [0.22, 1, 0.36, 1] }}
              className="origin-bottom-left"
            >
              <Button
                unstyled
                type="button"
                disabled={!session.hasAudio || line.provisional}
                data-active-line={active || undefined}
                aria-label={`${formatDuration(line.startMs)}부터 재생`}
                className={cn(
                  'flex w-full items-baseline gap-4 rounded-xl px-2 py-2 text-left transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 disabled:opacity-100',
                )}
                onClick={() => onSeek(line.startMs)}
              >
                <span className="w-14 shrink-0 text-right text-2xs font-medium tabular-nums text-muted-foreground">
                  {formatDuration(line.startMs)}
                </span>
                <span className={cn('min-w-0 flex-1 transition-all duration-500', lineTextClass(distance))}>
                  {line.text}
                </span>
              </Button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export function TranscriptionSessionPanel({ sessionId }: { sessionId: string }) {
  const { t } = useI18n()
  const session = useTranscription((state) =>
    state.sessions.find((item) => item.id === sessionId),
  )
  const runtime = useTranscription((state) => state.runtime)
  const start = useTranscription((state) => state.start)
  const retranscribe = useTranscription((state) => state.retranscribe)
  const stop = useTranscription((state) => state.stop)
  const setLanguage = useTranscription((state) => state.setLanguage)
  const audio = useRef<HTMLAudioElement>(null)
  const [playbackMs, setPlaybackMs] = useState(0)
  const [playbackStarted, setPlaybackStarted] = useState(false)

  useEffect(() => {
    setPlaybackMs(0)
    setPlaybackStarted(false)
  }, [sessionId])

  if (!session)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t('전사 세션을 찾을 수 없습니다.')}
      </div>
    )

  const running = ['preparing', 'transcribing', 'finalizing'].includes(session.status)
  const canStart = ['queued', 'stopped', 'error', 'waiting-for-runtime'].includes(session.status)
  const canRetranscribe =
    session.hasAudio &&
    (session.status === 'completed' ||
      (['stopped', 'error'].includes(session.status) &&
        (session.segments.length > 0 || Boolean(session.stableText.trim()))))
  const seekTo = (milliseconds: number) => {
    const element = audio.current
    if (!element) return
    element.currentTime = milliseconds / 1000
    setPlaybackMs(milliseconds)
    setPlaybackStarted(true)
    void element.play().catch(() => undefined)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 px-8 pt-10">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <AudioWaveform className="size-4" />
                <span>{t('로컬 전사 세션')}</span>
                <span aria-hidden="true">·</span>
                <span>{session.language === 'Korean' ? t('한국어') : 'English'}</span>
              </div>
              <h1 className="truncate text-3xl font-semibold tracking-tight">{session.title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={session.language}
                disabled={running}
                onValueChange={(value) => {
                  if (value === 'Korean' || value === 'English')
                    void setLanguage(session.id, value)
                }}
              >
                <SelectTrigger
                  className="h-8 min-w-28 rounded-full shadow-none"
                  aria-label="전사 언어"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Korean">{t('한국어')}</SelectItem>
                  <SelectItem value="English">English</SelectItem>
                </SelectContent>
              </Select>
              <Badge
                variant={session.status === 'error' ? 'destructive' : 'outline'}
                className={cn(
                  'h-8 rounded-full px-3',
                  session.status === 'transcribing' &&
                    'border-red-500/25 bg-red-500/8 text-red-500',
                )}
              >
                <StatusIcon status={session.status} />
                {t(STATUS_COPY[session.status])}
              </Badge>
              {running ? (
                <Button variant="outline" size="sm" onClick={() => void stop(session.id)}>
                  <Square />
                  {t('중지')}
                </Button>
              ) : canRetranscribe && runtime?.state === 'ready' ? (
                <Button
                  size="sm"
                  aria-label="정확도를 높이기 위해 저장된 오디오 재전사"
                  onClick={() => void retranscribe(session.id)}
                >
                  <RefreshCw />
                  {t('재전사')}
                </Button>
              ) : canStart && runtime?.state === 'ready' ? (
                <Button size="sm" onClick={() => void start(session.id)}>
                  <RefreshCw />
                  {t('전사 시작')}
                </Button>
              ) : null}
            </div>
          </header>

          <RuntimeSetup runtime={runtime} />

          <section className="flex min-h-0 flex-1 flex-col px-0" aria-label="전사 자막">
            <TranscriptTimeline
              session={session}
              running={running}
              playbackMs={playbackMs}
              playbackStarted={playbackStarted}
              onSeek={seekTo}
            />
          </section>

          {session.error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive"
            >
              {session.error}
            </p>
          )}
        </div>
      </div>
      <footer className="absolute inset-x-0 bottom-0 z-20 bg-background/50 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-8">
          <div className="min-w-0 flex-1">
            {session.hasAudio ? (
              <AudioPlayer
                session={session}
                audio={audio}
                onPlaybackStart={() => setPlaybackStarted(true)}
                onTimeChange={setPlaybackMs}
              />
            ) : (
              <MicrophoneState session={session} />
            )}
          </div>
          {session.sourceKind === 'microphone' && (
            <MicrophoneInputSelect
              disabled={session.status === 'transcribing' || session.status === 'finalizing'}
            />
          )}
        </div>
      </footer>
    </div>
  )
}
