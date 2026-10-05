import { readJournal } from '../application/jj-rewrite'

import { client } from './client'

import type { Adapter } from './contracts'
import type { Revision, Session } from '../domain/types'

function editorOptions(editor: string[]) {
  return ['--config', `ui.editor=${JSON.stringify([...editor, '--message-editor', '--vcs', 'jj'])}`]
}

export function jujutsuAdapter(cwd: string): Adapter {
  const cli = client('jj', cwd)
  const conflictPaths = new Map<string, { revision: string; path: string }>()

  return {
    kind: 'jj',
    cwd,
    capabilities: {
      actions: ['pick', 'reword', 'squash', 'fixup', 'drop'],
      instructions: [],
      sequenceEditor: false,
      rebaseMerges: true,
      root: false,
      onto: true,
      autosquash: false,
    },
    history: async () => {
      const output = await cli.call([
        'log',
        '--no-graph',
        '--limit',
        '100',
        '-r',
        'ancestors(@, 100)',
        '--template',
        String.raw`commit_id ++ "\x1f" ++ change_id ++ "\x1f" ++ author.name() ++ "\x1f" ++ author.timestamp().format("%Y-%m-%d") ++ "\x1f" ++ description.first_line() ++ "\x1f" ++ parents.map(|p| p.commit_id()).join(" ") ++ "\x1f" ++ immutable ++ "\x1f" ++ conflict ++ "\0"`,
      ])

      return output
        .split('\0')
        .filter(Boolean)
        .map((record): Revision => {
          const [id = '', changeId = '', author = '', date = '', subject = '', parents = '', immutable, conflicted] =
            record.split('\u{1F}', 8)

          return {
            id,
            changeId,
            author,
            date,
            subject,
            parents: parents.split(' ').filter(Boolean),
            immutable: immutable === 'true',
            conflicted: conflicted === 'true',
          }
        })
    },
    inspect: (revision, signal) => cli.call(['show', '--color=never', '--git', '-r', revision], signal),
    session: async () => {
      const revisions = await cli.call([
        'log',
        '--no-graph',
        '--limit',
        '100',
        '-r',
        'conflicts()',
        '--template',
        String.raw`commit_id ++ "\x1f" ++ change_id ++ "\0"`,
      ])
      const journal = await readJournal(cwd)
      const files: string[] = []

      conflictPaths.clear()

      const conflictedRevisions = revisions.split('\0').filter(Boolean)

      for (const record of conflictedRevisions) {
        const [revision = '', change = ''] = record.split('\u{1F}', 2)
        const output = await cli.call(['resolve', '--list', '-r', revision])

        for (const file of parseConflictPaths(output)) {
          const label = `${revision.slice(0, 8)} · ${file}`

          files.push(label)
          conflictPaths.set(label, { revision: change, path: file })
        }
      }
      const hasPartialPlan = Boolean(journal && !journal.completed)
      let description = hasPartialPlan
        ? 'An Atelier plan is unfinished — use resume-plan from the command palette'
        : 'Ready to reshape your changes'

      if (files.length > 0) description = 'Conflicted changes — resolve them; jj has no rebase --continue'

      return {
        state: sessionState(files.length, hasPartialPlan),
        description,
        operations: [
          ...(files.length > 0 ? ['resolve' as const] : []),
          ...(hasPartialPlan ? ['resume-plan' as const] : []),
        ],
        files,
      }
    },
    start: (options, editor) =>
      cli.native([...editorOptions(editor), 'rebase', '--source', options.base, '--onto', options.onto ?? '@-']),
    operation: (operation, editor) => {
      if (operation === 'resume-plan')
        return { command: editor[0] ?? '', args: [...editor.slice(1), '--resume-jj', '--cwd', cwd], env: {} }

      if (operation !== 'amend') throw new Error(`${operation} is not a Jujutsu operation`)

      return cli.native([...editorOptions(editor), 'describe'])
    },
    resolve: (file, editor) => {
      const conflict = conflictPaths.get(file)

      return cli.native([
        '--config',
        `ui.merge-editor=${JSON.stringify([...editor, '--merge', '--base', '$base', '--left', '$left', '--right', '$right', '--output', '$output'])}`,
        'resolve',
        ...(conflict ? ['-r', conflict.revision] : []),
        conflict?.path ?? file,
      ])
    },
    execute: cli.execute,
  }
}

function parseConflictPaths(output: string): string[] {
  return output.split('\n').flatMap((line) => {
    const suffix = line.indexOf('-sided conflict')

    if (suffix === -1) return []

    const prefix = line.slice(0, suffix).trimEnd()
    const separator = prefix.lastIndexOf(' ')

    return separator === -1 ? [] : [prefix.slice(0, separator).trimEnd()]
  })
}

function sessionState(count: number, hasPartialPlan: boolean): Session['state'] {
  if (count > 0) return 'conflicted'

  return hasPartialPlan ? 'partial' : 'idle'
}
