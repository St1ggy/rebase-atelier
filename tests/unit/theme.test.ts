import { CliRenderEvents, type TerminalColors, type ThemeMode, parseColor } from '@opentui/core'
import { expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'

import { observeTerminalTheme } from '../../src/ui/terminal-theme'
import { type Theme, contrastRatio, terminalTheme } from '../../src/ui/theme'

function palette(background: string, foreground: string): TerminalColors {
  return {
    palette: ['#1a1b26', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5', '#565f89'],
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

test('terminal theme preserves native default and ANSI palette intents', () => {
  const theme = terminalTheme(palette('#1a1b26', '#c0caf5'))

  expect(parseColor(theme.background).intent).toBe('default')
  expect(parseColor(theme.text).intent).toBe('default')
  expect(parseColor(theme.background).toInts().slice(0, 3)).toEqual([26, 27, 38])
  expect(parseColor(theme.accent).intent).toBe('indexed')
  expect(parseColor(theme.accent).slot).toBe(4)
  expect(contrastRatio(theme.muted, theme.background)).toBeGreaterThanOrEqual(4.5)
})

test('light and monochrome themes use the reported terminal background rather than fixed dark colors', () => {
  const colors = palette('#faf4ed', '#575279')
  const theme = terminalTheme(colors, 'light', true)

  expect(parseColor(theme.background).toInts().slice(0, 3)).toEqual([250, 244, 237])
  expect(parseColor(theme.danger).intent).toBe('default')
  expect(contrastRatio(theme.muted, theme.background)).toBeGreaterThanOrEqual(4.5)
  expect(parseColor(theme.selection).r).toBeGreaterThan(0.8)
})

// oxlint-disable-next-line unicorn/prefer-event-target -- Follow the real OpenTUI renderer's EventEmitter protocol.
class PaletteSource extends EventEmitter {
  themeMode: ThemeMode | null = 'dark'
  colors = palette('#1a1b26', '#c0caf5')
  clearPaletteCache() {
    /*
    No cache in this deterministic terminal source.
    */
  }

  async getPalette() {
    return this.colors
  }
}

test('palette observer reacts to scheme events and detaches on cleanup', async () => {
  const renderer = new PaletteSource()
  let current: Theme = terminalTheme()
  const stop = observeTerminalTheme(renderer, 'terminal', (theme) => {
    current = theme
  })

  await Promise.resolve()
  await Promise.resolve()
  renderer.colors = palette('#faf4ed', '#575279')
  renderer.themeMode = 'light'
  renderer.emit(CliRenderEvents.PALETTE, renderer.colors)
  expect(parseColor(current.background).toInts().slice(0, 3)).toEqual([250, 244, 237])
  stop()
  renderer.emit(CliRenderEvents.PALETTE, palette('#000000', '#ffffff'))
  expect(parseColor(current.background).toInts().slice(0, 3)).toEqual([250, 244, 237])
  expect(renderer.listenerCount(CliRenderEvents.PALETTE)).toBe(0)
  expect(renderer.listenerCount(CliRenderEvents.FOCUS)).toBe(0)
})
