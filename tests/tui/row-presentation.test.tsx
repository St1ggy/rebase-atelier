import { TextAttributes } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { expect, test } from 'bun:test'

import { parsePlan } from '../../src/domain/plan'
import { App, type AppResult } from '../../src/ui/app'
import { demoDetails } from '../../src/ui/demo-details'

test('cursor is a full-width inverse band and multi-selection has separate native backgrounds', async () => {
  let result: AppResult | undefined
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick aaaa Alpha\npick bbbb Beta\n', 'git')}
        title="fixture"
        mode="editor"
        view="full"
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 120, height: 36 },
  )

  try {
    await setup.renderOnce()
    const first = setup.captureSpans().lines.find((line) =>
      line.spans
        .map((span) => span.text)
        .join('')
        .includes('aaaa'),
    )
    const inverseWidth = first?.spans
      .filter((span) => (span.attributes & TextAttributes.INVERSE) !== 0)
      .reduce((sum, span) => sum + span.width, 0)

    expect(inverseWidth).toBe(68)
    expect(setup.captureCharFrame()).not.toContain('›')
    await setup.mockInput.typeText(' ')
    setup.mockInput.pressArrow('down')
    await setup.renderOnce()
    const lines = setup.captureSpans().lines
    const selected = lines.find((line) =>
      line.spans
        .map((span) => span.text)
        .join('')
        .includes('aaaa'),
    )
    const current = lines.find((line) =>
      line.spans
        .map((span) => span.text)
        .join('')
        .includes('bbbb'),
    )

    expect(selected?.spans.some((span) => (span.attributes & TextAttributes.INVERSE) !== 0)).toBe(false)
    expect(current?.spans.some((span) => (span.attributes & TextAttributes.INVERSE) !== 0)).toBe(true)
    expect(selected?.spans.some((span) => span.bg.intent === 'indexed')).toBe(true)
    expect(result).toBeUndefined()
  } finally {
    setup.renderer.destroy()
  }
})

test('fold tree stays in one display column through spacers and interleaved drops', async () => {
  let result: AppResult | undefined
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick aaaa A\ndrop xxxx X\nfixup bbbb B\nsquash cccc C\npick dddd D\n', 'git')}
        title="fixture"
        mode="editor"
        icons="unicode"
        view="full"
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 140, height: 42 },
  )

  try {
    await setup.renderOnce()
    const rows = setup.captureCharFrame().split('\n')
    const rootIndex = rows.findIndex((line) => line.includes('aaaa') && line.includes('pick'))
    const column = rows[rootIndex]?.indexOf('┌')

    expect(column).toBeGreaterThan(0)
    expect(rows[rootIndex + 1]?.indexOf('│')).toBe(column)
    expect(rows.find((line) => line.includes('xxxx') && line.includes('drop'))?.indexOf('│')).toBe(column)
    expect(rows.find((line) => line.includes('bbbb') && line.includes('fixup'))?.indexOf('├')).toBe(column)
    expect(rows.find((line) => line.includes('cccc') && line.includes('squash'))?.indexOf('└')).toBe(column)
    expect(result).toBeUndefined()
  } finally {
    setup.renderer.destroy()
  }
})

test('demo contains substantial complete multi-file patches with summaries', () => {
  const row = parsePlan('pick a4c92e1 Add authentication\n', 'git').rows[0]

  if (!row) throw new Error('Missing demo row')

  const detail = demoDetails(row)

  expect(detail).toContain('4 files changed')
  expect(detail).toContain('diff --git a/src/auth.ts')
  expect(detail).toContain('diff --git a/src/session-store.ts')
  expect(detail).toContain('diff --git a/src/http/auth-middleware.ts')
  expect(detail.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).length).toBeGreaterThan(
    140,
  )
})
