import { afterEach, expect, spyOn, test } from 'bun:test'
import { desktop, type Entry } from '@/shared/api/desktop'
import { useVault, type OpenDocument } from '../model/vault'
import { createNote, parseNote, serializeNote } from '@/shared/contracts/note'
import { createCanvas, parseCanvas, serializeCanvas } from '@/shared/contracts/canvas'

const values = new Map<string, string>()
const storage: Storage = {
  get length() {
    return values.size
  },
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => {
    values.set(key, value)
  },
  removeItem: (key) => {
    values.delete(key)
  },
}
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
const content = (title: string) => serializeNote(createNote(title))
const first = content('my edit')
const newer = content('newer edit')
const original: OpenDocument = {
  path: 'note.note.json',
  kind: 'note',
  content: first,
  saved: content('old'),
  revision: 'v1',
  saving: false,
  error: 'CONFLICT',
  page: 1,
  pdfText: '',
}
afterEach(() => {
  useVault.setState({
    path: null,
    entries: [],
    tabs: [],
    active: null,
    selectedFolder: '',
    loading: false,
    error: null,
  })
  values.clear()
})

test('switching root folders restores each folder’s saved tabs', async () => {
  const markdown = new Map([
    ['/Notes', new Map([['Ideas.md', '# Ideas\n']])],
    ['/Reading', new Map([['Papers/Queue.md', '# Queue\n']])],
  ])
  const open = spyOn(desktop, 'open').mockImplementation(async (root) => ({
    path: root,
    entries: [...markdown.get(root)!.entries()].map(([path, value]) => ({
      path,
      name: path.split('/').at(-1)!,
      kind: 'legacy',
      modified: 1,
      size: value.length,
    })),
  }))
  const read = spyOn(desktop, 'read').mockImplementation(async (path) => {
    const root = useVault.getState().path!
    return { content: markdown.get(root)!.get(path)!, revision: `${root}:${path}` }
  })
  try {
    storage.setItem(
      'non-tabs:/Reading',
      JSON.stringify({ paths: ['Papers/Queue.md'], active: 'Papers/Queue.md' }),
    )
    await useVault.getState().openVault('/Reading')

    expect(useVault.getState().path).toBe('/Reading')
    expect(useVault.getState().tabs.map((tab) => tab.path)).toEqual(['Papers/Queue.md'])
    expect(useVault.getState().active).toBe('Papers/Queue.md')
    expect(useVault.getState().selectedFolder).toBe('Papers')
  } finally {
    open.mockRestore()
    read.mockRestore()
  }
})

test('selecting a folder keeps the current document active', () => {
  useVault.setState({
    path: '/Notes',
    tabs: [{ ...original, path: 'Inbox.note.json' }],
    active: 'Inbox.note.json',
    selectedFolder: '',
  })

  useVault.getState().selectFolder('Research')

  expect(useVault.getState().selectedFolder).toBe('Research')
  expect(useVault.getState().active).toBe('Inbox.note.json')
})

test('document tabs keep their dragged order per root folder', () => {
  const tabs = ['one.md', 'two.md', 'three.md'].map((path) => ({
    ...original,
    path,
    kind: 'legacy' as const,
    content: `# ${path}\n`,
    saved: `# ${path}\n`,
  }))
  useVault.setState({ path: '/ordered', tabs, active: 'two.md' })

  useVault.getState().reorderTab('one.md', 2)

  expect(useVault.getState().tabs.map((tab) => tab.path)).toEqual([
    'two.md',
    'three.md',
    'one.md',
  ])
  expect(JSON.parse(storage.getItem('non-tabs:/ordered')!)).toEqual({
    paths: ['two.md', 'three.md', 'one.md'],
    active: 'two.md',
  })
})

