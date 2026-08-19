import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  LinkIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'

import { PairForm, type PairFormProps } from '#/features/pair/components/pair-form.tsx'
import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/ui/components/ui/card.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

/** Safe host details shown before a phone account claims a pairing attempt. */
export type PairingHostSummary = {
  readonly name: string
  readonly platform: string
}

/** Complete presentational states for the mobile half of pairing. */
export type PairingFlowProps =
  | { readonly view: 'validating' }
  | {
      readonly view: 'sign-in-required'
      readonly host: PairingHostSummary
      readonly onSignIn: () => void
    }
  | {
      readonly view: 'confirm'
      readonly host: PairingHostSummary
      readonly accountLabel: string
      readonly verificationPhrase: string
      readonly pending: boolean
      readonly onConfirm: () => void
      readonly onCancel: () => void
    }
  | {
      readonly view: 'waiting-for-desktop'
      readonly host: PairingHostSummary
      readonly verificationPhrase: string
      readonly onCancel: () => void
    }
  | {
      readonly view: 'success'
      readonly host: PairingHostSummary
      readonly onContinue: () => void
    }
  | {
      readonly view: 'expired'
      readonly onEnterCode: () => void
    }
  | ({ readonly view: 'code-entry' } & PairFormProps)

/** Render one mobile pairing state without owning routing or server effects. */
export function PairingFlow(props: PairingFlowProps) {
  if (props.view === 'validating') {
    return (
      <PairingLayout>
        <Spinner className="size-6" />
        <header className="flex flex-col gap-2">
          <h1>Checking pairing link</h1>
          <p className="text-muted-foreground">
            Porte is confirming that this request is valid and still available.
          </p>
        </header>
      </PairingLayout>
    )
  }

  if (props.view === 'sign-in-required') {
    return (
      <PairingLayout>
        <PairingHeader
          description="Sign in to your Porte account before this Mac can be paired."
          title="Continue on your phone"
        />
        <HostCard host={props.host} />
        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>Your Mac stays in control</AlertTitle>
          <AlertDescription>
            Porte grants remote access to this account without sharing your local Grok login.
          </AlertDescription>
        </Alert>
        <Button onClick={props.onSignIn}>Sign in to continue</Button>
      </PairingLayout>
    )
  }

  if (props.view === 'confirm') {
    return (
      <PairingLayout>
        <PairingHeader
          description="Confirm that the Mac and account below are the ones you expect."
          title="Pair this Mac"
        />
        <HostCard host={props.host} />
        <VerificationPhrase value={props.verificationPhrase} />
        <p className="text-muted-foreground">
          The terminal will ask to pair with <strong>{props.accountLabel}</strong>.
        </p>
        <div className="flex flex-col gap-3">
          <Button disabled={props.pending} onClick={props.onConfirm}>
            {props.pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <LinkIcon data-icon="inline-start" />
            )}
            Pair Mac
          </Button>
          <Button disabled={props.pending} variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
      </PairingLayout>
    )
  }

  if (props.view === 'waiting-for-desktop') {
    return (
      <PairingLayout>
        <ClockIcon className="size-6 text-status-info" />
        <PairingHeader
          description="Return to the Porte terminal and approve this account. Keep this page open."
          title="Confirm on your Mac"
        />
        <HostCard host={props.host} />
        <VerificationPhrase value={props.verificationPhrase} />
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel pairing
        </Button>
      </PairingLayout>
    )
  }

  if (props.view === 'success') {
    return (
      <PairingLayout>
        <CheckCircleIcon className="size-6 text-status-success" />
        <PairingHeader
          description="This phone can now securely control Porte sessions running on your Mac."
          title="Mac paired"
        />
        <HostCard host={props.host} />
        <Button onClick={props.onContinue}>
          Open sessions
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </PairingLayout>
    )
  }

  if (props.view === 'expired') {
    return (
      <PairingLayout>
        <WarningCircleIcon className="size-6 text-status-warning" />
        <PairingHeader
          description="Run porte pair again on your Mac, then scan the new QR code."
          title="Pairing link expired"
        />
        <Alert>
          <AlertTitle>No access was granted</AlertTitle>
          <AlertDescription>
            Pairing links expire quickly and can be used only once.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={props.onEnterCode}>
          Enter a fallback code
        </Button>
      </PairingLayout>
    )
  }

  return (
    <PairForm
      code={props.code}
      error={props.error}
      pending={props.pending}
      onCodeChange={props.onCodeChange}
      onSubmit={props.onSubmit}
    />
  )
}

function PairingLayout({ children }: { readonly children: React.ReactNode }) {
  return <section className="flex w-full flex-col gap-8">{children}</section>
}

function PairingHeader({
  title,
  description,
}: {
  readonly title: string
  readonly description: string
}) {
  return (
    <header className="flex flex-col gap-2">
      <small className="text-muted-foreground">Porte</small>
      <h1>{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </header>
  )
}

function HostCard({ host }: { readonly host: PairingHostSummary }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{host.name}</CardTitle>
        <CardDescription>{host.platform}</CardDescription>
      </CardHeader>
      <CardContent>
        <small className="text-muted-foreground">
          Local sessions and repositories remain on this machine.
        </small>
      </CardContent>
    </Card>
  )
}

function VerificationPhrase({ value }: { readonly value: string }) {
  return (
    <div className="flex flex-col gap-2">
      <small className="text-muted-foreground">Match this phrase in the terminal</small>
      <code className="w-full rounded-lg border border-border bg-muted p-4 text-center">
        {value}
      </code>
    </div>
  )
}
