import type { PermissionOption } from '@porte/core/client'
import type { ConversationPermission } from '@web/features/conversation/hooks/use-answer-permission.ts'
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@web/ui/components/ai-elements/confirmation.tsx'

export type ConversationPermissionProps = {
  readonly waiting: readonly ConversationPermission[]
  readonly onAnswer: (waiting: ConversationPermission, optionId: string) => void
}

/** Grok's option names are sentences; a word per kind fits two to a row on every screen. */
const LABELS = {
  allow_once: 'Allow',
  allow_always: 'Always allow',
  reject_once: 'Deny',
  reject_always: 'Never allow',
} satisfies Record<PermissionOption['kind'], string>

/** Allow on the first row, deny on the second; once before always inside a row. */
const ORDER = {
  allow_once: 0,
  allow_always: 1,
  reject_once: 2,
  reject_always: 3,
} satisfies Record<PermissionOption['kind'], number>

/**
 * What the agent is waiting to be allowed to do.
 *
 * Above the composer rather than in the transcript: it blocks the turn, so it
 * has to stay in view while the answer scrolls away.
 */
export function ConversationPermissions({ waiting, onAnswer }: ConversationPermissionProps) {
  if (waiting.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {waiting.map((one) => (
        <Confirmation
          key={one.permission.permissionId}
          approval={{ id: one.permission.permissionId }}
          state="approval-requested"
        >
          <ConfirmationTitle>{one.permission.title}</ConfirmationTitle>
          <ConfirmationRequest>
            <ConfirmationActions>
              {one.permission.options
                .toSorted((a, b) => ORDER[a.kind] - ORDER[b.kind])
                .map((option) => (
                  <ConfirmationAction
                    key={option.optionId}
                    disabled={one.answering}
                    title={option.name}
                    variant={variantOf(option)}
                    onClick={() => {
                      onAnswer(one, option.optionId)
                    }}
                  >
                    {LABELS[option.kind]}
                  </ConfirmationAction>
                ))}
            </ConfirmationActions>
          </ConfirmationRequest>
        </Confirmation>
      ))}
    </div>
  )
}

/** Allowing is neutral; refusing carries the weight, because it ends the turn. */
function variantOf(option: PermissionOption): 'outline' | 'destructive' {
  return option.kind === 'allow_once' || option.kind === 'allow_always' ? 'outline' : 'destructive'
}
