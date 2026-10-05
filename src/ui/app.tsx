import { useKeyboard, useTerminalDimensions } from '@opentui/solid'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { For, Show, createMemo } from 'solid-js'

import { semanticAction } from '../domain/plan'
import { actionLabels } from '../domain/types'

import { createController } from './controller'
import { glyph, resolveIconMode, useIcons } from './icons'
import { Inspector } from './inspector'
import { PlanModal } from './plan-modal'
import { groupGutters, keyHints, minimalRowContent, planCounts, rowContent } from './presentation'
import { RichText } from './rich-text'
import { type Theme, fit } from './theme'
import { useTheme } from './theme-context'
import { type ViewMode, viewMetrics } from './view-mode'

import type { RewritePlan, Session } from '../domain/types'
import type { Adapter, NativeCommand } from '../vcs/contracts'

export type AppResult =
  | { kind: 'save'; plan: RewritePlan }
  | { kind: 'cancel' }
  | { kind: 'native'; command: NativeCommand }
  | { kind: 'jj-plan'; plan: RewritePlan; base: string }
export type AppProps = {
  plan: RewritePlan
  title: string
  mode: 'editor' | 'history' | 'demo'
  adapter?: Adapter
  session?: Session
  theme?: Theme
  icons?: string
  ascii?: boolean
  keymap?: Record<string, string>
  defaultBase?: string
  view?: ViewMode
  onViewChange?: (mode: ViewMode) => Promise<void> | void
  onPlanChange?: (plan: RewritePlan) => void
  onResult: (result: AppResult) => void
}

