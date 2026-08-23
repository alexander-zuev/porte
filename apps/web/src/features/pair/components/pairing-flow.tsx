import { CheckCircleIcon, ProhibitIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { PairingOrigin } from '@porte/core/client'
import { PairForm, type PairFormProps } from '@web/features/pair/components/pair-form.tsx'
import {
  PairingAccount,
  PairingGrants,
  PairingLayout,
  PairingRequestOrigin,
  PairingRequestTime,
  PairingStatusIcon,
  type PairingTone,
} from '@web/features/pair/components/pairing-layout.tsx'
import { UP_COMMAND } from '@web/lib/product.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

/**
 * Dead ends a pairing attempt can reach.
 *
 * `unavailable` is the only one the server never reports: it comes from a
 * failed request, so it is knowledge the browser has and the contract does not.
 */
export type PairingIssue = 'expired' | 'already-decided' | 'not-yours' | 'unavailable'

/**
 * The impersonation warning, kept where the code is typed.
 *
 * A pairing code is only ever printed by your own terminal. Anyone handing you
 * one is asking you to attach their Mac to your account.
 */
const NEVER_SENT =
  'A real pairing code only ever appears in your own terminal, and expires in minutes'

/**
 * What approving actually hands over.
 *
 * Written as power the account gains over the Mac, not the reverse: the Mac
 * could always do these things, and the decision is whether anyone signed in
 * to this account may drive it remotely.
 */
const MAC_GRANTS = [
  'See your Grok sessions and the files they change',
  'Start a new session in any folder on this Mac',
  'Send prompts to a running session',
  'Stop a session that is working',
  'Approve or refuse what Grok asks to do',
] as const

/** Complete presentational states for the pairing flow. */
export type PairingFlowProps =
  | ({
      readonly view: 'code-entry'
      readonly accountLabel: string
      readonly accountImage?: string | null
    } & PairFormProps)
  | {
      readonly view: 'confirm'
      readonly accountLabel: string
      readonly accountImage?: string | null
      readonly requestedFrom: PairingOrigin
      readonly pending: boolean
      readonly onApprove: () => void
      readonly onDeny: () => void
    }
  | { readonly view: 'approved' }
  | { readonly view: 'denied' }
  | {
      readonly view: 'issue'
      readonly issue: PairingIssue
      readonly onRestart: () => void
      readonly onCancel: () => void
    }

/** Render one pairing state without routing or server effects. */
export function PairingFlow(props: PairingFlowProps) {
  if (props.view === 'confirm') return <ConfirmPairing {...props} />
  if (props.view === 'approved') return <ApprovedPairing />
  if (props.view === 'denied') return <DeniedPairing />
  if (props.view === 'issue') return <PairingIssueState {...props} />
  return <CodePairing {...props} />
}

function CodePairing(props: Extract<PairingFlowProps, { view: 'code-entry' }>) {
  return (
    <PairingLayout
      footnote={NEVER_SENT}
      title="Authorize your Mac"
      account={<PairingAccount image={props.accountImage} label={props.accountLabel} />}
    >
      <p className="text-muted-foreground">
        Enter the code shown in the terminal you are pairing. Never use a code sent by someone else.
      </p>
      <PairForm
        code={props.code}
        error={props.error}
        pending={props.pending}
        onCodeChange={props.onCodeChange}
        onSubmit={props.onSubmit}
      />
    </PairingLayout>
  )
}

function ConfirmPairing(props: Extract<PairingFlowProps, { view: 'confirm' }>) {
  return (
    <PairingLayout
      footnote="Your Grok credentials and your code never leave this Mac"
      title="Connect this Mac?"
      account={<PairingAccount image={props.accountImage} label={props.accountLabel} />}
      alert={<PairingRequestOrigin origin={props.requestedFrom} />}
      actions={
        // Side by side and equal weight: refusing is as ordinary as approving.
        <div className="flex w-full gap-3">
          <Button
            className="flex-1"
            disabled={props.pending}
            variant="outline"
            onClick={props.onDeny}
          >
            Cancel
          </Button>
          {/* Never focused on mount: a held Enter from the code form would approve. */}
          <Button className="flex-1" disabled={props.pending} onClick={props.onApprove}>
            {props.pending ? <Spinner data-icon="inline-start" /> : null}
            Connect this Mac
          </Button>
        </div>
      }
    >
      <PairingRequestTime origin={props.requestedFrom} />
      <PairingGrants grants={MAC_GRANTS} />
    </PairingLayout>
  )
}

/**
 * No action to offer.
 *
 * What happens next happens in the terminal, and the dashboard still reads
 * unpaired until the daemon connects, so a button here would lead nowhere good.
 */
/** Paired, not yet connected: nothing reaches this Mac until the daemon runs. */
function ApprovedPairing() {
  return (
    <PairingLayout
      title="Mac paired"
      icon={
        <PairingStatusIcon tone="success">
          <CheckCircleIcon aria-hidden className="size-6" />
        </PairingStatusIcon>
      }
    >
      <p className="text-muted-foreground">
        Back in your terminal, run <code>{UP_COMMAND}</code> to connect this Mac.
      </p>
    </PairingLayout>
  )
}

function DeniedPairing() {
  return (
    <PairingLayout
      title="Pairing cancelled"
      icon={
        <PairingStatusIcon tone="neutral">
          <ProhibitIcon aria-hidden className="size-6" />
        </PairingStatusIcon>
      }
    >
      <p className="text-muted-foreground">That code is dead and no Mac was connected</p>
    </PairingLayout>
  )
}

const ISSUE_CONTENT = {
  expired: {
    title: 'Code expired',
    description: 'Codes last ten minutes. Run porte pair again for a fresh one.',
    tone: 'neutral',
  },
  'already-decided': {
    title: 'Code already used',
    description: 'This code was answered once and cannot be answered again',
    tone: 'neutral',
  },
  'not-yours': {
    title: 'Code belongs to another account',
    description: 'Do not continue unless you ran porte pair yourself on this Mac',
    tone: 'warning',
  },
  unavailable: {
    title: 'Pairing is unavailable',
    description: 'Porte did not respond. No Mac was connected.',
    tone: 'destructive',
  },
} satisfies Record<PairingIssue, { title: string; description: string; tone: PairingTone }>

function PairingIssueState(props: Extract<PairingFlowProps, { view: 'issue' }>) {
  const content = ISSUE_CONTENT[props.issue]
  return (
    <PairingLayout
      title={content.title}
      icon={
        <PairingStatusIcon tone={content.tone}>
          <WarningCircleIcon aria-hidden className="size-6" />
        </PairingStatusIcon>
      }
      actions={
        <>
          <Button className="w-full" variant="outline" onClick={props.onRestart}>
            Enter a code
          </Button>
          <Button className="w-full" variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground">{content.description}</p>
    </PairingLayout>
  )
}
