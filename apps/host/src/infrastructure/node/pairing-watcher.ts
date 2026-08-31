import { spawn } from 'node:child_process'

import type { DeviceCodeGrant } from '@host/application/ports/device-authorizer.ts'
import type { PairingWatcher } from '@host/application/ports/remote-control-store.ts'

/**
 * Watches a grant in a detached copy of this CLI.
 *
 * The rc invocation must exit at once so the hook can paint its line; the
 * child outlives it, polls until the phone answers, and dies with the grant.
 */
export class DetachedPairingWatcher implements PairingWatcher {
  start(grant: DeviceCodeGrant): void {
    const entry = process.argv[1]
    if (entry === undefined) return
    const child = spawn(process.execPath, [entry, 'rc', 'watch-pairing'], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    })
    child.stdin.end(JSON.stringify(grant))
    child.unref()
  }
}
