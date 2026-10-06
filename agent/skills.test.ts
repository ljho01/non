import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { formatSkillCatalog, loadEnabledSkills, readSkillResource } from './skills'

test('enabled skills are advertised and can read only their own resources', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'non-skill-runtime-'))
  const skillDir = join(dataDir, 'skills', 'sample-skill')
  await mkdir(join(skillDir, 'references'), { recursive: true })
  await writeFile(join(dataDir, 'skills.json'), JSON.stringify({ enabled: ['sample-skill'] }))
  await writeFile(
    join(skillDir, 'SKILL.md'),
    '---\nname: sample-skill\ndescription: Helps with sample tasks.\n---\n\nRead references/rules.md.\n',
  )
  await writeFile(join(skillDir, 'references', 'rules.md'), 'Use the local rule.')
  const loaded = await loadEnabledSkills(dataDir)
  expect(loaded.errors).toEqual([])
  expect(formatSkillCatalog(loaded.skills)).toContain('<name>sample-skill</name>')
  expect(await readSkillResource(loaded.skills, 'sample-skill', 'references/rules.md')).toBe(
    'Use the local rule.',
  )
  await expect(readSkillResource(loaded.skills, 'sample-skill', '../outside')).rejects.toThrow(
    '경로',
  )
})
