import { PairingFlow, type PairingFlowProps } from '#/features/pair/components/pairing-flow.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'

/** Props for one mobile pairing page state. */
export type PairPageProps = PairingFlowProps

/** Place a pairing state in the shared mobile-first marketing frame. */
export function PairPage(props: PairPageProps) {
  return (
    <MarketingFrame className="flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <PairingFlow {...props} />
      </div>
    </MarketingFrame>
  )
}
