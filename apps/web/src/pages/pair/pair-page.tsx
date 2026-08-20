import { PairingFlow, type PairingFlowProps } from '#/features/pair/components/pairing-flow.tsx'
import { PublicShell } from '#/ui/components/public-shell.tsx'

/** Props for one pairing page state. */
export type PairPageProps = PairingFlowProps

/** Wordmark above, one card, and the legal links. Nothing else competes. */
export function PairPage(props: PairPageProps) {
  return (
    <PublicShell footer="legal" header="brand">
      <div className="w-full max-w-md">
        <PairingFlow {...props} />
      </div>
    </PublicShell>
  )
}
