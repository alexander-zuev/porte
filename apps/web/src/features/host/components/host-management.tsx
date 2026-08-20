import { ArrowLeftIcon, DesktopIcon, LinkIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { HostDescriptor } from '@porte/core'

import { Logo } from '#/ui/components/logo.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/ui/components/ui/alert-dialog.tsx'
import { Badge } from '#/ui/components/ui/badge.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/ui/components/ui/card.tsx'
import { Separator } from '#/ui/components/ui/separator.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

type ManagedHost = {
  readonly host: HostDescriptor
  readonly onBack: () => void
  readonly onRepair: () => void
  readonly onRevoke: () => void
}

/** Presentational states for the single paired-host management flow. */
export type HostManagementProps =
  | (ManagedHost & { readonly state: 'online' })
  | (ManagedHost & { readonly state: 'offline'; readonly lastSeen: string })
  | (ManagedHost & { readonly state: 'credential-rejected' | 'repair-required' })
  | (ManagedHost & { readonly state: 'revoking' })
  | {
      readonly state: 'revoked'
      readonly hostName: string
      readonly onBack: () => void
      readonly onPair: () => void
    }

/** Render paired-host identity, recovery, and access controls. */
export function HostManagement(props: HostManagementProps) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <Button variant="ghost" onClick={props.onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            Conversations
          </Button>
          <Logo size="sm" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-8 md:py-12">
        <header className="flex flex-col gap-2">
          <h1>Paired Mac</h1>
          <p className="text-muted-foreground">Manage remote access to your local conversations.</p>
        </header>
        {props.state === 'revoked' ? <RevokedHost {...props} /> : <ActiveHost {...props} />}
      </main>
    </div>
  )
}

function ActiveHost(props: Exclude<HostManagementProps, { state: 'revoked' }>) {
  const status = hostStatus(props)
  const revoking = props.state === 'revoking'
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="truncate">{props.host.name}</CardTitle>
              <CardDescription>{props.host.platform}</CardDescription>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <DesktopIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <h3>{status.title}</h3>
              <p className="text-muted-foreground">{status.description}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button disabled={revoking} variant="outline" onClick={props.onRepair}>
            <LinkIcon data-icon="inline-start" />
            Pair again
          </Button>
        </CardFooter>
      </Card>
      <Separator />
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2>Revoke access</h2>
          <p className="text-muted-foreground">
            This phone will lose remote access. Conversations and files remain on the Mac.
          </p>
        </header>
        <RevokeHostAction hostName={props.host.name} pending={revoking} onRevoke={props.onRevoke} />
      </section>
    </>
  )
}

function RevokeHostAction({
  hostName,
  pending,
  onRevoke,
}: {
  readonly hostName: string
  readonly pending: boolean
  readonly onRevoke: () => void
}) {
  if (pending) {
    return (
      <Button className="w-fit" disabled variant="destructive">
        <Spinner data-icon="inline-start" />
        Revoke access
      </Button>
    )
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        Revoke access
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke access to {hostName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Porte will reject this host credential. Local conversations and files will remain on the
            Mac.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep access</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onRevoke}>
            Revoke access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RevokedHost(props: Extract<HostManagementProps, { state: 'revoked' }>) {
  return (
    <Card>
      <CardHeader>
        <WarningCircleIcon aria-hidden className="size-6 text-status-warning-muted-foreground" />
        <CardTitle>Access revoked</CardTitle>
        <CardDescription>{props.hostName} can no longer connect to this account.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Local conversations and files remain unchanged.</p>
      </CardContent>
      <CardFooter>
        <Button onClick={props.onPair}>
          <LinkIcon data-icon="inline-start" />
          Pair a Mac
        </Button>
      </CardFooter>
    </Card>
  )
}

function hostStatus(props: Exclude<HostManagementProps, { state: 'revoked' }>) {
  if (props.state === 'online') {
    return {
      label: 'Online',
      variant: 'secondary' as const,
      title: 'Ready for remote control',
      description: 'Porte is running and connected on this Mac.',
    }
  }
  if (props.state === 'offline') {
    return {
      label: 'Offline',
      variant: 'outline' as const,
      title: `Last seen ${props.lastSeen}`,
      description: 'Run `porte start` on the Mac to restore remote access.',
    }
  }
  if (props.state === 'revoking') {
    return {
      label: 'Revoking',
      variant: 'outline' as const,
      title: 'Removing remote access',
      description: 'Porte is invalidating this host credential.',
    }
  }
  return {
    label: 'Pair again',
    variant: 'destructive' as const,
    title: props.state === 'credential-rejected' ? 'Credential rejected' : 'Pairing required',
    description: 'Run `porte pair` on this Mac, then confirm the new request on this phone.',
  }
}
