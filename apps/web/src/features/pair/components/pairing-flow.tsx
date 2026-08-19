import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  KeyIcon,
  LinkIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'

import { PairForm, type PairFormProps } from '#/features/pair/components/pair-form.tsx'
import {
  PairingHost,
  PairingLayout,
  PairingStatusIcon,
  VerificationPhrase,
  type PairingHostSummary,
} from '#/features/pair/components/pairing-layout.tsx'
import { Button } from '#/ui/components/ui/button.tsx'
import { Spinner } from '#/ui/components/ui/spinner.tsx'

export type { PairingHostSummary }

/** Complete presentational states for the mobile half of pairing. */
export type PairingFlowProps =
  | { readonly view: 'validating' }
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
        <PairingStatusIcon tone="info">
          <Spinner className="size-6" />
        </PairingStatusIcon>
        <h1>Checking link</h1>
      </PairingLayout>
    )
  }

  if (props.view === 'confirm') {
    return (
      <PairingLayout
        actions={
          <>
            <Button className="w-full" disabled={props.pending} onClick={props.onConfirm}>
              {props.pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LinkIcon data-icon="inline-start" />
              )}
              Pair Mac
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
        <PairingStatusIcon tone="info">
          <ShieldCheckIcon aria-hidden className="size-6" />
        </PairingStatusIcon>
        <PairingHost host={props.host} />
        <VerificationPhrase value={props.verificationPhrase} />
        <small className="text-muted-foreground">{props.accountLabel}</small>
      </PairingLayout>
    )
  }

  if (props.view === 'waiting-for-desktop') {
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
        <p className="text-muted-foreground">Approve this account on your Mac</p>
      </PairingLayout>
    )
  }

  if (props.view === 'success') {
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
        <p className="text-status-success">Paired</p>
      </PairingLayout>
    )
  }

  if (props.view === 'expired') {
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
        <h1>Link expired</h1>
        <p className="text-muted-foreground">Run porte pair again</p>
      </PairingLayout>
    )
  }

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
      <h1>Enter code</h1>
      <p className="text-muted-foreground">From the terminal</p>
    </PairingLayout>
  )
}
