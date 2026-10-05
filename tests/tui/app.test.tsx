import { TextAttributes } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { expect, test } from 'bun:test'

import { parsePlan } from '../../src/domain/plan'
import { App, type AppResult } from '../../src/ui/app'
import { gitAdapter } from '../../src/vcs/git'

test('keyboard edits, undo, search and save operate on the actual plan', async () => {
  let result: AppResult | undefined
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick aaaa Alpha\npick bbbb Beta\n', 'git')}
        title="fixture"
        mode="editor"
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 120, height: 30 },
  )

  try {
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain('ATELIER')
    setup.mockInput.pressArrow('down')
    await setup.mockInput.typeText('f')
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain('fixup')
    await setup.mockInput.typeText('z')
    await setup.renderOnce()
    expect(setup.captureCharFrame()).not.toContain('fixup')
    setup.mockInput.pressKey('s', { ctrl: true })
    await setup.renderOnce()
    setup.mockInput.pressEnter()
    await setup.renderOnce()
    expect(result?.kind).toBe('save')
  } finally {
    setup.renderer.destroy()
  }
})

test('inspector keyboard focus scrolls a long patch instead of moving the plan cursor', async () => {
  let result: AppResult | undefined
  const adapter = {
    ...gitAdapter('.'),
    inspect: async () => Array.from({ length: 80 }, (_, index) => `PATCH LINE ${index + 1}`).join('\n'),
  }
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick aaaa Alpha\npick bbbb Beta\n', 'git')}
        title="fixture"
        mode="editor"
        adapter={adapter}
        view="full"
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 120, height: 30 },
  )

  try {
    await setup.waitForFrame((frame) => frame.includes('PATCH LINE 1'))
    setup.mockInput.pressTab()
    setup.mockInput.pressKey('\u{1B}[6~')
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain('focused')
    expect(frame).not.toMatch(/PATCH LINE 1\b/)
    const selectedRow = setup
      .captureSpans()
      .lines.find((line) => line.spans.some((span) => (span.attributes & TextAttributes.INVERSE) !== 0))
    const selectedText = selectedRow?.spans.map((span) => span.text).join('')

    expect(selectedText).toContain('aaaa')
    expect(selectedText).toContain('Alpha')
    expect(result).toBeUndefined()
  } finally {
    setup.renderer.destroy()
  }
})

test.each([
  [80, 24],
  [120, 30],
  [160, 45],
])('renders a usable %sx%s layout', async (width, height) => {
  let result: AppResult | undefined
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick aaaa Café and 日本語\n', 'git')}
        title="fixture"
        mode="demo"
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width, height },
  )

  try {
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain('Café')
    expect(setup.captureCharFrame()).toContain('Ctrl+S')
    expect(result).toBeUndefined()
  } finally {
    setup.renderer.destroy()
  }
})
