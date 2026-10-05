import { splitLines } from './merge'

import type { Action, PlanIssue, PlanRow, Revision, RewritePlan, VcsKind } from './types'

const nativeActions: Record<VcsKind, Record<Action, string>> = {
  git: { pick: 'pick', reword: 'reword', edit: 'edit', squash: 'squash', fixup: 'fixup', drop: 'drop' },
  arc: { pick: 'pick', reword: 'reword', edit: 'edit', squash: 'squash', fixup: 'fixup', drop: 'drop' },
  hg: { pick: 'pick', reword: 'mess', edit: 'edit', squash: 'fold', fixup: 'roll', drop: 'drop' },
  jj: { pick: 'pick', reword: 'describe', edit: 'edit', squash: 'squash', fixup: 'fixup', drop: 'abandon' },
}
const gitAliases: Record<string, string> = {
  p: 'pick',
  r: 'reword',
  e: 'edit',
  s: 'squash',
  f: 'fixup',
  d: 'drop',
  x: 'exec',
  b: 'break',
  l: 'label',
  t: 'reset',
  m: 'merge',
  u: 'update-ref',
}
const hgAliases: Record<string, string> = {
  p: 'pick',
  m: 'mess',
  e: 'edit',
  f: 'fold',
  r: 'roll',
  d: 'drop',
  b: 'base',
}
const instructions: Record<VcsKind, string[]> = {
  git: ['exec', 'break', 'label', 'reset', 'merge', 'update-ref', 'noop'],
  arc: [],
  hg: ['base'],
  jj: [],
}

export function semanticAction(vcs: VcsKind, native: string): Action | undefined {
  const command = native.split(' ', 1)[0] ?? native
  const normalized = (vcs === 'hg' ? hgAliases : gitAliases)[command] ?? command

  return (Object.keys(nativeActions[vcs]) as Action[]).find((action) => nativeActions[vcs][action] === normalized)
}

function lineEnding(line: string): string {
  if (line.endsWith('\r\n')) return '\r\n'

  return line.endsWith('\n') ? '\n' : ''
}

function splitFirst(text: string): [string, string] {
  const content = text.trimStart()
  const space = content.search(/\s/)

  return space === -1 ? [content, ''] : [content.slice(0, space), content.slice(space).trimStart()]
}

function rowKind(content: string, vcs: VcsKind, action: string): PlanRow['kind'] {
  if (!content.trim()) return 'blank'

  if (content.trimStart().startsWith('#')) return 'comment'

  if (semanticAction(vcs, action)) return 'commit'

  return instructions[vcs].includes(action) ? 'instruction' : 'unknown'
}

function parseRow(original: string, index: number, vcs: VcsKind): PlanRow {
  const eol = lineEnding(original)
  const content = eol ? original.slice(0, -eol.length) : original
  const [native, tail] = splitFirst(content)
  const action = (vcs === 'hg' ? hgAliases : gitAliases)[native] ?? native
  const kind = rowKind(content, vcs, action)
  const row: PlanRow = { id: `row-${index}`, kind, action, revision: '', body: tail, original, eol }

  if (kind !== 'commit') return row

  const [first, rest] = splitFirst(tail)

  if (first === '-C' || first === '-c') {
    const [revision, body] = splitFirst(rest)

    return { ...row, action: `${action} ${first}`, revision, body }
  }

  return { ...row, revision: first, body: rest }
}

export function parsePlan(text: string, vcs: VcsKind): RewritePlan {
  return {
    vcs,
    rows: splitLines(text).map((line, index) => parseRow(line, index, vcs)),
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    trailingNewline: text.endsWith('\n'),
  }
}

function rowContent(row: PlanRow): string {
  if (row.original === undefined) return [row.action, row.revision, row.body].filter(Boolean).join(' ')

  return row.eol ? row.original.slice(0, -row.eol.length) : row.original
}

export function serializePlan(plan: RewritePlan): string {
  return plan.rows
    .map((row, index) => {
      let eol = row.eol || plan.eol

      if (index === plan.rows.length - 1 && !plan.trailingNewline) eol = ''

      return rowContent(row) + eol
    })
    .join('')
}

