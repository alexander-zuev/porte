import { CheckCircleIcon, ProhibitIcon, WarningCircleIcon } from '@phosphor-icons/react'

import { PairForm, type PairFormProps } from '#/features/pair/components/pair-form.tsx'
import {
  PairingAccount,
  PairingLayout,
  PairingStatusIcon,
  type PairingTone,
} from '#/features/pair/components/pairing-layout.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

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
      readonly pending: boolean
      readonly onApprove: () => void
      readonly onDeny: () => void
    }
  | { readonly view: 'approved'; readonly onContinue: () => void }
  | { readonly view: 'denied'; readonly onDone: () => void }
  | {
      readonly view: 'issue'
      readonly issue: PairingIssue
      readonly onRestart: () => void
      readonly onCancel: () => void
    }

/** Render one pairing state without routing or server effects. */
export function PairingFlow(props: PairingFlowProps) {
  if (props.view === 'confirm') return <ConfirmPairing {...props} />
  if (props.view === 'approved') return <ApprovedPairing {...props} />
  if (props.view === 'denied') return <DeniedPairing {...props} />
  if (props.view === 'issue') return <PairingIssueState {...props} />
  return <CodePairing {...props} />
}

function CodePairing(props: Extract<PairingFlowProps, { view: 'code-entry' }>) {
  return (
    <PairingLayout footnote={NEVER_SENT} title="Authorize your Mac">
      <PairingAccount image={props.accountImage} label={props.accountLabel} />
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
      footnote="Your Grok login stays on the Mac. Porte never receives it."
      title="Connect this Mac?"
      actions={
        <>
          {/* Never focused on mount: a held Enter from the code form would approve. */}
          <Button className="w-full" disabled={props.pending} onClick={props.onApprove}>
            {props.pending ? <Spinner data-icon="inline-start" /> : null}
            Connect this Mac
          </Button>
          <Button
            className="w-full"
            disabled={props.pending}
            variant="ghost"
            onClick={props.onDeny}
          >
            Cancel
          </Button>
        </>
      }
    >
      <PairingAccount image={props.accountImage} label={props.accountLabel} />
      <p className="text-muted-foreground">
        A terminal asked to control coding sessions from your account. Only continue if you started
        this on your own Mac.
      </p>
    </PairingLayout>
  )
}

function ApprovedPairing(props: Extract<PairingFlowProps, { view: 'approved' }>) {
  return (
    <PairingLayout
      title="Mac connected"
      icon={
        <PairingStatusIcon tone="success">
          <CheckCircleIcon aria-hidden className="size-6" />
        </PairingStatusIcon>
      }
      actions={
        <Button className="w-full" onClick={props.onContinue}>
          Open sessions
        </Button>
      }
    >
      <p className="text-muted-foreground">
        Return to the terminal. It finishes connecting within a few seconds.
      </p>
    </PairingLayout>
  )
}

function DeniedPairing(props: Extract<PairingFlowProps, { view: 'denied' }>) {
  return (
    <PairingLayout
      title="Pairing cancelled"
      icon={
        <PairingStatusIcon tone="neutral">
          <ProhibitIcon aria-hidden className="size-6" />
        </PairingStatusIcon>
      }
      actions={
        <Button className="w-full" variant="outline" onClick={props.onDone}>
          Done
        </Button>
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
