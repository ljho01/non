import { EventType, type StreamChunk } from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from '@tanstack/ai-react'
import { agentRequest, type AgentEvent } from '@/shared/api/desktop'

type AgentRequestFn = (
  action: string,
  payload?: unknown,
  event?: (event: AgentEvent) => void,
) => Promise<unknown>

const toolActivity: Record<string, string> = {
  list_files: '파일 목록 확인 중',
  read_file: '파일 읽는 중',
  write_file: '파일 저장 중',
  list_notes: '노트 목록 확인 중',
  read_note: '노트 읽는 중',
  search_notes: '노트 검색 중',
  remember: '기억 저장 중',
}

function custom(name: string, value: unknown): StreamChunk {
  return { type: EventType.CUSTOM, name, value, timestamp: Date.now() }
}

function abortError() {
  return new DOMException('The AI response was stopped.', 'AbortError')
}

export function createPiConnection(
  request: AgentRequestFn = agentRequest,
): ConnectConnectionAdapter {
  return {
    async *connect(_messages, data, abortSignal, runContext) {
      if (abortSignal?.aborted) throw abortError()

      const threadId = runContext?.threadId ?? crypto.randomUUID()
      const runId = runContext?.runId ?? crypto.randomUUID()
      const messageId = `${runId}:assistant`
      const queue: StreamChunk[] = [
        { type: EventType.RUN_STARTED, threadId, runId, timestamp: Date.now() },
        {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
          timestamp: Date.now(),
        },
      ]
      let wake: (() => void) | null = null
      let settled = false
      let failure: unknown

      const push = (chunk: StreamChunk) => {
        if (settled) return
        queue.push(chunk)
        wake?.()
        wake = null
      }
      const finish = () => {
        if (settled) return
        queue.push(
          { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: Date.now() },
          { type: EventType.RUN_FINISHED, threadId, runId, timestamp: Date.now() },
        )
        settled = true
        wake?.()
        wake = null
      }
      const fail = (error: unknown) => {
        if (settled) return
        failure = error
        settled = true
        wake?.()
        wake = null
      }
      const onAbort = () => {
        void request('cancel').catch(() => undefined)
        fail(abortError())
      }
      abortSignal?.addEventListener('abort', onAbort, { once: true })

      void request('prompt', data, (event) => {
        if (event.type === 'delta' && event.text) {
          push({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId,
            delta: event.text,
            timestamp: Date.now(),
          })
        }
        if (event.type === 'tool')
          push(custom('non:activity', toolActivity[event.name ?? ''] ?? '도구 실행 중'))
        if (event.type === 'memory_context')
          push(custom('non:memory-context', event.ids ?? []))
        if (event.type === 'memory_saved')
          push(custom('non:memory-saved', event.title ?? '새 기억'))
        if (event.type === 'stream_error')
          push(custom('non:stream-error', event.error ?? '응답 오류'))
      }).then(finish, fail)

      try {
        while (!settled || queue.length) {
          const chunk = queue.shift()
          if (chunk) {
            yield chunk
            continue
          }
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
        if (failure) throw failure
      } finally {
        abortSignal?.removeEventListener('abort', onAbort)
      }
    },
  }
}

export const piConnection = createPiConnection()
