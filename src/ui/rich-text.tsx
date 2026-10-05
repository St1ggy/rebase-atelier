import { createEffect, createSignal } from 'solid-js'

import type { ColorInput, StyledText, TextRenderable } from '@opentui/core'

// Solid's generic `content` property coerces objects to strings. Use the Core
// setter directly so styled chunks keep their attributes and palette intents.
export function RichText(props: {
  content: StyledText
  height?: number
  fg?: ColorInput
  bg?: ColorInput
  wrapMode?: 'none' | 'word' | 'char'
}) {
  const [node, setNode] = createSignal<TextRenderable>()

  createEffect(() => {
    const view = node()

    if (view) view.content = props.content
  })

  return (
    <text
      ref={(value: TextRenderable) => {
        setNode(value)
      }}
      height={props.height}
      fg={props.fg}
      bg={props.bg}
      wrapMode={props.wrapMode ?? 'none'}
    />
  )
}
