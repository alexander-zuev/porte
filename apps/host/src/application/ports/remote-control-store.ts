import type { DeviceCodeGrant } from '@host/application/ports/device-authorizer.ts'

/**
 * The person's sticky choices.
 *
 * `enabled`: connect on session start, or stay offline. `hook`: answer
 * `/remote-control` instantly through the prompt hook (opt-in — Grok frames a
 * hook answer as "Prompt blocked", which reads as an error), or let the skill
 * run it through the model. `statusLine`: keep the `/rc` row in Grok's status
 * line (on until the person turns it off).
 */
export type RcSettingsSnapshot = {
  readonly enabled: boolean
  readonly hook: boolean
  readonly statusLine: boolean
}

/** A read also says which write it saw, so a daemon can tell "changed" from "same again". */
export type RcSettingsRead = RcSettingsSnapshot & { readonly generation: number }

/** Remembers the on/off choice across sessions. Written by the rc command. */
export interface RcSettings {
  read(): Promise<RcSettingsRead>
  /** Every write, same content or not, advances `generation`. */
  write(settings: RcSettingsSnapshot): Promise<void>
}

/**
 * Why the Host stopped and will not come back on its own. Each variant names
 * one fix; readers derive the text. `protocol`: the relay closed the socket
 * for malformed frames three times in a row, which is version skew.
 */
export type HostFailure =
  | { readonly type: 'unauthorized'; readonly http: 401 | 403 }
  | { readonly type: 'refused'; readonly http: number }
  | { readonly type: 'agent-start' }
  | { readonly type: 'protocol' }

/** The live fact only the connected daemon knows. */
export type RcStateSnapshot =
  | { readonly status: 'on'; readonly url: string; readonly pid: number }
  | { readonly status: 'off' }
  /** The daemon is alive and the socket is not up: a first connect, a retry, or a restart. */
  | { readonly status: 'connecting'; readonly pid: number }
  /** The daemon is alive and waiting for the person; a dead `pid` reads as off. */
  | { readonly status: 'error'; readonly pid: number; readonly failure: HostFailure }

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
