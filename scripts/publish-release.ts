import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { npm } from './npm'

const release = (await Bun.file('release/packages.json').json()) as {
  version: string
  packages: { name: string; tarball: string; integrity: string }[]
}

if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${release.version}`)
  throw new Error('Release tag does not match npm version')

for (const packageInfo of release.packages) {
  const tarball = path.resolve('release', packageInfo.tarball)
  const integrity = `sha512-${createHash('sha512')
    .update(await readFile(tarball))
    .digest('base64')}`

  if (integrity !== packageInfo.integrity) throw new Error(`Tarball integrity mismatch for ${packageInfo.name}`)

  let existing: string | undefined

  try {
    existing = JSON.parse(
      await npm(['view', `${packageInfo.name}@${release.version}`, 'dist.integrity', '--json']),
    ) as string
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('E404')) throw error
  }

  if (existing) {
    if (existing !== integrity)
      throw new Error(`${packageInfo.name}@${release.version} already exists with different contents`)

    process.stdout.write(`Already published ${packageInfo.name}@${release.version}\n`)
    continue
  }

  process.stdout.write(
    await npm(['publish', tarball, '--access', 'public', ...(process.argv.includes('--dry-run') ? ['--dry-run'] : [])]),
  )
}
