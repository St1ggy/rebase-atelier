import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

// oxlint-disable-next-line import/extensions -- JSON imports require the explicit extension.
import manifest from '../package.json'
import { checked } from '../src/infrastructure/process'

import { npm } from './npm'
import { npmName } from './release-targets'

const release = (await Bun.file('release/packages.json').json()) as { packages: { name: string; tarball: string }[] }
const names = [npmName, `${npmName}-${process.platform}-${process.arch}`]
const tarballs = names.map((name) => {
  const packageInfo = release.packages.find((entry) => entry.name === name)

  if (!packageInfo) throw new Error(`No release package for ${name}`)

  return path.resolve('release', packageInfo.tarball)
})
const directory = await mkdtemp(path.join(tmpdir(), 'rebase-editor-npm-'))

try {
  await npm(
    [
      'install',
      '--prefix',
      directory,
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      ...tarballs,
    ],
    directory,
  )
  const launcher = path.join(directory, 'node_modules', '@st1ggy', 'rebase-editor', 'bin', 'rebase-editor.mjs')
  const version = await checked('node', [launcher, '--version'], { cwd: directory })
  const help = await checked('node', [launcher, '--help'], { cwd: directory })

  if (version.trim() !== manifest.version || !help.includes('rebase-editor --'))
    throw new Error('Installed npm command failed smoke checks')

  if (process.platform !== 'win32' && process.env.NPM_PTY_SMOKE === '1') {
    const executable = path.join(directory, 'node_modules', '.bin', 'rebase-editor')

    process.stdout.write(
      await checked('python3', ['scripts/pty-smoke.py'], {
        cwd: process.cwd(),
        env: { ATELIER_BINARY: executable, ATELIER_VIEW_TEST: 'compact' },
      }),
    )
  }

  process.stdout.write(`Installed npm command passed on ${process.platform}-${process.arch}\n`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
