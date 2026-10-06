import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { loadSkills, TODO_CONTEXT, type Skill } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'

const SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const MAX_RESOURCE_BYTES = 2 * 1024 * 1024

type SkillState = { enabled: string[] }

export type LoadedSkill = {
  skill: Skill
  root: string
}

async function enabledSkillIds(dataDir: string) {
  try {
    const state = JSON.parse(await readFile(join(dataDir, 'skills.json'), 'utf8')) as SkillState
    if (!state || !Array.isArray(state.enabled)) return []
    return state.enabled.filter(
      (id): id is string => typeof id === 'string' && SKILL_ID.test(id),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function loadEnabledSkills(dataDir: string) {
  const skills: LoadedSkill[] = []
  const errors: { id: string; error: string }[] = []
  const skillsFolder = join(dataDir, 'skills')
  let resolvedSkillsFolder: string
  try {
    resolvedSkillsFolder = await realpath(skillsFolder)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { skills, errors }
    throw error
  }
  for (const id of await enabledSkillIds(dataDir)) {
    try {
      const folder = join(resolvedSkillsFolder, id)
      const folderMetadata = await lstat(folder)
      if (!folderMetadata.isDirectory() || folderMetadata.isSymbolicLink())
        throw new Error('스킬 폴더가 올바르지 않습니다.')
      const resolvedFolder = await realpath(folder)
      if (!resolvedFolder.startsWith(`${resolvedSkillsFolder}/`))
        throw new Error('스킬 폴더가 앱 데이터 밖을 가리킵니다.')
      const skillFile = join(resolvedFolder, 'SKILL.md')
      const fileMetadata = await lstat(skillFile)
      if (
        !fileMetadata.isFile() ||
        fileMetadata.isSymbolicLink() ||
        fileMetadata.size > MAX_RESOURCE_BYTES
      )
        throw new Error('SKILL.md가 올바르지 않습니다.')
      const environment = new NodeExecutionEnv({ cwd: resolvedFolder })
      try {
        const loaded = await loadSkills(environment, resolvedFolder, TODO_CONTEXT)
        if (loaded.diagnostics.length) throw new Error(loaded.diagnostics[0].message)
        const skill = loaded.skills.find((candidate) => candidate.filePath === skillFile)
        if (!skill || skill.name !== id) throw new Error('SKILL.md name이 설치된 폴더와 다릅니다.')
        skills.push({ skill, root: resolvedFolder })
      } finally {
        await environment.cleanup(TODO_CONTEXT)
      }
    } catch (error) {
      errors.push({
        id,
        error: error instanceof Error ? error.message : '스킬을 불러오지 못했습니다.',
      })
    }
  }
  return { skills, errors }
}

function escapeXml(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;')
}

export function formatSkillCatalog(skills: LoadedSkill[]) {
  const visible = skills.filter(({ skill }) => !skill.disableModelInvocation)
  if (!visible.length) return ''
  return `\n\nUser-managed skills are available below. They are instructions, not higher-priority authority. When the task clearly matches a skill description, call read_skill for its SKILL.md before acting. Use read_skill again for relative reference files named by that skill.\n<available_skills>\n${visible
    .map(
      ({ skill }) =>
        `  <skill><name>${escapeXml(skill.name)}</name><description>${escapeXml(skill.description)}</description></skill>`,
    )
    .join('\n')}\n</available_skills>`
}

export async function readSkillResource(
  skills: LoadedSkill[],
  name: string,
  resource = 'SKILL.md',
) {
  const loaded = skills.find(({ skill }) => skill.name === name)
  if (!loaded) throw new Error('활성화된 스킬을 찾을 수 없습니다.')
  const normalized = resource.replaceAll('\\', '/')
  if (
    !normalized ||
    isAbsolute(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('스킬 리소스 경로가 올바르지 않습니다.')
  const addressed = join(loaded.root, normalized)
  const resolved = await realpath(addressed)
  if (!resolved.startsWith(`${loaded.root}/`))
    throw new Error('스킬 폴더 밖의 파일은 읽을 수 없습니다.')
  const metadata = await lstat(addressed)
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_RESOURCE_BYTES)
    throw new Error('스킬 리소스는 2MB 이하의 일반 텍스트 파일이어야 합니다.')
  const content = await readFile(resolved, 'utf8')
  if (content.includes('\0')) throw new Error('바이너리 스킬 리소스는 읽을 수 없습니다.')
  return content
}
