import { describe, expect, test } from 'bun:test'
import {
  applyQwenLiveEvent,
  parseQwenLiveEvent,
  type TranscriptionSession,
} from '../transcription'

const session: TranscriptionSession = {
  id: 'session-1',
  path: '회의.transcription',
  title: '회의',
  sourceName: '회의.m4a',
  sourceKind: 'file',
  language: 'Korean',
  status: 'preparing',
  createdAt: 1,
  updatedAt: 1,
  durationMs: 10_000,
  processedMs: 0,
  hasAudio: true,
  segments: [],
  stableText: '',
  provisionalText: '',
  error: null,
}

describe('Qwen live events', () => {
  test('parses only the pinned live event schema', () => {
    expect(
      parseQwenLiveEvent(
        '{"schema":"qwen-asr-live-event-v1","index":0,"kind":"update","audio_s":2.5,"elapsed_s":1,"stable_delta":"안녕","stable_reset":false,"provisional":"하세요"}',
      ),
    ).toMatchObject({ stable_delta: '안녕', provisional: '하세요' })
    expect(parseQwenLiveEvent('not-json')).toBeNull()
    expect(parseQwenLiveEvent('{"schema":"unknown"}')).toBeNull()
  })

  test('applies deltas, resets, and final text without guessing', () => {
    const first = applyQwenLiveEvent(session, {
      schema: 'qwen-asr-live-event-v1',
      index: 0,
      kind: 'update',
      audio_s: 2.5,
      elapsed_s: 2.5,
      stable_delta: '안녕',
      stable_reset: false,
      provisional: '하세요',
    })
    expect(first).toMatchObject({
      status: 'transcribing',
      stableText: '안녕',
      provisionalText: '하세요',
      processedMs: 2500,
      segments: [{ id: '0', startMs: 0, endMs: 2500, text: '안녕' }],
    })

    const reset = applyQwenLiveEvent(first, {
      schema: 'qwen-asr-live-event-v1',
      index: 1,
      kind: 'update',
      audio_s: 5,
      elapsed_s: 5,
      stable_delta: '안녕하세요',
      stable_reset: true,
      provisional: null,
    })
    expect(reset.stableText).toBe('안녕하세요')
    expect(reset.segments).toEqual([
      { id: '1', startMs: 0, endMs: 5000, text: '안녕하세요' },
    ])

    const final = applyQwenLiveEvent(reset, {
      schema: 'qwen-asr-live-event-v1',
      index: 2,
      kind: 'final',
      audio_s: 10,
      elapsed_s: 10,
      stable_delta: ' 여러분',
      stable_reset: false,
      provisional: null,
      text: '안녕하세요 여러분.',
    })
    expect(final).toMatchObject({
      status: 'finalizing',
      stableText: '안녕하세요 여러분.',
      provisionalText: '',
      processedMs: 10_000,
      segments: [
        { id: '1', startMs: 0, endMs: 5000, text: '안녕하세요' },
        { id: '2', startMs: 5000, endMs: 10_000, text: '여러분' },
      ],
    })
  })
})
