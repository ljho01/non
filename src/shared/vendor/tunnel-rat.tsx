import {
  Fragment,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from 'react'

type TunnelEntry = {
  id: number
  current: ReactNode
  listeners: Set<() => void>
}

type TunnelProps = {
  children: ReactNode
}

function TunnelItem({ entry }: { entry: TunnelEntry }) {
  const subscribe = (listener: () => void) => {
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }
  const getSnapshot = () => entry.current

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * React 19-safe replacement for tunnel-rat's tiny In/Out API.
 *
 * Excalidraw 0.18 uses tunnel-rat 0.1.2 for menu and footer slots. That
 * release stores ReactNode identities in Zustand and can recursively update
 * when React 19 recreates a child during the outlet render. Keeping the node
 * in a stable entry lets an inlet update only its matching outlet child.
 */
export default function tunnel() {
  let nextId = 0
  let entries: readonly TunnelEntry[] = []
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const getSnapshot = () => entries

  function In({ children }: TunnelProps) {
    const entry = useRef<TunnelEntry>(null)
    if (!entry.current) {
      entry.current = { id: nextId++, current: children, listeners: new Set() }
    }

    useLayoutEffect(() => {
      const current = entry.current!
      entries = [...entries, current].sort((left, right) => left.id - right.id)
      emit()
      return () => {
        entries = entries.filter((candidate) => candidate !== current)
        emit()
      }
    }, [])

    useLayoutEffect(() => {
      const current = entry.current!
      current.current = children
      for (const listener of current.listeners) listener()
    }, [children])

    return null
  }

  function Out() {
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return (
      <Fragment>
        {current.map((entry) => (
          <TunnelItem key={entry.id} entry={entry} />
        ))}
      </Fragment>
    )
  }

  return { In, Out }
}
