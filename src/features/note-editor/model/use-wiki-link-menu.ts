import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { knowledge } from '@/shared/api/knowledge'
import type { SearchHit } from '@/shared/contracts/links'
import { errorText } from '@/shared/lib/utils'
import { matchWikiLinkQuery, type WikiLinkQuery } from './wiki-suggestion'

export type WikiLinkMenuState = WikiLinkQuery & {
  left: number
  top: number
}

type WikiLinkRuntime = {
  active: number
  hits: SearchHit[]
}

export function useWikiLinkMenu({
  root,
  currentPath,
  allowCodeBlock = false,
}: {
  root: string | null
  currentPath: string
  allowCodeBlock?: boolean
}) {
  const [menu, setMenu] = useState<WikiLinkMenuState | null>(null)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [status, setStatus] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const menuRef = useRef<WikiLinkMenuState | null>(null)
  const runtime = useRef<WikiLinkRuntime>({ active: 0, hits: [] })

  const close = useCallback(() => {
    menuRef.current = null
    setMenu(null)
    setHits([])
    setStatus('')
  }, [])

  const update = useCallback(
    (editor: Editor) => {
      const { from, empty, $from } = editor.state.selection
      if (
        !editor.isEditable ||
        !empty ||
        !$from.parent.isTextblock ||
        (!allowCodeBlock && ($from.parent.type.spec.code || editor.isActive('code')))
      ) {
        close()
        return false
      }

      const text = $from.parent.textBetween(0, $from.parentOffset, '\n', '\uFFFC')
      const match = matchWikiLinkQuery(text, from)
      if (!match) {
        close()
        return false
      }

      const coords = editor.view.coordsAtPos(from)
      const menuHeight = 326
      const left = Math.max(12, Math.min(coords.left, window.innerWidth - 336))
      const top =
        coords.bottom + menuHeight > window.innerHeight
          ? Math.max(12, coords.top - menuHeight)
          : coords.bottom + 7
      const next = { ...match, left, top }
      const previous = menuRef.current
      menuRef.current = next
      setMenu(next)
      if (!previous || previous.query !== next.query || previous.from !== next.from) setActiveIndex(0)
      return true
    },
    [allowCodeBlock, close],
  )

  useEffect(() => {
    if (!menu || !root) return
    let alive = true
    setHits([])
    setStatus('검색 중…')
    const timer = window.setTimeout(() => {
      void knowledge
        .search(menu.query.trim())
        .then((results) => {
          if (!alive) return
          const next = results.filter((hit) => hit.path !== currentPath).slice(0, 8)
          setHits(next)
          setStatus(next.length ? '' : '일치하는 문서가 없습니다.')
        })
        .catch((error) => {
          if (alive) setStatus(errorText(error))
        })
    }, 120)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [currentPath, menu?.query, root])

  const resolvedActiveIndex = Math.min(activeIndex, Math.max(0, hits.length - 1))
  runtime.current = { active: resolvedActiveIndex, hits }

  const handleKeyDown = useCallback(
    (event: KeyboardEvent, select: (hit: SearchHit) => void) => {
      if (event.isComposing || !menuRef.current) return false
      const current = runtime.current
      if (event.key === 'ArrowDown' && current.hits.length) {
        event.preventDefault()
        const next = (current.active + 1) % current.hits.length
        current.active = next
        setActiveIndex(next)
        return true
      }
      if (event.key === 'ArrowUp' && current.hits.length) {
        event.preventDefault()
        const next = (current.active - 1 + current.hits.length) % current.hits.length
        current.active = next
        setActiveIndex(next)
        return true
      }
      if (event.key === 'Enter' && current.hits.length) {
        event.preventDefault()
        const hit = current.hits[current.active]
        if (hit) select(hit)
        return true
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return true
      }
      return false
    },
    [close],
  )

  return {
    menu,
    menuRef,
    hits,
    status,
    activeIndex: resolvedActiveIndex,
    setActiveIndex,
    close,
    update,
    handleKeyDown,
  }
}
