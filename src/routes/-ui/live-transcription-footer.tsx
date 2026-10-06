import { motion, useReducedMotion } from 'framer-motion'
import type { TranscriptionSession } from '@/shared/contracts/transcription'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { ArrowUpRight, Square } from '@/shared/ui/icon'
import { Tip } from '@/shared/ui/tooltip'
import { useI18n } from '@/shared/lib/i18n'

const SPECTRUM_BARS = [
  { height: 'h-2', delay: 0 },
  { height: 'h-3.5', delay: 0.08 },
  { height: 'h-5', delay: 0.16 },
  { height: 'h-3', delay: 0.24 },
  { height: 'h-4', delay: 0.12 },
  { height: 'h-2.5', delay: 0.2 },
] as const

function formatElapsed(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function liveStatus(session: TranscriptionSession, t: (key: string) => string) {
  if (session.status === 'preparing') return t('준비 중')
  if (session.status === 'finalizing') return t('마무리 중')
  return session.sourceKind === 'microphone' ? t('녹음 중') : t('전사 중')
}

function RecordingSpectrum() {
  const reducedMotion = useReducedMotion()
  return (
    <span className="flex h-6 w-7 shrink-0 items-center justify-center gap-0.5" aria-hidden="true">
      {SPECTRUM_BARS.map((bar, index) => (
        <motion.span
          key={index}
          initial={false}
          animate={{ scaleY: reducedMotion ? 0.65 : [0.35, 1, 0.5, 0.82] }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : {
                  delay: bar.delay,
                  duration: 0.72,
                  ease: 'easeInOut',
                  repeat: Number.POSITIVE_INFINITY,
                  repeatType: 'mirror',
                }
          }
          className={cn('w-0.5 origin-center rounded-full bg-red-500', bar.height)}
        />
      ))}
    </span>
  )
}

export function LiveTranscriptionFooter({
  session,
  onOpen,
  onStop,
}: {
  session: TranscriptionSession
  onOpen: () => void
  onStop: () => void
}) {
  const { t } = useI18n()
  return (
    <footer className="shrink-0 border-t border-border/60 p-2" aria-label="진행 중인 전사">
      <div className="flex h-12 items-center gap-1 rounded-xl bg-muted/55 p-1">
        <Button
          unstyled
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left hover:bg-foreground/5 focus-visible:bg-foreground/5"
          aria-label={`${session.title} 전사 탭 열기`}
          onClick={onOpen}
        >
          <RecordingSpectrum />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{session.title}</span>
            <span className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-red-500" aria-hidden="true" />
              <span>{liveStatus(session, t)}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatElapsed(session.processedMs)}</span>
            </span>
          </span>
        </Button>
        <Tip label={t('전사 탭 열기')}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-lg"
            aria-label="현재 전사 탭 열기"
            onClick={onOpen}
          >
            <ArrowUpRight />
          </Button>
        </Tip>
        <Tip label={t('전사 중지')}>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-lg text-red-500 hover:bg-red-500/10 hover:text-red-500"
            aria-label="현재 전사 중지"
            onClick={onStop}
          >
            <Square />
          </Button>
        </Tip>
      </div>
    </footer>
  )
}
