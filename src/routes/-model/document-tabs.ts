import { displayFilename, parseNote } from '@/shared/contracts/note'

type TitledDocument = {
  path: string
  kind: 'note' | 'canvas' | 'base' | 'pdf' | 'legacy'
  content: string
}

export function documentTabTitle(document: TitledDocument) {
  if (document.kind === 'note') {
    try {
      return parseNote(document.content).title.trim() || displayFilename(document.path)
    } catch {
      return displayFilename(document.path)
    }
  }
  return displayFilename(document.path)
}

export function tabIndexForShortcut(digit: number, tabCount: number) {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9 || tabCount < 1) return null
  const index = digit === 9 ? tabCount - 1 : digit - 1
  return index < tabCount ? index : null
}

export type WorkspaceTabTarget =
  | { kind: 'transcription'; id: string }
  | { kind: 'document'; path: string }

export function workspaceTabTargetForShortcut(
  digit: number,
  transcriptionIds: readonly string[],
  documentPaths: readonly string[],
): WorkspaceTabTarget | null {
  const targets: WorkspaceTabTarget[] = [
    ...transcriptionIds.map((id) => ({ kind: 'transcription' as const, id })),
    ...documentPaths.map((path) => ({ kind: 'document' as const, path })),
  ]
  const index = tabIndexForShortcut(digit, targets.length)
  return index === null ? null : (targets[index] ?? null)
}

export function modWActionForTabCount(tabCount: number) {
  if (tabCount === 1) return 'hide-window' as const
  if (tabCount > 1) return 'close-tab' as const
  return 'native' as const
}
