import { expect, test } from 'bun:test'
import { matchSlashCommand } from '../model/slash'

test('slash commands open at a block start or after whitespace', () => {
  expect(matchSlashCommand('/', 10)).toEqual({ from: 9, to: 10, query: '' })
  expect(matchSlashCommand('생각 /제목', 24)).toEqual({ from: 21, to: 24, query: '제목' })
})

test('slash commands stay closed inside words or after a completed phrase', () => {
  expect(matchSlashCommand('https://example.com', 20)).toBeNull()
  expect(matchSlashCommand('/제목 다음', 30)).toBeNull()
})
