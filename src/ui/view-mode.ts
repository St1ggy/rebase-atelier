export const viewModes = ['full', 'compact', 'minimal'] as const
export type ViewMode = (typeof viewModes)[number]
export const defaultViewMode: ViewMode = 'compact'

export function resolveViewMode(value?: string): ViewMode {
  if (value === undefined) return defaultViewMode

  const matched = viewModes.find((mode) => mode === value)

  if (matched) return matched

  throw new Error('View must be full, compact or minimal')
}

export function nextViewMode(value: ViewMode): ViewMode {
  return viewModes[(viewModes.indexOf(value) + 1) % viewModes.length] ?? 'full'
}

export function viewMetrics(view: ViewMode, height: number, hasNotice: boolean) {
  const presets = {
    full: { top: 2, horizontal: 2, header: 2, title: 3, summary: 2, footer: 4, listHeader: 3, listStatus: 1 },
    compact: { top: 1, horizontal: 2, header: 1, title: 1, summary: 0, footer: 3, listHeader: 1, listStatus: 0 },
    minimal: { top: 0, horizontal: 1, header: 1, title: 0, summary: 0, footer: 2, listHeader: 0, listStatus: 0 },
  }
  const preset = presets[view]
  const notice = hasNotice ? 2 : 0
  const panel = Math.max(
    0,
    height - preset.top - preset.header - preset.title - preset.summary - preset.footer - notice,
  )

  return { ...preset, notice, panel }
}
