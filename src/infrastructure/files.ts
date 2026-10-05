import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import nodePath from 'node:path'

export type FileDocument = { path: string; text: string; fingerprint: string }

export function fingerprint(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex')
}

export async function openDocument(path: string): Promise<FileDocument> {
  const text = await readFile(path, 'utf8')

  return { path, text, fingerprint: fingerprint(text) }
}

export async function saveDocument(document: FileDocument, text: string): Promise<FileDocument> {
  await saveBytes(document, Buffer.from(text, 'utf8'))

  return { path: document.path, text, fingerprint: fingerprint(text) }
}

export async function saveBytes(document: { path: string; fingerprint: string }, bytes: Uint8Array): Promise<void> {
  const current = await readFile(document.path)

  if (fingerprint(current) !== document.fingerprint)
    throw new Error('File changed outside Atelier. Reload before saving.')

  const temporary = `${document.path}.atelier-${randomUUID()}`
  const metadata = await stat(document.path)
  const mode = metadata.mode

  try {
    await writeFile(temporary, bytes, { mode })
    await rename(temporary, document.path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await mkdir(nodePath.dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}`

  try {
    await writeFile(temporary, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