export function planFromHistory(revisions: Revision[], vcs: VcsKind): RewritePlan {
  return parsePlan(
    revisions.map((revision) => `${nativeActions[vcs].pick} ${revision.id} ${revision.subject}\n`).join(''),
    vcs,
  )
}

export function setAction(plan: RewritePlan, ids: Set<string>, action: Action): RewritePlan {
  return {
    ...plan,
    rows: plan.rows.map((row) =>
      row.kind === 'commit' && ids.has(row.id)
        ? { ...row, action: nativeActions[plan.vcs][action], original: undefined }
        : row,
    ),
  }
}

export function editRow(plan: RewritePlan, id: string, text: string): RewritePlan {
  if (text.includes('\n') || text.includes('\r')) throw new Error('A native instruction occupies one line')

  const replacement = parsePlan(`${text}${plan.eol}`, plan.vcs).rows[0]

  if (!replacement || ['comment', 'blank', 'unknown'].includes(replacement.kind))
    throw new Error('Enter a supported native instruction or commit action')

  return { ...plan, rows: plan.rows.map((row) => (row.id === id ? { ...replacement, id, original: undefined } : row)) }
}

export function moveRows(plan: RewritePlan, ids: Set<string>, direction: -1 | 1): RewritePlan {
  const rows = [...plan.rows]
  const indices = rows.map((_, index) => index)
  const order = direction === 1 ? indices.toReversed() : indices

  for (const index of order) {
    const next = index + direction
    const row = rows[index]
    const neighbor = rows[next]

    if (row && neighbor && ids.has(row.id) && !ids.has(neighbor.id)) {
      rows[index] = neighbor
      rows[next] = row
    }
  }

  return { ...plan, rows }
}

function instructionIssues(row: PlanRow, labels: Set<string>): PlanIssue[] {
  const issues: PlanIssue[] = []

  if (row.action === 'label') {
    if (labels.has(row.body)) issues.push({ rowId: row.id, message: 'Duplicate label' })

    labels.add(row.body)
  }

  if (row.action === 'reset' && row.body !== 'onto' && !labels.has(row.body))
    issues.push({ rowId: row.id, message: 'Reset refers to an undefined label' })

  if (['exec', 'label', 'reset', 'merge', 'update-ref', 'base'].includes(row.action) && !row.body)
    issues.push({ rowId: row.id, message: 'Instruction requires an argument' })

  return issues
}

function commitIssues(row: PlanRow, action: Action | undefined, canFold: boolean): PlanIssue[] {
  const issues: PlanIssue[] = []

  if (!row.revision) issues.push({ rowId: row.id, message: 'Missing revision' })

  if (!canFold && (action === 'squash' || action === 'fixup'))
    issues.push({ rowId: row.id, message: 'A fold needs a preceding retained change in this section' })

  return issues
}

export function validatePlan(plan: RewritePlan): PlanIssue[] {
  const issues: PlanIssue[] = []
  const labels = new Set<string>()
  let canFold = false

  for (const row of plan.rows) {
    if (row.kind === 'commit') {
      const action = semanticAction(plan.vcs, row.action.split(' ', 1)[0] ?? '')

      issues.push(...commitIssues(row, action, canFold))

      if (action !== 'drop') canFold = true
    } else if (row.kind === 'instruction') {
      issues.push(...instructionIssues(row, labels))

      if (['label', 'reset', 'merge', 'base'].includes(row.action)) canFold = false
    }
  }

  return issues
}

type GroupLink = 'start' | 'middle' | 'end'

export function groupLinks(plan: RewritePlan): Map<string, GroupLink> {
  const result = new Map<string, GroupLink>()
  let group: string[] = []
  const flush = () => {
    if (group.length > 1) {
      for (const [index, id] of group.entries()) {
        let link: GroupLink = 'middle'

        if (index === 0) link = 'start'
        else if (index === group.length - 1) link = 'end'

        result.set(id, link)
      }
    }

    group = []
  }

  for (const row of plan.rows) {
    const action = semanticAction(plan.vcs, row.action.split(' ', 1)[0] ?? '')

    if (action !== 'drop' && row.kind === 'commit') {
      if (action !== 'squash' && action !== 'fixup') flush()

      group.push(row.id)
    } else if (row.kind === 'instruction') flush()
  }
  flush()

  return result
}
