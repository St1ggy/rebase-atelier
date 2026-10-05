#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

// oxlint-disable-next-line import/extensions -- JSON imports require the explicit extension.
import { version } from '../package.json'

import { executeJjPlan, readJournal } from './application/jj-rewrite'
import { parsePlan, planFromHistory, serializePlan } from './domain/plan'
import {
  clearDraft,
  loadDraft,
  loadSettings,
  saveDraft,
  saveSettings,
  saveViewPreference,
} from './infrastructure/config'
import { fingerprint, openDocument, saveBytes, saveDocument } from './infrastructure/files'
import { checked } from './infrastructure/process'
import { App, launcher } from './ui/app'
import { ConflictEditor } from './ui/conflict-editor'
import { FileChoice, type FileSide } from './ui/file-choice'
import { ResultScreen } from './ui/result'
import { terminal } from './ui/terminal'
import { TextEditor } from './ui/text-editor'
import { VcsPicker } from './ui/vcs-picker'
import { resolveViewMode } from './ui/view-mode'
import { createAdapter, detectRepositories } from './vcs/detection'

import type { RewritePlan, VcsKind } from './domain/types'
import type { Settings } from './infrastructure/config'
import type { AppResult } from './ui/app'
import type { Adapter } from './vcs/contracts'

const options = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
  demo: { type: 'boolean' },
  icons: { type: 'string' },
  view: { type: 'string' },
  vcs: { type: 'string' },
  cwd: { type: 'string' },
  'sequence-editor': { type: 'boolean' },
  'message-editor': { type: 'boolean' },
  editor: { type: 'boolean' },
  merge: { type: 'boolean' },
  base: { type: 'string' },
  left: { type: 'string' },
  right: { type: 'string' },
  output: { type: 'string' },
  'left-label': { type: 'string' },
  'right-label': { type: 'string' },
  'arc-conflict': { type: 'string' },
  'resume-jj': { type: 'boolean' },
} as const
const help = `Rebase Atelier ${version} — history, thoughtfully shaped

Usage:
  bun run dev -- --demo                  Explore without touching a repository
  bun run dev -- [--vcs git|arc|hg|jj]    Open the current workspace
  rebase-atelier --vcs git --sequence-editor FILE
  rebase-atelier --vcs hg --editor FILE   Detect native plan versus message
  rebase-atelier --message-editor FILE   Edit a multiline message
  rebase-atelier --merge --base B --left L --right R --output O
  rebase-atelier --resume-jj             Resume an interrupted Atelier plan

Options: --vcs KIND, --cwd PATH, --view full|compact|minimal, --icons nerd|unicode|ascii, --demo, --help, --version
ATELIER_GIT / ATELIER_ARC / ATELIER_HG / ATELIER_JJ override native executables.
F2 switches display modes. Ctrl+P opens commands. Ctrl+S applies. Ctrl+C cancels.
`
const demo =
  'pick a4c92e1 Add authentication\nfixup 91de703 Fix token validation\nsquash c863b25 Add authentication tests\n\npick 74f081a Improve error messages\npick 52ac984 Extract request middleware\ndrop 09de662 Temporary logging\n# A calm workspace for deliberate changes.\n'

function appearance(settings: Settings) {
  return {
    icons: process.env.ATELIER_ICONS ?? settings.icons,
    ascii: settings.ascii,
    keymap: settings.keymap,
    view: settings.view,
    onViewChange: saveViewPreference,
  }
}

async function editFile(file: string, kind: VcsKind, mode: string, settings: Settings): Promise<number> {
  const document = await openDocument(path.resolve(file))
  const nativePlan = parsePlan(document.text, kind)
  const isPlan =
    mode === 'sequence-editor' ||
    (mode === 'editor' && nativePlan.rows.some((row) => row.kind === 'commit' && /^[a-f\d]{4,64}$/i.test(row.revision)))

  if (!isPlan) {
    const text = await terminal<string | undefined>((finish) => (
      <TextEditor title={document.path} text={document.text} onResult={finish} />
    ))

    if (text === undefined) return 1

    await saveDocument(document, text)

    return 0
  }

  const restored = await loadDraft(document.path, document.fingerprint)
  const adapter = createAdapter(kind, process.cwd())
  let pending = Promise.resolve()
  const result = await terminal<AppResult>(
    (finish) => (
      <App
        plan={restored ?? nativePlan}
        title={`${restored ? 'RECOVERED DRAFT · ' : ''}${document.path}`}
        mode="editor"
        adapter={adapter}
        {...appearance(settings)}
        onResult={finish}
        onPlanChange={(plan) => {
          pending = queueDraft(pending, document.path, document.fingerprint, plan)
        }}
      />
    ),
    { kind: 'cancel' },
  )

  await pending

  if (result?.kind === 'save') await saveDocument(document, serializePlan(result.plan))

  await clearDraft(document.path)

  return result?.kind === 'save' ? 0 : 1
}

