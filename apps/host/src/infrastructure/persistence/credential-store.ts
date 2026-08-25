import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  CredentialStoreError,
  type CredentialStore,
  type StoredCredential,
} from '@host/application/ports/credential-store.ts'
import { z } from 'zod'

const StoredCredentialSchema = z.object({
  // Matches the config schema: a local Worker is a legitimate origin to pair with.
  baseUrl: z.url({ protocol: /^https?$/ }),
  token: z.string().min(1),
})

/** Owner read and write only. This file is a bearer credential. */
const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700
const FILE_NAME = 'credentials.json'

/**
 * The Porte credential as a file under the user's home directory.
 *
 * A file this process cannot parse is treated as absent rather than fatal, so a
 * corrupted credential sends the person to `porte pair` instead of to a stack
 * trace. Unreadable for any other reason still fails loudly.
 */
export class FileCredentialStore implements CredentialStore {
  private readonly filePath: string

  constructor(dataDirectory: string) {
    this.filePath = join(dataDirectory, FILE_NAME)
  }

  async read(): Promise<StoredCredential | null> {
    let contents: string
    try {
      contents = await readFile(this.filePath, 'utf8')
    } catch (cause) {
      if (isMissing(cause)) return null
      throw new CredentialStoreError({ cause })
    }

    return parseCredential(contents)
  }

  async write(credential: StoredCredential): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true, mode: DIRECTORY_MODE })
      await writeFile(this.filePath, JSON.stringify(credential, null, 2), {
        encoding: 'utf8',
        mode: FILE_MODE,
      })
    } catch (cause) {
      throw new CredentialStoreError({ cause })
    }
  }

  async clear(): Promise<void> {
    try {
      await rm(this.filePath, { force: true })
    } catch (cause) {
      throw new CredentialStoreError({ cause })
    }
  }
}

function isMissing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'
}

/** Unparseable and invalid both mean "no usable credential", so both give null. */
function parseCredential(contents: string): StoredCredential | null {
  try {
    const parsed = StoredCredentialSchema.safeParse(JSON.parse(contents))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
