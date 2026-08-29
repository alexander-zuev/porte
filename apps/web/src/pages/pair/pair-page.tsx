import { PairingFlow, type PairingFlowProps } from '@web/features/pair/components/pairing-flow.tsx'

/** Props for one pairing page state. */
export type PairPageProps = PairingFlowProps

/** One card under the wordmark. Nothing else competes. */
export function PairPage(props: PairPageProps) {
  return (
    <div className="w-full md:max-w-md">
      <PairingFlow {...props} />
    </div>
  )
}
