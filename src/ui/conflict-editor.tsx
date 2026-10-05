import { useKeyboard, useTerminalDimensions } from '@opentui/solid'
import { For, Show, createMemo, createSignal, untrack } from 'solid-js'

import { type History, record, redo, undo } from '../domain/history'
import { type ConflictInput, type MergeChoice, composeMerge, mergeBlocks } from '../domain/merge'

import { glyph, useIcons } from './icons'
import { fit, safeText } from './theme'
import { useTheme } from './theme-context'

import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'

type MergeState = { text: string; choices: [number, MergeChoice][]; generated: boolean }

export function ConflictEditor(props: { input: ConflictInput; onResult: (text?: string) => void }) {
  const dimensions = useTerminalDimensions()
  const dark = useTheme()
  const icons = useIcons()
  const input = untrack(() => props.input)
  const blocks = mergeBlocks(input)
  const conflicts = blocks.filter((block) => block.stable === undefined)
  const [index, setIndex] = createSignal(0)
  const [side, setSide] = createSignal(0)
  const [editing, setEditing] = createSignal(false)
  const [confirmedManual, setConfirmedManual] = createSignal(false)
  const [notice, setNotice] = createSignal(
    'Current file preserved. g prepares a fresh 3-way result; e edits the current file.',
  )
  const [history, setHistory] = createSignal<History<MergeState>>({
    past: [],
    present: { text: input.current, choices: [], generated: false },
    future: [],
  })
  let editor: TextareaRenderable | undefined
  const sourceScrolls = new Map<string, ScrollBoxRenderable>()
  const current = () => conflicts[index()]
  const unresolved = createMemo(
    () => conflicts.filter((block) => !new Map(history().present.choices).has(block.id)).length,
  )

  function choose(choice: MergeChoice) {
    if (!history().present.generated) {
      setNotice('Press g to generate a fresh result first. Your current file is preserved until you save.')

      return
    }

    if (!current()) return

    const choices = new Map([...history().present.choices, [current()!.id, choice] as [number, MergeChoice]])

    setHistory((value) =>
      record(value, { text: composeMerge(blocks, choices), choices: [...choices], generated: true }),
    )
    setConfirmedManual(false)
    setNotice(`Block ${index() + 1}: ${choice}`)
  }

  function escape() {
    if (!editing()) {
      props.onResult()

      return
    }

    setHistory((value) =>
      record(value, { ...value.present, text: editor?.plainText ?? value.present.text, generated: false }),
    )
    setEditing(false)
    setConfirmedManual(false)
    setNotice('Manual result ready. Ctrl+R confirms it resolved; Ctrl+S saves.')
  }

  function save() {
    if (editing()) {
      setNotice('Esc finishes manual editing before saving.')

      return
    }

    if (!confirmedManual() && (!history().present.generated || unresolved() > 0)) {
      setNotice('Resolve every block, or Ctrl+R explicitly confirms your manual result.')

      return
    }

    props.onResult(history().present.text)
  }

  const bindings: Record<string, () => void> = {
    'ctrl+up': () => scrollSources(-1),
    'ctrl+down': () => scrollSources(1),
    g: () => {
      setHistory((value) => record(value, { text: composeMerge(blocks, new Map()), choices: [], generated: true }))
      setConfirmedManual(false)
      setNotice('Fresh 3-way result prepared. 1 current, 2 incoming, 3 both, 4 base.')
    },
    e: () => setEditing(true),
    down: () => setIndex((value) => Math.min(conflicts.length - 1, value + 1)),
    n: () => setIndex((value) => Math.min(conflicts.length - 1, value + 1)),
    up: () => setIndex((value) => Math.max(0, value - 1)),
    p: () => setIndex((value) => Math.max(0, value - 1)),
    tab: () => setSide((value) => (value + 1) % 3),
    '1': () => choose('left'),
    '2': () => choose('right'),
    '3': () => choose('both'),
    '4': () => choose('base'),
    Z: () => {
      setHistory(redo)
      setConfirmedManual(false)
    },
    z: () => {
      setHistory(undo)
      setConfirmedManual(false)
    },
    'ctrl+r': () => {
      setConfirmedManual((value) => !value)
      setNotice('Manual resolution confirmed. Ctrl+S writes the result.')
    },
  }

  function scrollSources(amount: number) {
    for (const view of sourceScrolls.values()) {
      if (!view.isDestroyed) view.scrollBy(amount)
    }
  }

  useKeyboard((key) => {
    if (key.ctrl && key.name === 'c') {
      key.preventDefault()
      props.onResult()

      return
    }

    if (key.name === 'escape') {
      key.preventDefault()
      escape()

      return
    }

    if (key.ctrl && key.name === 's') {
      key.preventDefault()
      save()

      return
    }

    if (editing()) return

    const name = key.sequence === 'Z' ? 'Z' : key.name
    const id = key.ctrl ? `ctrl+${name}` : name
    const action = bindings[id]

    if (action) {
      key.preventDefault()
      action()
    }
  })

  const sides = () => [
    { name: props.input.labels.left, text: current()?.left ?? props.input.left },
    { name: 'BASE / common ancestor', text: current()?.base ?? props.input.base },
    { name: props.input.labels.right, text: current()?.right ?? props.input.right },
  ]

  return (
    <box width="100%" height="100%" backgroundColor={dark.background} padding={2} flexDirection="column">
      <text fg={dark.accent} height={2}>
        <b>{`${glyph('squash', icons)}  ATELIER / RESOLVE`}</b>
        <span> · {fit(props.input.path, dimensions().width - 32)}</span>
      </text>
      <text fg={dark.warning} height={2}>
        Block {Math.max(1, index() + 1)} / {conflicts.length} · {unresolved()} unresolved ·{' '}
        {confirmedManual() ? 'manual result confirmed' : 'draft'}
      </text>
      <box height="40%" flexDirection="row" gap={1}>
        <For each={sides().filter((_, sideIndex) => dimensions().width >= 120 || sideIndex === side())}>
          {(entry) => (
            <box
              flexGrow={1}
              width={dimensions().width >= 120 ? '33%' : '100%'}
              border
              borderColor={dark.line}
              padding={1}
              flexDirection="column"
            >
              <text fg={dark.accent} height={1}>
                {entry.name}
              </text>
              <scrollbox
                flexGrow={1}
                ref={(value: ScrollBoxRenderable) => {
                  sourceScrolls.set(entry.name, value)
                }}
              >
                <text fg={dark.text}>{safeText(entry.text)}</text>
              </scrollbox>
            </box>
          )}
        </For>
      </box>
      <text height={2} fg={dark.accent}>
        RESULT {editing() ? '· editing' : '· preview'}
      </text>
      <Show
        when={editing()}
        fallback={
          <scrollbox flexGrow={1} focused={!editing()}>
            <text fg={dark.text}>{safeText(history().present.text)}</text>
          </scrollbox>
        }
      >
        <textarea
          ref={(value: TextareaRenderable) => {
            editor = value
          }}
          initialValue={history().present.text}
          focused
          flexGrow={1}
          backgroundColor={dark.surface}
          textColor={dark.text}
          cursorColor={dark.accent}
        />
      </Show>
      <text fg={dark.warning} height={2}>
        {fit(notice(), dimensions().width - 6)}
      </text>
      <text fg={dark.muted}>g generate · 1/2/3/4 choose · ↑↓ blocks · Tab side · e edit · z/Z undo · Ctrl+S save</text>
    </box>
  )
}
