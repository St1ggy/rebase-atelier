import { randomUUID } from 'node:crypto'
import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js'

import { type History, record, redo, undo } from '../domain/history'
import { editRow, groupLinks, moveRows, parsePlan, serializePlan, setAction, validatePlan } from '../domain/plan'
import { type Action, type Operation, type RewritePlan, actionLabels } from '../domain/types'

import { demoDetails } from './demo-details'
import { safeText } from './theme'
import { type ViewMode, nextViewMode, resolveViewMode, viewModes } from './view-mode'

import type { AppProps } from './app'
import type { KeyEvent } from '@opentui/core'

export type Overlay = 'none' | 'help' | 'palette' | 'search' | 'instruction' | 'summary' | 'start' | 'quit'
export type Command = { name: string; run: () => void }

export function createController(props: AppProps, launch: () => string[]) {
  const initialPlan = untrack(() => props.plan)
  const [history, setHistory] = createSignal<History<RewritePlan>>({ past: [], present: initialPlan, future: [] })
  const [cursor, setCursor] = createSignal(0)
  const [selected, setSelected] = createSignal(new Set<string>())
  const [overlay, setOverlay] = createSignal<Overlay>('none')
  const [query, setQuery] = createSignal('')
  const [inspector, setInspector] = createSignal(false)
  const [view, setView] = createSignal(resolveViewMode(untrack(() => props.view)))
  const [detail, setDetail] = createSignal('Select a change to inspect its message and patch.')
  const [notice, setNotice] = createSignal('')
  const [base, setBase] = createSignal(untrack(() => props.defaultBase) ?? defaultBase(initialPlan))
  const [onto, setOnto] = createSignal('')
  const [optionFocus, setOptionFocus] = createSignal(0)
  const [root, setRoot] = createSignal(false)
  const [merges, setMerges] = createSignal(false)
  const [autosquash, setAutosquash] = createSignal(false)
  const [paletteIndex, setPaletteIndex] = createSignal(0)
  const [inserting, setInserting] = createSignal(false)
  const plan = () => history().present
  const isEditable = () => props.mode !== 'history' || props.plan.vcs === 'jj'
  const rows = createMemo(() => plan().rows.filter((row) => !['comment', 'blank'].includes(row.kind)))
  const row = () => rows()[cursor()]
  const activeIds = () => {
    if (selected().size > 0) return selected()

    const current = row()

    return new Set(current ? [current.id] : [])
  }
  const links = createMemo(() => groupLinks(plan()))
  const issues = createMemo(() => validatePlan(plan()))
  const hasChanged = () => serializePlan(plan()) !== serializePlan(initialPlan)
  const inspectionRevision = createMemo(() => row()?.revision)
  const needsInspector = createMemo(() => view() === 'full' || (view() === 'compact' && inspector()))
  let inspectionVersion = 0
  let inspection: AbortController | undefined

  createEffect(() => {
    const revision = inspectionRevision()

    inspection?.abort()
    inspection = new AbortController()
    inspectionVersion++

    if (!needsInspector()) {
      setDetail('Inspector hidden in this display mode.')

      return
    }

    if (!revision) {
      setDetail('Native instruction — press i to edit its arguments.')

      return
    }

    if (!props.adapter) {
      const current = row()

      setDetail(
        current && props.mode === 'demo'
          ? demoDetails(current)
          : 'No repository connected. The native plan can still be edited.',
      )

      return
    }

    const version = inspectionVersion

    setDetail('Loading change…')
    void props.adapter
      .inspect(revision, inspection.signal)
      .then((text) => {
        if (version === inspectionVersion) setDetail(safeText(text))
      })
      .catch((error: unknown) => {
        if (version === inspectionVersion) setDetail(error instanceof Error ? error.message : 'Inspection failed')
      })
  })
  createEffect(() => props.onPlanChange?.(plan()))
  onCleanup(() => {
    inspection?.abort()
    inspectionVersion++
  })

  function apply(action: Action) {
    if (!isEditable()) {
      setNotice('Ctrl+S chooses a range and opens the native plan.')

      return
    }

    if (props.adapter && !props.adapter.capabilities.actions.includes(action)) {
      setNotice('This workflow does not support that action.')

      return
    }

    setHistory((value) => record(value, setAction(value.present, activeIds(), action)))
    setNotice(actionLabels[action])
  }

  function move(direction: -1 | 1) {
    if (!isEditable()) return

    const id = row()?.id

    setHistory((value) => record(value, moveRows(value.present, activeIds(), direction)))

    if (id) setCursor(rows().findIndex((entry) => entry.id === id))
  }

  function navigate(direction: number, shouldExtend = false) {
    const previous = row()?.id
    const next = Math.max(0, Math.min(rows().length - 1, cursor() + direction))

    setCursor(next)

    if (shouldExtend)
      setSelected((value) => new Set([...value, ...(previous ? [previous] : []), ...(row() ? [row()!.id] : [])]))
  }

  function requestSave() {
    if (props.mode === 'history') {
      setOverlay('start')

      return
    }

    if (issues().length > 0) {
      setNotice(issues()[0]?.message ?? 'Invalid plan')

      return
    }

    setOverlay('summary')
  }

  function nativeOperation(operation: Operation) {
    if (!props.adapter || !props.session?.operations.includes(operation)) return

    props.onResult({ kind: 'native', command: props.adapter.operation(operation, launch()) })
  }

  function beginRewrite() {
    if (!props.adapter) return

    if (issues().length > 0) {
      setNotice(issues()[0]?.message ?? 'Invalid plan')

      return
    }

    if (props.adapter.kind === 'jj' && !merges()) {
      props.onResult({ kind: 'jj-plan', plan: plan(), base: base() })

      return
    }

    props.onResult({
      kind: 'native',
      command: props.adapter.start(
        { base: base(), onto: onto() || undefined, root: root(), merges: merges(), autosquash: autosquash() },
        launch(),
      ),
    })
  }

  function toggleSelection() {
    const id = row()?.id

    if (!id) return

    setSelected((value) => {
      const next = new Set(value)

      if (next.has(id)) next.delete(id)
      else next.add(id)

      return next
    })
  }

  function selectGroup() {
    let from = cursor()
    let to = cursor()

    if (links().has(row()?.id ?? '')) {
      while (from > 0 && links().get(rows()[from]?.id ?? '') !== 'start') from--
      to = from

      while (to + 1 < rows().length && links().get(rows()[to]?.id ?? '') !== 'end') to++
    }

    setSelected(
      new Set(
        rows()
          .slice(from, to + 1)
          .map((entry) => entry.id),
      ),
    )
  }

  function instruction(shouldInsert = false) {
    if (!isEditable() || !row()) return

    setInserting(shouldInsert)
    setQuery(shouldInsert ? '' : [row()!.action, row()!.revision, row()!.body].filter(Boolean).join(' '))
    setOverlay('instruction')
  }

  function open(overlayName: Overlay) {
    setQuery('')
    setPaletteIndex(0)
    setOverlay(overlayName)
  }

  function changeView(value: ViewMode) {
    setInspector(false)
    setView(value)
    const persisted = props.onViewChange?.(value)

    if (persisted)
      void persisted.catch((error: unknown) => {
        setNotice(`View changed; settings were not saved: ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  function toggleInspector() {
    if (view() === 'minimal') {
      setNotice('Minimal hides the inspector. F2 changes the display mode.')

      return
    }

    setInspector((value) => !value)
  }

  const bindings: Record<string, () => void> = {
    up: () => navigate(-1),
    down: () => navigate(1),
    'shift+up': () => navigate(-1, true),
    'shift+down': () => navigate(1, true),
    left: () => move(-1),
    right: () => move(1),
    home: () => setCursor(0),
    end: () => setCursor(Math.max(0, rows().length - 1)),
    pageup: () => navigate(-10),
    pagedown: () => navigate(10),
    space: toggleSelection,
    g: selectGroup,
    z: () => setHistory(undo),
    Z: () => setHistory(redo),
    'ctrl+z': () => setHistory(undo),
    p: () => apply('pick'),
    r: () => apply('reword'),
    e: () => apply('edit'),
    s: () => apply('squash'),
    f: () => apply('fixup'),
    d: () => apply('drop'),
    delete: () => apply('drop'),
    backspace: () => apply('drop'),
    'ctrl+s': requestSave,
    'ctrl+p': () => open('palette'),
    f2: () => changeView(nextViewMode(view())),
    '?': () => open('help'),
    '/': () => open('search'),
    tab: toggleInspector,
    return: toggleInspector,
    i: () => instruction(),
    a: () => instruction(true),
  }

  const commands = (): Command[] => [
    ...(['pick', 'reword', 'edit', 'squash', 'fixup', 'drop'] as Action[])
      .filter((action) => !props.adapter || props.adapter.capabilities.actions.includes(action))
      .map((action) => ({ name: `${action} — ${actionLabels[action]}`, run: () => apply(action) })),
    { name: 'Move selected changes up', run: bindings.left! },
    { name: 'Move selected changes down', run: bindings.right! },
    { name: 'Select entire fold group', run: selectGroup },
    { name: 'Undo plan edit', run: bindings.z! },
    { name: 'Redo plan edit', run: bindings.Z! },
    { name: 'Insert native instruction', run: () => instruction(true) },
    { name: 'Save / start rewrite', run: requestSave },
    ...viewModes.map((mode) => ({ name: `View: ${mode}`, run: () => changeView(mode) })),
    ...(props.session?.operations ?? [])
      .filter((operation) => operation !== 'resolve')
      .map((operation) => ({ name: `${operation} current operation`, run: () => nativeOperation(operation) })),
    ...(props.session?.files ?? []).map((file) => ({
      name: `Resolve ${file}`,
      run: () => {
        if (props.adapter) props.onResult({ kind: 'native', command: props.adapter.resolve(file, launch()) })
      },
    })),
  ]
  const filteredCommands = () =>
    commands().filter((command) => command.name.toLowerCase().includes(query().toLowerCase()))

  function escape() {
    if (overlay() !== 'none') {
      setOverlay('none')
      setQuery('')

      return
    }

    if (inspector()) {
      setInspector(false)

      return
    }

    if (selected().size > 0) {
      setSelected(new Set<string>())

      return
    }

    setOverlay('quit')
  }

  function startKey(key: KeyEvent) {
    const handlers: Record<string, () => void> = {
      tab: () => setOptionFocus((value) => (value + 1) % 2),
      'ctrl+s': beginRewrite,
      'ctrl+r': () => {
        if (props.adapter?.capabilities.root) setRoot((value) => !value)
      },
      'ctrl+m': () => {
        if (props.adapter?.capabilities.rebaseMerges) setMerges((value) => !value)
      },
      'ctrl+a': () => {
        if (props.adapter?.capabilities.autosquash) setAutosquash((value) => !value)
      },
    }

    const action = handlers[keyId(key)]

    if (action) {
      key.preventDefault()
      action()
    }
  }

  function paletteKey(key: KeyEvent) {
    const handlers: Record<string, () => void> = {
      down: () => setPaletteIndex((value) => Math.min(filteredCommands().length - 1, value + 1)),
      up: () => setPaletteIndex((value) => Math.max(0, value - 1)),
      return: () => {
        const command = filteredCommands()[paletteIndex()]

        setOverlay('none')
        setQuery('')
        command?.run()
      },
    }

    const action = handlers[key.name]

    if (action) {
      key.preventDefault()
      action()
    }
  }

  function handleKey(key: KeyEvent) {
    if (key.ctrl && key.name === 'c') {
      props.onResult({ kind: 'cancel' })

      return
    }

    if (key.name === 'escape') {
      escape()

      return
    }

    const overlays: Partial<Record<Overlay, (event: KeyEvent) => void>> = {
      quit: (event) => {
        if (event.name === 'return') props.onResult({ kind: 'cancel' })
      },
      summary: (event) => {
        if (event.name === 'return') props.onResult({ kind: 'save', plan: plan() })
      },
      start: startKey,
      palette: paletteKey,
    }

    if (overlay() !== 'none') {
      overlays[overlay()]?.(key)

      return
    }

    if (inspector() && ['up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown'].includes(key.name)) return

    const id = keyId(key)

    const action = bindings[props.keymap?.[id] ?? id]

    if (action) {
      key.preventDefault()
      action()
    }
  }

  function submitInput() {
    if (overlay() === 'search') {
      const found = rows().findIndex((entry) =>
        `${entry.revision} ${entry.body}`.toLowerCase().includes(query().toLowerCase()),
      )

      if (found === -1) {
        setNotice('No matching change')
      } else {
        setCursor(found)
      }

      setOverlay('none')

      return
    }

    if (overlay() !== 'instruction' || !row()) return

    try {
      if (inserting()) {
        const entry = parsePlan(`${query()}\n`, plan().vcs).rows[0]

        if (!entry || entry.kind !== 'instruction') throw new Error('Enter a native instruction, such as exec or break')

        const insertAt = plan().rows.findIndex((candidate) => candidate.id === row()?.id) + 1
        const next = {
          ...plan(),
          rows: [
            ...plan().rows.slice(0, insertAt),
            { ...entry, id: `insert-${randomUUID()}` },
            ...plan().rows.slice(insertAt),
          ],
        }

        setHistory((value) => record(value, next))
      } else setHistory((value) => record(value, editRow(value.present, row()!.id, query())))

      setOverlay('none')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Invalid instruction')
    }
  }

  return {
    history,
    cursor,
    selected,
    overlay,
    query,
    inspector,
    view,
    detail,
    notice,
    base,
    onto,
    optionFocus,
    root,
    merges,
    autosquash,
    paletteIndex,
    plan,
    rows,
    row,
    links,
    issues,
    hasChanged,
    filteredCommands,
    handleKey,
    submitInput,
    setQuery,
    setBase,
    setOnto,
    setPaletteIndex,
  }
}

function keyId(key: KeyEvent): string {
  if (key.ctrl) return `ctrl+${key.name}`

  if (key.sequence === 'Z') return 'Z'

  if (key.name.length === 1) return key.sequence || key.name

  return key.shift ? `shift+${key.name}` : key.name
}

function defaultBase(plan: RewritePlan): string {
  if (plan.vcs === 'arc') return 'trunk'

  if (plan.vcs === 'jj') return '@-'

  if (plan.vcs === 'hg') return plan.rows.find((row) => row.kind === 'commit')?.revision ?? '.'

  return `HEAD~${Math.max(1, Math.min(5, plan.rows.length - 1))}`
}
