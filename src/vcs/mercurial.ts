import { client, editorCommand, parseDelimitedHistory } from './client'
import { type Adapter, basicActions } from './contracts'

import type { Session } from '../domain/types'

function editors(editor: string[]) {
  return { HGEDITOR: editorCommand([...editor, '--editor', '--vcs', 'hg']) }
}

export function mercurialAdapter(cwd: string): Adapter {
  const cli = client('hg', cwd)
  const extensions = ['--config', 'extensions.histedit=', '--config', 'extensions.rebase=']
  let activeOperation = 'histedit'

  return {
    kind: 'hg',
    cwd,
    capabilities: {
      actions: [...basicActions],
      instructions: ['base'],
      sequenceEditor: true,
      rebaseMerges: false,
      root: false,
      onto: true,
      autosquash: false,
    },
    history: async () =>
      parseDelimitedHistory(
        await cli.call([
          'log',
          '-l',
          '100',
          '-T',
          String.raw`{node}\x1f{author|person}\x1f{date|isodate}\x1f{desc|firstline}\x1f{p1node}\0`,
        ]),
      ),
    inspect: (revision, signal) => cli.call(['log', '-r', revision, '--stat', '--patch'], signal),
    session: async () => {
      const status = await cli.call(['status'])
      const output = await cli.call(['resolve', '-l', '-T', 'json'])
      const conflicts = JSON.parse(output) as { mergestatus: string; path: string }[]
      const files = conflicts.filter((conflict) => conflict.mergestatus === 'U').map((conflict) => conflict.path)
      const summary = await cli.call([...extensions, 'summary'])
      const isStopped = /histedit:|rebase:/.test(summary)
      let state: Session['state'] = 'idle'

      activeOperation = summary.includes('rebase:') ? 'rebase' : 'histedit'

      if (isStopped) state = 'stopped'

      if (files.length > 0) state = 'conflicted'

      return {
        state,
        description: isStopped ? summary.trim() : status.trim() || 'Ready to reshape your history',
        operations: isStopped ? ['continue', 'abort', 'amend', 'resolve'] : [],
        files,
      }
    },
    start: (options, editor) =>
      cli.native(
        [
          ...extensions,
          ...(options.onto ? ['rebase', '-s', options.base, '-d', options.onto] : ['histedit', options.base]),
        ],
        editors(editor),
      ),
    operation: (operation, editor) => {
      const args = operation === 'amend' ? ['commit', '--amend'] : [activeOperation, `--${operation}`]

      return cli.native([...extensions, ...args], editors(editor))
    },
    resolve: (path, editor) =>
      cli.native([
        '--config',
        `merge-tools.atelier.executable=${editor[0] ?? ''}`,
        '--config',
        `merge-tools.atelier.args=${editorCommand([...editor.slice(1), '--merge', '--left-label', 'APPLIED CHANGE / local', '--right-label', 'DESTINATION / other'])} --base $base --left $local --right $other --output $local`,
        '--config',
        'merge-tools.atelier.premerge=false',
        '--config',
        'merge-tools.atelier.check=changed',
        'resolve',
        '--tool',
        'atelier',
        '--',
        path,
      ]),
    execute: cli.execute,
  }
}
