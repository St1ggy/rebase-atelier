import { createHash } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { type ViewMode, defaultViewMode, resolveViewMode } from '../ui/view-mode'

import { writePrivateJson } from './files'

import type { RewritePlan, VcsKind } from '../domain/types'

export type Settings = {
  theme: 'dark' | 'light' | 'terminal' | 'mono'
  icons: 'nerd' | 'unicode' | 'ascii'
  ascii: boolean
  view: ViewMode
  keymap: Record<string, string>
  repositories: Record<string, VcsKind>
}
const defaults: Settings = {
  theme: 'terminal',
  icons: 'nerd',
  ascii: false,
  view: defaultViewMode,
  keymap: {},
  repositories: {},
}
const preferences: { pending?: Promise<void> } = {}

export function configPath(): string {
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config'), 'rebase-atelier', 'config.json')
}

export async function loadSettings(): Promise<Settings> {
  try {
    const value = JSON.parse(await readFile(configPath(), 'utf8')) as Partial<Settings>

    return {
      ...defaults,
      ...value,
      view: resolveViewMode(value.view),
      keymap: value.keymap ?? {},
      repositories: value.repositories ?? {},
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaults

    throw new Error('Cannot load Atelier config.json', { cause: error })
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writePrivateJson(configPath(), settings)
}

export function saveViewPreference(view: ViewMode): Promise<void> {
  preferences.pending = writeViewPreference(preferences.pending, view)

  return preferences.pending
}

async function writeViewPreference(previous: Promise<void> | undefined, view: ViewMode): Promise<void> {
  try {
    await previous
  } catch {
    // A previous failed write must not block the next explicit selection.
  }

  const settings = await loadSettings()

  await saveSettings({ ...settings, view })
}

export async function flushPreferences(): Promise<void> {
  try {
    await preferences.pending
  } catch {
    // Preference errors are shown by the UI and must not prevent plan saving.
  }
}

function draftPath(documentPath: string): string {
  const key = createHash('sha256').update(documentPath).digest('hex')

  return path.join(
    process.env.XDG_STATE_HOME ?? path.join(homedir(), '.local', 'state'),
    'rebase-atelier',
    `draft-${key}.json`,
  )
}

export async function loadDraft(documentPath: string, expected: string): Promise<RewritePlan | undefined> {
  try {
    const value = JSON.parse(await readFile(draftPath(documentPath), 'utf8')) as {
      fingerprint: string
      plan: RewritePlan
    }

    return value.fingerprint === expected ? value.plan : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined

    throw error
  }
}

export async function saveDraft(documentPath: string, fingerprint: string, plan: RewritePlan): Promise<void> {
  await writePrivateJson(draftPath(documentPath), { fingerprint, plan })
}

export async function clearDraft(documentPath: string): Promise<void> {
  await rm(draftPath(documentPath), { force: true })
}
