#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const platform = `${process.platform}-${process.arch}`
const supported = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']

if (!supported.includes(platform)) {
  process.stderr.write(`rebase-editor: unsupported platform ${platform}. Supported: ${supported.join(', ')}.\n`)
  process.exit(1)
}

const packageName = `@st1ggy/rebase-editor-${platform}`
const filename = process.platform === 'win32' ? 'rebase-editor.exe' : 'rebase-editor'
let binary

try {
  binary = require.resolve(`${packageName}/bin/${filename}`)
} catch {
  process.stderr.write(
    `rebase-editor: missing ${packageName}. Reinstall @st1ggy/rebase-editor with optional dependencies enabled (npm install --include=optional).\n`,
  )
  process.exit(1)
}

const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' })
// Both processes share the foreground terminal group. The TUI owns Ctrl+C
// handling and terminal restoration; the launcher waits for it to finish.
const interrupt = () => {
  // Wait for the foreground TUI to handle the interrupt and restore the terminal.
}
const terminate = () => child.kill('SIGTERM')
const hangup = () => child.kill('SIGHUP')

process.on('SIGINT', interrupt)
process.on('SIGTERM', terminate)
process.on('SIGHUP', hangup)
child.on('error', (error) => {
  process.stderr.write(`rebase-editor: ${error.message}\n`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', terminate)
  process.removeListener('SIGHUP', hangup)

  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