export function App(props: AppProps) {
  const dimensions = useTerminalDimensions()
  const state = createController(props, launcher)
  const palette = useTheme()
  const inheritedIcons = useIcons()
  const theme = () => props.theme ?? palette
  const isFull = () => state.view() === 'full'
  const isMinimal = () => state.view() === 'minimal'
  const icons = () => (isMinimal() ? 'none' : resolveIconMode(props.icons ?? inheritedIcons, props.ascii))
  const hasSessionNotice = () => Boolean(props.session && props.session.state !== 'idle')
  const metrics = () => viewMetrics(state.view(), dimensions().height, hasSessionNotice())
  const width = () => Math.max(20, dimensions().width - metrics().horizontal * 2)
  const isWide = () => dimensions().width >= 120
  const rowHeight = () => (isFull() && dimensions().height >= 34 ? 2 : 1)
  const hasInspector = () => !isMinimal() && ((isFull() && isWide()) || state.inspector())
  const isSplit = () => hasInspector() && isWide()
  const showPlan = () => isMinimal() || isSplit() || !state.inspector()
  const leftWidth = () => (isSplit() ? Math.floor(width() * 0.59) : width())
  const count = () =>
    Math.max(1, Math.floor((metrics().panel - metrics().listHeader - metrics().listStatus) / rowHeight()))
  const start = () => Math.max(0, state.cursor() - count() + 1)
  const viewport = createMemo(() => state.rows().slice(start(), start() + count()))
  const totals = createMemo(() => planCounts(state.plan()))
  const gutters = createMemo(() => groupGutters(state.plan(), icons()))
  const message = () =>
    state.issues()[0]?.message ??
    (state.notice() || actionLabels[semanticAction(state.plan().vcs, state.row()?.action ?? '') ?? 'pick'])

  useKeyboard(state.handleKey)

  function hints(): [string, string][] {
    if (isMinimal())
      return [
        ['p/r/e/s/f/d', 'action'],
        ['z/Z', 'undo'],
        ['Ctrl+S', 'apply'],
        ['F2', 'view'],
        ['?', 'help'],
      ]

    if (state.inspector())
      return [
        ['↑↓', 'scroll'],
        ['PgUp/PgDn', 'page'],
        ['Tab', 'plan'],
        ['Esc', 'back'],
        ['F2', 'view'],
      ]

    if (width() < 95)
      return [
        ['↑↓', 'navigate'],
        ['Tab', 'inspect'],
        ['Ctrl+S', 'apply'],
        ['F2', 'view'],
        ['?', 'help'],
      ]

    return [
      ['↑↓', 'navigate'],
      ['Space', 'select'],
      ['←→', 'move'],
      ['Tab', 'inspect'],
      ['Ctrl+S', 'apply'],
      ['F2', 'view'],
      ['?', 'help'],
    ]
  }

  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={theme().background}
      paddingTop={metrics().top}
      paddingX={metrics().horizontal}
      alignItems="center"
      flexDirection="column"
    >
      <box width={width()} flexGrow={1} flexShrink={1} flexBasis={0} minHeight={0} flexDirection="column">
        <box
          height={metrics().header}
          flexShrink={0}
          flexDirection="row"
          justifyContent="space-between"
          border={isFull() ? ['bottom'] : []}
          borderColor={theme().line}
        >
          <box flexDirection="row" gap={2}>
            <Show when={isFull()}>
              <text fg={theme().accent}>{glyph('branch', icons())}</text>
            </Show>
            <text fg={theme().text}>
              <b>ATELIER</b>
            </text>
            <Show when={isFull()}>
              <text fg={theme().muted}>Interactive rebase</text>
            </Show>
          </box>
          <text
            fg={state.hasChanged() ? theme().warning : theme().muted}
          >{`${props.plan.vcs.toUpperCase()} · ${props.mode.toUpperCase()} · ${state.view().toUpperCase()}${state.hasChanged() ? ' · UNSAVED' : ''}`}</text>
        </box>
        <Show when={!isMinimal()}>
          <box height={metrics().title} flexShrink={0} paddingTop={isFull() ? 1 : 0}>
            <text fg={theme().muted}>{fit(props.title, width())}</text>
          </box>
        </Show>
        <Show when={isFull()}>
          <box height={2} flexShrink={0} flexDirection="row" gap={2}>
            <text fg={theme().text}>
              <b>{`${totals().commits} changes`}</b>
            </text>
            <text fg={theme().success}>{`${totals().kept} kept`}</text>
            <text fg={theme().info}>{`${totals().folded} folded`}</text>
            <text fg={theme().danger}>{`${totals().dropped} dropped`}</text>
            <Show when={state.selected().size > 0}>
              <text fg={theme().accent}>{`${state.selected().size} selected`}</text>
            </Show>
          </box>
        </Show>
        <Show when={hasSessionNotice()}>
          <text fg={theme().warning} height={2} flexShrink={0}>
            {fit(props.session?.description ?? '', width())}
          </text>
        </Show>
        <box id="main-content" flexGrow={1} flexShrink={1} flexBasis={0} minHeight={0} flexDirection="row" gap={2}>
          <Show when={showPlan()}>
            <box width={leftWidth()} minHeight={0} flexShrink={0} flexDirection="column">
              <Show when={!isMinimal()}>
                <box height={isFull() ? 2 : 1} flexShrink={0} flexDirection="row" justifyContent="space-between">
                  <text fg={theme().text}>
                    <b>{props.mode === 'history' ? 'HISTORY' : 'REWRITE PLAN'}</b>
                  </text>
                  <text
                    fg={theme().muted}
                  >{`${Math.min(state.cursor() + 1, state.rows().length)} / ${state.rows().length}`}</text>
                </box>
              </Show>
              <Show when={isFull()}>
                <text fg={theme().muted} height={1} flexShrink={0}>
                  {'            ACTION    CHANGE    SUBJECT'}
                </text>
              </Show>
              <For each={viewport()}>
                {(entry, index) => (
                  <box height={rowHeight()} flexShrink={0} flexDirection="column" backgroundColor={theme().background}>
                    <RichText
                      height={1}
                      bg={state.selected().has(entry.id) ? theme().selection : theme().background}
                      content={
                        isMinimal()
                          ? minimalRowContent(
                              state.plan(),
                              entry,
                              theme(),
                              leftWidth(),
                              entry.id === state.row()?.id,
                              state.selected().has(entry.id),
                            )
                          : rowContent(
                              state.plan(),
                              entry,
                              theme(),
                              icons(),
                              leftWidth(),
                              start() + index(),
                              entry.id === state.row()?.id,
                              state.selected().has(entry.id),
                              gutters().get(entry.id)?.primary ?? '  ',
                            )
                      }
                    />
                    <Show when={rowHeight() === 2}>
                      <text
                        height={1}
                        fg={theme().info}
                        bg={theme().background}
                      >{`      ${gutters().get(entry.id)?.spacer ?? '  '}`}</text>
                    </Show>
                  </box>
                )}
              </For>
              <Show when={state.rows().length === 0}>
                <text fg={theme().muted}>No changes in this plan.</text>
              </Show>
              <box flexGrow={1} minHeight={0} />
              <Show when={isFull()}>
                <text
                  fg={theme().muted}
                  height={1}
                  flexShrink={0}
                >{`${glyph('undo', icons())}  ${state.history().past.length} edits${state.selected().size > 0 ? ' · arrows move the selection' : ' · Space to select, g for a whole group'}`}</text>
              </Show>
            </box>
          </Show>
          <Show when={hasInspector()}>
            <Inspector
              row={state.row()}
              plan={state.plan()}
              detail={state.detail()}
              focused={state.inspector()}
              width={isSplit() ? width() - leftWidth() - 2 : width()}
              theme={theme()}
              icons={icons()}
            />
          </Show>
        </box>
        <box id="workspace-footer" height={metrics().footer} flexShrink={0} flexDirection="column">
          <box
            marginTop={isFull() ? 1 : 0}
            height={isMinimal() ? 1 : 2}
            flexShrink={0}
            border={isMinimal() ? [] : ['top']}
            borderColor={theme().line}
          >
            <text fg={state.issues().length > 0 ? theme().danger : theme().muted}>{fit(message(), width())}</text>
          </box>
          <RichText height={1} content={keyHints(hints(), theme())} />
        </box>
      </box>
      <Show when={state.overlay() !== 'none'}>
        <PlanModal
          state={state}
          app={props}
          showIcons={!isMinimal()}
          theme={theme()}
          icons={icons()}
          width={dimensions().width}
          height={dimensions().height}
        />
      </Show>
    </box>
  )
}

export function launcher(): string[] {
  const entry = process.argv[1]

  return entry && existsSync(entry) && /\.(?:tsx?|js)$/.test(entry) ? [process.execPath, entry] : [process.execPath]
}
