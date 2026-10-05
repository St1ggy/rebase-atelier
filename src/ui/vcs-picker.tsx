import { useKeyboard } from '@opentui/solid'
import { For, createSignal } from 'solid-js'

import { glyph, useIcons } from './icons'
import { useTheme } from './theme-context'

import type { VcsKind } from '../domain/types'

export function VcsPicker(props: { kinds: VcsKind[]; onResult: (kind?: VcsKind) => void }) {
  const [cursor, setCursor] = createSignal(0)
  const dark = useTheme()
  const icons = useIcons()

  useKeyboard((key) => {
    const actions: Record<string, () => void> = {
      down: () => setCursor((value) => Math.min(props.kinds.length - 1, value + 1)),
      up: () => setCursor((value) => Math.max(0, value - 1)),
      return: () => props.onResult(props.kinds[cursor()]),
      escape: () => props.onResult(),
    }

    actions[key.name]?.()
  })

  return (
    <box width="100%" height="100%" backgroundColor={dark.background} padding={4} flexDirection="column" gap={1}>
      <text fg={dark.accent}>
        <b>{`${glyph('branch', icons)}  ATELIER / CHOOSE WORKSPACE`}</b>
      </text>
      <text fg={dark.muted}>Several VCS were detected. Your selection is remembered for this repository.</text>
      <For each={props.kinds}>
        {(kind, index) => (
          <text fg={index() === cursor() ? dark.accent : dark.text}>
            {index() === cursor() ? '› ' : '  '}
            {kind.toUpperCase()}
          </text>
        )}
      </For>
      <text fg={dark.muted}>↑↓ choose · Enter open · Esc cancel</text>
    </box>
  )
}