async function editMerge(
  basePath: string,
  leftPath: string,
  rightPath: string,
  outputPath: string,
  labels: { left: string; right: string },
): Promise<number> {
  const buffers = await Promise.all([basePath, leftPath, rightPath, outputPath].map((file) => readFile(file)))
  const decoded = decodeMerge(buffers)

  if (!decoded) return chooseWholeFile(buffers, outputPath, labels)

  const [base = '', left = '', right = '', current = ''] = decoded
  const document = { path: outputPath, text: current, fingerprint: fingerprint(current) }
  const result = await terminal<string | undefined>((finish) => (
    <ConflictEditor
      input={{
        path: outputPath,
        base,
        left,
        right,
        current: document.text,
        labels,
      }}
      onResult={finish}
    />
  ))

  if (result === undefined) return 1

  await saveDocument(document, result)

  return 0
}

function decodeMerge(buffers: Buffer[]): string[] | undefined {
  try {
    if (buffers.some((buffer) => buffer.includes(0) || buffer.length > 2_000_000)) return undefined

    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

    return buffers.map((buffer) => decoder.decode(buffer))
  } catch {
    return undefined
  }
}

async function chooseWholeFile(
  buffers: Buffer[],
  outputPath: string,
  labels: { left: string; right: string },
): Promise<number> {
  const side = await terminal<FileSide | undefined>((finish) => (
    <FileChoice title={outputPath} sizes={buffers.map((buffer) => buffer.length)} labels={labels} onResult={finish} />
  ))

  if (!side) return 1

  const sides = { base: buffers[0], left: buffers[1], right: buffers[2] }
  const bytes = sides[side]
  const original = buffers[3]

  if (!bytes || !original) throw new Error('Missing conflict data')

  await saveBytes({ path: outputPath, fingerprint: fingerprint(original) }, bytes)

  return 0
}

async function chooseAdapter(
  cwd: string,
  requested: VcsKind | undefined,
  settings: Settings,
): Promise<Adapter | undefined> {
  const found = await detectRepositories(cwd)

  if (!found && !requested) throw new Error('No supported repository found. Try --demo or --vcs KIND.')

  let kind = requested ?? settings.repositories[found?.cwd ?? cwd]

  if (!kind && found?.kinds.length === 1) kind = found.kinds[0]

  if (!kind && found) {
    kind = await terminal<VcsKind | undefined>((finish) => <VcsPicker kinds={found.kinds} onResult={finish} />)

    if (!kind) return undefined

    settings.repositories[found.cwd] = kind
    await saveSettings(settings)
  }

  if (!kind) throw new Error('Choose a VCS with --vcs')

  return createAdapter(kind, kind === 'arc' ? cwd : (found?.cwd ?? cwd))
}

async function runWorkspaceCommand(adapter: Adapter, result: AppResult): Promise<void> {
  if (result.kind === 'jj-plan') {
    await executeJjPlan(adapter.cwd, result.plan, result.base, launcher())
  } else if (result.kind === 'native') {
    const execution = await adapter.execute(result.command)

    if (execution.code !== 0)
      throw new Error(`Native command stopped (${execution.code}). Reopen the workspace to inspect its state.`)
  }
}

