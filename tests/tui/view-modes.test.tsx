import { BoxRenderable, TextAttributes } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { expect, test } from 'bun:test'

import { parsePlan, serializePlan } from '../../src/domain/plan'
import { App, type AppResult } from '../../src/ui/app'
import { gitAdapter } from '../../src/vcs/git'

const plan = 'pick aaaa Alpha\npick bbbb Beta\n'

test('F2 switches views without losing actions, cursor, selection or undo history', async () => {
  let result: AppResult | undefined
  const changes: string[] = []
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan(plan, 'git')}
        title="fixture"
        mode="editor"
        icons="nerd"
        view="full"
        onViewChange={(mode) => {
          changes.push(mode)
        }}
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 140, height: 42 },
  )

  try {
    await setup.renderOnce()
    setup.mockInput.pressArrow('down')
    await setup.mockInput.typeText('f ')
    setup.mockInput.pressKey('F2')
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain('COMPACT')
    expect(setup.captureCharFrame()).not.toContain('INSPECTOR')
    setup.mockInput.pressKey('F2')
    await setup.renderOnce()
    const minimal = setup.captureCharFrame()

    expect(minimal).toContain('MINIMAL')
    expect(minimal).toContain('fixup')
    expect(minimal).not.toContain('REWRITE PLAN')
    expect(minimal).not.toMatch(/[\u{E000}-\u{F8FF}]/u)
    const current = setup
      .captureSpans()
      .lines.find((line) => line.spans.some((span) => (span.attributes & TextAttributes.INVERSE) !== 0))

    expect(current?.spans.map((span) => span.text).join('')).toContain('bbbb')
    expect(current?.spans.map((span) => span.text).join('')).toContain('*')
    await setup.mockInput.typeText('z')
    await setup.renderOnce()
    expect(setup.captureCharFrame()).not.toContain('fixup')
    await setup.mockInput.typeText('Z')
    setup.mockInput.pressKey('s', { ctrl: true })
    await setup.renderOnce()
    expect(setup.captureCharFrame()).not.toMatch(/[\u{E000}-\u{F8FF}]/u)
    setup.mockInput.pressEnter()
    await setup.renderOnce()
    expect(changes).toEqual(['compact', 'minimal'])
    expect(result?.kind).toBe('save')

    if (result?.kind === 'save') expect(serializePlan(result.plan)).toBe('pick aaaa Alpha\nfixup bbbb Beta\n')
  } finally {
    setup.renderer.destroy()
  }
})

test('Compact is the default, opens the inspector on demand and Minimal clears its keyboard focus', async () => {
  let result: AppResult | undefined
  let inspections = 0
  const adapter = {
    ...gitAdapter('.'),
    inspect: async () => {
      inspections++

      return 'A real inspector'
    },
  }
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan(plan, 'git')}
        title="fixture"
        mode="editor"
        adapter={adapter}
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 140, height: 42 },
  )

  try {
    await setup.renderOnce()
    expect(inspections).toBe(0)
    expect(setup.captureCharFrame()).toContain('COMPACT')
    setup.mockInput.pressTab()
    await setup.waitForFrame((frame) => frame.includes('A real inspector'))
    expect(inspections).toBe(1)
    setup.mockInput.pressKey('F2')
    setup.mockInput.pressArrow('down')
    setup.mockInput.pressTab()
    await setup.renderOnce()
    const frame = setup.captureCharFrame()

    expect(frame).toContain('MINIMAL')
    expect(frame).not.toContain('INSPECTOR')
    expect(frame).toContain('Minimal hides the inspector')
    const current = setup
      .captureSpans()
      .lines.find((line) => line.spans.some((span) => (span.attributes & TextAttributes.INVERSE) !== 0))

    expect(current?.spans.map((span) => span.text).join('')).toContain('bbbb')
    expect(result).toBeUndefined()
  } finally {
    setup.renderer.destroy()
  }
})

test.each(['full', 'compact', 'minimal'] as const)(
  '%s keeps its footer at the bottom after narrow resize',
  async (view) => {
    let result: AppResult | undefined
    const setup = await testRender(
      () => (
        <App
          plan={parsePlan(plan, 'git')}
          title="fixture"
          mode="editor"
          view={view}
          onResult={(value) => {
            result = value
          }}
        />
      ),
      { width: 160, height: 50 },
    )

    try {
      for (const [width, height] of [
        [160, 50],
        [80, 24],
      ] as const) {
        setup.resize(width, height)
        await setup.renderOnce()
        const footer = setup.renderer.root.findDescendantById('workspace-footer')

        if (!(footer instanceof BoxRenderable)) throw new Error('Missing footer')

        expect(footer.y + footer.height).toBe(height)
        const last = setup.captureCharFrame().split('\n')[height - 1]

        expect(last).toContain('F2')

        if (view === 'minimal') expect(setup.renderer.root.findDescendantById('inspector-scroll')).toBeUndefined()
      }
      expect(result).toBeUndefined()
    } finally {
      setup.renderer.destroy()
    }
  },
)
