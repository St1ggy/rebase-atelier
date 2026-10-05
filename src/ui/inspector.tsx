import { createMemo } from 'solid-js'

import { semanticAction } from '../domain/plan'
import { actionLabels } from '../domain/types'

import { type IconMode, glyph } from './icons'
import { styledDetail } from './presentation'
import { RichText } from './rich-text'
import { type Theme, fit } from './theme'

import type { PlanRow, RewritePlan } from '../domain/types'

export function Inspector(props: {
  row?: PlanRow
  plan: RewritePlan
  detail: string
  focused: boolean
  width: number
  theme: Theme
  icons: IconMode
}) {
  const patch = createMemo(() => styledDetail(props.detail, props.theme))
  const action = () => semanticAction(props.plan.vcs, props.row?.action ?? '')

  return (
    <box
      flexGrow={1}
      minWidth={0}
      minHeight={0}
      border={['left']}
      borderColor={props.theme.line}
      paddingLeft={3}
      flexDirection="column"
    >
      <box height={2} flexShrink={0} flexDirection="row" justifyContent="space-between">
        <text
          fg={props.focused ? props.theme.accent : props.theme.muted}
        >{`${glyph('code', props.icons)}  INSPECTOR`}</text>
        <text fg={props.theme.muted}>{props.focused ? 'focused · Tab back' : 'Tab to focus'}</text>
      </box>
      <text height={2} flexShrink={0} fg={props.theme.text} wrapMode="word">
        <b>{props.row?.body || props.row?.action || 'Select a change'}</b>
      </text>
      <text height={1} flexShrink={0} fg={props.theme.muted}>
        {fit(actionLabels[action() ?? 'pick'], Math.max(1, props.width - 4))}
      </text>
      <text height={2} flexShrink={0} fg={props.theme.muted}>
        {props.row?.revision ? `${glyph('commit', props.icons)}  ${props.row.revision}` : 'Native instruction'}
      </text>
      <scrollbox id="inspector-scroll" flexGrow={1} minHeight={0} focused={props.focused} minWidth={0}>
        <RichText content={patch()} wrapMode="word" />
      </scrollbox>
    </box>
  )
}
