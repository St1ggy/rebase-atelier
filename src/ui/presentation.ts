import { StyledText, bg, bold, fg, reverse, strikethrough } from '@opentui/core'

import { groupLinks, semanticAction } from '../domain/plan'

import { type IconMode, type IconName, glyph } from './icons'
import { type Theme, fit, safeText } from './theme'

import type { PlanRow, RewritePlan } from '../domain/types'
import type { TextChunk } from '@opentui/core'

export function planCounts(plan: RewritePlan) {
  const commits = plan.rows.filter((row) => row.kind === 'commit')
  const actions = commits.map((row) => semanticAction(plan.vcs, row.action))
  const dropped = actions.filter((action) => action === 'drop').length
  const folded = actions.filter((action) => action === 'fixup' || action === 'squash').length

  return { commits: commits.length, dropped, folded, kept: commits.length - dropped - folded }
}

export function actionColor(plan: RewritePlan, row: PlanRow, theme: Theme) {
  const action = semanticAction(plan.vcs, row.action)

  if (action === 'drop') return theme.danger

  if (action === 'fixup' || action === 'squash') return theme.info

  if (action === 'reword' || action === 'edit') return theme.warning

  return action === 'pick' ? theme.success : theme.muted
}

export type GroupGutter = { primary: string; spacer: string }

export function groupGutters(plan: RewritePlan, mode: IconMode): Map<string, GroupGutter> {
  const links = groupLinks(plan)
  const rows = plan.rows.filter((row) => !['comment', 'blank'].includes(row.kind))
  const joins = mode === 'ascii' ? { start: '+-', middle: '+-', end: '`-' } : { start: '┌─', middle: '├─', end: '└─' }
  const trunk = mode === 'ascii' ? '| ' : '│ '
  const result = new Map<string, GroupGutter>()
  let isOpen = false

  for (const row of rows) {
    const link = links.get(row.id)

    if (link === 'start') isOpen = true

    const continuation = isOpen ? trunk : '  '
    const primary = link ? joins[link] : continuation

    if (link === 'end') isOpen = false

    result.set(row.id, { primary, spacer: isOpen ? trunk : '  ' })
  }

  return result
}

export function rowContent(
  plan: RewritePlan,
  row: PlanRow,
  theme: Theme,
  mode: IconMode,
  width: number,
  index: number,
  isCurrent: boolean,
  isSelected: boolean,
  connector: string,
): StyledText {
  const action = semanticAction(plan.vcs, row.action)
  const mark = isSelected ? glyph('selected', mode) : ' '

  const icon = glyph((action ?? 'terminal') as IconName, mode)
  const subject = fit(row.body, Math.max(1, width - 32))
  const subjectText = subject.trimEnd()
  const title = action === 'drop' ? strikethrough(subjectText) : subjectText
  const styledTitle = isCurrent ? bold(title) : title
  const number = String(index + 1).padStart(2)
  const revision = fit(row.revision.slice(0, 8), 8)

  const chunks = [
    fg(isCurrent ? theme.accent : theme.muted)(fit(mark, 2)),
    fg(theme.muted)(`${number}  ${connector} `),
    fg(actionColor(plan, row, theme))(`${fit(icon, 2)} ${fit(row.action, 10)}`),
    fg(theme.muted)(`${revision}  `),
    fg(action === 'drop' ? theme.muted : theme.text)(styledTitle),
    fg(theme.text)(subject.slice(subjectText.length)),
  ]

  return paintRow(chunks, theme, isCurrent, isSelected)
}

function paintRow(chunks: TextChunk[], theme: Theme, isCurrent: boolean, isSelected: boolean): StyledText {
  if (isCurrent) {
    // Native inverse keeps the cursor band visible even without OSC palette replies.
    return new StyledText(chunks.map((chunk) => reverse(bg(theme.background)(fg(theme.text)(chunk)))))
  }

  if (isSelected) return new StyledText(chunks.map((chunk) => bg(theme.selection)(chunk)))

  return new StyledText(chunks)
}

export function minimalRowContent(
  plan: RewritePlan,
  row: PlanRow,
  theme: Theme,
  width: number,
  isCurrent: boolean,
  isSelected: boolean,
): StyledText {
  const prefix = `${isSelected ? '* ' : '  '}${fit(row.action, 10)} ${fit(row.revision.slice(0, 8), 8)}  `
  const subject = fit(row.body, Math.max(1, width - 23))
  const text = subject.trimEnd()
  const content = semanticAction(plan.vcs, row.action) === 'drop' ? strikethrough(text) : text
  const chunks = [fg(theme.text)(prefix), fg(theme.text)(content), fg(theme.text)(subject.slice(text.length))]

  return paintRow(chunks, theme, isCurrent, isSelected)
}

export function styledDetail(text: string, theme: Theme): StyledText {
  const lines = safeText(text).split('\n')

  return new StyledText(
    lines.map((line) => {
      let color = theme.text

      if (line.startsWith('diff --git') || line.startsWith('@@')) color = theme.info
      else if (
        line.startsWith('+++') ||
        line.startsWith('---') ||
        line.startsWith('index ') ||
        /^(commit |Author|Commit|Date|changeset:|user:|date:)/.test(line)
      )
        color = theme.muted
      else if (line.startsWith('+')) color = theme.success
      else if (line.startsWith('-')) color = theme.danger

      return fg(color)(`${line}\n`)
    }),
  )
}

export function keyHints(hints: [string, string][], theme: Theme): StyledText {
  return new StyledText(hints.flatMap(([key, label]) => [fg(theme.text)(bold(key)), fg(theme.muted)(` ${label}   `)]))
}
