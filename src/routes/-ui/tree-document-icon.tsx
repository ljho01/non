import type { Entry } from '@/shared/api/desktop'
import { AudioWaveform, Canvas, Database, FilePdf, FileText } from '@/shared/ui/icon'
import { cn } from '@/shared/lib/utils'

export function TreeDocumentIcon({
  kind,
  selected = false,
}: {
  kind: Entry['kind']
  selected?: boolean
}) {
  if (kind === 'transcription') return <AudioWaveform size={16} aria-hidden />
  if (kind === 'base') return <Database size={16} aria-hidden />
  if (kind === 'pdf') return <FilePdf size={16} className="text-[#b17b6b]" aria-hidden />
  if (kind === 'canvas') return <Canvas size={16} aria-hidden />
  if (kind === 'legacy') {
    return (
      <span className="relative size-4 shrink-0 text-muted-foreground" aria-hidden>
        <FileText size={16} />
        <span
          className={cn(
            'absolute -right-1 -bottom-0.5 rounded-sm bg-sidebar px-px text-2xs font-medium leading-none group-hover/sidebar-item:bg-accent',
            selected && 'bg-accent',
          )}
        >
          md
        </span>
      </span>
    )
  }
  return <FileText size={16} aria-hidden />
}
