import { expect, test } from 'bun:test'
import {
  reorderSidebarSections,
  type SidebarSection,
  addFolderRoot,
  addRecentDocument,
  moveFavoriteItems,
  moveRecentDocuments,
  pruneMissingFavoriteItems,
  pruneMissingRecentDocuments,
  toggleFavoriteItem,
  type RecentDocument,
  useSettings,
} from '../model/settings'

test('agent filesystem sandbox is enabled by default', () => {
  expect(useSettings.getState().agentSandbox).toBe(true)
})

test('moving a folder updates only matching recent paths in the same vault', () => {
  const documents: RecentDocument[] = [
    { root: '/Notes', path: 'Inbox/a.md', title: 'A', kind: 'legacy', openedAt: 1 },
    { root: '/Notes', path: 'Other/b.md', title: 'B', kind: 'legacy', openedAt: 2 },
    { root: '/Archive', path: 'Inbox/c.md', title: 'C', kind: 'legacy', openedAt: 3 },
  ]
  expect(moveRecentDocuments(documents, '/Notes', 'Inbox', 'Filed/Inbox')).toEqual([
    { ...documents[0], path: 'Filed/Inbox/a.md' },
    documents[1],
    documents[2],
  ])
})

test('added root folders stay ordered and are not duplicated', () => {
  const first = addFolderRoot([], '/Notes')
  const second = addFolderRoot(first, '/Reading')

  expect(second).toEqual(['/Notes', '/Reading'])
  expect(addFolderRoot(second, '/Notes')).toBe(second)
})

test('recent documents keep the top five stable and move older entries to the front', () => {
  const recent = (index: number, root = '/Notes'): RecentDocument => ({
    root,
    path: `note-${index}.note.json`,
    title: `Note ${index}`,
    kind: 'note',
    openedAt: index,
  })
  const documents = Array.from({ length: 12 }, (_, index) => recent(index))
  const reopenedInTopFive = { ...recent(4), title: 'Renamed', openedAt: 20 }
  const stable = addRecentDocument(documents, reopenedInTopFive)

  expect(stable).toHaveLength(12)
  expect(stable[4]).toEqual(reopenedInTopFive)
  expect(stable.slice(0, 4)).toEqual(documents.slice(0, 4))
  expect(stable.filter((item) => item.path === reopenedInTopFive.path)).toHaveLength(1)

  const reopenedOlder = { ...recent(6), title: 'Older renamed', openedAt: 21 }
  const reordered = addRecentDocument(stable, reopenedOlder)

  expect(reordered[0]).toEqual(reopenedOlder)
  expect(reordered.filter((item) => item.path === reopenedOlder.path)).toHaveLength(1)

  const otherRoot = addRecentDocument(reordered, recent(4, '/Archive'))
  expect(otherRoot[0].root).toBe('/Archive')
  expect(
    otherRoot.some(
      (item) => item.root === '/Notes' && item.path === reopenedInTopFive.path,
    ),
  ).toBe(true)
})

test('missing recent documents are pruned only for the verified vault', () => {
  const documents: RecentDocument[] = [
    { root: '/Notes', path: 'kept.md', title: 'Kept', kind: 'legacy', openedAt: 3 },
    { root: '/Notes', path: 'missing.md', title: 'Missing', kind: 'legacy', openedAt: 2 },
    { root: '/Archive', path: 'unknown.md', title: 'Unknown', kind: 'legacy', openedAt: 1 },
  ]

  expect(pruneMissingRecentDocuments(documents, '/Notes', new Set(['kept.md']))).toEqual([
    documents[0],
    documents[2],
  ])
  const complete = [documents[0], documents[2]]
  expect(pruneMissingRecentDocuments(complete, '/Notes', new Set(['kept.md']))).toBe(complete)
})

test('favorites toggle without affecting items in another vault', () => {
  const first = toggleFavoriteItem([], '/Notes', 'Inbox', 1)
  const second = toggleFavoriteItem(first, '/Archive', 'Inbox', 2)

  expect(second).toEqual([
    { root: '/Archive', path: 'Inbox', addedAt: 2 },
    { root: '/Notes', path: 'Inbox', addedAt: 1 },
  ])
  expect(toggleFavoriteItem(second, '/Notes', 'Inbox', 3)).toEqual([second[0]])
})

test('moving a folder updates favorite descendants in the same vault', () => {
  const items = [
    { root: '/Notes', path: 'Inbox', addedAt: 3 },
    { root: '/Notes', path: 'Inbox/a.md', addedAt: 2 },
    { root: '/Archive', path: 'Inbox/b.md', addedAt: 1 },
  ]

  expect(moveFavoriteItems(items, '/Notes', 'Inbox', 'Filed/Inbox')).toEqual([
    { ...items[0], path: 'Filed/Inbox' },
    { ...items[1], path: 'Filed/Inbox/a.md' },
    items[2],
  ])
})

test('missing favorites are pruned only after their vault is verified', () => {
  const items = [
    { root: '/Notes', path: 'kept.md', addedAt: 2 },
    { root: '/Notes', path: 'missing.md', addedAt: 1 },
    { root: '/Archive', path: 'unknown.md', addedAt: 0 },
  ]

  expect(pruneMissingFavoriteItems(items, '/Notes', new Set(['kept.md']))).toEqual([
    items[0],
    items[2],
  ])
})

test('sidebar reordering preserves hidden sections for restoring their position', () => {
  const order: SidebarSection[] = ['recent', 'favorites', 'files']
  expect(reorderSidebarSections(order, ['favorites'], 'files', 0)).toEqual([
    'files', 'favorites', 'recent',
  ])
  expect(reorderSidebarSections(order, [], 'recent', 2)).toEqual([
    'favorites', 'files', 'recent',
  ])
  expect(reorderSidebarSections(order, ['favorites'], 'favorites', 0)).toBe(order)
  expect(reorderSidebarSections(order, [], 'files', -1)).toBe(order)
})

test('sidebar visibility is independent of section order and supports hiding everything', () => {
  const original = useSettings.getState()
  try {
    for (const section of original.sidebarSectionOrder)
      useSettings.getState().setSidebarSectionVisible(section, false)
    expect(useSettings.getState().hiddenSidebarSections).toHaveLength(3)
    useSettings.getState().setSidebarSectionVisible('files', true)
    expect(useSettings.getState().hiddenSidebarSections).toEqual(['recent', 'favorites'])
    expect(useSettings.getState().sidebarSectionOrder).toEqual(original.sidebarSectionOrder)
  } finally {
    useSettings.setState({
      sidebarSectionOrder: original.sidebarSectionOrder,
      hiddenSidebarSections: original.hiddenSidebarSections,
    })
  }
})
