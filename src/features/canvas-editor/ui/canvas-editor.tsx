import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import { useVault, type OpenDocument } from '@/entities/vault'
import { useSettings } from '@/entities/settings'
import { parseCanvas } from '@/shared/contracts/canvas'

function initialData(content: string): ExcalidrawInitialDataState {
  return parseCanvas(content) as unknown as ExcalidrawInitialDataState
}

function useCanvasTheme() {
  const preference = useSettings((state) => state.theme)
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return preference === 'dark' || (preference === 'system' && systemDark) ? 'dark' : 'light'
}

export function CanvasEditor({ document }: { document: OpenDocument }) {
  const theme = useCanvasTheme()
  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const syncing = useRef(false)
  const currentContent = useRef(document.content)
  const data = useMemo(() => initialData(document.content), [document.path])

  useEffect(() => {
    if (document.content === currentContent.current || !api.current) return
    const next = initialData(document.content)
    currentContent.current = document.content
    syncing.current = true
    api.current.updateScene({
      elements: next.elements ?? [],
      appState: { ...api.current.getAppState(), ...next.appState },
    })
    const files = Object.values(next.files ?? {}) as BinaryFileData[]
    if (files.length) api.current.addFiles(files)
    window.requestAnimationFrame(() => {
      syncing.current = false
    })
  }, [document.content])

  const onChange = useCallback<
    NonNullable<React.ComponentProps<typeof Excalidraw>['onChange']>
  >(
    (elements, appState, files) => {
      if (syncing.current) return
      const content = `${serializeAsJSON(elements, appState, files, 'local')}\n`
      if (content === currentContent.current) return
      currentContent.current = content
      useVault.getState().edit(document.path, content)
    },
    [document.path],
  )

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden bg-workspace-surface" aria-label="캔버스 편집기">
      <Excalidraw
        initialData={data}
        excalidrawAPI={(instance) => {
          api.current = instance
        }}
        onChange={onChange}
        theme={theme}
        langCode="ko-KR"
        name={document.path.split('/').at(-1)?.replace(/\.excalidraw$/i, '')}
        autoFocus
      />
    </section>
  )
}
