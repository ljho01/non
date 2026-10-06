import { reorderById } from '@/shared/lib/reorder'

export const MAX_CHAT_TABS = 5

export type ChatTabDescriptor = {
  id: string
  title: string
  isNew: boolean
}

export type ChatTabSession = {
  tabs: ChatTabDescriptor[]
  activeId: string
}

type PersistedChatTabs = {
  openedChatIds: string[]
  activeChatId: string
  titles: Record<string, string>
  newChatIds: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function newChatTab(id: string = crypto.randomUUID()): ChatTabDescriptor {
  return { id, title: '새 대화', isNew: true }
}

export function parseChatTabSession(raw: string | null): ChatTabSession | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    if (!isRecord(value) || !Array.isArray(value.openedChatIds)) return null
    const ids = [
      ...new Set(
        value.openedChatIds.filter(
          (id): id is string => typeof id === 'string' && UUID.test(id),
        ),
      ),
    ].slice(0, MAX_CHAT_TABS)
    if (!ids.length) return null
    const titles = isRecord(value.titles) ? value.titles : {}
    const newIds = new Set(
      Array.isArray(value.newChatIds)
        ? value.newChatIds.filter((id): id is string => typeof id === 'string')
        : [],
    )
    const tabs = ids.map((id) => ({
      id,
      title: typeof titles[id] === 'string' ? titles[id].slice(0, 120) : '새 대화',
      isNew: newIds.has(id),
    }))
    const activeId =
      typeof value.activeChatId === 'string' && ids.includes(value.activeChatId)
        ? value.activeChatId
        : ids[0]
    return { tabs, activeId }
  } catch {
    return null
  }
}

export function serializeChatTabSession(session: ChatTabSession): string {
  const value: PersistedChatTabs = {
    openedChatIds: session.tabs.map((tab) => tab.id),
    activeChatId: session.activeId,
    titles: Object.fromEntries(session.tabs.map((tab) => [tab.id, tab.title])),
    newChatIds: session.tabs.filter((tab) => tab.isNew).map((tab) => tab.id),
  }
  return JSON.stringify(value)
}

export function openChatTab(
  session: ChatTabSession,
  tab: ChatTabDescriptor,
): ChatTabSession {
  const existing = session.tabs.find((item) => item.id === tab.id)
  const tabs = existing
    ? session.tabs.map((item) => (item.id === tab.id ? { ...item, ...tab } : item))
    : [tab, ...session.tabs].slice(0, MAX_CHAT_TABS)
  return { tabs, activeId: tab.id }
}

export function closeChatTab(
  session: ChatTabSession,
  id: string,
  fallback: ChatTabDescriptor,
): ChatTabSession {
  const index = session.tabs.findIndex((tab) => tab.id === id)
  if (index < 0) return session
  const tabs = session.tabs.filter((tab) => tab.id !== id)
  if (!tabs.length) return { tabs: [fallback], activeId: fallback.id }
  if (session.activeId !== id) return { tabs, activeId: session.activeId }
  return { tabs, activeId: tabs[Math.max(0, index - 1)]?.id ?? tabs[0].id }
}

export function reorderChatTab(
  session: ChatTabSession,
  id: string,
  toIndex: number,
): ChatTabSession {
  return {
    ...session,
    tabs: reorderById(session.tabs, id, toIndex, (tab) => tab.id),
  }
}
