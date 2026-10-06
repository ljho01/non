import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, join } from 'node:path'
import { loadSkills, TODO_CONTEXT, type Skill } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import type { InstalledSkill } from '../src/shared/contracts/skill'

const SKILL_FILE = 'SKILL.md'
const MAX_FILES = 2_000
const MAX_BYTES = 50 * 1024 * 1024
const SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

type SkillState = { enabled: string[] }

export const builtInAsideSkill = `---
name: aside-browser
version: 3
description: Read when you need a browser, or have to work across user's logged-in websites (e.g. Gmail, Slack, cloud consoles, etc.), or have to refer personal contexts like memory and browsing history.
---

# Aside

This file is only an entry point. You MUST run \`aside guide\` to read this skill’s actual instructions before using Aside, then follow them.

- If \`aside\` is not installed, ask the user for permission to install Aside CLI. After the user approves, run the macOS/Linux installer \`curl -fsSL https://releases.aside.com/install.sh | bash\`, then run \`aside guide\`.
- If \`aside guide\` is reported as an unknown command, your CLI is outdated. Run \`aside --update\`, then run \`aside guide\` again.
- If a newer CLI version is available, the guide may be outdated. Always run \`aside --update\`, then run \`aside guide\` again before continuing.

If installation or an update fails, report the error instead of guessing the CLI usage.
`

export const skillDirectory = (dataDir: string) => join(dataDir, 'skills')
const statePath = (dataDir: string) => join(dataDir, 'skills.json')

