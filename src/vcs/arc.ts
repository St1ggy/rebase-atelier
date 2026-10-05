import { client, editorCommand } from './client'
import { type Adapter, basicActions } from './contracts'

import type { Session } from '../domain/types'

type ArcCommit = {
  hash?: string
  commit?: string
  author?: string
  date?: string
  message?: string
  title?: string
  parents?: string[]
}

function editors(editor: string[]) {
  return {
    ARC_EDITOR: editorCommand([...editor, '--message-editor', '--vcs', 'arc']),
    ARC_SEQUENCE_EDITOR: editorCommand([...editor, '--sequence-editor', '--vcs', 'arc']),
  }
}

export function arcAdapter(cwd: string): Adapter {
  const cli = client('arc', cwd)

  return {
    kind: 'arc',
    cwd,
    capabilities: {
      actions: [...basicActions],
      instructions: [],
      sequenceEditor: true,
      rebaseMerges: false,
      root: false,
      onto: true,
      autosquash: true,
    },
    history: async () => {
      const output = await cli.call(['log', '-n', '100', '--json'])
      const commits = JSON.parse(output) as ArcCommit[] | { commits: ArcCommit[] }

      return (Array.isArray(commits) ? commits : commits.commits).map((commit) => ({
        id: commit.hash ?? commit.commit ?? '',
        author: commit.author ?? '',
        date: commit.date ?? '',
        subject: commit.title ?? commit.message?.split('\n', 1)[0] ?? '',
        parents: commit.parents ?? [],
      }))
    },
    inspect: (revision, signal) => cli.call(['show', '--no-color', '--git', revision], signal),
    session: async () => {
      const output = await cli.call(['status'])
      const files = output.split('\n').flatMap((line) => {
        const content = line.trim()
        const colon = content.indexOf(':')
        const status = content.slice(0, colon)

        return ['both modified', 'both added', 'deleted by us', 'deleted by them'].includes(status)
          ? [content.slice(colon + 1).trim()]
          : []
      })
      const isStopped = /rebase.*(?:progress|continue)|rebasing|fix conflicts/i.test(output)
      let state: Session['state'] = 'idle'

      if (isStopped) state = 'stopped'

      if (files.length > 0) state = 'conflicted'

      return {
        state,
        description: output.trim(),
        operations: isStopped || files.length > 0 ? ['continue', 'skip', 'abort', 'amend', 'resolve'] : [],
        files,
      }
    },
    start: (options, editor) =>
      cli.native(
        [
          'rebase',
          '-i',
          options.base,
          ...(options.onto ? ['--onto', options.onto] : []),
          ...(options.autosquash ? ['--autosquash'] : []),
        ],
        editors(editor),
      ),
    operation: (operation, editor) =>
      cli.native(operation === 'amend' ? ['commit', '--amend'] : ['rebase', `--${operation}`], editors(editor)),
    resolve: (file, editor) => ({
      command: editor[0] ?? '',
      args: [...editor.slice(1), '--arc-conflict', file, '--cwd', cwd],
      env: {},
    }),
    execute: cli.execute,
  }
}
