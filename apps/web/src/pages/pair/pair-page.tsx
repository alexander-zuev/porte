import { PairingFlow, type PairingFlowProps } from '#/features/pair/components/pairing-flow.tsx'
import { PublicShell } from '#/ui/components/public-shell.tsx'

/** Props for one pairing page state. */
export type PairPageProps = PairingFlowProps

/** Wordmark above, one card, and the legal links. Nothing else competes. */
export function PairPage(props: PairPageProps) {
  return (
    <PublicShell footer="legal" header="brand">
      {/* One wrapper: centres the card and caps it at a readable width. */}
      <div className="mx-auto w-full max-w-[36rem] flex-1 px-5 pb-10">
        <PairingFlow {...props} />
      </div>
    </PublicShell>
  )
}