test('save a recovery copy when the original was removed externally', async () => {
  const files = new Map<string, string>()
  const save = spyOn(desktop, 'save').mockImplementation(async (path, content) => {
    files.set(path, content)
    return 'v2'
  })
  const read = spyOn(desktop, 'read').mockImplementation(async (path) => {
    if (!files.has(path)) throw new Error('File removed')
    return { content: files.get(path)!, revision: 'v2' }
  })
  const list = spyOn(desktop, 'list').mockImplementation(async () =>
    [...files.keys()].map((path) => ({ path, name: path, kind: 'note', modified: 1, size: 1 })),
  )
  try {
    useVault.setState({ path: '/test-vault', tabs: [{ ...original }], active: 'note.note.json' })
    await useVault.getState().saveCopy('note.note.json')
    expect(files.size).toBe(1)
    expect(parseNote([...files.values()][0]).title).toBe('my edit')
    expect(parseNote([...files.values()][0]).id).not.toBe(parseNote(first).id)
    expect(useVault.getState().tabs).toHaveLength(1)
    expect(useVault.getState().tabs[0].path).not.toBe('note.note.json')
    expect(parseNote(useVault.getState().tabs[0].content).title).toBe('my edit')
  } finally {
    save.mockRestore()
    read.mockRestore()
    list.mockRestore()
  }
})

test('typing during an in-flight save stays dirty until the next save', async () => {
  let release: (revision: string) => void = () => {}
  const save = spyOn(desktop, 'save')
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    .mockResolvedValue('v3')
  try {
    useVault.setState({
      path: '/test-vault',
      tabs: [{ ...original, error: null }],
      active: 'note.note.json',
    })
    const operation = useVault.getState().save('note.note.json')
    useVault.setState((s) => ({ tabs: s.tabs.map((t) => ({ ...t, content: newer })) }))
    release('v2')
    expect(await operation).toBe(true)
    expect(useVault.getState().tabs[0].saved).toBe(first)
    expect(useVault.getState().tabs[0].content).toBe(newer)
    await useVault.getState().save('note.note.json')
    expect(useVault.getState().tabs[0].saved).toBe(newer)
  } finally {
    save.mockRestore()
  }
})

test('Markdown creation, saving, external refresh, and recovery copies retain Markdown source', async () => {
  const source = '---\r\ncustom: yes\r\n---\r\n# 제목\r\n[[Target]]  \r\n'
  const files = new Map<string, string>()
  const save = spyOn(desktop, 'save').mockImplementation(async (path, content) => {
    files.set(path, content)
    return 'v2'
  })
  const read = spyOn(desktop, 'read').mockImplementation(async (path) => ({
    content: files.get(path)!,
    revision: 'v2',
  }))
  const list = spyOn(desktop, 'list').mockImplementation(async () =>
    [...files.keys()].map((path) => ({ path, name: path, kind: 'legacy', modified: 1, size: 1 })),
  )
  try {
    useVault.setState({ path: '/markdown-test', tabs: [] })
    await useVault.getState().createNote('Folder/New.md')
    expect(files.get('Folder/New.md')).toBe('# New\n\n')
    expect(useVault.getState().tabs[0].kind).toBe('legacy')
    useVault.getState().edit('Folder/New.md', source)
    expect(await useVault.getState().save('Folder/New.md')).toBe(true)
    expect(files.get('Folder/New.md')).toBe(source)
    files.set('Folder/New.md', '# External\n')
    await useVault.getState().refresh()
    expect(useVault.getState().tabs[0].content).toBe('# External\n')
    useVault.getState().edit('Folder/New.md', source)
    await useVault.getState().saveCopy('Folder/New.md')
    const copy = useVault.getState().tabs[0]
    expect(copy.path).toEndWith('.md')
    expect(copy.path).not.toBe('Folder/New.md')
    expect(files.get(copy.path)).toBe(source)
    expect(files.get('Folder/New.md')).toBe('# External\n')
    await useVault.getState().close(copy.path)
  } finally {
    save.mockRestore()
    read.mockRestore()
    list.mockRestore()
  }
})

