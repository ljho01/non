import { expect, test } from 'bun:test'
import { markdownWikiLink, matchWikiLinkQuery } from '../model/wiki-suggestion'

test('wiki link suggestions match an empty or partial query at the cursor', () => {
  expect(matchWikiLinkQuery('[[', 12)).toEqual({ from: 10, to: 12, query: '' })
  expect(matchWikiLinkQuery('앞 문장 [[검색 키워드', 42)).toEqual({
    from: 34,
    to: 42,
    query: '검색 키워드',
  })
})

test('wiki link suggestions ignore escaped, closed, and nested tokens', () => {
  expect(matchWikiLinkQuery('\\[[숨김', 20)).toBeNull()
  expect(matchWikiLinkQuery('[[완료]]', 20)).toBeNull()
  expect(matchWikiLinkQuery('[[중첩[', 20)).toBeNull()
})

test('markdown suggestions serialize a stable target with a readable label', () => {
  expect(
    markdownWikiLink({
      id: 'note-id',
      path: 'folder/Target.note.json',
      title: '대상 문서',
      kind: 'note',
      snippet: '',
    }),
  ).toBe('[[id:note-id|대상 문서]]')
})