async function workspace(cwd: string, requested: VcsKind | undefined, settings: Settings): Promise<number> {
  const adapter = await chooseAdapter(cwd, requested, settings)

  if (!adapter) return 0

  while (true) {
    const [revisions, session] = await Promise.all([adapter.history(), adapter.session()])
    const editable = revisions.toReversed().filter((revision) => adapter.kind !== 'jj' || !revision.immutable)
    const plan = planFromHistory(editable, adapter.kind)
    const defaultBase = adapter.kind === 'jj' ? editable[0]?.parents[0] : undefined
    const currentSettings = await loadSettings()
    const result = await terminal<AppResult>(
      (finish) => (
        <App
          plan={plan}
          title={adapter.cwd}
          mode="history"
          adapter={adapter}
          session={session}
          defaultBase={defaultBase}
          {...appearance(currentSettings)}
          onResult={finish}
        />
      ),
      { kind: 'cancel' },
    )

    if (!result || result.kind === 'cancel') return 0

    let message = ''

    try {
      await runWorkspaceCommand(adapter, result)
      const current = await adapter.session()

      if (current.state === 'idle') {
        const after = await adapter.history()

        message = `Native operation finished.\n\nBefore: ${revisions.length} displayed changes\nAfter: ${after.length} displayed changes\n\n${after
          .slice(0, 20)
          .map((revision) => `${revision.id.slice(0, 12)} ${revision.subject}`)
          .join('\n')}`
      }
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    if (message)
      await terminal<boolean>((finish) => <ResultScreen text={message} onResult={() => finish(true)} />, true)
  }
}

async function editArcConflict(cwd: string, file: string): Promise<number> {
  const command = process.env.ATELIER_ARC ?? 'arc'
  const output = await checked(command, ['root'], { cwd })
  const root = output.trim()
  const fullPath = path.resolve(root, file)
  const relative = path.relative(root, fullPath).replaceAll('\\', '/')
  const document = await openDocument(fullPath)
  const [base, left, right] = await Promise.all(
    [1, 2, 3].map((stage) => checked(command, ['show', `:${stage}:${relative}`], { cwd })),
  )
  const text = await terminal<string | undefined>((finish) => (
    <ConflictEditor
      input={{
        path: file,
        base: base ?? '',
        left: left ?? '',
        right: right ?? '',
        current: document.text,
        labels: { left: 'CURRENT / destination history', right: 'INCOMING / applied change' },
      }}
      onResult={finish}
    />
  ))

  if (text === undefined) return 1

  await saveDocument(document, text)
  await checked(command, ['add', file], { cwd })

  return 0
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter((argument) => argument !== '--'),
    options,
    allowPositionals: true,
  })

  if (values.help) {
    process.stdout.write(help)

    return 0
  }

  if (values.version) {
    process.stdout.write(`${version}\n`)

    return 0
  }

  if (values.vcs && !['git', 'arc', 'hg', 'jj'].includes(values.vcs)) throw new Error(`Unknown VCS: ${values.vcs}`)

  configureIcons(values.icons)
  await configureView(values.view)

  const cwd = path.resolve(values.cwd ?? process.cwd())

  if (values.merge) {
    if (!values.base || !values.left || !values.right || !values.output)
      throw new Error('Merge mode requires --base, --left, --right and --output')

    return editMerge(values.base, values.left, values.right, values.output, {
      left: values['left-label'] ?? 'LEFT / native version',
      right: values['right-label'] ?? 'RIGHT / native version',
    })
  }

  if (values['arc-conflict']) return editArcConflict(cwd, values['arc-conflict'])

  if (values['resume-jj']) {
    const journal = await readJournal(cwd)

    if (!journal) throw new Error('No Jujutsu plan journal found')

    await executeJjPlan(cwd, journal.plan, journal.base, launcher(), true)

    return 0
  }

  const settings = await loadSettings()
  const kind = (values.vcs ?? 'git') as VcsKind
  const mode = ['sequence-editor', 'message-editor', 'editor'].find((name) => values[name as keyof typeof values])

  if (mode) {
    if (!positionals[0]) throw new Error('Editor mode requires a filename')

    return editFile(positionals[0], kind, mode, settings)
  }

  if (values.demo) {
    await terminal<AppResult>(
      (finish) => (
        <App
          plan={parsePlan(demo, kind)}
          title="feature/auth → main · 6 changes · demo repository"
          mode="demo"
          {...appearance(settings)}
          onResult={finish}
        />
      ),
      { kind: 'cancel' },
    )

    return 0
  }

  return workspace(cwd, values.vcs as VcsKind | undefined, settings)
}

async function queueDraft(
  previous: Promise<void>,
  documentPath: string,
  expectedFingerprint: string,
  plan: RewritePlan,
): Promise<void> {
  await previous
  await saveDraft(documentPath, expectedFingerprint, plan)
}

function configureIcons(value?: string) {
  if (!value) return

  if (!['nerd', 'unicode', 'ascii'].includes(value)) throw new Error('Icons must be nerd, unicode or ascii')

  process.env.ATELIER_ICONS = value
}

async function configureView(value?: string) {
  if (value !== undefined) await saveViewPreference(resolveViewMode(value))
}

try {
  process.exitCode = await main()
} catch (error) {
  process.stderr.write(`Atelier: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