async function readState(dataDir: string): Promise<SkillState> {
  try {
    const value = JSON.parse(await readFile(statePath(dataDir), 'utf8')) as unknown
    if (!value || typeof value !== 'object' || !Array.isArray((value as SkillState).enabled))
      throw new Error('스킬 설정 파일이 올바르지 않습니다.')
    return {
      enabled: (value as SkillState).enabled.filter(
        (id): id is string => typeof id === 'string' && SKILL_ID.test(id),
      ),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { enabled: [] }
    throw error
  }
}

async function writeState(dataDir: string, state: SkillState) {
  const target = statePath(dataDir)
  const temporary = `${target}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, target)
}

export async function ensureBuiltInSkills(dataDir: string) {
  const root = skillDirectory(dataDir)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const folder = join(root, 'aside-browser')
  try {
    await lstat(folder)
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    await mkdir(folder, { mode: 0o700 })
    await writeFile(join(folder, SKILL_FILE), builtInAsideSkill, { mode: 0o600 })
    const state = await readState(dataDir)
    await writeState(dataDir, {
      enabled: [...new Set([...state.enabled, 'aside-browser'])].sort(),
    })
  } catch (error) {
    await rm(folder, { recursive: true, force: true })
    throw error
  }
}

async function validateTree(folder: string) {
  let files = 0
  let bytes = 0
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const metadata = await lstat(path)
      if (metadata.isSymbolicLink()) throw new Error('심볼릭 링크가 포함된 스킬은 설치할 수 없습니다.')
      if (metadata.isDirectory()) await visit(path)
      else if (metadata.isFile()) {
        files += 1
        bytes += metadata.size
        if (files > MAX_FILES || bytes > MAX_BYTES)
          throw new Error('스킬은 최대 2,000개 파일, 50MB까지 설치할 수 있습니다.')
      } else throw new Error('일반 파일과 폴더만 포함된 스킬을 설치할 수 있습니다.')
    }
  }
  await visit(folder)
}

async function inspectSkill(folder: string): Promise<Skill> {
  const file = join(folder, SKILL_FILE)
  const metadata = await lstat(file)
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 2 * 1024 * 1024)
    throw new Error('SKILL.md는 2MB 이하의 일반 파일이어야 합니다.')
  const environment = new NodeExecutionEnv({ cwd: folder })
  try {
    const loaded = await loadSkills(environment, folder, TODO_CONTEXT)
    const relevantDiagnostics = loaded.diagnostics.filter(
      (diagnostic) => diagnostic.path === file || diagnostic.path.startsWith(`${folder}/`),
    )
    if (relevantDiagnostics.length) throw new Error(relevantDiagnostics[0].message)
    const skill = loaded.skills.find((candidate) => candidate.filePath === file)
    if (!skill) throw new Error('SKILL.md에 name과 description frontmatter가 필요합니다.')
    if (!SKILL_ID.test(skill.name)) throw new Error('스킬 이름 형식이 올바르지 않습니다.')
    return skill
  } finally {
    await environment.cleanup(TODO_CONTEXT)
  }
}

export async function listSkills(dataDir: string): Promise<InstalledSkill[]> {
  await ensureBuiltInSkills(dataDir)
  const root = skillDirectory(dataDir)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const state = await readState(dataDir)
  const directories = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
  return Promise.all(
    directories.map(async (directory): Promise<InstalledSkill> => {
      try {
        const skill = await inspectSkill(join(root, directory))
        if (skill.name !== directory) throw new Error('스킬 폴더 이름과 name이 다릅니다.')
        return {
          id: skill.name,
          name: skill.name,
          description: skill.description,
          enabled: state.enabled.includes(skill.name),
          builtIn: skill.name === 'aside-browser',
          error: null,
        }
      } catch (error) {
        return {
          id: directory,
          name: directory,
          description: 'SKILL.md를 읽을 수 없는 스킬입니다.',
          enabled: false,
          builtIn: directory === 'aside-browser',
          error: error instanceof Error ? error.message : '스킬을 읽지 못했습니다.',
        }
      }
    }),
  )
}

export async function installSkill(dataDir: string, source: string) {
  const sourcePath = await realpath(source)
  if (!(await stat(sourcePath)).isDirectory()) throw new Error('스킬 폴더를 선택하세요.')
  await validateTree(sourcePath)
  const skill = await inspectSkill(sourcePath)
  if (basename(sourcePath) !== skill.name)
    throw new Error(`스킬 폴더 이름을 "${skill.name}"으로 맞춰 주세요.`)
  const root = skillDirectory(dataDir)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const target = join(root, skill.name)
  try {
    await lstat(target)
    throw new Error(`${skill.name} 스킬이 이미 설치되어 있습니다.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const temporary = await mkdtemp(join(root, '.install-'))
  // Bun 1.4 and Node both require a non-existing destination with errorOnExist.
  const stage = join(temporary, 'content')
  let installed = false
  try {
    await cp(sourcePath, stage, { recursive: true, force: false, errorOnExist: true })
    await validateTree(stage)
    await rename(stage, target)
    installed = true
    const copied = await inspectSkill(target)
    if (copied.name !== skill.name) throw new Error('복사 중 SKILL.md가 변경되었습니다.')
  } catch (error) {
    await rm(stage, { recursive: true, force: true })
    if (installed) await rm(target, { recursive: true, force: true })
    throw error
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  return {
    id: skill.name,
    name: skill.name,
    description: skill.description,
    enabled: false,
    builtIn: false,
    error: null,
  } satisfies InstalledSkill
}

export async function setSkillEnabled(dataDir: string, id: string, enabled: boolean) {
  if (!SKILL_ID.test(id)) throw new Error('스킬 이름이 올바르지 않습니다.')
  const skills = await listSkills(dataDir)
  const skill = skills.find((item) => item.id === id)
  if (!skill) throw new Error('설치된 스킬을 찾을 수 없습니다.')
  if (enabled && skill.error) throw new Error(skill.error)
  const state = await readState(dataDir)
  const ids = new Set(state.enabled)
  if (enabled) ids.add(id)
  else ids.delete(id)
  await writeState(dataDir, { enabled: [...ids].sort() })
}

export async function prepareSkillRemoval(dataDir: string, id: string) {
  if (!SKILL_ID.test(id)) throw new Error('스킬 이름이 올바르지 않습니다.')
  if (id === 'aside-browser') throw new Error('기본 제공 스킬은 비활성화할 수 있지만 삭제할 수 없습니다.')
  const root = skillDirectory(dataDir)
  const target = join(root, id)
  const resolvedRoot = await realpath(root)
  const resolvedTarget = await realpath(target)
  if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}/`))
    throw new Error('스킬 경로가 올바르지 않습니다.')
  await setSkillEnabled(dataDir, id, false)
  return resolvedTarget
}
