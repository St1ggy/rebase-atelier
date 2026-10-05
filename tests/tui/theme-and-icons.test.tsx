import { TextRenderable } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { expect, test } from 'bun:test'
import { createSignal } from 'solid-js'

import { parsePlan } from '../../src/domain/plan'
import { App, type AppResult } from '../../src/ui/app'
import { glyph } from '../../src/ui/icons'
import { terminalTheme } from '../../src/ui/theme'
import { ThemeContext, useTheme } from '../../src/ui/theme-context'

import type { TerminalColors } from '@opentui/core'

function terminalColors(background: string, foreground: string): TerminalColors {
  return {
    palette: ['#1a1b26', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7'],
    defaultForeground: foreground,
    defaultBackground: background,
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  }
}

function PaletteProbe() {
  const theme = useTheme()

  return (
    <text id="palette-probe" fg={theme.text}>
      Terminal palette
    </text>
  )
}

test('retained theme references update native renderables when the palette changes', async () => {
  const [theme, setTheme] = createSignal(terminalTheme(terminalColors('#1a1b26', '#c0caf5')))
  const setup = await testRender(
    () => (
      <ThemeContext.Provider value={theme}>
        <PaletteProbe />
      </ThemeContext.Provider>
    ),
    { width: 80, height: 24 },
  )

  try {
    await setup.renderOnce()
    const node = setup.renderer.root.getRenderable('palette-probe')

    expect(node).toBeInstanceOf(TextRenderable)

    if (!(node instanceof TextRenderable)) throw new Error('Missing text renderable')

    expect(node.fg.toInts().slice(0, 3)).toEqual([192, 202, 245])
    setTheme(terminalTheme(terminalColors('#faf4ed', '#575279'), 'light'))
    await setup.renderOnce()
    expect(node.fg.toInts().slice(0, 3)).toEqual([87, 82, 121])
    expect(node.fg.intent).toBe('default')
  } finally {
    setup.renderer.destroy()
  }
})

test('Nerd glyphs and plain fallback remain aligned and demo patches follow selection', async () => {
  let result: AppResult | undefined
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick a4c92e1 Add authentication\npick 74f081a Improve error messages\n', 'git')}
        title="fixture"
        mode="demo"
        icons="nerd"
        view="full"
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 140, height: 42 },
  )

  try {
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain(glyph('commit', 'nerd'))
    expect(setup.captureCharFrame()).toContain('4 files changed')
    expect(setup.captureCharFrame()).toContain('src/session-store.ts')
    setup.mockInput.pressArrow('down')
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain('Your session has expired')
    expect(frame).not.toContain('validateSignature')
    expect(frame).not.toContain('[object Object]')
    expect(glyph('commit', 'ascii')).toBe('*')
    expect(glyph('pick', 'unicode')).toBe('✓')
    expect(result).toBeUndefined()
  } finally {
    setup.renderer.destroy()
  }
})
