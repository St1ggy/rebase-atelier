import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { semanticAction, validatePlan } from '../domain/plan'
import { writePrivateJson } from '../infrastructure/files'
import { client } from '../vcs/client'

import type { RewritePlan } from '../domain/types'

export type RewriteJournal = {
  cwd: string
  before: string
  after: string
  plan: RewritePlan
  base: string
  next: number
  inFlight: boolean
  completed: boolean
  target?: string
  identities: Record<string, string>
  substep?: number
}

export function journalPath(cwd: string): string {
  const key = createHash('sha256').update(cwd).digest('hex').slice(0, 24)

  return path.join(
    process.env.XDG_STATE_HOME ?? path.join(homedir(), '.local', 'state'),
    'rebase-atelier',
    `${key}.json`,
  )
}

export async function readJournal(cwd: string): Promise<RewriteJournal | undefined> {
  try {
    return JSON.parse(await readFile(journalPath(cwd), 'utf8')) as RewriteJournal
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined

    throw error
  }
}

async function operationHead(cwd: string): Promise<string> {
  const output = await client('jj', cwd).call(['op', 'log', '--no-graph', '--limit', '1', '--template', 'id'])

  return output.trim()
}

export async function executeJjPlan(
  cwd: string,
  plan: RewritePlan,
  base: string,
  editor: string[],
  shouldResume = false,
): Promise<RewriteJournal> {
  const cli = client('jj', cwd)
  const issues = validatePlan(plan)

  if (issues.length > 0) throw new Error(issues[0]?.message)

  const journal = await loadOrCreateJournal(cwd, plan, base, shouldResume)
  const revisions = journal.plan.rows.filter((row) => row.kind === 'commit')

  let target = journal.target

  if (!target) {
    const output = await cli.call(['log', '--no-graph', '-r', journal.base, '--template', 'change_id'])

    target = output.trim()
  }

  for (let index = journal.next; index < revisions.length; index++) {
    const row = revisions[index]

    if (!row) continue

    const identity = journal.identities[row.id] ?? row.revision
    const action = semanticAction('jj', row.action)
    const steps = jjSteps(action, identity, target)

    await executeSteps(journal, steps, editor)

    if (action !== 'drop' && action !== 'squash' && action !== 'fixup') target = identity

    journal.target = target
    journal.next = index + 1
    journal.substep = 0
    await writePrivateJson(journalPath(cwd), journal)
  }
  await finishWorkspace(
    journal,
    target,
    revisions.some((row) => semanticAction('jj', row.action) !== 'drop'),
  )

  return journal
}

async function loadOrCreateJournal(
  cwd: string,
  plan: RewritePlan,
  base: string,
  shouldResume: boolean,
): Promise<RewriteJournal> {
  const existing = await readJournal(cwd)
  const head = await operationHead(cwd)

  if (shouldResume) {
    if (!existing || existing.inFlight || existing.after !== head)
      throw new Error(
        'Cannot resume automatically: the last step or operation head is ambiguous. Inspect jj op log first.',
      )

    return existing
  }

  if (existing && !existing.completed)
    throw new Error('An unfinished Atelier plan exists. Use --resume-jj or inspect its operation journal.')

  const journal: RewriteJournal = {
    cwd,
    before: head,
    after: head,
    plan,
    base,
    next: 0,
    inFlight: false,
    completed: false,
    identities: {},
  }
  const cli = client('jj', cwd)

  const rows = plan.rows.filter((entry) => entry.kind === 'commit')

  for (const row of rows) {
    const constraints = await cli.call([
      'log',
      '--no-graph',
      '-r',
      row.revision,
      '--template',
      'if(immutable, "immutable", "") ++ if(parents.len() > 1, " merge", "")',
    ])

    if (constraints.trim())
      throw new Error(
        'Linear plan editing requires mutable, single-parent changes. Use native graph rebase for merge history.',
      )

    const change = await cli.call(['log', '--no-graph', '-r', row.revision, '--template', 'change_id'])

    if (!change.trim()) throw new Error(`Revision ${row.revision} is not present`)

    journal.identities[row.id] = change.trim()
  }

  return journal
}

async function finishWorkspace(journal: RewriteJournal, target: string, hasRetainedChange: boolean): Promise<void> {
  const cli = client('jj', journal.cwd)

  journal.inFlight = true
  await writePrivateJson(journalPath(journal.cwd), journal)
  await cli.call([hasRetainedChange ? 'edit' : 'new', target])
  journal.after = await operationHead(journal.cwd)
  journal.inFlight = false
  journal.completed = true
  await writePrivateJson(journalPath(journal.cwd), journal)
}

async function executeSteps(journal: RewriteJournal, steps: string[][], editor: string[]): Promise<void> {
  const cli = client('jj', journal.cwd)

  for (let step = journal.substep ?? 0; step < steps.length; step++) {
    journal.inFlight = true
    await writePrivateJson(journalPath(journal.cwd), journal)

    const result = await cli.execute(
      cli.native([
        '--config',
        `ui.editor=${JSON.stringify([...editor, '--message-editor', '--vcs', 'jj'])}`,
        ...(steps[step] ?? []),
      ]),
      editor.length > 0,
    )

    journal.after = await operationHead(journal.cwd)
    journal.inFlight = false
    journal.substep = result.code === 0 ? step + 1 : step
    await writePrivateJson(journalPath(journal.cwd), journal)

    if (result.code !== 0) throw new Error(`Jujutsu plan stopped: ${result.stderr}. The operation journal was saved.`)
  }
}

function jjSteps(action: string | undefined, identity: string, target: string): string[][] {
  const rebase = ['rebase', '-r', identity, '--insert-after', target]
  const steps: Record<string, string[][]> = {
    drop: [['abandon', identity]],
    reword: [rebase, ['describe', '-r', identity]],
    squash: [['squash', '--from', identity, '--into', target]],
    fixup: [['squash', '--from', identity, '--into', target, '--use-destination-message']],
    pick: [rebase],
  }
  const result = steps[action ?? '']

  if (!result) throw new Error(`Unsupported Jujutsu plan action: ${action}`)

  return result
}
