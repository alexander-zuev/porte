import type { CommandHandler } from '@host/application/handlers/types.ts'
import type { TurnOutcome } from '@host/domain/conversation/conversation.ts'
import type { CommandDataMap } from '@host/domain/messages/commands.ts'
import { createCommand, type CommandMap } from '@host/domain/messages/types.ts'
import {
  CODING_AGENT_UNAVAILABLE_ERROR,
  INTERNAL_SERVER_ERROR,
  isClassifiedError,
} from '@porte/core/client'

/**
 * Begin the turn now, run the prompt in the background, and end the turn with
 * `FinishTurn` when the agent answers. The relay sees `turn.started` before this returns.
 */
export const startTurn: CommandHandler<CommandMap['StartTurn'], void> = async (command, deps) => {
  // TODO(step 2): load the session when it is not open (deadline close, idle eviction) before beginning.
  const conversation = deps.conversations.get(command.conversationId)
  const turnId = conversation.beginTurn(command.attemptId, command.userMessage)
  deps.conversations.save(conversation)

  const { conversationId } = command
  deps.background.run(
    deps.codingAgent.prompt(conversationId, turnId, command.userMessage.content).then(
      (result) => {
        const finish: CommandDataMap['FinishTurn'] = {
          conversationId,
          turnId,
          outcome: result.outcome,
        }
        if (result.usage !== undefined) finish.usage = result.usage
        return deps.bus.handle(createCommand('FinishTurn', finish))
      },
      (cause: unknown) =>
        deps.bus.handle(
          createCommand('FinishTurn', { conversationId, turnId, outcome: failedOutcome(cause) }),
        ),
    ),
  )
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
