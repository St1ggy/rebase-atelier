import { createCliRenderer } from '@opentui/core'
import { render } from '@opentui/solid'
import { createSignal } from 'solid-js'

import { flushPreferences, loadSettings } from '../infrastructure/config'

import { IconContext, resolveIconMode } from './icons'
import { observeTerminalTheme } from './terminal-theme'
import { ThemeContext, resolveTheme } from './theme-context'

import type { JSX } from 'solid-js'

export async function terminal<T>(
  component: (finish: (result: T) => void) => JSX.Element,
  cancel?: T,
): Promise<T | undefined> {
  const { promise: result, resolve: settle } = Promise.withResolvers<T | undefined>()
  const settings = await loadSettings()
  const [theme, setTheme] = createSignal(resolveTheme(settings.theme))
  const icons =
    settings.view === 'minimal' ? 'none' : resolveIconMode(process.env.ATELIER_ICONS ?? settings.icons, settings.ascii)
  let hasFinished = false
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: false,
    targetFps: 30,
    screenMode: 'alternate-screen',
    onDestroy: () => {
      if (hasFinished) {
        return
      }

      hasFinished = true
      settle(cancel)
    },
  })
  const finish = (value: T) => {
    if (hasFinished) return

    hasFinished = true
    renderer.destroy()
    settle(value)
  }
  const stopTheme = observeTerminalTheme(renderer, settings.theme, setTheme)

  try {
    await render(
      () => (
        <ThemeContext.Provider value={theme}>
          <IconContext.Provider value={icons}>{component(finish)}</IconContext.Provider>
        </ThemeContext.Provider>
      ),
      renderer,
    )

    const value = await result

    await flushPreferences()

    return value
  } finally {
    stopTheme()
    renderer.destroy()
  }
}
