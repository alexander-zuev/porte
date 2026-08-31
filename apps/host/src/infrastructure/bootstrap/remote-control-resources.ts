import { setTimeout as sleep } from 'node:timers/promises'

import type { RemoteControlDeps } from '@host/application/commands/remote-control.ts'
import { createPairingResources } from '@host/infrastructure/bootstrap/pairing-resources.ts'
import type { HostConfig } from '@host/infrastructure/config/host-config.ts'
import { describeThisMachine } from '@host/infrastructure/node/machine.ts'
import { DetachedPairingWatcher } from '@host/infrastructure/node/pairing-watcher.ts'
import { FileMachineLock } from '@host/infrastructure/persistence/machine-lock.ts'
import {
  FileRcPairingStore,
  FileRcSettings,
  FileRcState,
} from '@host/infrastructure/persistence/remote-control-store.ts'

/** How long an rc toggle waits for a daemon to confirm the connection. */
const CONFIRM_TIMEOUT_MS = 10_000

/** Wire the remote-control verbs to the real stores, server, and clock. */
export function createRemoteControlDeps(config: HostConfig): RemoteControlDeps {
  const pairing = createPairingResources(config)
  return {
    authorizer: pairing.authorizer,
    credentials: pairing.credentials,
    settings: new FileRcSettings(config.dataDirectory),
    state: new FileRcState(config.dataDirectory),
    pairing: new FileRcPairingStore(config.dataDirectory),
    watcher: new DetachedPairingWatcher(),
    baseUrl: config.baseUrl,
    host: describeThisMachine(),
    now: () => Date.now(),
    sleep: (ms) => sleep(ms),
    confirmTimeoutMs: CONFIRM_TIMEOUT_MS,
  }
}

/** The daemon's lock over this machine's relay connection. */
export function createMachineLock(config: HostConfig): FileMachineLock {
  return new FileMachineLock(config.dataDirectory)
}
