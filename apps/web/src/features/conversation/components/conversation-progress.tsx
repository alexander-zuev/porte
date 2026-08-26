import { CheckCircleIcon, CircleIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import type { ConversationPlan, ConversationUsage, PlanEntry } from '@porte/core/client'
import { cn } from '@web/lib/utils.ts'
import { MessageResponse } from '@web/ui/components/ai-elements/message.tsx'
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@web/ui/components/ai-elements/plan.tsx'

/** Shows current ACP plans above the prompt. */
export function ConversationPlans({
  plans,
  running,
}: {
  readonly plans: readonly ConversationPlan[]
  readonly running: boolean
}) {
  if (plans.length === 0) return null
  // No side padding: the plan sits above the composer and holds the same width,
  // so the two fixed panels read as one column under the scrolling transcript.
  return (
    <div className="flex flex-col gap-2">
      {plans.map((plan) => (
        <Plan key={plan.planId} defaultOpen isStreaming={running}>
          <PlanHeader>
            <PlanTitle>Plan</PlanTitle>
            <PlanDescription>{planDescription(plan)}</PlanDescription>
            <PlanAction>
              <PlanTrigger />
            </PlanAction>
          </PlanHeader>
          <PlanContent>
            <PlanBody plan={plan} />
          </PlanContent>
        </Plan>
      ))}
    </div>
  )
}

function PlanBody({ plan }: { readonly plan: ConversationPlan }) {
  if (plan.type === 'markdown') return <MessageResponse>{plan.content}</MessageResponse>
  if (plan.type === 'file') {
    return (
      <small className="break-all text-muted-foreground">
        Plan file: <code>{plan.uri}</code>
      </small>
    )
  }
  return (
    <ol className="space-y-2">
      {plan.entries.map((entry, index) => (
        <li key={`${plan.planId}-${String(index)}`}>
          <PlanEntryRow entry={entry} />
        </li>
      ))}
    </ol>
  )
}

/**
 * One step, styled by how far the plan has got to it.
 *
 * Only the current step is at full contrast: a done step is crossed out and a
 * step not started yet is quiet, so the eye lands on the one line that says
 * what is happening now.
 */
function PlanEntryRow({ entry }: { readonly entry: PlanEntry }) {
  const Icon =
    entry.status === 'completed'
      ? CheckCircleIcon
      : entry.status === 'in_progress'
        ? PencilSimpleIcon
        : CircleIcon

  return (
    <small
      className={cn(
        'flex gap-2',
        entry.status === 'in_progress' ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className={cn(entry.status === 'completed' && 'line-through')}>{entry.content}</span>
    </small>
  )
}

function planDescription(plan: ConversationPlan): string {
  if (plan.type === 'items') {
    const done = plan.entries.filter((entry) => entry.status === 'completed').length
    return `${String(done)} of ${String(plan.entries.length)} complete`
  }
  return plan.type === 'file' ? 'Plan file' : 'Plan details'
}

/** Formats the cumulative ACP cost for the context control. */
export function conversationCost(usage: ConversationUsage): string | undefined {
  if (usage.cost === undefined) return undefined
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: usage.cost.currency,
  }).format(usage.cost.amount)
}
