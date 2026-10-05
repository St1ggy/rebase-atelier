import { createContext, useContext } from 'solid-js'

import { dark, light, monochrome, terminalTheme } from './theme'

import type { Theme } from './theme'
import type { TerminalColors, ThemeMode } from '@opentui/core'
import type { Accessor } from 'solid-js'

const fallback = terminalTheme()

export const ThemeContext = createContext<Accessor<Theme>>(() => fallback)

// Palette changes remain reactive even in screens which retain one theme reference.
export function useTheme(): Theme {
  const current = useContext(ThemeContext)

  return {
    get background() {
      return current().background
    },
    get surface() {
      return current().surface
    },
    get selection() {
      return current().selection
    },
    get text() {
      return current().text
    },
    get muted() {
      return current().muted
    },
    get accent() {
      return current().accent
    },
    get warning() {
      return current().warning
    },
    get danger() {
      return current().danger
    },
    get line() {
      return current().line
    },
    get success() {
      return current().success
    },
    get info() {
      return current().info
    },
  }
}

export function resolveTheme(name: string, colors?: TerminalColors, mode?: ThemeMode | null): Theme {
  const isMonochrome = name === 'mono' || process.env.NO_COLOR !== undefined

  if (name === 'terminal') return terminalTheme(colors, mode, isMonochrome)

  if (isMonochrome) return monochrome

  return name === 'light' ? light : dark
}
