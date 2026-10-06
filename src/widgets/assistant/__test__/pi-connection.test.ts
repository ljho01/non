import { expect, test } from 'bun:test'
import { EventType } from '@tanstack/ai'
import type { AgentEvent } from '@/shared/api/desktop'
import { createPiConnection } from '../model/pi-connection'

test('pi IPC events are exposed as TanStack AI AG-UI stream chunks', async () => {
  const payload = { chatId: crypto.randomUUID(), text: 'hello', model: 'codex' }
  let received: unknown
  const connection = createPiConnection(async (action, nextPayload, event) => {
    expect(action).toBe('prompt')
    received = nextPayload
    event?.({ type: 'memory_context', ids: ['global:one'] } satisfies AgentEvent)
    event?.({ type: 'tool', name: 'search_notes' } satisfies AgentEvent)
    event?.({ type: 'delta', text: '안녕' } satisfies AgentEvent)
    return { messages: [] }
  })

  const chunks = []
  for await (const chunk of connection.connect([], payload, undefined, {
    threadId: payload.chatId,
    runId: 'run-1',
  }))
    chunks.push(chunk)

  expect(received).toEqual(payload)
  expect(chunks.map((chunk) => chunk.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TEXT_MESSAGE_START,
    EventType.CUSTOM,
    EventType.CUSTOM,
    EventType.TEXT_MESSAGE_CONTENT,
    EventType.TEXT_MESSAGE_END,
    EventType.RUN_FINISHED,
  ])
  expect(chunks.find((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)).toMatchObject({
    messageId: 'run-1:assistant',
    delta: '안녕',
  })
})

test('stopping TanStack AI aborts the active pi request', async () => {
  const actions: string[] = []
  const connection = createPiConnection((action) => {
    actions.push(action)
    return action === 'cancel' ? Promise.resolve(undefined) : new Promise(() => undefined)
  })
  const controller = new AbortController()
  const iterator = connection
    .connect([], {}, controller.signal, { threadId: 'thread-1', runId: 'run-1' })
    [Symbol.asyncIterator]()

  expect((await iterator.next()).value?.type).toBe(EventType.RUN_STARTED)
  expect((await iterator.next()).value?.type).toBe(EventType.TEXT_MESSAGE_START)
  controller.abort()
  await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' })
  expect(actions).toEqual(['prompt', 'cancel'])
})
