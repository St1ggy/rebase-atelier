import { testRender } from '@opentui/solid'
import { expect, test } from 'bun:test'

import { ConflictEditor } from '../../src/ui/conflict-editor'
import { TextEditor } from '../../src/ui/text-editor'

test('3-way choices save the intended result and undo invalidates manual confirmation', async () => {
  let result: string | undefined
  const setup = await testRender(
    () => (
      <ConflictEditor
        input={{
          path: 'file',
          base: 'old\n',
          left: 'ours\n',
          right: 'theirs\n',
          current: 'existing manual work\n',
          labels: { left: 'Current', right: 'Incoming' },
        }}
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 140, height: 35 },
  )

  try {
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain('existing manual work')
    setup.mockInput.pressKey('s', { ctrl: true })
    await setup.renderOnce()
    expect(result).toBeUndefined()
    await setup.mockInput.typeText('g2')
    setup.mockInput.pressKey('s', { ctrl: true })
    await setup.renderOnce()
    expect(result).toBe('theirs\n')
  } finally {
    setup.renderer.destroy()
  }
})

test('text editor supports paste, multiline content and reserved shortcuts', async () => {
  let result: string | undefined
  const setup = await testRender(
    () => (
      <TextEditor
        title="Message"
        text="original"
        onResult={(value) => {
          result = value
        }}
      />
    ),
    { width: 80, height: 24 },
  )

  try {
    await setup.renderOnce()
    setup.mockInput.pressKey('a', { ctrl: true })
    await setup.mockInput.pasteBracketedText('New title\n\nBody with p/r/e/s/f/d.')
    setup.mockInput.pressKey('s', { ctrl: true })
    await setup.renderOnce()
    expect(result).toContain('New title\n\nBody with p/r/e/s/f/d.')
  } finally {
    setup.renderer.destroy()
  }
})
