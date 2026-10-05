import { access } from 'node:fs/promises'
import path from 'node:path'

import { arcAdapter } from './arc'
import { gitAdapter } from './git'
import { jujutsuAdapter } from './jujutsu'
import { mercurialAdapter } from './mercurial'

import type { Adapter } from './contracts'
import type { VcsKind } from '../domain/types'

export function createAdapter(kind: VcsKind, cwd: string): Adapter {
  const factories = { git: gitAdapter, arc: arcAdapter, hg: mercurialAdapter, jj: jujutsuAdapter }

  return factories[kind](cwd)
}

export async function detectRepositories(cwd: string): Promise<{ cwd: string; kinds: VcsKind[] } | undefined> {
  let directory = path.resolve(cwd)

  while (true) {
    const kinds: VcsKind[] = []

    for (const [kind, marker] of [
      ['jj', '.jj'],
      ['git', '.git'],
      ['hg', '.hg'],
      ['arc', '.arc'],
      ['arc', '.arcadia.root'],
    ] as const) {
      try {
        await access(path.join(directory, marker))

        if (!kinds.includes(kind)) kinds.push(kind)
      } catch {
        /*
        This marker is absent; keep checking ancestors.
        */
      }
    }

    if (kinds.length > 0) return { cwd: directory, kinds }

    const parent = path.dirname(directory)

    if (parent === directory) return undefined

    directory = parent
  }
}
