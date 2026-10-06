import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, rename, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { builtInAsideSkill, installSkill, listSkills, setSkillEnabled } from './skills'

async function fixture(root: string, id = 'sample-skill') {
  const source = join(root, id)
  await mkdir(source)
  await writeFile(
    join(source, 'SKILL.md'),
    `---\nname: ${id}\ndescription: Helps with a local test task.\n---\n\nFollow the test instructions.\n`,
  )
  return source
}

test('skills install disabled and require an explicit enable action', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-skill-manager-'))
  const data = join(root, 'data')
  await mkdir(data)
  const source = await fixture(root)
  await installSkill(data, source)
  const installed = await listSkills(data)
  expect(installed.find((skill) => skill.id === 'aside-browser')).toMatchObject({
    enabled: true,
    builtIn: true,
    error: null,
  })
  expect(installed.find((skill) => skill.id === 'sample-skill')).toMatchObject({
    enabled: false,
    builtIn: false,
    error: null,
  })
  await setSkillEnabled(data, 'sample-skill', true)
  expect((await listSkills(data)).find((skill) => skill.id === 'sample-skill')?.enabled).toBe(true)
})

test('the bundled Aside skill stays byte-for-byte identical to the user skill', async () => {
  expect(new Bun.CryptoHasher('sha256').update(builtInAsideSkill).digest('hex')).toBe(
    'dc9166286989de01f4d6087d4a21dfd91c5e6e0089b39589b555601754abd3c6',
  )
})

test('skill installation rejects symbolic links and mismatched folder names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'non-skill-security-'))
  const data = join(root, 'data')
  await mkdir(data)
  const source = await fixture(root)
  await symlink('/tmp', join(source, 'escape'))
  await expect(installSkill(data, source)).rejects.toThrow('심볼릭 링크')

  const secondRoot = await mkdtemp(join(tmpdir(), 'non-skill-name-'))
  const mismatched = await fixture(secondRoot, 'correct-name')
  const wrong = join(secondRoot, 'wrong-name')
  await rename(mismatched, wrong)
  await expect(installSkill(data, wrong)).rejects.toThrow('does not match parent directory')
})
