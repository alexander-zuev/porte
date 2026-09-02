import {
  LATEST_CLI_VERSION,
  isCliOutdated,
  type AccountHost,
  type IsoDateTime,
} from '@porte/core/client'

/**
 * One thing that needs the person. Derived from facts the app already holds —
 * nothing is stored; a notification disappears when its fact stops being true.
 * Web Push (roadmap §8) lands on this same shape later.
 */
export type PorteNotification = {
  /** Stable per fact, so a dismissal outlives reloads and dies with the fact. */
  readonly id: string
  readonly kind: 'cli-update'
  readonly title: string
  readonly body: string
  readonly at: IsoDateTime | null
}

/** Every notification the account's current state carries. */
export function deriveNotifications(account: AccountHost | undefined): PorteNotification[] {
  if (account?.state !== 'paired') return []
  const { host } = account
  if (!isCliOutdated(host.cliVersion ?? undefined)) return []
  const running = host.cliVersion === null ? 'an older Porte' : `Porte ${host.cliVersion}`
  return [
    {
      id: `cli-update:${host.id}:${LATEST_CLI_VERSION}`,
      kind: 'cli-update',
      title: `Update Porte on ${host.name}`,
      body: `This machine runs ${running} and ${LATEST_CLI_VERSION} is out. In Grok, run "grok plugin update porte", then start a new session.`,
      at: host.lastSeenAt,
    },
  ]
}
