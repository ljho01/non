import { execFile } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import { z } from 'zod'

const execFileAsync = promisify(execFile)

async function asideBinary() {
  const candidates = [
    ...String(process.env.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)
      .map((folder) => join(folder, 'aside')),
    ...(process.env.HOME ? [join(process.env.HOME, '.local', 'bin', 'aside')] : []),
    '/opt/homebrew/bin/aside',
    '/usr/local/bin/aside',
  ]
  for (const candidate of [...new Set(candidates)]) {
    try {
      const resolved = await realpath(candidate)
      const metadata = await lstat(resolved)
      if (metadata.isFile() && !metadata.isSymbolicLink()) return resolved
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  throw new Error(
    'Aside CLI가 설치되어 있지 않습니다. aside-browser 스킬 지침에 따라 사용자에게 설치 권한을 먼저 요청하세요.',
  )
}

export function createAsideTool(): AgentTool {
  return {
    name: 'run_aside',
    label: 'Aside',
    description:
      'Run the installed Aside CLI without a shell. Read the aside-browser skill first, call this with args=["--update"] and then args=["guide"], and follow that guide. Ask the user before installation if Aside is missing.',
    parameters: Type.Object({
      args: Type.Array(Type.String(), { minItems: 1, maxItems: 40 }),
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, value, signal) => {
      const { args } = z
        .object({
          args: z.array(z.string().min(1).max(2_000)).min(1).max(40),
        })
        .parse(value)
      if (args.some((argument) => argument.includes('\0')))
        throw new Error('Aside 인자에 null 문자를 사용할 수 없습니다.')
      const executable = await asideBinary()
      const { stdout, stderr } = await execFileAsync(executable, args, {
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
        timeout: 120_000,
        signal,
      })
      const rawOutput = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n\n')
      const output =
        rawOutput.length > 200_000
          ? `${rawOutput.slice(0, 200_000)}\n\n[Aside output truncated]`
          : rawOutput
      return {
        content: [{ type: 'text', text: output || 'Aside command completed.' }],
        details: { command: 'aside', args },
      }
    },
  }
}
