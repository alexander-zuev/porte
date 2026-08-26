import type { PermissionOption } from '@porte/core/client'
import type { ConversationPermission } from '@web/entities/conversation/use-conversation.ts'
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
              {one.permission.options.map((option) => (
                <ConfirmationAction
                  key={option.optionId}
                  disabled={one.answering}
                  variant={variantOf(option)}
                  onClick={() => {
                    onAnswer(one, option.optionId)
                  }}
                >
                  {option.name}
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
