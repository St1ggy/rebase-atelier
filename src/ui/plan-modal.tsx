import { For, Show, untrack } from 'solid-js'

import { semanticAction } from '../domain/plan'

import { type IconMode, glyph } from './icons'
import { planCounts } from './presentation'

import type { AppProps } from './app'
import type { createController } from './controller'
import type { Theme } from './theme'

export function PlanModal(props: {
  state: ReturnType<typeof createController>
  app: AppProps
  theme: Theme
  icons: IconMode
  width: number
  height: number
  showIcons?: boolean
}) {
  const state = untrack(() => props.state)
  const width = () => Math.min(84, props.width - 4)
  const count = () => Math.max(1, Math.min(14, props.height - 15))
  const start = () => Math.max(0, state.paletteIndex() - count() + 1)
  const heights = () => ({
    palette: count() + 10,
    search: 11,
    instruction: 13,
    summary: 18,
    start: 23,
    help: 23,
    quit: 10,
    none: 1,
  })
  const height = () => Math.min(props.height - 2, heights()[state.overlay()])
  const middle = () => Math.floor((props.height - height()) / 2)
  const titleIcon = () => {
    if (props.showIcons === false) return ''

    const icon = state.overlay() === 'palette' || state.overlay() === 'search' ? 'search' : 'terminal'

    return `${glyph(icon, props.icons)}  `
  }

  return (
    <box
      position="absolute"
      left={Math.max(1, Math.floor((props.width - width()) / 2))}
      top={Math.max(1, Math.min(5, middle()))}
      width={width()}
      height={height()}
      backgroundColor={props.theme.surface}
      border
      borderStyle="rounded"
      borderColor={props.theme.accent}
      padding={2}
      flexDirection="column"
    >
      <box height={2} flexDirection="row" justifyContent="space-between">
        <text fg={props.theme.text}>
          <b>{`${titleIcon()}${state.overlay().toUpperCase()}`}</b>
        </text>
        <text fg={props.theme.muted}>Esc close</text>
      </box>
      <Show when={['palette', 'search', 'instruction'].includes(state.overlay())}>
        <input
          focused
          backgroundColor={props.theme.background}
          focusedBackgroundColor={props.theme.background}
          textColor={props.theme.text}
          value={state.query()}
          onInput={(value) => {
            state.setQuery(value)
            state.setPaletteIndex(0)
          }}
          onSubmit={state.submitInput}
          placeholder="Search commands or changes…"
        />
        <box height={1} />
      </Show>
      <Show when={state.overlay() === 'palette'}>
        <For each={state.filteredCommands().slice(start(), start() + count())}>
          {(command, index) => (
            <box
              height={1}
              backgroundColor={index() + start() === state.paletteIndex() ? props.theme.selection : undefined}
            >
              <text
                fg={index() + start() === state.paletteIndex() ? props.theme.text : props.theme.muted}
              >{`${index() + start() === state.paletteIndex() ? '› ' : '  '}${command.name}`}</text>
            </box>
          )}
        </For>
        <Show when={state.filteredCommands().length === 0}>
          <text fg={props.theme.muted}>No matching commands.</text>
        </Show>
      </Show>
      <Show when={state.overlay() === 'summary'}>
        <text height={3} fg={props.theme.text}>
          <b>Review your plan</b>
        </text>
        <text fg={props.theme.success}>{`${planCounts(state.plan()).kept} kept changes`}</text>
        <text fg={props.theme.info}>{`${planCounts(state.plan()).folded} squash / fixup changes`}</text>
        <text fg={props.theme.danger}>{`${planCounts(state.plan()).dropped} excluded changes`}</text>
        <text
          height={3}
          fg={props.theme.muted}
        >{`${state.history().past.length} edits · ${state.rows().filter((row) => !semanticAction(state.plan().vcs, row.action)).length} native instructions`}</text>
        <text fg={props.theme.text}>Enter saves the native plan. The VCS executes it.</text>
      </Show>
      <Show when={state.overlay() === 'quit'}>
        <text fg={props.theme.text}>Enter closes without saving. Esc returns to your plan.</text>
      </Show>
      <Show when={state.overlay() === 'help'}>
        <text fg={props.theme.text}>
          {
            'p  pick       r  reword       e  edit\ns  squash     f  fixup        d  drop\n\nSpace selects · Shift+arrows extends selection\n← / → moves · g selects a complete fold group\nz / Z undo / redo · i edits · a inserts instruction\n/ searches · Tab focuses the inspector\nCtrl+P commands · Ctrl+S review and apply\n\nAction keys become ordinary text inside editors.'
          }
        </text>
      </Show>
      <Show when={state.overlay() === 'start'}>
        <text height={2} fg={props.theme.muted}>
          {props.app.plan.vcs === 'hg' ? 'First revision · included in histedit' : 'Base revision / source'}
        </text>
        <input
          focused={state.optionFocus() === 0}
          value={state.base()}
          onInput={state.setBase}
          backgroundColor={props.theme.background}
          textColor={props.theme.text}
        />
        <box height={1} />
        <text height={2} fg={props.theme.muted}>
          Onto destination · optional
        </text>
        <input
          focused={state.optionFocus() === 1}
          value={state.onto()}
          onInput={state.setOnto}
          backgroundColor={props.theme.background}
          textColor={props.theme.text}
        />
        <box height={1} />
        <text
          height={3}
          fg={props.theme.text}
        >{`${state.root() ? '[x]' : '[ ]'} Root   ${state.merges() ? '[x]' : '[ ]'} Merges   ${state.autosquash() ? '[x]' : '[ ]'} Autosquash`}</text>
        <text fg={props.theme.muted}>Ctrl+R root · Ctrl+M merges · Ctrl+A autosquash</text>
        <text fg={props.theme.accent}>Ctrl+S starts the native workflow.</text>
      </Show>
      <box flexGrow={1} />
      <text fg={props.theme.muted}>Enter confirm · Esc return</text>
    </box>
  )
}
