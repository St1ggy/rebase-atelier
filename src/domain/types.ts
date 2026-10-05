export type VcsKind = 'git' | 'arc' | 'hg' | 'jj'

export type Revision = {
  id: string
  changeId?: string
  parents: string[]
  subject: string
  author: string
  date: string
  immutable?: boolean
  conflicted?: boolean
}

export type Action = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'

export type PlanRow = {
  id: string
  kind: 'commit' | 'instruction' | 'comment' | 'blank' | 'unknown'
  action: string
  revision: string
  body: string
  original?: string
  eol: string
}

export type RewritePlan = {
  vcs: VcsKind
  rows: PlanRow[]
  eol: string
  trailingNewline: boolean
}

export type PlanIssue = { rowId: string; message: string }
export type Operation = 'continue' | 'skip' | 'abort' | 'edit-plan' | 'amend' | 'resolve' | 'resume-plan'
export type Session = {
  state: 'idle' | 'stopped' | 'conflicted' | 'completed' | 'partial'
  description: string
  operations: Operation[]
  files: string[]
}

export type Capabilities = {
  actions: Action[]
  instructions: string[]
  sequenceEditor: boolean
  rebaseMerges: boolean
  root: boolean
  onto: boolean
  autosquash: boolean
}

export const actionLabels: Record<Action, string> = {
  pick: 'Keep this change',
  reword: 'Edit its message',
  edit: 'Stop here to amend',
  squash: 'Combine, keeping both messages',
  fixup: 'Combine, keeping the target message',
  drop: 'Exclude this change',
}
