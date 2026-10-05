import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

// oxlint-disable-next-line import/extensions -- JSON imports require the explicit extension.
import manifest from '../package.json'

import { npm } from './npm'
import { npmName, releaseTargets, repoUrl } from './release-targets'

const tag = process.env.RELEASE_TAG

if (tag && tag !== `v${manifest.version}`) throw new Error(`Tag ${tag} does not match version ${manifest.version}`)

const common = {
  version: manifest.version,
  description: manifest.description,
  license: 'MIT',
  author: 'Dmitrii Bragin',
  homepage: `${repoUrl}#readme`,
  repository: { type: 'git', url: `git+${repoUrl}.git` },
  bugs: { url: `${repoUrl}/issues` },
  publishConfig: { access: 'public' },
  ...(process.env.GITHUB_SHA && { gitHead: process.env.GITHUB_SHA }),
}
const output = path.resolve('release')
const tarballs = path.join(output, 'tarballs')
const packages = []
const checksums = []

await mkdir(tarballs, { recursive: true })

for (const target of releaseTargets) {
  const name = `${npmName}-${target.id}`
  const directory = path.join(output, 'npm', target.id)
  const bin = path.join(directory, 'bin')
  const filename = target.os === 'win32' ? 'rebase-atelier.exe' : 'rebase-atelier'
  const asset = path.resolve('artifacts', target.asset)

  await mkdir(bin, { recursive: true })
  await copyFile(asset, path.join(bin, filename))
  await chmod(path.join(bin, filename), 0o755)
  await copyFile('LICENSE', path.join(directory, 'LICENSE'))
  await writeFile(
    path.join(directory, 'README.md'),
    `# ${name}\n\nNative binary for [Rebase Atelier](${repoUrl}) on ${target.id}. Install \`${npmName}\` to get the \`rebase-atelier\` command.\n`,
  )
  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify({ ...common, name, os: [target.os], cpu: [target.cpu], files: ['bin'] }, null, 2)}\n`,
  )
  checksums.push(
    `${createHash('sha256')
      .update(await readFile(asset))
      .digest('hex')}  ${target.asset}`,
  )
  packages.push({ name, directory })
}

const directory = path.join(output, 'npm', npmName)

await mkdir(path.join(directory, 'bin'), { recursive: true })
await copyFile('bin/rebase-atelier.mjs', path.join(directory, 'bin', 'rebase-atelier.mjs'))
await chmod(path.join(directory, 'bin', 'rebase-atelier.mjs'), 0o755)
await copyFile('README.md', path.join(directory, 'README.md'))
await copyFile('LICENSE', path.join(directory, 'LICENSE'))
const optionalDependencies = Object.fromEntries(
  releaseTargets.map((target) => [`${npmName}-${target.id}`, manifest.version]),
)

await writeFile(
  path.join(directory, 'package.json'),
  `${JSON.stringify(
    {
      ...common,
      name: npmName,
      engines: { node: '>=20' },
      bin: { 'rebase-atelier': 'bin/rebase-atelier.mjs' },
      files: ['bin'],
      keywords: ['rebase', 'git', 'arc', 'mercurial', 'jujutsu', 'tui', 'editor'],
      optionalDependencies,
    },
    null,
    2,
  )}\n`,
)
packages.push({ name: npmName, directory })

const entries = []

for (const packageInfo of packages) {
  const result = JSON.parse(await npm(['pack', packageInfo.directory, '--pack-destination', tarballs, '--json'])) as {
    filename: string
    integrity: string
  }[]
  const packed = result[0]

  if (!packed) throw new Error(`No tarball created for ${packageInfo.name}`)

  entries.push({ name: packageInfo.name, tarball: `tarballs/${packed.filename}`, integrity: packed.integrity })
}

await writeFile(
  path.join(output, 'packages.json'),
  `${JSON.stringify({ version: manifest.version, packages: entries }, null, 2)}\n`,
)
await writeFile('artifacts/SHA256SUMS.txt', `${checksums.join('\n')}\n`)
process.stdout.write(`Packed ${entries.length} npm packages for ${manifest.version}\n`)
