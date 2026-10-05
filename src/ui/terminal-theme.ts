import { CliRenderEvents } from '@opentui/core'

import { resolveTheme } from './theme-context'

import type { Theme } from './theme'
import type { CliRenderer, TerminalColors } from '@opentui/core'

type PaletteListener = ((colors: TerminalColors) => void) | (() => void)
export type PaletteRenderer = Pick<CliRenderer, 'getPalette' | 'clearPaletteCache' | 'themeMode'> & {
  on: (event: string, listener: PaletteListener) => unknown
  off: (event: string, listener: PaletteListener) => unknown
}

export function observeTerminalTheme(
  renderer: PaletteRenderer,
  name: string,
  publish: (theme: Theme) => void,
): () => void {
  let isAlive = true
  let isRefreshing = false
  let hasQueuedRefresh = false
  let colors: TerminalColors | undefined
  const apply = () => {
    if (isAlive) publish(resolveTheme(name, colors, renderer.themeMode))
  }
  const palette = (value: TerminalColors) => {
    colors = value
    apply()
  }

  async function refresh() {
    if (!isAlive) return

    if (isRefreshing) {
      hasQueuedRefresh = true

      return
    }

    isRefreshing = true

    try {
      renderer.clearPaletteCache()
      palette(await renderer.getPalette({ size: 16, timeout: 200 }))
    } catch {
      apply()
    } finally {
      isRefreshing = false

      if (hasQueuedRefresh && isAlive) {
        hasQueuedRefresh = false
        void refresh()
      }
    }
  }

  const changed = () => {
    colors = undefined
    apply()
    void refresh()
  }
  const focus = () => {
    void refresh()
  }

  apply()

  if (name === 'terminal') {
    renderer.on(CliRenderEvents.PALETTE, palette)
    renderer.on(CliRenderEvents.THEME_MODE, changed)
    renderer.on(CliRenderEvents.FOCUS, focus)
    void refresh()
  }

  // Same-mode palette edits need not emit a light/dark notification.
  const poll =
    name === 'terminal'
      ? setInterval(() => {
          if (colors?.defaultBackground && colors.defaultForeground) void refresh()
        }, 5000)
      : undefined

  poll?.unref()

  return () => {
    isAlive = false

    if (poll) clearInterval(poll)

    renderer.off(CliRenderEvents.PALETTE, palette)
    renderer.off(CliRenderEvents.THEME_MODE, changed)
    renderer.off(CliRenderEvents.FOCUS, focus)
  }
}
