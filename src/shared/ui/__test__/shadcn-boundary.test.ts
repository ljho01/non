import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('feature and route UI uses shared shadcn controls instead of raw form elements', () => {
  const root = join(import.meta.dir, '../../../..')
  const glob = new Bun.Glob('src/**/*.tsx')
  const violations = [...glob.scanSync({ cwd: root })]
    .filter((path) => !path.startsWith('src/shared/ui/'))
    .flatMap((path) => {
      const source = readFileSync(join(root, path), 'utf8')
      return [...source.matchAll(/<(button|input|textarea|select)(?:\s|>)/g)].map(
        (match) => `${path}:${source.slice(0, match.index).split('\n').length}:${match[1]}`,
      )
    })
  expect(violations).toEqual([])
})

test('UI typography uses named size tokens instead of pixel literals', () => {
  const root = join(import.meta.dir, '../../../..')
  const glob = new Bun.Glob('src/**/*.{css,ts,tsx}')
  const violations = [...glob.scanSync({ cwd: root })].flatMap((path) => {
    const source = readFileSync(join(root, path), 'utf8')
    return [
      ...source.matchAll(/font-size:\s*(?:\d+(?:\.\d+)?)px/g),
      ...source.matchAll(/text-\[(?:\d+(?:\.\d+)?)px\]/g),
    ].map((match) => `${path}:${source.slice(0, match.index).split('\n').length}:${match[0]}`)
  })
  expect(violations).toEqual([])
})

test('CSS typography properties consume named tokens', () => {
  const root = join(import.meta.dir, '../../../..')
  const source = readFileSync(join(root, 'src/app/styles.css'), 'utf8')
  const properties = ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'font-family']
  const violations = source.split('\n').flatMap((line, index) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('--')) return []
    return properties
      .filter((property) => trimmed.startsWith(`${property}:`) && !trimmed.includes('var(--'))
      .map((property) => `src/app/styles.css:${index + 1}:${property}`)
  })
  expect(violations).toEqual([])
})

test('application icons use the shared Hugeicons adapter', () => {
  const root = join(import.meta.dir, '../../../..')
  const glob = new Bun.Glob('src/**/*.{ts,tsx}')
  const violations = [...glob.scanSync({ cwd: root })]
    .filter((path) => path !== 'src/shared/ui/icon.tsx')
    .flatMap((path) => {
      const source = readFileSync(join(root, path), 'utf8')
      return [...source.matchAll(/from ['"](?:lucide-react|@hugeicons\/[^'"]+)['"]/g)].map(
        (match) => `${path}:${source.slice(0, match.index).split('\n').length}:${match[0]}`,
      )
    })
  expect(violations).toEqual([])
})
