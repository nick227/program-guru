import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { isStorageMiss, setStorageRoot, storage, StorageError } from '../infrastructure/storage'

describe('local storage', () => {
  beforeEach(() => {
    setStorageRoot(mkdtempSync(join(tmpdir(), 'programs-app-storage-')))
  })

  it('rejects path-escape keys before touching the filesystem', async () => {
    await expect(storage().size('../secret')).rejects.toBeInstanceOf(StorageError)
    await expect(storage().read('foo/../../etc/passwd')).rejects.toMatchObject({ code: 'EINVAL_KEY' })
    expect(isStorageMiss(new StorageError('x', 'EINVAL_KEY'))).toBe(true)
  })

  it('rejects missing objects from read() as a settled promise, not a late stream error', async () => {
    await expect(storage().read('no/such/object.bin')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await storage().size('no/such/object.bin')).toBeNull()
  })

  it('reads bytes written through the provider', async () => {
    const payload = Buffer.from('hello-platform')
    await storage().write('platform/hello.txt', Readable.from(payload), payload.length)
    expect(await storage().size('platform/hello.txt')).toBe(payload.length)
    const chunks: Buffer[] = []
    for await (const c of await storage().read('platform/hello.txt')) chunks.push(c as Buffer)
    expect(Buffer.concat(chunks).equals(payload)).toBe(true)
  })

  it('treats a pre-existing file under the root as readable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'programs-app-storage-pre-'))
    setStorageRoot(root)
    mkdirSync(join(root, 'platform'), { recursive: true })
    writeFileSync(join(root, 'platform', 'seeded.bin'), Buffer.from([1, 2, 3]))
    expect(await storage().size('platform/seeded.bin')).toBe(3)
    const stream = await storage().read('platform/seeded.bin')
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(c as Buffer)
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]))
  })
})
