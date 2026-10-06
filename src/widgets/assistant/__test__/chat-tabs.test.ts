import { expect, test } from 'bun:test'
import {
  closeChatTab,
  newChatTab,
  openChatTab,
  parseChatTabSession,
  reorderChatTab,
  serializeChatTabSession,
  type ChatTabSession,
} from '../model/chat-tabs'

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
]

function session(): ChatTabSession {
  return {
    tabs: ids.slice(0, 3).map((id, index) => ({
      id,
      title: `대화 ${index + 1}`,
      isNew: index === 2,
    })),
    activeId: ids[1],
  }
}

test('chat tabs persist order, active tab, titles and unsent tabs', () => {
  const restored = parseChatTabSession(serializeChatTabSession(session()))
  expect(restored).toEqual(session())
})

test('chat tabs reorder, open up to five, and select a neighbor when closed', () => {
  const reordered = reorderChatTab(session(), ids[0], 2)
  expect(reordered.tabs.map((tab) => tab.id)).toEqual([ids[1], ids[2], ids[0]])

  let opened = reordered
  for (const [index, id] of ids.slice(3).entries())
    opened = openChatTab(opened, { id, title: `추가 ${index}`, isNew: false })
  expect(opened.tabs).toHaveLength(5)
  expect(opened.activeId).toBe(ids[5])

  const closed = closeChatTab(opened, ids[5], newChatTab(ids[0]))
  expect(closed.tabs.some((tab) => tab.id === ids[5])).toBe(false)
  expect(closed.tabs.some((tab) => tab.id === closed.activeId)).toBe(true)
})

test('closing the only chat creates a fresh blank runtime', () => {
  const only = { tabs: [session().tabs[0]], activeId: ids[0] }
  const fallback = newChatTab(ids[1])
  expect(closeChatTab(only, ids[0], fallback)).toEqual({
    tabs: [fallback],
    activeId: ids[1],
  })
})
