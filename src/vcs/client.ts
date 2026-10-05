import { checked, run } from '../infrastructure/process'

import type { NativeCommand } from './contracts'
import type { Revision, VcsKind } from '../domain/types'

export function client(kind: VcsKind, cwd: string) {
  const command = process.env[`ATELIER_${kind.toUpperCase()}`] ?? kind
  const env = { HGPLAIN: '1', GIT_PAGER: 'cat', PAGER: 'cat', ARC_PAGER: 'cat', JJ_PAGER: 'cat' }

  return {
    command,
    call: (args: string[], signal?: AbortSignal) => checked(command, args, { cwd, env, signal }),
    tryCall: (args: string[]) => run(command, args, { cwd, env }),
    native: (args: string[], extra: Record<string, string> = {}): NativeCommand => ({
      command,
      args,
      env: { ...env, ...extra },
    }),
    execute: (invocation: NativeCommand, isInteractive = true) =>
      run(invocation.command, invocation.args, {
        cwd,
        env: invocation.env,
        interactive: isInteractive,
      }),
  }
}

export function shellCommand(args: string[]): string {
  const escapedQuote = String.raw`'\''`

  return args.map((argument) => `'${argument.replaceAll("'", () => escapedQuote)}'`).join(' ')
}

export function editorCommand(args: string[], isPosix = process.platform !== 'win32'): string {
  return isPosix ? shellCommand(args) : args.map((argument) => quoteWindowsArgument(argument)).join(' ')
}

function quoteWindowsArgument(argument: string): string {
  let result = '"'
  let backslashes = 0

  for (const character of argument) {
    if (character === '\\') {
      backslashes++
      continue
    }

    const count = character === '"' ? backslashes * 2 + 1 : backslashes

    result += '\\'.repeat(count) + character

    backslashes = 0
  }

  return `${result}${'\\'.repeat(backslashes * 2)}"`
}

export function parseDelimitedHistory(output: string): Revision[] {
  return output
    .split('\0')
    .filter((record) => record.trim())
    .map((record) => {
      const [id = '', author = '', date = '', subject = '', parents = ''] = record.trimStart().split('\u{1F}', 5)

      return { id, author, date, subject, parents: parents.split(' ').filter(Boolean) }
    })
}
