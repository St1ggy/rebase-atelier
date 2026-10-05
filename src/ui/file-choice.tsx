import { useKeyboard } from '@opentui/solid'

import { glyph, useIcons } from './icons'
import { safeText } from './theme'
import { useTheme } from './theme-context'

export type FileSide = 'left' | 'right' | 'base'

export function FileChoice(props: {
  title: string
  sizes: number[]
  labels: { left: string; right: string }
  onResult: (side?: FileSide) => void
}) {
  const dark = useTheme()
  const icons = useIcons()

  useKeyboard((key) => {
    const choices: Record<string, FileSide> = { '1': 'left', '2': 'right', '3': 'base' }
    const side = choices[key.name]

    if (side) props.onResult(side)

    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) props.onResult()
  })

  return (
    <box width="100%" height="100%" backgroundColor={dark.background} padding={4} flexDirection="column" gap={2}>
      <text fg={dark.accent}>
        <b>{`${glyph('file', icons)}  ATELIER / WHOLE-FILE RESOLUTION`}</b>
      </text>
      <text fg={dark.text}>{safeText(props.title)}</text>
      <text fg={dark.muted}>Binary, non-UTF-8 or oversized text content. Select the exact bytes to retain.</text>
      <text fg={dark.text}>
        1 {props.labels.left} · {props.sizes[1]} bytes
      </text>
      <text fg={dark.text}>
        2 {props.labels.right} · {props.sizes[2]} bytes
      </text>
      <text fg={dark.text}>3 Base · {props.sizes[0]} bytes</text>
      <text fg={dark.warning}>A selection writes that complete version. Esc cancels.</text>
    </box>
  )
}
