import { platformLabel, type PairedHost } from '@porte/core/client'
import { formatDateTime } from '@web/lib/format-date.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/** Identity shown on the account surface. */
export type AccountIdentity = {
  readonly name: string
  readonly email: string
}

/** Which destructive action is in flight, if any. */
export type AccountPending = 'none' | 'unpair' | 'signOut' | 'delete'

export type AccountPanelProps = {
  readonly identity: AccountIdentity
  /** Absent when the account controls no Mac. */
  readonly host?: PairedHost
  readonly pending: AccountPending
  /** Set when the last destructive action failed. */
  readonly failure?: string
  readonly deleteConfirming: boolean
  readonly onUnpair: () => void
  readonly onSignOut: () => void
  readonly onRequestDelete: () => void
  readonly onCancelDelete: () => void
  readonly onConfirmDelete: () => void
}

/** Everything the user owns: who they are, which Mac they control, how to leave. */
export function AccountPanel({
  identity,
  host,
  pending,
  failure,
  deleteConfirming,
  onUnpair,
  onSignOut,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: AccountPanelProps) {
  const busy = pending !== 'none'

  return (
    <div className="flex w-full max-w-md flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h1>Account</h1>
        <div className="flex flex-col gap-1">
          <strong>{identity.name}</strong>
          <small className="text-muted-foreground">{identity.email}</small>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Paired Mac</h2>
        {host === undefined ? (
          <p className="text-muted-foreground">No Mac is paired with this account.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <strong className="break-words">{host.name}</strong>
              {/* No status dot: this page opens no relay socket, so it cannot say. */}
              <small className="text-muted-foreground">
                {host.lastSeenAt === null ? (
                  'Never connected'
                ) : (
                  <>
                    Last seen{' '}
                    <time dateTime={host.lastSeenAt} suppressHydrationWarning>
                      {formatDateTime(host.lastSeenAt)}
                    </time>
                  </>
                )}
              </small>
              <small className="text-muted-foreground">{platformLabel(host.platform)}</small>
            </div>
            <p className="text-muted-foreground">
              Unpairing stops remote control. The Mac keeps its sessions and files.
            </p>
            <Button className="self-start" disabled={busy} variant="outline" onClick={onUnpair}>
              {pending === 'unpair' ? <Spinner data-icon="inline-start" /> : null}
              Unpair this Mac
            </Button>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2>Leave</h2>
        <Button className="self-start" disabled={busy} variant="outline" onClick={onSignOut}>
          {pending === 'signOut' ? <Spinner data-icon="inline-start" /> : null}
          Sign out
        </Button>

        {deleteConfirming ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <strong>Delete this account?</strong>
            <p className="text-muted-foreground">
              This removes your account, its pairing, and the session titles Porte stores. Your
              repositories and files are untouched. This cannot be undone.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button disabled={busy} variant="destructive" onClick={onConfirmDelete}>
                {pending === 'delete' ? <Spinner data-icon="inline-start" /> : null}
                Delete account
              </Button>
              <Button disabled={busy} variant="ghost" onClick={onCancelDelete}>
                Keep my account
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="self-start"
            disabled={busy}
            variant="destructive"
            onClick={onRequestDelete}
          >
            Delete account
          </Button>
        )}

        {failure === undefined ? null : (
          <p className="text-destructive-muted-foreground" role="alert">
            {failure}
          </p>
        )}
      </section>
    </div>
  )
}
