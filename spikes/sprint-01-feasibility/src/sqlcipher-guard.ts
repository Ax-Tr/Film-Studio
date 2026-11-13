export interface SqlCipherDatabase {
  getFirstAsync<T>(sql: string): Promise<T | null>
  execAsync(sql: string): Promise<void>
}

export interface CipherInfo {
  cipher_version: string
}

export async function assertSqlCipherAvailable(database: SqlCipherDatabase): Promise<string> {
  const result = await database.getFirstAsync<CipherInfo>('PRAGMA cipher_version')
  if (!result?.cipher_version) {
    throw new Error('SQLCipher is unavailable; refusing to open screenplay storage without encryption')
  }
  return result.cipher_version
}

export async function unlockEncryptedDatabase(database: SqlCipherDatabase, keyHex: string): Promise<string> {
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error('Database key must be exactly 256 bits encoded as hexadecimal')
  }
  const cipherVersion = await assertSqlCipherAvailable(database)
  await database.execAsync(`PRAGMA key = "x'${keyHex.toLowerCase()}'"`)
  return cipherVersion
}
