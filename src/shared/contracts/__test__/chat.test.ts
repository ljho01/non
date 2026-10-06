import { expect, test } from 'bun:test'
import {
  base64ByteLength,
  chatImageSchema,
  chatImagesSchema,
} from '@/shared/contracts/chat'

test('chat image payloads validate base64 data and supported MIME types', () => {
  const data = Buffer.from('small image fixture').toString('base64')
  expect(base64ByteLength(data)).toBe(19)
  expect(chatImageSchema.parse({ data, mimeType: 'image/png' })).toEqual({
    data,
    mimeType: 'image/png',
  })
  expect(chatImageSchema.safeParse({ data: 'not-base64', mimeType: 'image/png' }).success).toBe(
    false,
  )
  expect(chatImageSchema.safeParse({ data, mimeType: 'image/svg+xml' }).success).toBe(false)
})

test('one chat turn accepts at most five images', () => {
  const image = { data: Buffer.from('image').toString('base64'), mimeType: 'image/jpeg' as const }
  expect(chatImagesSchema.safeParse(Array.from({ length: 5 }, () => image)).success).toBe(true)
  expect(chatImagesSchema.safeParse(Array.from({ length: 6 }, () => image)).success).toBe(false)
})

