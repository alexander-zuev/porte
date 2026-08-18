import { PairForm, type PairFormProps } from '#/features/pair/components/pair-form.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'

export type PairPageProps = PairFormProps

export function PairPage(props: PairPageProps) {
  return (
    <MarketingFrame className="flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <PairForm {...props} />
      </div>
    </MarketingFrame>
  )
}