test('canvas creation, saving, and recovery copies retain Excalidraw data', async () => {
  const files = new Map<string, string>()
  const save = spyOn(desktop, 'save').mockImplementation(async (path, value) => {
    files.set(path, value)
    return 'canvas-v2'
  })
  const read = spyOn(desktop, 'read').mockImplementation(async (path) => ({
    content: files.get(path)!,
    revision: 'canvas-v2',
  }))
  const list = spyOn(desktop, 'list').mockImplementation(async () =>
    [...files.entries()].map(([path, value]) => ({
      path,
      name: path,
      kind: 'canvas',
      modified: 1,
      size: value.length,
    })),
  )
  try {
    useVault.setState({ path: '/canvas-test', selectedFolder: 'Maps', tabs: [] })
    const path = await useVault.getState().createUntitled('canvas')
    expect(path).toBe('Maps/Untitled.excalidraw')
    expect(parseCanvas(files.get(path)!).type).toBe('excalidraw')
    expect(useVault.getState().tabs[0].kind).toBe('canvas')

    const canvas = createCanvas()
    canvas.elements.push({ id: 'box', type: 'rectangle' })
    const edited = serializeCanvas(canvas)
    useVault.getState().edit(path, edited)
    expect(await useVault.getState().save(path)).toBe(true)
    await useVault.getState().saveCopy(path)
    const copy = useVault.getState().tabs[0]
    expect(copy.path).toEndWith('.excalidraw')
    expect(parseCanvas(files.get(copy.path)!).elements).toHaveLength(1)
  } finally {
    save.mockRestore()
    read.mockRestore()
    list.mockRestore()
  }
})

test('instant notes use collision-safe Untitled names in the selected folder', async () => {
  const files = new Map<string, string>([
    ['Notes/Untitled.note.json', content('existing JSON')],
    ['Notes/Untitled.md', '# Existing Markdown\n'],
  ])
  let raced = false
  const save = spyOn(desktop, 'save').mockImplementation(async (path, value) => {
    if (path === 'Notes/Untitled 2.note.json' && !raced) {
      raced = true
      throw new Error('CONFLICT: another writer created this file')
    }
    files.set(path, value)
    return `revision-${files.size}`
  })
  const read = spyOn(desktop, 'read').mockImplementation(async (path) => ({
    content: files.get(path)!,
    revision: `revision-${files.size}`,
  }))
  const list = spyOn(desktop, 'list').mockImplementation(async () =>
    [...files.entries()].map(([path, value]) => ({
      path,
      name: path.split('/').at(-1)!,
      kind: path.endsWith('.md') ? 'legacy' : 'note',
      modified: 1,
      size: value.length,
    })),
  )
  try {
    useVault.setState({
      path: '/test-vault',
      selectedFolder: 'Notes',
      entries: await desktop.list(),
      tabs: [],
      active: null,
    })
    expect(await useVault.getState().createUntitled()).toBe('Notes/Untitled 3.note.json')
    expect(parseNote(files.get('Notes/Untitled 3.note.json')!).title).toBe('')
    expect(await useVault.getState().createUntitled('markdown')).toBe('Notes/Untitled 2.md')
    expect(files.get('Notes/Untitled 2.md')).toBe('')
    expect(useVault.getState().active).toBe('Notes/Untitled 2.md')
  } finally {
    save.mockRestore()
    read.mockRestore()
    list.mockRestore()
  }
})

test('instant folders use collision-safe names under the requested tree folder', async () => {
  const folders = new Set(['Notes/Untitled folder'])
  const createFolder = spyOn(desktop, 'createFolder').mockImplementation(async (path) => {
    if (folders.has(path)) throw new Error('CONFLICT: already exists')
    folders.add(path)
  })
  const list = spyOn(desktop, 'list').mockImplementation(async () =>
    [...folders].map((path) => ({
      path,
      name: path.split('/').at(-1)!,
      kind: 'folder',
      modified: 0,
      size: 0,
    })),
  )
  try {
    useVault.setState({
      path: '/test-vault',
      selectedFolder: 'Elsewhere',
      entries: await desktop.list(),
    })
    expect(await useVault.getState().createUntitledFolder('Notes')).toBe(
      'Notes/Untitled folder 2',
    )
    expect(useVault.getState().selectedFolder).toBe('Notes/Untitled folder 2')
    expect(useVault.getState().entries.some((entry) => entry.path === 'Notes/Untitled folder 2')).toBe(
      true,
    )
  } finally {
    createFolder.mockRestore()
    list.mockRestore()
  }
})

