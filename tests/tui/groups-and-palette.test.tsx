import { testRender } from '@opentui/solid'
import { expect, test } from 'bun:test'

import { parsePlan, serializePlan } from '../../src/domain/plan'
import { App, type AppResult } from '../../src/ui/app'
import { gitAdapter } from '../../src/vcs/git'

test('moving a fold group includes interleaved drops and retains its fold target', async () => {
  let result: AppResult | undefined
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick aaaa A\ndrop xxxx X\nfixup bbbb B\nsquash cccc C\npick dddd D\n', 'git')}
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
    await setup.mockInput.typeText('g')
    setup.mockInput.pressArrow('right')
    setup.mockInput.pressKey('s', { ctrl: true })
    await setup.renderOnce()
    setup.mockInput.pressEnter()
    await setup.renderOnce()
    expect(result?.kind).toBe('save')

    if (result?.kind === 'save')
      expect(serializePlan(result.plan)).toBe('pick dddd D\npick aaaa A\ndrop xxxx X\nfixup bbbb B\nsquash cccc C\n')
  } finally {
    setup.renderer.destroy()
  }
})

test('palette scrolls to off-screen conflicts and activates the visible item', async () => {
  let result: AppResult | undefined
  const adapter = { ...gitAdapter('.'), inspect: async () => 'fixture inspector' }
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick aaaa A\n', 'git')}
        title="fixture"
        mode="history"
        adapter={adapter}
        session={{
          state: 'conflicted',
          description: '30 conflicts',
          operations: ['resolve'],
          files: Array.from({ length: 30 }, (_, index) => `file-${index}`),
        }}
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 120, height: 30 },
  )

  try {
    await setup.renderOnce()
    setup.mockInput.pressKey('p', { ctrl: true })
    await setup.mockInput.typeText('Resolve')

    for (let index = 0; index < 29; index++) setup.mockInput.pressArrow('down')

    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain('Resolve file-29')
    setup.mockInput.pressEnter()
    await setup.renderOnce()
    expect(result?.kind).toBe('native')

    if (result?.kind === 'native') expect(result.command.args).toContain('file-29')
  } finally {
    setup.renderer.destroy()
  }
})
