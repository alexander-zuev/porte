import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  KeyIcon,
  LinkIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import type { HostDescriptor } from '@porte/core'

import { PairForm, type PairFormProps } from '#/features/pair/components/pair-form.tsx'
import {
  PairingHost,
  PairingLayout,
  PairingStatusIcon,
  VerificationPhrase,
} from '#/features/pair/components/pairing-layout.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

type Confirmation = {
  readonly host: HostDescriptor
  readonly accountLabel: string
  readonly verificationPhrase: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

type PairingIssue =
  | 'confirmation-mismatch'
  | 'consumed'
  | 'account-conflict'
  | 'host-disconnected'
  | 'server-unavailable'

/** Complete presentational states for the mobile pairing flow. */
export type PairingFlowProps =
  | { readonly view: 'validating' }
  | ({ readonly view: 'confirm' } & Confirmation)
  | ({ readonly view: 'confirming' } & Confirmation)
  | {
      readonly view: 'waiting-for-desktop'
      readonly host: HostDescriptor
      readonly verificationPhrase: string
      readonly onCancel: () => void
    }
  | {
      readonly view: 'success'
      readonly host: HostDescriptor
      readonly onContinue: () => void
    }
  | { readonly view: 'expired'; readonly onEnterCode: () => void }
  | {
      readonly view: 'issue'
      readonly issue: PairingIssue
      readonly pending: boolean
      readonly onPrimary: () => void
      readonly onCancel: () => void
    }
  | ({ readonly view: 'code-entry' } & PairFormProps)

/** Render one mobile pairing state without routing or server effects. */
export function PairingFlow(props: PairingFlowProps) {
  if (props.view === 'validating') return <ValidatingPairing />
  if (props.view === 'confirm' || props.view === 'confirming') {
    return <ConfirmPairing {...props} />
  }
  if (props.view === 'waiting-for-desktop') return <WaitingPairing {...props} />
  if (props.view === 'success') return <SuccessfulPairing {...props} />
  if (props.view === 'expired') return <ExpiredPairing {...props} />
  if (props.view === 'issue') return <PairingIssueState {...props} />
  return <CodePairing {...props} />
}

function ValidatingPairing() {
  return (
    <PairingLayout>
      <PairingStatusIcon tone="info">
        <Spinner className="size-6" />
      </PairingStatusIcon>
      <h1>Checking pairing link</h1>
      <p className="text-muted-foreground">Confirming that this request is safe to use</p>
    </PairingLayout>
  )
}

function ConfirmPairing(props: Confirmation & { readonly view: 'confirm' | 'confirming' }) {
  const pending = props.view === 'confirming'
  return (
    <PairingLayout
      actions={
        <>
          <Button className="w-full" disabled={pending} onClick={props.onConfirm}>
            {pending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
            Pair Mac
          </Button>
          <Button className="w-full" disabled={pending} variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        </>
      }
    >
      <PairingStatusIcon tone="info">
        <ShieldCheckIcon aria-hidden className="size-6" />
      </PairingStatusIcon>
      <PairingHost host={props.host} />
      <p className="text-muted-foreground">Confirm that the terminal shows this phrase</p>
      <VerificationPhrase value={props.verificationPhrase} />
      <div className="flex flex-col gap-1">
        <small className="text-muted-foreground">Porte account: {props.accountLabel}</small>
        <small className="text-muted-foreground">
          Your Grok login stays on the Mac. Porte never receives it.
        </small>
      </div>
    </PairingLayout>
  )
}

function WaitingPairing(props: Extract<PairingFlowProps, { view: 'waiting-for-desktop' }>) {
  return (
    <PairingLayout
      actions={
        <Button className="w-full" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      }
    >
      <PairingStatusIcon tone="info">
        <ClockIcon aria-hidden className="size-6" />
      </PairingStatusIcon>
      <PairingHost host={props.host} />
      <VerificationPhrase value={props.verificationPhrase} />
      <p className="text-muted-foreground">Approve this account in the terminal to finish</p>
    </PairingLayout>
  )
}

function SuccessfulPairing(props: Extract<PairingFlowProps, { view: 'success' }>) {
  return (
    <PairingLayout
      actions={
        <Button className="w-full" onClick={props.onContinue}>
          Open sessions
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      }
    >
      <PairingStatusIcon tone="success">
        <CheckCircleIcon aria-hidden className="size-6" />
      </PairingStatusIcon>
      <PairingHost host={props.host} />
      <h2>Paired and connected</h2>
      <p className="text-muted-foreground">This phone can now control sessions on this Mac</p>
    </PairingLayout>
  )
}

function ExpiredPairing(props: Extract<PairingFlowProps, { view: 'expired' }>) {
  return (
    <PairingLayout
      actions={
        <Button className="w-full" variant="outline" onClick={props.onEnterCode}>
          Enter a code
        </Button>
      }
    >
      <PairingStatusIcon tone="warning">
        <WarningCircleIcon aria-hidden className="size-6" />
      </PairingStatusIcon>
      <h1>Pairing link expired</h1>
      <p className="text-muted-foreground">Run npx porte pair again, or enter a current code</p>
    </PairingLayout>
  )
}

const ISSUE_CONTENT = {
  'confirmation-mismatch': {
    title: 'Phrases do not match',
    description: 'Do not pair this Mac. Cancel this request, then run npx porte pair again.',
    action: 'Cancel pairing',
  },
  consumed: {
    title: 'Pairing link already used',
    description: 'This link cannot pair another Mac or account.',
    action: 'Open sessions',
  },
  'account-conflict': {
    title: 'Pairing belongs to another account',
    description: 'Sign in with the account that opened this pairing request.',
    action: 'Sign in again',
  },
  'host-disconnected': {
    title: 'Mac disconnected',
    description: 'Keep npx porte pair open in the terminal, then try again.',
    action: 'Try again',
  },
  'server-unavailable': {
    title: 'Pairing is unavailable',
    description: 'The pairing service did not respond. Your Mac is not paired.',
    action: 'Try again',
  },
} satisfies Record<PairingIssue, { title: string; description: string; action: string }>

function PairingIssueState(props: Extract<PairingFlowProps, { view: 'issue' }>) {
  const content = ISSUE_CONTENT[props.issue]
  return (
    <PairingLayout
      actions={
        <>
          <Button className="w-full" disabled={props.pending} onClick={props.onPrimary}>
            {props.pending ? <Spinner data-icon="inline-start" /> : null}
            {content.action}
          </Button>
          <Button
            className="w-full"
            disabled={props.pending}
            variant="ghost"
            onClick={props.onCancel}
          >
            Cancel
          </Button>
        </>
      }
    >
      <PairingStatusIcon tone="warning">
        <WarningCircleIcon aria-hidden className="size-6" />
      </PairingStatusIcon>
      <h1>{content.title}</h1>
      <p className="text-muted-foreground">{content.description}</p>
    </PairingLayout>
  )
}

function CodePairing(props: Extract<PairingFlowProps, { view: 'code-entry' }>) {
  return (
    <PairingLayout
      actions={
        <PairForm
          code={props.code}
          error={props.error}
          pending={props.pending}
          onCodeChange={props.onCodeChange}
          onSubmit={props.onSubmit}
        />
      }
    >
      <PairingStatusIcon tone="info">
        <KeyIcon aria-hidden className="size-6" />
      </PairingStatusIcon>
      <h1>Enter pairing code</h1>
      <p className="text-muted-foreground">Use the six characters shown by npx porte pair</p>
    </PairingLayout>
  )
}