test('moving an open document updates its tab, active path, folder, and persisted session', async () => {
  const move = spyOn(desktop, 'move').mockResolvedValue('Archive/note.note.json')
  const list = spyOn(desktop, 'list').mockResolvedValue([
    { path: 'Archive', name: 'Archive', kind: 'folder', modified: 0, size: 0 },
    {
      path: 'Archive/note.note.json',
      name: 'note.note.json',
      kind: 'note',
      modified: 1,
      size: first.length,
    },
  ])
  const read = spyOn(desktop, 'read').mockResolvedValue({ content: first, revision: 'v2' })
  try {
    useVault.setState({
      path: '/test-vault',
      entries: await desktop.list(),
      tabs: [{ ...original, content: first, saved: first, error: null }],
      active: 'note.note.json',
      selectedFolder: '',
    })

    expect(await useVault.getState().move('note.note.json', 'Archive')).toBe(
      'Archive/note.note.json',
    )
    expect(useVault.getState().tabs[0].path).toBe('Archive/note.note.json')
    expect(useVault.getState().active).toBe('Archive/note.note.json')
    expect(JSON.parse(storage.getItem('non-tabs:/test-vault')!)).toEqual({
      paths: ['Archive/note.note.json'],
      active: 'Archive/note.note.json',
    })
  } finally {
    move.mockRestore()
    list.mockRestore()
    read.mockRestore()
  }
})

test('archiving a folder saves and closes its open descendants', async () => {
  const archive = spyOn(desktop, 'archive').mockResolvedValue({
    id: '00000000-0000-0000-0000-000000000000',
    path: 'Notes',
    originalPath: 'Notes',
    name: 'Notes',
    kind: 'folder',
    modified: 1,
    size: 0,
    archivedAt: 1,
  })
  const list = spyOn(desktop, 'list').mockResolvedValue([])
  try {
    useVault.setState({
      path: '/test-vault',
      entries: [
        { path: 'Notes', name: 'Notes', kind: 'folder', modified: 1, size: 0 },
        {
          path: 'Notes/note.note.json',
          name: 'note.note.json',
          kind: 'note',
          modified: 1,
          size: first.length,
        },
      ],
      tabs: [{ ...original, path: 'Notes/note.note.json', content: first, saved: first }],
      active: 'Notes/note.note.json',
      selectedFolder: 'Notes',
    })

    await useVault.getState().archive('Notes')

    expect(archive).toHaveBeenCalledWith('Notes')
    expect(useVault.getState().tabs).toEqual([])
    expect(useVault.getState().active).toBeNull()
    expect(useVault.getState().selectedFolder).toBe('')
  } finally {
    archive.mockRestore()
    list.mockRestore()
  }
})

test('renaming a folder remaps the visible tree before the disk refresh finishes', async () => {
  let finishList: (entries: Entry[]) => void = () => {}
  const rename = spyOn(desktop, 'rename').mockResolvedValue('Archive')
  const list = spyOn(desktop, 'list').mockImplementation(
    () =>
      new Promise((resolve) => {
        finishList = resolve
      }),
  )
  const read = spyOn(desktop, 'read').mockResolvedValue({ content: first, revision: 'v2' })
  try {
    useVault.setState({
      path: '/test-vault',
      entries: [
        { path: 'Notes', name: 'Notes', kind: 'folder', modified: 1, size: 0 },
        {
          path: 'Notes/note.note.json',
          name: 'note.note.json',
          kind: 'note',
          modified: 1,
          size: first.length,
        },
      ],
      tabs: [{ ...original, path: 'Notes/note.note.json', content: first, saved: first }],
      active: 'Notes/note.note.json',
      selectedFolder: 'Notes',
    })

    const operation = useVault.getState().rename('Notes', 'Archive')
    await Promise.resolve()
    await Promise.resolve()

    expect(useVault.getState().entries.map((entry) => entry.path)).toEqual([
      'Archive',
      'Archive/note.note.json',
    ])
    expect(useVault.getState().active).toBe('Archive/note.note.json')
    expect(useVault.getState().selectedFolder).toBe('Archive')

    finishList([
      { path: 'Archive', name: 'Archive', kind: 'folder', modified: 2, size: 0 },
      {
        path: 'Archive/note.note.json',
        name: 'note.note.json',
        kind: 'note',
        modified: 2,
        size: first.length,
      },
    ])
    await operation
    expect(useVault.getState().entries).toHaveLength(2)
  } finally {
    rename.mockRestore()
    list.mockRestore()
    read.mockRestore()
  }
})
