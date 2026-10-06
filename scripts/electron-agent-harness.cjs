const { app, utilityProcess } = require('electron')
const { createInterface } = require('node:readline')
const { join } = require('node:path')

const marker = process.argv.indexOf('--data-dir')
const dataDir = marker >= 0 ? process.argv[marker + 1] : null
if (!dataDir) throw new Error('Missing --data-dir')

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const child = utilityProcess.fork(join(__dirname, '..', 'dist-electron', 'agent.cjs'), [
    '--data-dir',
    dataDir,
  ])
  child.on('message', (event) => {
    if (event?.type === 'credential:request') {
      child.postMessage({
        type: 'credential:result',
        requestId: event.requestId,
        data: undefined,
      })
      return
    }
    process.stdout.write(`${JSON.stringify(event)}\n`)
  })
  child.on('exit', (code) => {
    if (code) process.stderr.write(`Agent utility process exited with code ${code}\n`)
    app.quit()
  })
  createInterface({ input: process.stdin }).on('line', (line) => {
    try {
      child.postMessage(JSON.parse(line))
    } catch {
      process.stdout.write('{"type":"error","error":"Invalid JSON"}\n')
    }
  })
  process.stdin.on('end', () => {
    child.kill()
    app.quit()
  })
})
