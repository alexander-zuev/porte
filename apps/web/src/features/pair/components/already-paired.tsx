import { LaptopIcon } from '@phosphor-icons/react'
import type { PairedHost } from '@porte/core/client'
import { Link } from '@tanstack/react-router'
import type { HostConnectionStatus } from '@web/entities/host/host-connection.ts'
import { PairedMachineSummary } from '@web/features/host/components/paired-machine-summary.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Spinner } from '@web/ui/components/ui/spinner.tsx'

export type AlreadyPairedProps = {
  readonly host: PairedHost
  readonly connection: HostConnectionStatus
  readonly unpairing: boolean
  /** Set when the last unpair failed. */
  readonly failure?: string
  readonly onUnpair: () => void
}

/**
 * Where a paired account lands on the pairing page.
 *
 * Porte pairs one machine, so a second cannot be added beside it: the way to
 * another machine is to release this one first, which is the only action here
 * that changes anything. Going to the conversations is the usual next step.
 */
export function AlreadyPaired({
  host,
  connection,
  unpairing,
  failure,
  onUnpair,
}: AlreadyPairedProps) {
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="text-muted-foreground">
          <LaptopIcon aria-hidden className="size-7" />
        </span>
        <h1>Your machine is paired</h1>
        <PairedMachineSummary connection={connection} host={host} />
      </div>

      {failure === undefined ? null : (
        <p className="text-destructive-muted-foreground" role="alert">
          {failure}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" nativeButton={false} render={<Link to="/conversations" />}>
          Open conversations
        </Button>
        <Button className="min-h-11" disabled={unpairing} variant="outline" onClick={onUnpair}>
          {unpairing ? <Spinner data-icon="inline-start" /> : null}
          Pair a different machine
        </Button>
      </div>
    </div>
  )
}
