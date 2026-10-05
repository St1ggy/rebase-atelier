import { BoxRenderable, ScrollBoxRenderable } from '@opentui/core'
import { testRender } from '@opentui/solid'
import { expect, test } from 'bun:test'
import { createSignal } from 'solid-js'

import { parsePlan } from '../../src/domain/plan'
import { App, type AppResult } from '../../src/ui/app'

import type { Session } from '../../src/domain/types'

test('footer stays at the window bottom while content and inspector expand and resize', async () => {
  let result: AppResult | undefined
  const [session, setSession] = createSignal<Session>()
  const setup = await testRender(
    () => (
      <App
        plan={parsePlan('pick aaaa Alpha\npick bbbb Beta\n', 'git')}
        title="fixture"
        mode="editor"
        session={session()}
        view="full"
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 140, height: 70 },
  )

  try {
    for (const [width, height] of [
      [140, 70],
      [80, 24],
      [240, 50],
    ] as const) {
      setup.resize(width, height)
      await setup.renderOnce()
      const footer = setup.renderer.root.findDescendantById('workspace-footer')
      const content = setup.renderer.root.findDescendantById('main-content')

      expect(footer).toBeInstanceOf(BoxRenderable)
      expect(content).toBeInstanceOf(BoxRenderable)

      if (!(footer instanceof BoxRenderable) || !(content instanceof BoxRenderable))
        throw new Error('Missing layout boxes')

      expect(footer.y + footer.height).toBe(height)
      expect(content.height).toBe(height - 13)
      expect(content.width).toBe(width - 4)
      expect(setup.captureCharFrame().split('\n')[height - 1]).toContain('Ctrl+S')

      if (width >= 120) {
        const inspector = setup.renderer.root.findDescendantById('inspector-scroll')

        expect(inspector).toBeInstanceOf(ScrollBoxRenderable)

        if (!(inspector instanceof ScrollBoxRenderable)) throw new Error('Missing inspector')

        expect(inspector.height).toBe(content.height - 7)
      }
    }

    setSession({ state: 'conflicted', description: 'Resolve conflicts', operations: ['resolve'], files: ['file.txt'] })
    await setup.renderOnce()
    const content = setup.renderer.root.findDescendantById('main-content')

    if (!(content instanceof BoxRenderable)) throw new Error('Missing content')

    expect(content.height).toBe(35)
    expect(setup.captureCharFrame().split('\n', 50)[49]).toContain('Ctrl+S')
    expect(result).toBeUndefined()
  } finally {
    setup.renderer.destroy()
  }
})
