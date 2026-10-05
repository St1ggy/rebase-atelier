import { describe, expect, test } from 'bun:test'

import { record, redo, undo } from '../../src/domain/history'
import {
  groupLinks,
  moveRows,
  parsePlan,
  semanticAction,
  serializePlan,
  setAction,
  validatePlan,
} from '../../src/domain/plan'

describe('native plan documents', () => {
  test.each(['git', 'arc', 'hg'] as const)('preserves every byte for %s', (vcs) => {
    const text = '# explanation\r\n  pick abcd1234 Subject  with  spacing\r\n\r\ncustom anything\r\npick deadbeef End'

    expect(serializePlan(parsePlan(text, vcs))).toBe(text)
  })

  test('preserves Git merge and fixup flags, shell arguments, unknown lines', () => {
    const text =
      'label onto\nreset onto\npick abcd Subject\nfixup -C dcba Another\nexec printf "a b"\nmerge -c beef branch # Message\nupdate-ref refs/heads/topic\nfuture arbitrary payload\n'
    const plan = parsePlan(text, 'git')

    expect(serializePlan(plan)).toBe(text)
    expect(plan.rows[3]?.action).toBe('fixup -C')
    expect(semanticAction('git', 'fixup -C')).toBe('fixup')
    expect(validatePlan(plan)).toEqual([])
  })

  test('uses native Mercurial names without leaking Git commands', () => {
    const plan = parsePlan('pick abcd subject\npick dcba followup\n', 'hg')
    const folded = setAction(plan, new Set(['row-1']), 'fixup')

    expect(serializePlan(folded)).toBe('pick abcd subject\nroll dcba followup\n')
    expect(validatePlan(folded)).toEqual([])
  })

  test('moves a selected block without reversing it', () => {
    const plan = parsePlan('pick a A\npick b B\npick c C\npick d D\n', 'git')
    const moved = moveRows(plan, new Set(['row-1', 'row-2']), 1)

    expect(moved.rows.map((row) => row.revision)).toEqual(['a', 'd', 'b', 'c'])
  })

  test('retains document termination when moving its final line', () => {
    const plan = parsePlan('pick a A\npick b B', 'git')

    const moved = moveRows(plan, new Set(['row-1']), -1)

    expect(serializePlan(moved)).toBe('pick b B\npick a A')
  })

  test('does not invent a squash target across a topology reset', () => {
    const plan = parsePlan('pick a A\nlabel base\nreset base\nsquash b B\n', 'git')

    expect(validatePlan(plan).map((issue) => issue.rowId)).toEqual(['row-3'])
  })

  test('groups folds and ignores dropped changes', () => {
    const plan = parsePlan('pick a A\ndrop x X\nfixup b B\nsquash c C\npick d D\n', 'git')

    expect([...groupLinks(plan)]).toEqual([
      ['row-0', 'start'],
      ['row-2', 'middle'],
      ['row-3', 'end'],
    ])
  })

  test('undo/redo restores a transaction, and a new edit clears redo', () => {
    const initial = { past: [] as number[], present: 1, future: [] as number[] }
    const edited = record(initial, 2)

    expect(undo(edited).present).toBe(1)
    expect(redo(undo(edited)).present).toBe(2)
    expect(record(undo(edited), 3).future).toEqual([])
  })
})
