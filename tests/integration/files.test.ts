import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { openDocument, saveDocument } from '../../src/infrastructure/files'

test('saving rejects a concurrent edit without overwriting it', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atelier-save-'))
  const file = path.join(directory, 'plan')

  try {
    await writeFile(file, 'original\r\n')
    const document = await openDocument(file)

    await writeFile(file, 'external\r\n')
    await expect(saveDocument(document, 'ours\n')).rejects.toThrow('outside Atelier')
    expect(await readFile(file, 'utf8')).toBe('external\r\n')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
