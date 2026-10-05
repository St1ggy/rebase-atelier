import { useKeyboard } from '@opentui/solid'
import { createSignal } from 'solid-js'

import { glyph, useIcons } from './icons'
import { safeText } from './theme'
import { useTheme } from './theme-context'

import type { TextareaRenderable } from '@opentui/core'

export function TextEditor(props: { title: string; text: string; onResult: (text?: string) => void }) {
  let editor: TextareaRenderable | undefined
  const dark = useTheme()
  const icons = useIcons()
  const [notice, setNotice] = createSignal('')

  useKeyboard((key) => {
    if ((key.ctrl && key.name === 'c') || key.name === 'escape') props.onResult()

    if (key.ctrl && key.name === 's') {
      const text = editor?.plainText ?? props.text

      if (!text.trim()) {
        setNotice('The message is empty. Enter a message or cancel.')

        return
      }

      props.onResult(text)
    }
  })

  return (
    <box width="100%" height="100%" backgroundColor={dark.background} padding={2} flexDirection="column">
      <text fg={dark.accent} height={2}>
        <b>{`${glyph('reword', icons)}  ATELIER / MESSAGE`}</b>
      </text>
      <text fg={dark.muted} height={2}>
        {safeText(props.title)}
      </text>
      <textarea
        ref={(value: TextareaRenderable) => {
          editor = value
        }}
        initialValue={props.text}
        focused
        flexGrow={1}
        backgroundColor={dark.surface}
        textColor={dark.text}
        cursorColor={dark.accent}
        wrapMode="word"
        keyBindings={[{ name: 'return', action: 'newline' }]}
      />
      <text fg={dark.warning} height={2}>
        {notice()}
      </text>
      <text fg={dark.muted}>Ctrl+S save · Esc cancel · Enter newline · Ctrl+Z undo</text>
    </box>
  )
}
