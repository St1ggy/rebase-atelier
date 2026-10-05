import type { Capabilities, Operation, Revision, Session, VcsKind } from '../domain/types'
import type { RunResult } from '../infrastructure/process'

export type RewriteOptions = { base: string; onto?: string; root?: boolean; autosquash?: boolean; merges?: boolean }
export type NativeCommand = { command: string; args: string[]; env: Record<string, string> }
export type Adapter = {
  kind: VcsKind
  cwd: string
  capabilities: Capabilities
  history: () => Promise<Revision[]>
  inspect: (revision: string, signal?: AbortSignal) => Promise<string>
  session: () => Promise<Session>
  start: (options: RewriteOptions, editor: string[]) => NativeCommand
  operation: (operation: Operation, editor: string[]) => NativeCommand
  resolve: (path: string, editor: string[]) => NativeCommand
  execute: (command: NativeCommand, isInteractive?: boolean) => Promise<RunResult>
}

export const basicActions = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'] as const
