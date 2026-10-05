import { access } from 'node:fs/promises'
import path from 'node:path'

import { client, parseDelimitedHistory, shellCommand } from './client'
import { type Adapter, basicActions } from './contracts'

import type { Session } from '../domain/types'

function editors(editor: string[]) {
  return {
    GIT_SEQUENCE_EDITOR: shellCommand([...editor, '--sequence-editor', '--vcs', 'git']),
    GIT_EDITOR: shellCommand([...editor, '--message-editor', '--vcs', 'git']),
  }
}

export function gitAdapter(cwd: string): Adapter {
  const cli = client('git', cwd)

  return {
    kind: 'git',
    cwd,
    capabilities: {
      actions: [...basicActions],
      instructions: ['exec', 'break', 'label', 'reset', 'merge', 'update-ref'],
      sequenceEditor: true,
      rebaseMerges: true,
      root: true,
      onto: true,
      autosquash: true,
    },
    history: async () =>
      parseDelimitedHistory(await cli.call(['log', '-n', '100', '--format=%H%x1f%an%x1f%aI%x1f%s%x1f%P%x00'])),
    inspect: (revision, signal) =>
      cli.call(['show', '--no-ext-diff', '--no-color', '--format=fuller', '--stat', '--patch', revision, '--'], signal),
    session: async () => {
      const fileOutput = await cli.call(['diff', '--name-only', '--diff-filter=U', '-z'])
      const rebaseOutput = await cli.call(['rev-parse', '--git-path', 'rebase-merge'])
      const applyOutput = await cli.call(['rev-parse', '--git-path', 'rebase-apply'])
      const files = fileOutput.split('\0').filter(Boolean)
      const rebasePath = rebaseOutput.trim()
      const applyPath = applyOutput.trim()
      const stopped = await Promise.all(
        [rebasePath, applyPath].map(async (directory) => {
          try {
            await access(path.resolve(cwd, directory))

            return true
          } catch {
            return false
          }
        }),
      )

      let state: Session['state'] = 'idle'
      let description = 'Ready to reshape your history'

      if (stopped.some(Boolean)) {
        state = 'stopped'
        description = 'Rebase paused: inspect, amend or continue'
      }

      if (files.length > 0) {
        state = 'conflicted'
        description = `${files.length} conflicted files`
      }

      return {
        state,
        description,
        operations: stopped.some(Boolean) ? ['continue', 'skip', 'abort', 'edit-plan', 'amend', 'resolve'] : [],
        files,
      }
    },
    start: (options, editor) => {
      const args = ['rebase', '-i', ...(options.root ? ['--root'] : [options.base])]

      if (options.onto) args.push('--onto', options.onto)

      if (options.autosquash) args.push('--autosquash')

      if (options.merges) args.push('--rebase-merges')

      return cli.native(args, editors(editor))
    },
    operation: (operation, editor) =>
      cli.native(
        operation === 'amend'
          ? ['commit', '--amend']
          : ['rebase', `--${operation === 'edit-plan' ? 'edit-todo' : operation}`],
        editors(editor),
      ),
    resolve: (file, editor) =>
      cli.native([
        '-c',
        `mergetool.atelier.cmd=${shellCommand([...editor, '--merge', '--left-label', 'DESTINATION / current history', '--right-label', 'APPLIED / incoming change'])} --base "$BASE" --left "$LOCAL" --right "$REMOTE" --output "$MERGED"`,
        '-c',
        'mergetool.atelier.trustExitCode=true',
        '-c',
        'mergetool.keepBackup=false',
        'mergetool',
        '--tool=atelier',
        '--no-prompt',
        '--',
        file,
      ]),
    execute: cli.execute,
  }
}
