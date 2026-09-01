import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { VERSION } from '@host/entrypoints/cli/version.ts'
import { isVersionBefore } from '@porte/core/client'

/** Read by `statusline.sh` and by `rc`; holds the newest version while this build is behind. */
export const UPDATE_AVAILABLE_FILE = 'update-available'

/** The one line every surface prints; the fix is the plugin update, not npm. */
export function updateNoticeLine(latest: string): string {
  return `Porte ${latest} is available → run in Grok: grok plugin update porte`
}

// The relay repeats `version.latest` on every reconnect; one line per process is enough.
let printed = false

/**
 * Record what the relay said is newest. Behind: keep the marker file for the
 * status line and say so once. Current: remove the marker.
 */
export async function noteLatestCliVersion(dataDirectory: string, latest: string): Promise<void> {
  const marker = join(dataDirectory, UPDATE_AVAILABLE_FILE)
  if (!isVersionBefore(VERSION, latest)) {
    await rm(marker, { force: true })
    return
  }
  await writeFile(marker, latest)
  if (printed) return
  printed = true
  process.stderr.write(`\n${updateNoticeLine(latest)}\n`)
}
