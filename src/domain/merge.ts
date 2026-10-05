import { diff3Merge } from 'node-diff3'

export type ConflictInput = {
  path: string
  base: string
  left: string
  right: string
  current: string
  labels: { left: string; right: string }
  finalize?: () => Promise<void>
}
export type MergeBlock = { id: number; stable?: string; base: string; left: string; right: string }
export type MergeChoice = 'left' | 'right' | 'both' | 'base'

export function splitLines(text: string): string[] {
  if (!text) return []

  const lines = text.split('\n').map((line, index, array) => (index < array.length - 1 ? `${line}\n` : line))

  if (lines.at(-1) === '') lines.pop()

  return lines
}

export function mergeBlocks(input: ConflictInput): MergeBlock[] {
  if ([input.base, input.left, input.right, input.current].some((text) => text.includes('\0'))) {
    throw new Error('Binary conflict: use a whole-file resolution or a native merge tool')
  }

  if (Math.max(input.base.length, input.left.length, input.right.length) > 2_000_000) {
    throw new Error('This file exceeds the interactive 3-way limit (2 MB). Use a native merge tool.')
  }

  return diff3Merge(splitLines(input.left), splitLines(input.base), splitLines(input.right)).map((region, id) => ({
    id,
    stable: region.ok?.join(''),
    base: region.conflict?.o.join('') ?? '',
    left: region.conflict?.a.join('') ?? '',
    right: region.conflict?.b.join('') ?? '',
  }))
}

export function composeMerge(blocks: MergeBlock[], choices: Map<number, MergeChoice>): string {
  return blocks
    .map((block) => {
      if (block.stable !== undefined) return block.stable

      const choice = choices.get(block.id)

      if (choice === 'both') return block.left + block.right

      if (choice) return block[choice]

      return `<<<<<<< current\n${block.left}||||||| base\n${block.base}=======\n${block.right}>>>>>>> incoming\n`
    })
    .join('')
}
