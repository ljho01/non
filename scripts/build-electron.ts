import { access, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const output = join(root, 'dist-electron')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })

const builds = [
  { input: join(root, 'electron/main.ts'), name: 'main.cjs' },
  { input: join(root, 'electron/preload.ts'), name: 'preload.cjs' },
  { input: join(root, 'agent/main.ts'), name: 'agent.cjs' },
]

for (const build of builds) {
  const result = await Bun.build({
    entrypoints: [build.input],
    outdir: output,
    naming: build.name,
    target: 'node',
    format: 'cjs',
    sourcemap: 'external',
    minify: false,
    external: ['electron', 'electron/main', 'electron/renderer', 'electron/utility'],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  await access(join(output, build.name))
}
