import { platformLabel, type PairedHost } from '@porte/core/client'
import type { HostConnectionStatus } from '@web/entities/host/host-connection.ts'
import { formatDateTime } from '@web/lib/format-date.ts'
import { HostStatus } from '@web/ui/components/host-status.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@web/ui/components/ui/alert-dialog.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@web/ui/components/ui/card.tsx'
import { Field, FieldLabel } from '@web/ui/components/ui/field.tsx'
import { Input } from '@web/ui/components/ui/input.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/** Identity shown on the account surface. */
export type AccountIdentity = {
  readonly name: string
  readonly email: string
}

/** Which destructive action is in flight, if any. */
export type AccountPending = 'none' | 'unpair' | 'delete'

export type AccountPanelProps = {
  readonly identity: AccountIdentity
  /** Absent when the account controls no Mac. */
  readonly host?: PairedHost
  /** Whether that Mac is reachable right now. */
  readonly connection: HostConnectionStatus
  readonly pending: AccountPending
  /** Set when the last destructive action failed. */
  readonly failure?: string
  readonly deleteConfirming: boolean
  readonly onUnpair: () => void
  readonly onRequestDelete: () => void
  readonly onCancelDelete: () => void
  readonly onConfirmDelete: () => void
}

/**
 * Who you are, which Mac you control, and how to leave.
 *
 * Signing out is not here. It lives in the menu, one tap from every page, and
 * a second way to do it would be a second thing to keep true.
 */
export function AccountPanel({
  identity,
  host,
  connection,
  pending,
  failure,
  deleteConfirming,
  onUnpair,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: AccountPanelProps) {
  const busy = pending !== 'none'

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="flex flex-col gap-2">
        <small className="text-muted-foreground">Account</small>
        <h1>Profile and Mac</h1>
      </header>

      <Profile identity={identity} />
      <PairedMac
        busy={busy}
        connection={connection}
        host={host}
        pending={pending}
        onUnpair={onUnpair}
      />
      <DangerZone
        busy={busy}
        confirming={deleteConfirming}
        failure={failure}
        pending={pending}
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
        onRequest={onRequestDelete}
      />
    </div>
  )
}

/** Read-only for now: the provider owns both of these, so neither is ours to edit. */
function Profile({ identity }: { readonly identity: AccountIdentity }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Comes from the account you signed in with.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <Input readOnly id="account-name" value={identity.name} />
        </Field>
        <Field>
          <FieldLabel htmlFor="account-email">Email</FieldLabel>
          <Input readOnly id="account-email" type="email" value={identity.email} />
        </Field>
      </CardContent>
    </Card>
  )
}

function PairedMac({
  host,
  connection,
  pending,
  busy,
  onUnpair,
}: {
  readonly host?: PairedHost
  readonly connection: HostConnectionStatus
  readonly pending: AccountPending
  readonly busy: boolean
  readonly onUnpair: () => void
}) {
  if (host === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Paired Mac</CardTitle>
          <CardDescription>No Mac is paired with this account.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paired Mac</CardTitle>
        <CardDescription>
          Unpairing stops remote control. The Mac keeps its sessions and files.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <HostStatus connection={connection} />
          <strong className="break-words">{host.name}</strong>
          <small className="text-muted-foreground">({platformLabel(host.platform)})</small>
        </span>
        <small className="text-muted-foreground">
          {host.lastSeenAt === null ? (
            'Never connected'
          ) : (
            <>
              Last seen:{' '}
              <time dateTime={host.lastSeenAt} suppressHydrationWarning>
                {formatDateTime(host.lastSeenAt)}
              </time>
            </>
          )}
        </small>
      </CardContent>
      <CardFooter className="justify-end border-t">
        <Button disabled={busy} variant="outline" onClick={onUnpair}>
          {pending === 'unpair' ? <Spinner data-icon="inline-start" /> : null}
          Unpair this Mac
        </Button>
      </CardFooter>
    </Card>
  )
}

/**
 * The one action that cannot be taken back.
 *
 * Behind a dialog rather than an inline confirm: it takes over the screen, so
 * the choice is made on its own rather than beside the thing being deleted.
 */
function DangerZone({
  confirming,
  pending,
  busy,
  failure,
  onRequest,
  onCancel,
  onConfirm,
}: {
  readonly confirming: boolean
  readonly pending: AccountPending
  readonly busy: boolean
  readonly failure?: string
  readonly onRequest: () => void
  readonly onCancel: () => void
  readonly onConfirm: () => void
}) {
  return (
    <Card className="border-destructive-muted">
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
        <CardDescription>
          Deleting removes your account, its pairing, and the conversation titles Porte stores. Your
          repositories and files are untouched. This cannot be undone.
        </CardDescription>
      </CardHeader>

      {failure === undefined ? null : (
        <CardContent>
          <p className="text-destructive-muted-foreground" role="alert">
            {failure}
          </p>
        </CardContent>
      )}

      <CardFooter className="justify-end border-t">
        <AlertDialog
          open={confirming}
          onOpenChange={(open) => {
            if (!open) onCancel()
          }}
        >
          <Button disabled={busy} variant="destructive" onClick={onRequest}>
            Delete account
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this account?</AlertDialogTitle>
              <AlertDialogDescription>
                Your account, its pairing, and the conversation titles Porte stores are removed.
                Your repositories and files are untouched. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Keep my account</AlertDialogCancel>
              <AlertDialogAction disabled={busy} variant="destructive" onClick={onConfirm}>
                {pending === 'delete' ? <Spinner data-icon="inline-start" /> : null}
                Delete account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  )
}
