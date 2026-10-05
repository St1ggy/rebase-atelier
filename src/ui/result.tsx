import { useKeyboard } from '@opentui/solid'

import { glyph, useIcons } from './icons'
import { safeText } from './theme'
import { useTheme } from './theme-context'

export function ResultScreen(props: { text: string; onResult: () => void }) {
  const dark = useTheme()
  const icons = useIcons()

  useKeyboard((key) => {
    if (key.name === 'return' || key.name === 'escape') props.onResult()
  })

  return (
    <box width="100%" height="100%" padding={2} backgroundColor={dark.background} flexDirection="column">
      <text fg={dark.accent} height={3}>
        <b>{`${glyph('pick', icons)}  ATELIER / REWRITE RESULT`}</b>
      </text>
      <scrollbox flexGrow={1} focused>
        <text fg={dark.text}>{safeText(props.text)}</text>
      </scrollbox>
      <text fg={dark.muted} height={2}>
        Enter returns to your history.
      </text>
    </box>
  )
}
