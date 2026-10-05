import { createContext, useContext } from 'solid-js'

export type IconMode = 'nerd' | 'unicode' | 'ascii' | 'none'
export type IconName =
  | 'branch'
  | 'commit'
  | 'pick'
  | 'reword'
  | 'edit'
  | 'squash'
  | 'fixup'
  | 'drop'
  | 'file'
  | 'code'
  | 'search'
  | 'undo'
  | 'selected'
  | 'arrow'
  | 'terminal'
export const IconContext = createContext<IconMode>('nerd')
const nerd: Record<IconName, string> = {
  branch: '\u{F418}',
  commit: '\u{F417}',
  pick: '\u{F00C}',
  reword: '\u{F040}',
  edit: '\u{F04C}',
  squash: '\u{F419}',
  fixup: '\u{F0AD}',
  drop: '\u{F1F8}',
  file: '\u{F15B}',
  code: '\u{F121}',
  search: '\u{F002}',
  undo: '\u{F0E2}',
  selected: '\u{F046}',
  arrow: '\u{F054}',
  terminal: '\u{F120}',
}
const unicode: Record<IconName, string> = {
  branch: '⑂',
  commit: '●',
  pick: '✓',
  reword: '✎',
  edit: 'Ⅱ',
  squash: '⇉',
  fixup: '+',
  drop: '×',
  file: '▤',
  code: '⌘',
  search: '⌕',
  undo: '↶',
  selected: '▣',
  arrow: '›',
  terminal: '›',
}
const ascii: Record<IconName, string> = {
  branch: '|',
  commit: '*',
  pick: '+',
  reword: '~',
  edit: '=',
  squash: '&',
  fixup: '+',
  drop: 'x',
  file: '#',
  code: '#',
  search: '/',
  undo: 'z',
  selected: '*',
  arrow: '>',
  terminal: '>',
}

export function glyph(name: IconName, mode: IconMode): string {
  if (mode === 'none') return ''

  return { nerd, unicode, ascii }[mode][name]
}

export function useIcons(): IconMode {
  return useContext(IconContext)
}

export function resolveIconMode(value?: string, isAscii = false): IconMode {
  if (value === 'none') return 'none'

  if (isAscii || process.env.TERM === 'dumb') return 'ascii'

  if (value === 'ascii' || value === 'unicode') return value

  return 'nerd'
}
