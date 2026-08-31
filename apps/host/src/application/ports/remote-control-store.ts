import type { DeviceCodeGrant } from '@host/application/ports/device-authorizer.ts'

/**
 * The person's sticky choices.
 *
 * `enabled`: connect on session start, or stay offline. `hook`: answer
 * `/remote-control` instantly through the prompt hook (opt-in — Grok frames a
 * hook answer as "Prompt blocked", which reads as an error), or let the skill
 * run it through the model.
 */
export type RcSettingsSnapshot = { readonly enabled: boolean; readonly hook: boolean }

/** Remembers the on/off choice across sessions. Written by the rc command. */
export interface RcSettings {
  read(): Promise<RcSettingsSnapshot>
  write(settings: RcSettingsSnapshot): Promise<void>
}

/** The live fact only the connected daemon knows. */
export type RcStateSnapshot =
  | { readonly status: 'on'; readonly url: string; readonly pid: number }
  | { readonly status: 'off' }

/**
 * Publishes the connection fact for other processes.
 *
 * Written only by the lock holder; a snapshot whose writer is dead reads as off.
 */
export interface RcState {
  read(): Promise<RcStateSnapshot>
  write(state: RcStateSnapshot): Promise<void>
}

/** A pairing that was started from Grok and is waiting for phone approval. */
export type PendingPairing = {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUriComplete: string
  /** Epoch milliseconds after which the code is dead and a new one is needed. */
  readonly expiresAtMs: number
}

/** Remembers the in-flight pairing between rc invocations. */
export interface RcPairingStore {
  read(): Promise<PendingPairing | null>
  write(pending: PendingPairing): Promise<void>
  clear(): Promise<void>
}

/**
 * Watches a grant for approval outside the rc process.
 *
 * The rc command prints the link and exits; approval lands minutes later. The
 * watcher polls in a detached process and, on approval, stores the credential
 * and enables remote control, so a daemon connects on its own.
 */
export interface PairingWatcher {
  start(grant: DeviceCodeGrant): void
}
