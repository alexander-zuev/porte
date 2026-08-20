import type { HostId, HostPlatform, UserId } from '@porte/core'

/**
 * The Mac one account controls.
 *
 * Comes into being at approval, which is the only moment both halves are known:
 * the grant proves which person owns the Mac, and the request that asked for the
 * code says what the Mac is called. A daemon connecting later refreshes both.
 */
/** The aggregate flattened to data. What a repository stores and restores from. */
export type HostSnapshot = {
  readonly id: HostId
  readonly userId: UserId
  readonly name: string
  readonly platform: HostPlatform
  readonly revokedAt: Date | null
  readonly lastSeenAt: Date | null
}

export class Host {
  private constructor(private state: HostSnapshot) {}

  /** Rebuild from storage. The repository owns this; nothing else should call it. */
  static restore(snapshot: HostSnapshot): Host {
    return new Host(snapshot)
  }

  /**
   * The account takes ownership of a Mac, at the moment it approves the grant.
   *
   * `lastSeenAt` is null because nothing has been seen yet. The daemon may
   * connect a second later or never, and only its announcement can say.
   */
  static register(input: {
    id: HostId
    userId: UserId
    name: string
    platform: HostPlatform
  }): Host {
    return new Host({
      id: input.id,
      userId: input.userId,
      name: input.name,
      platform: input.platform,
      revokedAt: null,
      lastSeenAt: null,
    })
  }

  get id(): HostId {
    return this.state.id
  }

  get userId(): UserId {
    return this.state.userId
  }

  get isRevoked(): boolean {
    return this.state.revokedAt !== null
  }

  /** Flatten for persistence. The repository owns this; nothing else should call it. */
  toPlainObject(): HostSnapshot {
    return this.state
  }

  /**
   * Record that the relay held this Mac at a moment.
   *
   * Written when a daemon arrives and again when it goes, because those are the
   * two moments anyone observed it. Between them the Mac is reachable and the
   * relay says so, which is why nothing writes while a socket is open.
   */
  markSeen(at: Date): void {
    this.state = { ...this.state, lastSeenAt: at }
  }

  /** Release the Mac. Repeating this keeps the original moment. */
  revoke(at: Date): void {
    if (this.isRevoked) return

    this.state = { ...this.state, revokedAt: at }
  }
}
