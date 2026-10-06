import { Agent, type AgentTool, type StreamFn } from '@earendil-works/pi-agent-core'
import { Type, type Api, type Model } from '@earendil-works/pi-ai'
import { z } from 'zod'

const MAX_SUBAGENTS = 4

export function parseSubagentTasks(value: unknown) {
  const input = z
    .object({
      task: z.string().min(1).max(20_000).optional(),
      tasks: z.array(z.string().min(1).max(20_000)).min(1).max(MAX_SUBAGENTS).optional(),
    })
    .superRefine((candidate, context) => {
      if (Boolean(candidate.task) === Boolean(candidate.tasks))
        context.addIssue({ code: 'custom', message: 'task 또는 tasks 중 하나만 지정하세요.' })
    })
    .parse(value)
  return input.task ? [input.task] : (input.tasks ?? [])
}

export function createSubagentTool({
  model,
  streamFn,
  systemPrompt,
  tools,
}: {
  model: Model<Api>
  streamFn: StreamFn
  systemPrompt: string
  tools: AgentTool[]
}): AgentTool {
  return {
    name: 'subagent',
    label: 'Subagent',
    description:
      'Delegate one focused task to an isolated subagent, or run up to four independent tasks in parallel. Use task for one job or tasks for parallel jobs. Subagents cannot delegate again.',
    parameters: Type.Object({
      task: Type.Optional(Type.String()),
      tasks: Type.Optional(Type.Array(Type.String(), { minItems: 1, maxItems: MAX_SUBAGENTS })),
    }),
    execute: async (_toolCallId, value, signal, onUpdate) => {
      const tasks = parseSubagentTasks(value)
      const outputs = await Promise.all(
        tasks.map(async (task, index) => {
          const child = new Agent({
            streamFn,
            shouldStopAfterTurn: ({ context }) => context.messages.length >= 16,
            initialState: {
              model,
              thinkingLevel: 'medium',
              messages: [],
              systemPrompt,
              tools,
            },
          })
          let output = ''
          const abort = () => child.abort()
          signal?.addEventListener('abort', abort, { once: true })
          const unsubscribe = child.subscribe((event) => {
            if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta')
              output += event.assistantMessageEvent.delta
            if (event.type === 'tool_execution_start')
              onUpdate?.({
                content: [
                  {
                    type: 'text',
                    text: `Subagent ${index + 1}/${tasks.length}: ${event.toolName}`,
                  },
                ],
                details: { completed: index, total: tasks.length },
              })
          })
          try {
            await child.prompt(task)
            if (child.state.errorMessage) throw new Error(child.state.errorMessage)
            return output.trim() || 'Subagent completed without a text response.'
          } finally {
            unsubscribe()
            signal?.removeEventListener('abort', abort)
          }
        }),
      )
      const text = outputs
        .map((output, index) =>
          outputs.length === 1 ? output : `## Subagent ${index + 1}\n\n${output}`,
        )
        .join('\n\n')
      return {
        content: [{ type: 'text', text }],
        details: { tasks: tasks.length },
      }
    },
  }
}
