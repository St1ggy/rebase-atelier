import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  configPath,
  flushPreferences,
  loadSettings,
  saveSettings,
  saveViewPreference,
} from '../../src/infrastructure/config'
import { checked, run } from '../../src/infrastructure/process'

test('view preferences serialize changes, preserve other settings and survive native CLI launches', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atelier-view-'))
  const original = process.env.XDG_CONFIG_HOME

  await flushPreferences()
  process.env.XDG_CONFIG_HOME = directory

  try {
    const initial = await loadSettings()

    expect(initial.view).toBe('compact')
    await saveSettings({ ...initial, theme: 'light', keymap: { j: 'down' } })
    const compact = saveViewPreference('compact')
    const minimal = saveViewPreference('minimal')

    await Promise.all([compact, minimal])
    const restored = await loadSettings()

    expect(restored.view).toBe('minimal')
    expect(restored.theme).toBe('light')
    expect(restored.keymap).toEqual({ j: 'down' })
    const settingsModule = path.resolve('src/infrastructure/config.ts')
    const probe = `const {loadSettings}=await import(${JSON.stringify(settingsModule)}); process.stdout.write((await loadSettings()).view)`
    const globalView = await checked(process.execPath, ['-e', probe], {
      cwd: directory,
      env: { XDG_CONFIG_HOME: directory },
    })

    expect(globalView).toBe('minimal')
    const before = await readFile(configPath(), 'utf8')
    const invalid = await run(process.execPath, ['src/main.ts', '--view', 'unsupported', '--demo'], {
      cwd: process.cwd(),
      env: { XDG_CONFIG_HOME: directory },
    })

    expect(invalid.code).toBe(1)
    expect(invalid.stderr).toContain('View must be full')
    expect(await readFile(configPath(), 'utf8')).toBe(before)
    expect(await checked(process.execPath, ['src/main.ts', '--help'], { cwd: process.cwd() })).toContain(
      '--view full|compact|minimal',
    )
    await writeFile(configPath(), '{"theme":"light","icons":"unicode"}\n')
    const withoutView = await loadSettings()

    expect(withoutView.view).toBe('compact')
    expect(withoutView.theme).toBe('light')
  } finally {
    await flushPreferences()

    if (original === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = original

    await rm(directory, { recursive: true, force: true })
  }
})
