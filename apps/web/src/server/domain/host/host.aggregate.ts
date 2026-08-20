import type { HostId, HostPlatform, UserId } from '@porte/core'

/**
 * The Mac one account controls.
 *
 * Pairing and registration are separate moments. The device grant proves which
 * person owns the Mac; only the daemon knows what the Mac is called and what it
 * runs. So this record comes into being when the daemon first announces itself,
 * never at approval, and it is correct from the moment it exists.
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

/** What a daemon tells us about itself when it connects. */
export type HostAnnouncement = {
  readonly name: string
  readonly platform: HostPlatform
  readonly at: Date
}

/**
 * Outcome of an announcement.
 *
 * A revoked daemon reconnecting is an ordinary event, not a fault, so it is
 * reported as data the caller must handle rather than thrown past it.
 */
export type AnnounceResult = { ok: true } | { ok: false; reason: 'revoked' }

export class Host {
  private constructor(private state: HostSnapshot) {}

  /** Rebuild from storage. The repository owns this; nothing else should call it. */
  static restore(snapshot: HostSnapshot): Host {
    return new Host(snapshot)
  }

  /** First contact from a daemon whose owner has approved the device grant. */
  static register(input: {
    id: HostId
    userId: UserId
    name: string
    platform: HostPlatform
    at: Date
  }): Host {
    return new Host({
      id: input.id,
      userId: input.userId,
      name: input.name,
      platform: input.platform,
      revokedAt: null,
      lastSeenAt: input.at,
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
   * Refresh identity and liveness from a reconnecting daemon.
   *
   * Refuses a revoked host, so unpairing cannot be undone by reconnecting.
   * Name and platform are re-read every time, which is what makes a rename or
   * an OS upgrade need no separate code path.
   */
  announce(announcement: HostAnnouncement): AnnounceResult {
    if (this.isRevoked) return { ok: false, reason: 'revoked' }

    this.state = {
      ...this.state,
      name: announcement.name,
      platform: announcement.platform,
      lastSeenAt: announcement.at,
    }
    return { ok: true }
  }

  /** Release the Mac. Repeating this keeps the original moment. */
  revoke(at: Date): void {
    if (this.isRevoked) return

    this.state = { ...this.state, revokedAt: at }
  }
}
