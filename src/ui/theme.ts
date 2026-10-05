import { type ColorInput, RGBA, type TerminalColors, type ThemeMode, parseColor } from '@opentui/core'
import stringWidth from 'string-width'

export type Theme = {
  background: ColorInput
  surface: ColorInput
  selection: ColorInput
  text: ColorInput
  muted: ColorInput
  accent: ColorInput
  warning: ColorInput
  danger: ColorInput
  line: ColorInput
  success: ColorInput
  info: ColorInput
}
export const dark: Theme = {
  background: '#111619',
  surface: '#192126',
  selection: '#243C38',
  text: '#E3E9E5',
  muted: '#84948F',
  accent: '#96DCC0',
  warning: '#DEB778',
  danger: '#EA938E',
  line: '#34433F',
  success: '#96DCC0',
  info: '#9FBFDF',
}
export const light: Theme = {
  background: '#F2F1EA',
  surface: '#E5E7DE',
  selection: '#CCDCD0',
  text: '#273A33',
  muted: '#64766C',
  accent: '#226B50',
  warning: '#8B6227',
  danger: '#A33F3F',
  line: '#BFCAC0',
  success: '#226B50',
  info: '#325F91',
}

export function safeText(text: string): string {
  return [...text]
    .filter((character) => {
      const point = character.codePointAt(0) ?? 0

      return point === 9 || point === 10 || (point >= 32 && (point < 127 || point > 159))
    })
    .join('')
}

export const monochrome: Theme = {
  background: '#161616',
  surface: '#202020',
  selection: '#3B3B3B',
  text: '#DADADA',
  muted: '#A0A0A0',
  accent: '#FFFFFF',
  warning: '#D0D0D0',
  danger: '#FFFFFF',
  line: '#555555',
  success: '#FFFFFF',
  info: '#DADADA',
}

export function mixColors(background: ColorInput, foreground: ColorInput, amount: number): RGBA {
  const base = parseColor(background)
  const tint = parseColor(foreground)

  return RGBA.fromValues(
    base.r + (tint.r - base.r) * amount,
    base.g + (tint.g - base.g) * amount,
    base.b + (tint.b - base.b) * amount,
  )
}

function luminance(color: ColorInput): number {
  const rgb = parseColor(color)
  const linear = [rgb.r, rgb.g, rgb.b].map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )

  return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722
}

export function contrastRatio(left: ColorInput, right: ColorInput): number {
  const a = luminance(left)
  const b = luminance(right)

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function readable(color: ColorInput, background: ColorInput, foreground: ColorInput): ColorInput {
  for (let step = 0; step <= 10; step++) {
    const candidate = mixColors(color, foreground, step / 10)

    if (contrastRatio(candidate, background) >= 4.5) return step === 0 ? color : candidate
  }

  return foreground
}

export function terminalTheme(colors?: TerminalColors, mode?: ThemeMode | null, isMonochrome = false): Theme {
  const fallback = mode === 'light' ? light : dark
  const foreground = colors?.defaultForeground ?? fallback.text
  const background = colors?.defaultBackground ?? fallback.background
  const hasDefaults = Boolean(colors?.defaultForeground && colors.defaultBackground)
  const indexed = (index: number) => RGBA.fromIndex(index, colors?.palette[index] ?? undefined)
  const role = (index: number) => {
    if (isMonochrome) return RGBA.defaultForeground(foreground)

    const color = indexed(index)

    return hasDefaults ? readable(color, background, foreground) : color
  }
  const muted = readable(mixColors(background, foreground, 0.6), background, foreground)

  return {
    background: RGBA.defaultBackground(background),
    text: RGBA.defaultForeground(foreground),
    surface: hasDefaults ? mixColors(background, foreground, 0.045) : RGBA.defaultBackground(background),
    selection: hasDefaults ? mixColors(background, foreground, 0.22) : RGBA.fromIndex(8),
    muted: hasDefaults ? muted : RGBA.defaultForeground(foreground),
    line: hasDefaults ? mixColors(background, foreground, 0.22) : indexed(8),
    accent: role(4),
    success: role(2),
    info: role(6),
    warning: role(3),
    danger: role(1),
  }
}

export function fit(text: string, width: number): string {
  const clean = safeText(text).replaceAll('\n', ' ')

  if (stringWidth(clean) <= width) return clean.padEnd(clean.length + width - stringWidth(clean))

  let result = ''

  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean)

  for (const part of segments) {
    if (stringWidth(result + part.segment) >= width) break

    result += part.segment
  }

  return `${result}…`
}
