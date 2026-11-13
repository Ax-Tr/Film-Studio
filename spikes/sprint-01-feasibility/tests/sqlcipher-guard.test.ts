import { describe, expect, it, vi } from 'vitest'
import { unlockEncryptedDatabase, type SqlCipherDatabase } from '../src/sqlcipher-guard.js'

describe('SQLCipher fail-closed guard', () => {
  it('refuses to continue when the native binary does not contain SQLCipher', async () => {
    const database: SqlCipherDatabase = {
      getFirstAsync: vi.fn().mockResolvedValue(null),
      execAsync: vi.fn(),
    }

    await expect(unlockEncryptedDatabase(database, 'a'.repeat(64))).rejects.toThrow('SQLCipher is unavailable')
    expect(database.execAsync).not.toHaveBeenCalled()
  })

  it('rejects malformed or hard-coded text passwords before issuing a pragma', async () => {
    const database: SqlCipherDatabase = {
      getFirstAsync: vi.fn(),
      execAsync: vi.fn(),
    }

    await expect(unlockEncryptedDatabase(database, 'password')).rejects.toThrow('256 bits')
    expect(database.getFirstAsync).not.toHaveBeenCalled()
    expect(database.execAsync).not.toHaveBeenCalled()
  })

  it('checks the cipher before applying a validated 256-bit key', async () => {
    const calls: string[] = []
    const database: SqlCipherDatabase = {
      getFirstAsync: async <T>(sql: string): Promise<T | null> => {
        calls.push(sql)
        return { cipher_version: '4.x-spike' } as T
      },
      execAsync: vi.fn(async (sql: string) => { calls.push(sql) }),
    }

    await expect(unlockEncryptedDatabase(database, 'AB'.repeat(32))).resolves.toBe('4.x-spike')
    expect(calls).toEqual([
      'PRAGMA cipher_version',
      `PRAGMA key = "x'${'ab'.repeat(32)}'"`,
    ])
  })
})
