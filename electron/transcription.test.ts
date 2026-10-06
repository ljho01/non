import { afterEach, describe, expect, test } from 'bun:test'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseAvfoundationAudioInputs,
  removeOriginalModelAfterConversion,
  TranscriptionManager,
} from './transcription'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('transcription session storage', () => {
  test('keeps the source path in main while exposing only session metadata', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'non-transcription-'))
    temporaryDirectories.push(dataDirectory)
    const source = join(dataDirectory, 'meeting.wav')
    await writeFile(source, Buffer.alloc(44))
    const events: unknown[] = []
    const manager = new TranscriptionManager(dataDirectory, (event) => events.push(event))

    const created = await manager.create(source, 'Korean')
    expect(created).toMatchObject({
      title: 'meeting',
      sourceName: 'meeting.wav',
      sourceKind: 'file',
      language: 'Korean',
      status: 'queued',
    })
    expect('sourcePath' in (created as unknown as Record<string, unknown>)).toBe(false)
    expect(events).toHaveLength(1)

    const restored = new TranscriptionManager(dataDirectory, () => undefined)
    const sessions = await restored.list()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.id).toBe(created.id)
    expect('sourcePath' in (sessions[0] as unknown as Record<string, unknown>)).toBe(false)
  })

  test('creates path-free microphone sessions and allows language changes while stopped', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'non-transcription-'))
    temporaryDirectories.push(dataDirectory)
    const manager = new TranscriptionManager(dataDirectory, () => undefined)

    const created = await manager.createMicrophone('Korean', '회의/주간')
    expect(created).toMatchObject({
      path: expect.stringMatching(/^회의\/주간\/.+\.transcription$/),
      sourceKind: 'microphone',
      sourceName: '마이크',
      language: 'Korean',
      durationMs: null,
      hasAudio: false,
      segments: [],
    })
    const changed = await manager.setLanguage(created.id, 'English')
    expect(changed.language).toBe('English')
    const renamed = await manager.renameSession(created.id, '제품 회의')
    expect(renamed).toMatchObject({
      title: '제품 회의',
      path: '회의/주간/제품 회의.transcription',
    })
    const moved = await manager.moveSession(created.id, '보관')
    expect(moved.path).toBe('보관/제품 회의.transcription')
    expect(await manager.audioPath(created.id)).toBeNull()
    await manager.removeSession(created.id)
    expect(await manager.list()).toEqual([])
  })

  test('keeps archived sessions out of the active list and restores them', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'non-transcription-'))
    temporaryDirectories.push(dataDirectory)
    const events: Array<{ type?: string; id?: string }> = []
    const manager = new TranscriptionManager(dataDirectory, (event) => events.push(event))
    const created = await manager.createMicrophone('Korean', '회의')

    const archived = await manager.archiveSession(created.id)
    expect(archived).toMatchObject({
      id: created.id,
      originalPath: created.path,
    })
    expect(await manager.list()).toEqual([])
    expect(await manager.listArchived()).toHaveLength(1)
    expect(events.at(-1)).toEqual({ type: 'removed', id: created.id })

    const restored = await manager.restoreArchivedSession(created.id)
    expect(restored.path).toBe(created.path)
    expect(await manager.list()).toHaveLength(1)
    expect(await manager.listArchived()).toEqual([])
  })

  test('rejects files outside the supported audio and video formats', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'non-transcription-'))
    temporaryDirectories.push(dataDirectory)
    const source = join(dataDirectory, 'notes.txt')
    await writeFile(source, 'not audio')
    const manager = new TranscriptionManager(dataDirectory, () => undefined)

    await expect(manager.create(source, 'English')).rejects.toThrow('지원하지 않는 오디오 형식')
  })
})

test('parses only AVFoundation audio inputs', () => {
  const output = [
    '[AVFoundation indev @ 0x1] AVFoundation video devices:',
    '[AVFoundation indev @ 0x1] [0] FaceTime HD Camera',
    '[AVFoundation indev @ 0x1] AVFoundation audio devices:',
    '[AVFoundation indev @ 0x1] [0] MacBook Pro Microphone',
    '[AVFoundation indev @ 0x1] [1] External USB Audio',
  ].join('\n')

  expect(parseAvfoundationAudioInputs(output)).toEqual([
    { id: '0', name: 'MacBook Pro Microphone' },
    { id: '1', name: 'External USB Audio' },
  ])
})

describe('transcription model storage', () => {
  test('removes the source checkpoint after a complete q8 conversion', async () => {
    const repositoryDirectory = await mkdtemp(join(tmpdir(), 'non-transcription-model-'))
    temporaryDirectories.push(repositoryDirectory)
    const originalDirectory = join(repositoryDirectory, 'models', 'original')
    const q8Directory = join(repositoryDirectory, 'models', 'q8')
    await mkdir(originalDirectory, { recursive: true })
    await mkdir(q8Directory, { recursive: true })
    await writeFile(join(originalDirectory, 'model.safetensors'), 'source')
    await writeFile(join(q8Directory, 'optimization.json'), '{}')
    await writeFile(join(q8Directory, 'weights.safetensors'), 'quantized')

    expect(await removeOriginalModelAfterConversion(repositoryDirectory)).toBe(true)
    await expect(access(originalDirectory)).rejects.toThrow()
  })

  test('keeps the source checkpoint when the q8 conversion is incomplete', async () => {
    const repositoryDirectory = await mkdtemp(join(tmpdir(), 'non-transcription-model-'))
    temporaryDirectories.push(repositoryDirectory)
    const originalDirectory = join(repositoryDirectory, 'models', 'original')
    const q8Directory = join(repositoryDirectory, 'models', 'q8')
    await mkdir(originalDirectory, { recursive: true })
    await mkdir(q8Directory, { recursive: true })
    await writeFile(join(originalDirectory, 'model.safetensors'), 'source')
    await writeFile(join(q8Directory, 'optimization.json'), '{}')

    expect(await removeOriginalModelAfterConversion(repositoryDirectory)).toBe(false)
    let originalRetained = false
    try {
      await access(originalDirectory)
      originalRetained = true
    } catch {
      originalRetained = false
    }
    expect(originalRetained).toBe(true)
  })
})
