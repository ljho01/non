import { expect, test } from 'bun:test'
import { parseSubagentTasks } from './subagent'

test('subagent accepts one task or up to four parallel tasks', () => {
  expect(parseSubagentTasks({ task: 'Inspect the source.' })).toEqual(['Inspect the source.'])
  expect(parseSubagentTasks({ tasks: ['A', 'B', 'C', 'D'] })).toEqual(['A', 'B', 'C', 'D'])
  expect(() => parseSubagentTasks({ task: 'A', tasks: ['B'] })).toThrow()
  expect(() => parseSubagentTasks({ tasks: ['A', 'B', 'C', 'D', 'E'] })).toThrow()
})
