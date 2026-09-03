import { CodingAgentResponseError } from '@host/application/errors/coding-agent-errors.ts'
import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { TurnOutcome } from '@host/domain/conversation/conversation.ts'
import type { CommandMap } from '@host/domain/messages/types.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'
import {
  CODING_AGENT_UNAVAILABLE_ERROR,
  INTERNAL_SERVER_ERROR,
  IsoDateTimeSchema,
  isClassifiedError,
  type AttemptId,
  type ConversationId,
  type TurnId,
} from '@porte/core/client'

/**
 * Hand the prompt to Grok and answer once the turn exists.
 *
 * Grok owns the turn: its id is learned when the stream echoes the prompt,
 * and `ApplyAgentUpdate` binds that echo to this attempt. The request waits for
 * that bind, or for Grok's refusal, whichever comes first. A repeated attempt
 * answers with the turn it already produced and sends nothing.
 */
export const startTurn: CommandHandler<CommandMap['StartTurn'], TurnId> = async (command, deps) => {
  const conversation = deps.conversations.get(command.conversationId)
  if (!deps.codingAgent.isOpen(conversation.id)) {
    await deps.codingAgent.loadSession(conversation.id, conversation.cwd)
  }
  const request = conversation.requestTurn(command.attemptId, command.userMessage)
  if (request.type === 'repeated') return request.turnId
  const bound = deps.attempts.wait(command.attemptId)
  if (request.type === 'pending') return bound

  conversation.touch(IsoDateTimeSchema.parse(deps.now().toISOString()))
  deps.conversations.save(conversation)

  const { conversationId, attemptId } = command
  deps.background.run(
    deps.codingAgent.prompt(conversationId, command.userMessage.content).then(
      () => settlePrompt(deps, conversationId, attemptId, undefined),
      (cause: unknown) => settlePrompt(deps, conversationId, attemptId, cause),
    ),
  )
  return bound
}

/**
 * Grok answered the prompt request. Normally the turn already ended on the
 * stream and nothing is left to do. Two failures are settled here: an attempt
 * still waiting for its echo (refused, or run without one) fails its request,
 * and a rejection during a bound turn ends that turn as failed.
 */
async function settlePrompt(
  deps: AppDeps,
  conversationId: ConversationId,
  attemptId: AttemptId,
  cause: unknown,
): Promise<void> {
  const conversation = deps.conversations.find(conversationId)
  if (conversation === null) {
    deps.attempts.failed(attemptId, cause ?? new CodingAgentResponseError({ cause: undefined }))
    return
  }
  if (conversation.pendingAttemptId === attemptId) {
    conversation.dropPendingAttempt(attemptId)
    deps.conversations.save(conversation)
    deps.attempts.failed(
      attemptId,
      cause ??
        new CodingAgentResponseError({
          cause: new TypeError('Grok answered the prompt without echoing it'),
        }),
    )
    return
  }
  if (cause === undefined) return
  const turnId = conversation.runningTurnFor(attemptId)
  if (turnId === undefined) return
  conversation.finishTurn(turnId, failedOutcome(cause))
  deps.conversations.save(conversation)
}

/** The relay contract allows three tags; anything not transient is internal. */
function failedOutcome(cause: unknown): TurnOutcome {
  const message = cause instanceof Error && cause.message.length > 0 ? cause.message : 'Turn failed'
  const transient = isClassifiedError(cause) && cause.classification === 'transient'
  return {
    type: 'failed',
    error: { _tag: transient ? CODING_AGENT_UNAVAILABLE_ERROR : INTERNAL_SERVER_ERROR, message },
  }
}
