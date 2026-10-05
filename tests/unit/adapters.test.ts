import { expect, test } from 'bun:test'

import { arcAdapter } from '../../src/vcs/arc'
import { editorCommand, shellCommand } from '../../src/vcs/client'
import { gitAdapter } from '../../src/vcs/git'
import { jujutsuAdapter } from '../../src/vcs/jujutsu'
import { mercurialAdapter } from '../../src/vcs/mercurial'

test('each VCS uses its own editor protocol and capabilities', () => {
  const editor = ['/bin/atelier']
  const arc = arcAdapter('.')
  const git = gitAdapter('.')
  const hg = mercurialAdapter('.')
  const jj = jujutsuAdapter('.')

  expect(arc.start({ base: 'trunk' }, editor).env.ARC_SEQUENCE_EDITOR).toContain('--sequence-editor')
  expect(arc.start({ base: 'trunk' }, editor).env.ARC_EDITOR).toContain('--message-editor')
  expect(git.start({ base: 'HEAD~2' }, editor).env.GIT_SEQUENCE_EDITOR).toContain('--sequence-editor')
  expect(hg.start({ base: '.' }, editor).env.HGEDITOR).toContain('--editor')
  expect(jj.capabilities.sequenceEditor).toBe(false)
  expect(() => jj.operation('continue', editor)).toThrow('not a Jujutsu')
})

test('editor quoting preserves paths and distinguishes Windows from POSIX shells', () => {
  expect(shellCommand(["a'b", '$HOME'])).toBe(String.raw`'a'\''b' '$HOME'`)
  expect(editorCommand([String.raw`C:\dir with space\atelier.exe`, 'plain'], false)).toBe(
    String.raw`"C:\dir with space\atelier.exe" "plain"`,
  )
  expect(editorCommand(['trailing\\'], false)).toBe(String.raw`"trailing\\"`)
})
