import { expect, test } from 'bun:test'

import { composeMerge, mergeBlocks, splitLines } from '../../src/domain/merge'

test('merges independent changes without dropping line endings', () => {
  const blocks = mergeBlocks({
    path: 'file',
    base: 'a\r\nb\r\nc',
    left: 'A\r\nb\r\nc',
    right: 'a\r\nb\r\nC',
    current: '',
    labels: { left: 'L', right: 'R' },
  })

  expect(composeMerge(blocks, new Map())).toBe('A\r\nb\r\nC')
})

test('structured conflicts support all resolutions and preserve empty files', () => {
  const blocks = mergeBlocks({
    path: 'file',
    base: 'old\n',
    left: 'ours\n',
    right: 'theirs\n',
    current: '',
    labels: { left: 'L', right: 'R' },
  })
  const id = blocks.find((block) => block.stable === undefined)?.id ?? -1

  expect(composeMerge(blocks, new Map([[id, 'left']]))).toBe('ours\n')
  expect(composeMerge(blocks, new Map([[id, 'right']]))).toBe('theirs\n')
  expect(composeMerge(blocks, new Map([[id, 'both']]))).toBe('ours\ntheirs\n')
  expect(splitLines('')).toEqual([])
})

test('binary content is not fed to the text merge engine', () => {
  expect(() =>
    mergeBlocks({ path: 'binary', base: '', left: '\0', right: '', current: '', labels: { left: 'L', right: 'R' } }),
  ).toThrow('Binary')
})
