import type { PendingPermission } from '@porte/core/client'
import { useMutation } from '@tanstack/react-query'

import type { ConversationAgentClient } from './use-conversation-agent.ts'

export type ConversationPermission = {
  readonly permission: PendingPermission
  readonly answering: boolean
}

/** User actions that change the active conversation. */
export type ConversationActions = {
  readonly onAnswerPermission: (waiting: ConversationPermission, optionId: string) => void
}

export type AnswerPermission = {
  readonly actions: ConversationActions
  /** The permission whose answer is in flight, so its buttons can lock. */
  readonly answeringId: string | null
}

/** Answer one permission request over the conversation socket. */
export function useAnswerPermission(agent: ConversationAgentClient): AnswerPermission {
  const answer = useMutation({
    mutationFn: (input: { readonly permission: PendingPermission; readonly optionId: string }) =>
      agent.stub.answerPermission({
        turnId: input.permission.turnId,
        permissionId: input.permission.permissionId,
        optionId: input.optionId,
      }),
  })

  return {
    actions: {
      onAnswerPermission: (waiting, optionId) => {
        answer.mutate({ permission: waiting.permission, optionId })
      },
    },
    answeringId: answer.isPending ? answer.variables.permission.permissionId : null,
  }
}
